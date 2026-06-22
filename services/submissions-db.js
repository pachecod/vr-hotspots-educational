const { query, isDbEnabled } = require('./db-service');

async function createSubmission({
  studentId,
  studentName,
  projectName,
  fileName,
  remotePath,
  syncedFromB2 = false,
}) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `INSERT INTO submissions (
      student_id, student_name, project_name, file_name, remote_path, synced_from_b2
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (file_name) DO UPDATE SET
      student_id = EXCLUDED.student_id,
      student_name = EXCLUDED.student_name,
      project_name = EXCLUDED.project_name,
      remote_path = EXCLUDED.remote_path,
      updated_at = NOW()
    RETURNING *`,
    [studentId || null, studentName, projectName, fileName, remotePath, syncedFromB2]
  );
  return rows[0];
}

async function listSubmissions({ classId, studentId } = {}) {
  if (!isDbEnabled()) return [];
  let sql = `SELECT sub.*, s.display_name AS student_display_name, c.name AS class_name, c.id AS class_id
             FROM submissions sub
             LEFT JOIN students s ON s.id = sub.student_id
             LEFT JOIN classes c ON c.id = s.class_id`;
  const clauses = [];
  const params = [];
  if (classId) {
    params.push(classId);
    clauses.push(`c.id = $${params.length}`);
  }
  if (studentId) {
    params.push(studentId);
    clauses.push(`sub.student_id = $${params.length}`);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ` ORDER BY sub.submitted_at DESC`;
  const { rows } = await query(sql, params);
  return rows.map(formatSubmissionRow);
}

function formatSubmissionRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentDisplayName: row.student_display_name || row.student_name,
    className: row.class_name || null,
    classId: row.class_id || null,
    projectName: row.project_name,
    fileName: row.file_name,
    remotePath: row.remote_path,
    hostedPath: row.hosted_path,
    hostedUrl: row.hosted_url,
    hostedAt: row.hosted_at,
    isHosted: row.is_hosted,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    syncedFromB2: row.synced_from_b2,
  };
}

async function getSubmissionByFileName(fileName) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(`SELECT * FROM submissions WHERE file_name = $1`, [fileName]);
  return rows[0] || null;
}

async function updateSubmissionHosting(fileName, { hostedPath, hostedUrl, isHosted }) {
  if (!isDbEnabled()) return;
  await query(
    `UPDATE submissions SET hosted_path = $1, hosted_url = $2, is_hosted = $3,
     hosted_at = CASE WHEN $3 THEN NOW() ELSE NULL END, updated_at = NOW()
     WHERE file_name = $4`,
    [hostedPath || null, hostedUrl || null, !!isHosted, fileName]
  );
}

async function deleteSubmission(fileName) {
  if (!isDbEnabled()) return;
  await query(`DELETE FROM submissions WHERE file_name = $1`, [fileName]);
}

module.exports = {
  createSubmission,
  listSubmissions,
  getSubmissionByFileName,
  updateSubmissionHosting,
  deleteSubmission,
  formatSubmissionRow,
};
