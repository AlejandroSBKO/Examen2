const pool = require('../db/pool');

async function logEvent({ type, userId, username, ip, userAgent, sessionId, details }) {
  const query = `INSERT INTO logs
    (log_type, user_id, username, ip_address, user_agent, session_id, details)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`;

  try {
    await pool.query(query, [
      type,
      userId || null,
      username || null,
      ip || null,
      userAgent || null,
      sessionId || null,
      details || null,
    ]);
    console.log(`[${type}] ${new Date().toISOString()} | user=${username || 'unknown'} | ip=${ip || 'unknown'}`);
    return true;
  } catch (error) {
    console.error('[LOG_EVENT_ERROR]', error.message);
    return false;
  }
}

module.exports = { logEvent };
