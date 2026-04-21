const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { logEvent } = require('../middleware/logger');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Intenta de nuevo más tarde.',
  },
});

function sanitizeText(value) {
  return String(value || '')
    .trim()
    .replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

async function handleLogout(req, res) {
  const sessionSnapshot = req.session ? {
    userId: req.session.userId,
    username: req.session.username,
    sessionId: req.sessionID,
  } : null;

  if (!req.session) {
    return res.redirect('/');
  }

  try {
    await logEvent({
      type: 'LOGOUT',
      userId: sessionSnapshot?.userId,
      username: sessionSnapshot?.username,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      sessionId: sessionSnapshot?.sessionId,
      details: 'User requested logout',
    });
  } catch (error) {
    console.error('Failed to log logout event:', error.message);
  }

  req.session.destroy((error) => {
    if (error) {
      console.error('Session destroy failed:', error.message);
    }
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
}

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/index.html'));
});

router.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/register.html'));
});

router.post('/register', async (req, res) => {
  try {
    const username = sanitizeText(req.body.username).toLowerCase();
    const email = sanitizeText(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!validateUsername(username)) {
      return res.status(400).json({ success: false, message: 'El nombre de usuario no es válido.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'El correo electrónico no es válido.' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener 8 caracteres, una mayúscula y un número.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Las contraseñas no coinciden.' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2) LIMIT 1',
      [username, email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'El usuario o correo ya existe.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      [username, email, passwordHash, 'user']
    );

    return res.json({ success: true, redirect: '/' });
  } catch (error) {
    console.error('Register error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo completar el registro.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const email = sanitizeText(req.body.email).toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios.' });
    }

    const result = await pool.query(
      'SELECT id, username, email, password, role, is_active FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );

    const user = result.rows[0];
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!user) {
      await logEvent({
        type: 'ACCESS_FAIL',
        username: email,
        ip,
        userAgent,
        sessionId: null,
        details: 'USER_NOT_FOUND',
      });
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    if (!user.is_active) {
      await logEvent({
        type: 'ACCESS_FAIL',
        userId: user.id,
        username: user.username,
        ip,
        userAgent,
        sessionId: null,
        details: 'INACTIVE',
      });
      return res.status(401).json({ success: false, message: 'La cuenta está desactivada.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      await logEvent({
        type: 'ACCESS_FAIL',
        userId: user.id,
        username: user.username,
        ip,
        userAgent,
        sessionId: null,
        details: 'WRONG_PASSWORD',
      });
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) {
          return reject(error);
        }
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        req.session.loginTime = new Date().toISOString();
        req.session.userAgent = userAgent;
        req.session.loginIp = ip;
        req.session.suspiciousActivity = false;
        req.session.save((saveError) => {
          if (saveError) {
            return reject(saveError);
          }
          resolve();
        });
      });
    });

    await logEvent({
      type: 'ACCESS_OK',
      userId: user.id,
      username: user.username,
      ip,
      userAgent,
      sessionId: req.sessionID,
      details: `Role=${user.role}`,
    });

    return res.json({
      success: true,
      redirect: user.role === 'admin' ? '/admin' : '/user',
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo iniciar sesión.' });
  }
});

router.post('/logout', handleLogout);
router.get('/logout', handleLogout);

module.exports = router;
