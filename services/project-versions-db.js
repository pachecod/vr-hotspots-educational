const { query, slugify, withClient, isDbEnabled } = require('./db-service');

const NOTE_MAX_LEN = 2000;

function trimNote(note) {
  if (note == null || note === '') return null;
  return String(note).trim().slice(0, NOTE_MAX_LEN) || null;
}

function formatVersionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    versionNumber: row.version_number,
    kind: row.kind,
    b2Path: row.b2_path,
    fileName: row.file_name,
    studentNote: row.student_note,
    adminNote: row.admin_note,
    parentVersionId: row.parent_version_id,
    createdBy: row.created_by,
    studentSeenAt: row.student_seen_at,
    submittedAt: row.submitted_at,
    hostedPath: row.hosted_path,
    hostedUrl: row.hosted_url,
    hostedAt: row.hosted_at,
    isHosted: row.is_hosted,
    createdAt: row.created_at,
    projectName: row.project_name,
    projectSlug: row.project_slug,
    studentId: row.student_id,
    studentDisplayName: row.student_display_name || row.display_name,
    className: row.class_name,
    classId: row.class_id,
    classSlug: row.class_slug,
  };
}


async function findOrCreateThread(client, { studentId, projectName }) {
  const projectSlug = slugify(projectName) || 'project';
  const q = client ? client.query.bind(client) : query;

  const existing = await q(
    `SELECT * FROM project_threads WHERE student_id = $1 AND project_slug = $2`,
    [studentId, projectSlug]
  );
  if (existing.rows.length) return existing.rows[0];

  const inserted = await q(
    `INSERT INTO project_threads (student_id, project_name, project_slug)
     VALUES ($1, $2, $3) RETURNING *`,
    [studentId, projectName.trim(), projectSlug]
  );
  return inserted.rows[0];
}

async function getNextVersionNumber(client, threadId) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM project_versions WHERE thread_id = $1`,
    [threadId]
  );
  return rows[0].next;
}

function buildVersionedB2Path({ classSlug, studentId, projectSlug, versionNumber, timestamp }) {
  const v = String(versionNumber).padStart(3, '0');
  const ts = timestamp || Date.now();
  const fileName = `v${v}_${ts}.zip`;
  return {
    fileName,
    b2Path: `student-projects/${classSlug}/${studentId}/${projectSlug}/${fileName}`,
  };
}

async function reserveVersionPath({ studentId, classSlug, projectName, threadId }) {
  if (!isDbEnabled()) return null;

  return withClient(async (client) => {
    let thread;
    if (threadId) {
      const { rows } = await client.query(
        `SELECT * FROM project_threads WHERE id = $1 FOR UPDATE`,
        [threadId]
      );
      if (!rows.length || rows[0].student_id !== studentId) {
        throw new Error('Invalid project thread');
      }
      thread = rows[0];
    } else {
      thread = await findOrCreateThread(client, { studentId, projectName });
      await client.query(`SELECT * FROM project_threads WHERE id = $1 FOR UPDATE`, [thread.id]);
    }

    const versionNumber = await getNextVersionNumber(client, thread.id);
    const { fileName, b2Path } = buildVersionedB2Path({
      classSlug: classSlug || 'default',
      studentId,
      projectSlug: thread.project_slug,
      versionNumber,
    });

    return {
      fileName,
      b2Path,
      threadId: thread.id,
      versionNumber,
      projectSlug: thread.project_slug,
    };
  });
}

async function createVersion({
  studentId,
  projectName,
  fileName,
  b2Path,
  kind,
  createdBy,
  studentNote,
  adminNote,
  parentVersionId,
  threadId,
  versionNumber: preReservedVersionNumber,
}) {
  if (!isDbEnabled()) return null;

  return withClient(async (client) => {
    let thread;
    if (threadId) {
      const { rows } = await client.query(`SELECT * FROM project_threads WHERE id = $1`, [threadId]);
      if (!rows.length || rows[0].student_id !== studentId) {
        throw new Error('Invalid project thread');
      }
      thread = rows[0];
    } else {
      thread = await findOrCreateThread(client, { studentId, projectName });
    }

    const versionNumber =
      preReservedVersionNumber != null
        ? preReservedVersionNumber
        : await getNextVersionNumber(client, thread.id);
    const submittedAt = kind === 'submitted' ? new Date() : null;

    const { rows } = await client.query(
      `INSERT INTO project_versions (
        thread_id, version_number, kind, b2_path, file_name,
        student_note, admin_note, parent_version_id, created_by, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        thread.id,
        versionNumber,
        kind,
        b2Path,
        fileName,
        trimNote(studentNote),
        trimNote(adminNote),
        parentVersionId || null,
        createdBy,
        submittedAt,
      ]
    );

    return {
      version: rows[0],
      thread,
      versionNumber,
    };
  });
}

async function getVersionById(versionId) {
  const { rows } = await query(
    `SELECT pv.*, pt.project_name, pt.project_slug, pt.student_id,
            s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id,
            c.slug AS class_slug
     FROM project_versions pv
     JOIN project_threads pt ON pt.id = pv.thread_id
     LEFT JOIN students s ON s.id = pt.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE pv.id = $1`,
    [versionId]
  );
  return formatVersionRow(rows[0]);
}

async function getVersionByFileName(fileName) {
  const { rows } = await query(
    `SELECT pv.*, pt.project_name, pt.project_slug, pt.student_id,
            s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id,
            c.slug AS class_slug
     FROM project_versions pv
     JOIN project_threads pt ON pt.id = pv.thread_id
     LEFT JOIN students s ON s.id = pt.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE pv.file_name = $1`,
    [fileName]
  );
  return formatVersionRow(rows[0]);
}

async function listStudentProjects(studentId) {
  const { rows } = await query(
    `SELECT pt.id AS thread_id, pt.project_name, pt.project_slug, pt.created_at AS thread_created_at,
            lv.id AS latest_version_id, lv.version_number AS latest_version_number,
            lv.kind AS latest_kind, lv.student_note, lv.admin_note, lv.submitted_at, lv.created_at AS latest_created_at,
            lv.student_seen_at,
            (SELECT COUNT(*)::int FROM project_versions pv2
             WHERE pv2.thread_id = pt.id AND pv2.kind = 'admin_return' AND pv2.student_seen_at IS NULL) AS unread_feedback
     FROM project_threads pt
     LEFT JOIN LATERAL (
       SELECT * FROM project_versions pv
       WHERE pv.thread_id = pt.id
       ORDER BY pv.version_number DESC
       LIMIT 1
     ) lv ON TRUE
     WHERE pt.student_id = $1
     ORDER BY COALESCE(lv.submitted_at, lv.created_at, pt.created_at) DESC`,
    [studentId]
  );
  return rows.map((r) => ({
    threadId: r.thread_id,
    projectName: r.project_name,
    projectSlug: r.project_slug,
    threadCreatedAt: r.thread_created_at,
    latestVersionId: r.latest_version_id,
    latestVersionNumber: r.latest_version_number,
    latestKind: r.latest_kind,
    studentNote: r.student_note,
    adminNote: r.admin_note,
    submittedAt: r.submitted_at,
    latestCreatedAt: r.latest_created_at,
    studentSeenAt: r.student_seen_at,
    unreadFeedback: r.unread_feedback || 0,
  }));
}

async function listThreadVersions(threadId, { studentId } = {}) {
  let sql = `SELECT pv.*, pt.project_name, pt.project_slug, pt.student_id,
                    s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id,
                    c.slug AS class_slug
             FROM project_versions pv
             JOIN project_threads pt ON pt.id = pv.thread_id
             LEFT JOIN students s ON s.id = pt.student_id
             LEFT JOIN classes c ON c.id = s.class_id
             WHERE pv.thread_id = $1`;
  const params = [threadId];
  if (studentId) {
    params.push(studentId);
    sql += ` AND pt.student_id = $${params.length}`;
  }
  sql += ` ORDER BY pv.version_number DESC`;
  const { rows } = await query(sql, params);
  return rows.map(formatVersionRow);
}

async function listAdminInbox({ classId, studentId, filter } = {}) {
  let sql = `SELECT DISTINCT ON (pt.id)
               pv.*, pt.project_name, pt.project_slug, pt.student_id,
               s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id,
               c.slug AS class_slug
             FROM project_threads pt
             JOIN project_versions pv ON pv.thread_id = pt.id AND pv.kind = 'submitted'
             LEFT JOIN students s ON s.id = pt.student_id
             LEFT JOIN classes c ON c.id = s.class_id
             WHERE 1=1`;
  const params = [];
  if (classId) {
    params.push(classId);
    sql += ` AND c.id = $${params.length}`;
  }
  if (studentId) {
    params.push(studentId);
    sql += ` AND pt.student_id = $${params.length}`;
  }
  if (filter === 'with_notes') {
    sql += ` AND pv.student_note IS NOT NULL AND TRIM(pv.student_note) <> ''`;
  } else if (filter === 'without_notes') {
    sql += ` AND (pv.student_note IS NULL OR TRIM(pv.student_note) = '')`;
  }
  sql += ` ORDER BY pt.id, pv.version_number DESC, pv.submitted_at DESC NULLS LAST`;
  const { rows } = await query(sql, params);
  return rows.map(formatVersionRow);
}

async function markVersionSeen(versionId, studentId) {
  await query(
    `UPDATE project_versions pv
     SET student_seen_at = NOW()
     FROM project_threads pt
     WHERE pv.id = $1 AND pv.thread_id = pt.id AND pt.student_id = $2`,
    [versionId, studentId]
  );
}

async function updateVersionHosting(versionId, { hostedPath, hostedUrl, isHosted }) {
  await query(
    `UPDATE project_versions SET hosted_path = $1, hosted_url = $2, is_hosted = $3,
     hosted_at = CASE WHEN $3 THEN NOW() ELSE NULL END
     WHERE id = $4`,
    [hostedPath || null, hostedUrl || null, !!isHosted, versionId]
  );
}

async function deleteVersion(versionId) {
  await query(`DELETE FROM project_versions WHERE id = $1`, [versionId]);
}

async function getUnreadFeedbackCount(studentId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM project_versions pv
     JOIN project_threads pt ON pt.id = pv.thread_id
     WHERE pt.student_id = $1 AND pv.kind = 'admin_return' AND pv.student_seen_at IS NULL`,
    [studentId]
  );
  return rows[0]?.count || 0;
}

async function listAllVersionsForStudent(studentId) {
  const { rows } = await query(
    `SELECT pv.*, pt.project_name, pt.project_slug, pt.student_id,
            s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id,
            c.slug AS class_slug
     FROM project_versions pv
     JOIN project_threads pt ON pt.id = pv.thread_id
     LEFT JOIN students s ON s.id = pt.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE pt.student_id = $1
     ORDER BY pv.created_at DESC`,
    [studentId]
  );
  return rows.map(formatVersionRow);
}

async function importLegacySubmissions() {
  if (!isDbEnabled()) return { imported: 0 };
  const { rows: subs } = await query(`SELECT * FROM submissions ORDER BY submitted_at ASC`);
  let imported = 0;

  for (const sub of subs) {
    const exists = await query(`SELECT id FROM project_versions WHERE file_name = $1`, [sub.file_name]);
    if (exists.rows.length) continue;

    if (!sub.student_id) continue;

    const thread = await findOrCreateThread(null, {
      studentId: sub.student_id,
      projectName: sub.project_name || 'VR_Project',
    });

    const versionNumber = await getNextVersionNumber(null, thread.id);
    await query(
      `INSERT INTO project_versions (
        thread_id, version_number, kind, b2_path, file_name, created_by, submitted_at,
        hosted_path, hosted_url, hosted_at, is_hosted
      ) VALUES ($1, $2, 'submitted', $3, $4, 'student', $5, $6, $7, $8, $9)`,
      [
        thread.id,
        versionNumber,
        sub.remote_path,
        sub.file_name,
        sub.submitted_at,
        sub.hosted_path,
        sub.hosted_url,
        sub.hosted_at,
        !!sub.is_hosted,
      ]
    );
    imported++;
  }

  return { imported };
}

module.exports = {
  NOTE_MAX_LEN,
  trimNote,
  buildVersionedB2Path,
  reserveVersionPath,
  createVersion,
  findOrCreateThread,
  getVersionById,
  getVersionByFileName,
  listStudentProjects,
  listThreadVersions,
  listAdminInbox,
  listAllVersionsForStudent,
  markVersionSeen,
  updateVersionHosting,
  deleteVersion,
  getUnreadFeedbackCount,
  importLegacySubmissions,
  formatVersionRow,
};
