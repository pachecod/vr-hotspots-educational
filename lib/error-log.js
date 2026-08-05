const { isDbEnabled, query } = require('../services/db-service');

const EDT_TZ = 'America/New_York';

function formatTimestampEdt(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: EDT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date instanceof Date ? date : new Date(date));
  } catch (_) {
    return new Date(date).toISOString();
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    timestampEdt: row.timestamp_edt,
    level: row.level,
    code: row.code,
    message: row.message,
    userName: row.user_name,
    studentId: row.student_id,
    source: row.source,
    appVersion: row.app_version,
    details: row.details || {},
  };
}

async function createErrorLog({
  level = 'error',
  code,
  message,
  userName = 'unknown',
  studentId = null,
  source = null,
  appVersion = null,
  details = {},
  createdAt = null,
} = {}) {
  if (!isDbEnabled()) return null;
  const codeStr = String(code || 'unknown').slice(0, 120);
  const messageStr = String(message || 'Untitled error').slice(0, 2000);
  const userStr = String(userName || 'unknown').slice(0, 200);
  const when = createdAt ? new Date(createdAt) : new Date();
  const timestampEdt = formatTimestampEdt(when);
  const detailsObj = details && typeof details === 'object' ? details : { value: details };

  const { rows } = await query(
    `INSERT INTO admin_error_logs (
      created_at, timestamp_edt, level, code, message, user_name, student_id, source, app_version, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING *`,
    [
      when.toISOString(),
      timestampEdt,
      String(level || 'error').slice(0, 40),
      codeStr,
      messageStr,
      userStr,
      studentId || null,
      source ? String(source).slice(0, 200) : null,
      appVersion ? String(appVersion).slice(0, 40) : null,
      JSON.stringify(detailsObj),
    ]
  );
  return mapRow(rows[0]);
}

async function listErrorLogs({ limit = 100, offset = 0, code = null, level = null } = {}) {
  if (!isDbEnabled()) return { logs: [], total: 0 };
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);
  const params = [];
  const where = [];
  if (code) {
    params.push(String(code));
    where.push(`code = $${params.length}`);
  }
  if (level) {
    params.push(String(level));
    where.push(`level = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await query(`SELECT COUNT(*)::int AS n FROM admin_error_logs ${whereSql}`, params);
  params.push(lim, off);
  const { rows } = await query(
    `SELECT * FROM admin_error_logs ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { logs: rows.map(mapRow), total: countRes.rows[0]?.n || 0 };
}

/** Compact error rows for Usage dashboard markers (same time window as Render charts). */
async function listErrorLogsForWindow({ hours = 24, limit = 200 } = {}) {
  if (!isDbEnabled()) return { logs: [], total: 0, hours: Number(hours) || 24 };
  const h = Math.max(1, Math.min(24 * 30, Number(hours) || 24));
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  const countRes = await query(
    `SELECT COUNT(*)::int AS n FROM admin_error_logs
     WHERE created_at >= NOW() - ($1::text || ' hours')::interval`,
    [String(h)]
  );
  const { rows } = await query(
    `SELECT id, created_at, timestamp_edt, level, code, message, user_name, source
     FROM admin_error_logs
     WHERE created_at >= NOW() - ($1::text || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [String(h), lim]
  );
  return {
    hours: h,
    total: countRes.rows[0]?.n || 0,
    truncated: (countRes.rows[0]?.n || 0) > lim,
    logs: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      timestampEdt: row.timestamp_edt,
      level: row.level,
      code: row.code,
      message: row.message,
      userName: row.user_name,
      source: row.source,
    })),
  };
}

async function getErrorLog(id) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(`SELECT * FROM admin_error_logs WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

async function deleteErrorLog(id) {
  if (!isDbEnabled()) return false;
  const { rowCount } = await query(`DELETE FROM admin_error_logs WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function clearErrorLogs({ olderThanDays = null } = {}) {
  if (!isDbEnabled()) return 0;
  if (olderThanDays != null) {
    const days = Math.max(1, Number(olderThanDays) || 30);
    const { rowCount } = await query(
      `DELETE FROM admin_error_logs WHERE created_at < NOW() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return rowCount || 0;
  }
  const { rowCount } = await query(`DELETE FROM admin_error_logs`);
  return rowCount || 0;
}

/** Fire-and-forget server-side logger; never throws to callers. */
function logAppError(payload) {
  return createErrorLog(payload).catch((err) => {
    console.error('[error-log] failed to persist:', err.message);
    return null;
  });
}

module.exports = {
  EDT_TZ,
  formatTimestampEdt,
  createErrorLog,
  listErrorLogs,
  listErrorLogsForWindow,
  getErrorLog,
  deleteErrorLog,
  clearErrorLogs,
  logAppError,
};
