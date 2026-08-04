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

async function getRecentUploads(limit = 25) {
  if (!isDbEnabled()) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, created_at AS "createdAt", kind,
            byte_size AS "byteSize", b2_path AS "b2Path",
            class_slug AS "classSlug", project_name AS "projectName",
            file_name AS "fileName"
     FROM usage_upload_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit) || 25))]
  );
  return rows;
}

module.exports = {
  recordUploadEvent,
  updateProjectVersionByteSize,
  insertSnapshots,
  getLatestSnapshots,
  getSnapshotHistory,
  getUploadTotals,
  getRecentUploads,
};
