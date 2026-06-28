const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const projectVersionsDb = require('../services/project-versions-db');
const submissionsDb = require('../services/submissions-db');
const { query, isDbEnabled } = require('../services/db-service');

async function purgeProjectThread(threadId) {
  const versions = await projectVersionsDb.listRawVersionsForThread(threadId);
  for (const version of versions) {
    if (version.b2_path) {
      try {
        await b2Service.deleteFile(version.b2_path);
      } catch (err) {
        console.warn('B2 delete warning:', err.message);
      }
    }
    if (version.hosted_path) {
      const hostedDir = path.join('hosted-projects', version.hosted_path);
      if (fs.existsSync(hostedDir)) {
        fs.rmSync(hostedDir, { recursive: true, force: true });
      }
    }
    if (version.file_name) {
      try {
        await submissionsDb.deleteSubmission(version.file_name);
      } catch (err) {
        console.warn('Submissions row delete warning:', err.message);
      }
    }
  }
  await projectVersionsDb.deleteThread(threadId);
  return versions.length;
}

/** Threads left with only teacher feedback/drafts after submitted rows were removed individually. */
async function purgeOrphanProjectThreads() {
  if (!isDbEnabled()) return { purged: 0 };
  const { rows } = await query(
    `SELECT pt.id FROM project_threads pt
     WHERE EXISTS (SELECT 1 FROM project_versions pv WHERE pv.thread_id = pt.id)
     AND NOT EXISTS (
       SELECT 1 FROM project_versions pv WHERE pv.thread_id = pt.id AND pv.kind = 'submitted'
     )`
  );
  let purged = 0;
  for (const row of rows) {
    await purgeProjectThread(row.id);
    purged++;
  }
  return { purged };
}

/** Empty project threads with no versions at all. */
async function purgeEmptyProjectThreads() {
  if (!isDbEnabled()) return { purged: 0 };
  const { rows } = await query(
    `SELECT pt.id FROM project_threads pt
     WHERE NOT EXISTS (SELECT 1 FROM project_versions pv WHERE pv.thread_id = pt.id)`
  );
  let purged = 0;
  for (const row of rows) {
    await projectVersionsDb.deleteThread(row.id);
    purged++;
  }
  return { purged };
}

module.exports = { purgeProjectThread, purgeOrphanProjectThreads, purgeEmptyProjectThreads };
