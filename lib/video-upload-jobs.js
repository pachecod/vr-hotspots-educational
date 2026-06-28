const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map();

function createUploadJob({ fileName, category, ownerStudentId = null }) {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const job = {
    id,
    fileName,
    category,
    ownerStudentId,
    phase: 'queued',
    transcodePercent: 0,
    message: 'Waiting to compress video…',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    asset: null,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

function updateUploadJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
}

function getUploadJob(jobId) {
  return jobs.get(jobId) || null;
}

function completeUploadJob(jobId, asset) {
  return updateUploadJob(jobId, {
    phase: 'done',
    transcodePercent: 100,
    message: 'Complete',
    asset,
  });
}

function failUploadJob(jobId, message) {
  return updateUploadJob(jobId, {
    phase: 'error',
    message: message || 'Upload failed',
    error: message || 'Upload failed',
  });
}

function deleteUploadJob(jobId) {
  jobs.delete(jobId);
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    const updated = new Date(job.updatedAt).getTime();
    if (updated < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

module.exports = {
  createUploadJob,
  updateUploadJob,
  getUploadJob,
  completeUploadJob,
  failUploadJob,
  deleteUploadJob,
};
