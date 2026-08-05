/**
 * Durable login/logout activity for the Admin Activity page.
 * No-ops when DATABASE_URL is unset; never throws to callers.
 */

const { getPool, isDbEnabled } = require('../../services/db-service');

function clientIp(req) {
  if (!req) return null;
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().slice(0, 64) || null;
  const addr = req.socket && req.socket.remoteAddress;
  return addr ? String(addr).slice(0, 64) : null;
}

function clientUserAgent(req) {
  if (!req || !req.headers) return null;
  const ua = req.headers['user-agent'];
  return ua ? String(ua).slice(0, 240) : null;
}

async function recordAuthEvent({
  event,
  role,
  studentId = null,
  username = null,
  displayName = null,
  classId = null,
  classSlug = null,
  ip = null,
  userAgent = null,
  req = null,
} = {}) {
  if (!isDbEnabled()) return null;
  const ev = String(event || '').toLowerCase();
  const rl = String(role || '').toLowerCase();
  if (ev !== 'login' && ev !== 'logout') return null;
  if (!rl) return null;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO auth_events
        (event, role, student_id, username, display_name, class_id, class_slug, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        ev,
        rl.slice(0, 40),
        studentId || null,
        username ? String(username).slice(0, 120) : null,
        displayName ? String(displayName).slice(0, 160) : null,
        classId || null,
        classSlug ? String(classSlug).slice(0, 120) : null,
        ip != null ? String(ip).slice(0, 64) : clientIp(req),
        userAgent != null ? String(userAgent).slice(0, 240) : clientUserAgent(req),
      ]
    );
    return rows[0] || null;
  } catch (err) {
    console.warn('auth event failed:', err.message);
    return null;
  }
}

async function listAuthEvents({ days = 30, limit = 200, event = null, role = null } = {}) {
  if (!isDbEnabled()) {
    return { days, total: 0, events: [] };
  }
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  const params = [d];
  let where = `created_at >= NOW() - ($1::text || ' days')::interval`;
  if (event === 'login' || event === 'logout') {
    params.push(event);
    where += ` AND event = $${params.length}`;
  }
  if (role) {
    params.push(String(role).slice(0, 40));
    where += ` AND role = $${params.length}`;
  }
  params.push(lim);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id,
            created_at AS "createdAt",
            event,
            role,
            student_id AS "studentId",
            username,
            display_name AS "displayName",
            class_id AS "classId",
            class_slug AS "classSlug",
            ip,
            user_agent AS "userAgent"
     FROM auth_events
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  const countParams = params.slice(0, -1);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM auth_events WHERE ${where}`,
    countParams
  );

  return {
    days: d,
    total: countRows[0]?.total || 0,
    events: rows,
  };
}

module.exports = {
  recordAuthEvent,
  listAuthEvents,
  clientIp,
  clientUserAgent,
};
