const express = require('express');
const path = require('path');
const pool = require('../db/pool');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function parseSessionRow(row) {
  const sess = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
  const sessionData = sess || {};
  return {
    sid: row.sid,
    expire: row.expire,
    userId: sessionData.userId || null,
    username: sessionData.username || 'unknown',
    role: sessionData.role || 'user',
    loginTime: sessionData.loginTime || null,
    loginIp: sessionData.loginIp || null,
    userAgent: sessionData.userAgent || null,
    suspiciousActivity: Boolean(sessionData.suspiciousActivity),
  };
}

function buildLogQuery(params) {
  const clauses = [];
  const values = [];
  let index = 1;

  if (params.type) {
    clauses.push(`log_type = $${index++}`);
    values.push(params.type);
  }

  if (params.search) {
    clauses.push(`username ILIKE $${index++}`);
    values.push(`%${params.search}%`);
  }

  if (params.from) {
    clauses.push(`created_at >= $${index++}`);
    values.push(params.from);
  }

  if (params.to) {
    clauses.push(`created_at <= $${index++}`);
    values.push(params.to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, values };
}

router.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/admin.html'));
});

router.get('/user', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/user.html'));
});

router.get('/api/admin/data', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const statsQuery = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM logs WHERE log_type = 'ACCESS_OK' AND created_at::date = CURRENT_DATE) AS successful_logins_today,
        (SELECT COUNT(*) FROM logs WHERE log_type = 'ACCESS_FAIL' AND created_at::date = CURRENT_DATE) AS failed_attempts_today,
        (SELECT COUNT(*) FROM session WHERE expire > NOW()) AS active_sessions
    `);

    const recentLogsQuery = await pool.query(
      'SELECT id, log_type, username, ip_address, user_agent, session_id, details, created_at FROM logs ORDER BY created_at DESC LIMIT 10'
    );

    const recentUsersQuery = await pool.query(
      'SELECT id, username, email, role, created_at, is_active FROM users ORDER BY created_at DESC LIMIT 10'
    );

    return res.json({
      stats: statsQuery.rows[0],
      recentLogs: recentLogsQuery.rows,
      recentUsers: recentUsersQuery.rows,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin data error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo cargar el panel.' });
  }
});

router.get('/api/admin/logs', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const search = String(req.query.search || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    const filters = buildLogQuery({
      type: type || null,
      search: search || null,
      from: from || null,
      to: to || null,
    });

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM logs ${filters.where}`, filters.values);
    const dataQuery = await pool.query(
      `SELECT id, log_type, user_id, username, ip_address, user_agent, session_id, details, created_at
       FROM logs
       ${filters.where}
       ORDER BY created_at DESC
       LIMIT $${filters.values.length + 1} OFFSET $${filters.values.length + 2}`,
      [...filters.values, limit, (page - 1) * limit]
    );

    return res.json({
      data: dataQuery.rows,
      total: countResult.rows[0].total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Logs error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener las bitácoras.' });
  }
});

router.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at, is_active FROM users ORDER BY created_at DESC'
    );
    return res.json({ users: result.rows });
  } catch (error) {
    console.error('Users error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener los usuarios.' });
  }
});

router.patch('/api/admin/users/:id/status', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { is_active, toggle } = req.body;
    const result = await pool.query('SELECT id, is_active FROM users WHERE id = $1', [userId]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const nextStatus = typeof toggle !== 'undefined' ? !result.rows[0].is_active : Boolean(is_active);
    const updated = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, email, role, created_at, is_active',
      [nextStatus, userId]
    );

    return res.json({ success: true, user: updated.rows[0] });
  } catch (error) {
    console.error('Toggle user status error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo actualizar el estado.' });
  }
});

router.get('/api/admin/sessions', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT sid, sess, expire FROM session WHERE expire > NOW() ORDER BY expire DESC'
    );
    const sessions = result.rows.map(parseSessionRow);
    return res.json({ sessions });
  } catch (error) {
    console.error('Sessions error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener las sesiones.' });
  }
});

router.delete('/api/admin/sessions/:sid', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const sid = req.params.sid;
    await new Promise((resolve, reject) => {
      req.sessionStore.destroy(sid, (error) => {
        if (error) {
          return reject(error);
        }
        return resolve();
      });
    });
    return res.json({ success: true, message: 'Sesión invalidada.' });
  } catch (error) {
    console.error('Delete session error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo invalidar la sesión.' });
  }
});

router.get('/api/session/status', isAuthenticated, (req, res) => {
  return res.json({
    sessionId: req.sessionID,
    username: req.session.username,
    role: req.session.role,
    loginTime: req.session.loginTime,
    loginIp: req.session.loginIp,
    userAgent: req.session.userAgent,
    suspiciousActivity: Boolean(req.session.suspiciousActivity),
    serverTime: new Date().toISOString(),
  });
});

router.get('/api/user/activity', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, log_type, username, ip_address, user_agent, session_id, details, created_at FROM logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.session.userId]
    );
    return res.json({ activity: result.rows });
  } catch (error) {
    console.error('User activity error:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo obtener la actividad.' });
  }
});

module.exports = router;
