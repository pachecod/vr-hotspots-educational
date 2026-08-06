const { getPool, isDbEnabled } = require('../../services/db-service');

async function recordUploadEvent({
  kind,
  byteSize = 0,
  b2Path = null,
  classSlug = null,
  studentId = null,
  projectName = null,
  fileName = null,
}) {
  if (!isDbEnabled()) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO usage_upload_events
      (kind, byte_size, b2_path, class_slug, student_id, project_name, file_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      String(kind || 'other').slice(0, 40),
      Math.max(0, Number(byteSize) || 0),
      b2Path || null,
      classSlug || null,
      studentId || null,
      projectName || null,
      fileName || null,
    ]
  );
  return rows[0] || null;
}

async function updateProjectVersionByteSize(b2Path, byteSize) {
  if (!isDbEnabled() || !b2Path) return;
  const pool = getPool();
  await pool.query(
    `UPDATE project_versions SET byte_size = $2 WHERE b2_path = $1 AND (byte_size IS NULL OR byte_size = 0)`,
    [b2Path, Math.max(0, Number(byteSize) || 0)]
  );
}

async function insertSnapshots(rows) {
  if (!isDbEnabled() || !rows.length) return 0;
  const pool = getPool();
  const capturedAt = new Date().toISOString();
  let inserted = 0;
  for (const row of rows) {
    await pool.query(
      `INSERT INTO usage_storage_snapshots
        (captured_at, source, scope, byte_size, file_count, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        capturedAt,
        row.source,
        row.scope,
        Math.max(0, Number(row.byteSize) || 0),
        Math.max(0, Number(row.fileCount) || 0),
        JSON.stringify(row.details || {}),
      ]
    );
    inserted += 1;
  }
  return inserted;
}

async function getLatestSnapshots() {
  if (!isDbEnabled()) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (source, scope)
      id, captured_at AS "capturedAt", source, scope,
      byte_size AS "byteSize", file_count AS "fileCount", details
    FROM usage_storage_snapshots
    ORDER BY source, scope, captured_at DESC
  `);
  return rows;
}

async function getSnapshotHistory({ source = null, scope = null, days = 30 } = {}) {
  if (!isDbEnabled()) return [];
  const pool = getPool();
  const params = [Math.max(1, Math.min(365, Number(days) || 30))];
  let where = `captured_at >= NOW() - ($1::text || ' days')::interval`;
  if (source) {
    params.push(source);
    where += ` AND source = $${params.length}`;
  }
  if (scope) {
    params.push(scope);
    where += ` AND scope = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT captured_at AS "capturedAt", source, scope,
            byte_size AS "byteSize", file_count AS "fileCount", details
     FROM usage_storage_snapshots
     WHERE ${where}
     ORDER BY captured_at ASC`,
    params
  );
  return rows;
}

async function getUploadTotals({ days = 30 } = {}) {
  if (!isDbEnabled()) {
    return { days, totalBytes: 0, totalEvents: 0, byKind: [], byDay: [] };
  }
  const pool = getPool();
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const { rows: byKind } = await pool.query(
    `SELECT kind,
            COUNT(*)::int AS events,
            COALESCE(SUM(byte_size), 0)::bigint AS "byteSize"
     FROM usage_upload_events
     WHERE created_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY kind
     ORDER BY "byteSize" DESC`,
    [d]
  );
  const { rows: byDay } = await pool.query(
    `SELECT date_trunc('day', created_at AT TIME ZONE 'America/New_York')::date AS day,
            COALESCE(SUM(byte_size), 0)::bigint AS "byteSize",
            COUNT(*)::int AS events
     FROM usage_upload_events
     WHERE created_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY 1
     ORDER BY 1 ASC`,
    [d]
  );
  const totalBytes = byKind.reduce((s, r) => s + Number(r.byteSize || 0), 0);
  const totalEvents = byKind.reduce((s, r) => s + Number(r.events || 0), 0);
  return { days: d, totalBytes, totalEvents, byKind, byDay };
}

async function getUploadEventById(id) {
  if (!isDbEnabled() || !id) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, created_at AS "createdAt", kind,
            byte_size AS "byteSize", b2_path AS "b2Path",
            class_slug AS "classSlug", student_id AS "studentId",
            project_name AS "projectName", file_name AS "fileName"
     FROM usage_upload_events
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getRecentUploads(limit = 25) {
  const result = await listUploadEvents({ days: 365, limit });
  return result.events;
}

async function listUploadEvents({ days = 30, limit = 200, offset = 0, kind = null } = {}) {
  if (!isDbEnabled()) {
    return { days, total: 0, limit: 0, offset: 0, events: [] };
  }
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const lim = Math.max(1, Math.min(5000, Number(limit) || 200));
  const off = Math.max(0, Number(offset) || 0);
  const params = [d];
  let where = `u.created_at >= NOW() - ($1::text || ' days')::interval`;
  if (kind) {
    params.push(String(kind).slice(0, 40));
    where += ` AND u.kind = $${params.length}`;
  }
  params.push(lim, off);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.id,
            u.created_at AS "createdAt",
            u.kind,
            u.byte_size AS "byteSize",
            u.b2_path AS "b2Path",
            u.class_slug AS "classSlug",
            u.student_id AS "studentId",
            u.project_name AS "projectName",
            u.file_name AS "fileName",
            s.username AS "studentUsername",
            s.display_name AS "studentDisplayName"
     FROM usage_upload_events u
     LEFT JOIN students s ON s.id = u.student_id
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM usage_upload_events u
     WHERE ${where}`,
    countParams
  );

  return {
    days: d,
    total: countRows[0]?.total || 0,
    limit: lim,
    offset: off,
    events: rows,
  };
}

/** Backblaze Caps & Alerts reset at 00:00 GMT — use that calendar day. */
function gmtDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

async function recordDownloadBytes(byteSize, { source = 'proxy' } = {}) {
  if (!isDbEnabled()) return null;
  const bytes = Math.max(0, Math.floor(Number(byteSize) || 0));
  if (!bytes) return null;
  const day = gmtDayKey();
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO usage_download_daily (day_gmt, byte_size, event_count, updated_at)
     VALUES ($1::date, $2, 1, NOW())
     ON CONFLICT (day_gmt) DO UPDATE SET
       byte_size = usage_download_daily.byte_size + EXCLUDED.byte_size,
       event_count = usage_download_daily.event_count + 1,
       updated_at = NOW()
     RETURNING day_gmt AS "dayGmt", byte_size AS "byteSize", event_count AS "eventCount"`,
    [day, bytes]
  );
  return rows[0] || null;
}

async function getDownloadTotalsToday() {
  if (!isDbEnabled()) {
    return { dayGmt: gmtDayKey(), byteSize: 0, eventCount: 0 };
  }
  const day = gmtDayKey();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT day_gmt AS "dayGmt",
            byte_size AS "byteSize",
            event_count AS "eventCount"
     FROM usage_download_daily
     WHERE day_gmt = $1::date
     LIMIT 1`,
    [day]
  );
  if (!rows[0]) {
    return { dayGmt: day, byteSize: 0, eventCount: 0 };
  }
  return {
    dayGmt: rows[0].dayGmt,
    byteSize: Number(rows[0].byteSize) || 0,
    eventCount: Number(rows[0].eventCount) || 0,
  };
}

module.exports = {
  recordUploadEvent,
  getUploadEventById,
  updateProjectVersionByteSize,
  insertSnapshots,
  getLatestSnapshots,
  getSnapshotHistory,
  getUploadTotals,
  getRecentUploads,
  listUploadEvents,
  recordDownloadBytes,
  getDownloadTotalsToday,
  gmtDayKey,
};
