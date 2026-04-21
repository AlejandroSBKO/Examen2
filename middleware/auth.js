const path = require('path');
const { logEvent } = require('./logger');

function getIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function isAuthenticated(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/');
  }

  const currentUserAgent = req.headers['user-agent'] || 'unknown';
  const currentIp = getIpAddress(req);
  const storedUserAgent = req.session.userAgent;
  const storedIp = req.session.loginIp;
  const mismatched = Boolean(storedUserAgent && storedIp && storedUserAgent !== currentUserAgent && storedIp !== currentIp);

  if (mismatched && !req.session.suspiciousActivity) {
    req.session.suspiciousActivity = true;
    logEvent({
      type: 'ACCESS_OK',
      userId: req.session.userId,
      username: req.session.username,
      ip: currentIp,
      userAgent: currentUserAgent,
      sessionId: req.sessionID,
      details: '⚠️ SUSPICIOUS: UA/IP mismatch',
    }).catch(() => {});
  }

  if (mismatched && req.accepts(['json', 'html']) === 'json' && (req.originalUrl.startsWith('/api/') || req.xhr || !req.accepts('html'))) {
    return res.status(200).json({
      warning: true,
      message: 'Anomalía detectada: IP y navegador diferentes',
      suspiciousActivity: true,
    });
  }

  return next();
}

function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).sendFile(path.join(__dirname, '../public/pages/403.html'));
}

module.exports = { isAuthenticated, isAdmin };
