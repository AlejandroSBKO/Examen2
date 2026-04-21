require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const PgSession = require('connect-pg-simple')(session);
const pool = require('./db/pool');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: false,
});

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/', authRoutes);
app.use('/', dashboardRoutes);

app.get('/setup', async (req, res) => {
  const setupKey = process.env.SETUP_KEY;
  if (!setupKey || req.query.key !== setupKey) {
    return res.status(403).json({ success: false, message: 'Acceso denegado.' });
  }

  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    return res.json({ success: true, message: 'Esquema aplicado correctamente.' });
  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({ success: false, message: 'No se pudo ejecutar el esquema.' });
  }
});

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Recurso no encontrado.' });
  }
  return res.status(404).send(`
    <!doctype html>
    <html lang="es">
      <head><meta charset="utf-8"><title>404</title></head>
      <body style="font-family:sans-serif;background:#0a0e1a;color:#f1f5f9;padding:40px;">Recurso no encontrado.</body>
    </html>
  `);
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);

  if (res.headersSent) {
    return next(error);
  }

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor.',
      ...(isProduction ? {} : { error: error.message }),
    });
  }

  return res.status(500).send(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error</title>
        <style>
          body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0a0e1a; color:#f1f5f9; font-family:Inter,system-ui,sans-serif; }
          .card { max-width: 520px; padding: 32px; border: 1px solid #1e2d45; border-radius: 24px; background: rgba(17,24,39,.9); box-shadow: 0 30px 90px rgba(0,0,0,.45); }
        </style>
      </head>
      <body><div class="card"><h1>Error interno</h1><p>La aplicación encontró un problema inesperado.</p></div></body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Secure Auth App listening on port ${port}`);
});
