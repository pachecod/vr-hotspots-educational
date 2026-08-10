/**
 * Ensure client-supplied B2 paths stay under the authenticated student's prefix.
 */
function assertStudentOwnedRemotePath(remotePath, { classSlug, studentId } = {}) {
  if (!remotePath || typeof remotePath !== 'string') {
    const err = new Error('remotePath is required');
    err.statusCode = 400;
    throw err;
  }
  const normalized = remotePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.includes('\0')) {
    const err = new Error('Invalid remotePath');
    err.statusCode = 400;
    throw err;
  }
  const slug = String(classSlug || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const sid = String(studentId || '').trim();
  if (!sid) {
    const err = new Error('Student session required for remotePath');
    err.statusCode = 400;
    throw err;
  }
  const prefix = `student-projects/${slug}/${sid}/`;
  if (!normalized.startsWith(prefix)) {
    const err = new Error('remotePath must be under your student-projects folder');
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

module.exports = { assertStudentOwnedRemotePath };
