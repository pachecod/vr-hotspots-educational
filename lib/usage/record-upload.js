const usageDb = require('./usage-db');
const b2Service = require('../../services/b2-service');

function classSlugFromPath(remotePath) {
  const parts = String(remotePath || '').split('/');
  if (parts[0] === 'student-projects' && parts[1]) return parts[1];
  return null;
}

/**
 * Record bytes for a cloud draft/submit after the client uploaded to B2.
 * Prefers client-provided byteSize; falls back to B2 getFileInfo.
 */
async function recordProjectUploadBytes({
  kind,
  byteSize,
  remotePath,
  fileName,
  projectName,
  studentId,
  classSlug,
}) {
  let size = Number(byteSize);
  if (!Number.isFinite(size) || size <= 0) {
    try {
      const info = await b2Service.getFileInfo(remotePath);
      size = info ? Number(info.contentLength) || 0 : 0;
    } catch (_) {
      size = 0;
    }
  }
  size = Math.max(0, size || 0);

  try {
    await usageDb.recordUploadEvent({
      kind: kind === 'draft' ? 'draft' : kind === 'submitted' ? 'submitted' : String(kind || 'other'),
      byteSize: size,
      b2Path: remotePath || null,
      classSlug: classSlug || classSlugFromPath(remotePath),
      studentId: studentId || null,
      projectName: projectName || null,
      fileName: fileName || null,
    });
  } catch (err) {
    console.warn('usage upload event failed:', err.message);
  }

  if (remotePath && size > 0) {
    try {
      await usageDb.updateProjectVersionByteSize(remotePath, size);
    } catch (err) {
      console.warn('usage version byte_size update failed:', err.message);
    }
  }

  return size;
}

module.exports = { recordProjectUploadBytes, classSlugFromPath };
