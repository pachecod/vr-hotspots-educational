const path = require('path');
const fs = require('fs');
const b2Service = require('../../services/b2-service');
const projectVersionsDb = require('../../services/project-versions-db');
const submissionsDb = require('../../services/submissions-db');
const { query, isDbEnabled } = require('../../services/db-service');
const { purgeProjectThread } = require('../purge-project-thread');
const {
  loadSubmissionsLog,
  writeSubmissionsLog,
} = require('../legacy-submissions');
const {
  buildStudentAssetKey,
  buildOrphanAssetKey,
  buildCommonAssetKey,
  deleteTagsForKey,
} = require('../asset-tags');
const { buildRemotePath } = require('../common-assets');
const {
  deleteFlatPageB2Files,
  removeHostedFlatPageDir,
  HOSTED_DIR,
  studentHostedPrefix,
} = require('./flat-page-purge');

async function recordPurgedB2Path(b2Path) {
  if (!isDbEnabled() || !b2Path) return;
  try {
    await query(
      `INSERT INTO purged_b2_paths (b2_path) VALUES ($1) ON CONFLICT (b2_path) DO NOTHING`,
      [b2Path]
    );
  } catch (_) {}
}

async function isB2PathPurged(b2Path) {
  if (!isDbEnabled() || !b2Path) return false;
  const { rows } = await query(`SELECT 1 FROM purged_b2_paths WHERE b2_path = $1`, [b2Path]);
  return rows.length > 0;
}

function removeHostedDir(hostedPath) {
  if (!hostedPath || hostedPath.includes('..') || hostedPath.includes('/')) return false;
  const hostedDir = path.join(HOSTED_DIR, hostedPath);
  if (!fs.existsSync(hostedDir)) return false;
  fs.rmSync(hostedDir, { recursive: true, force: true });
  return true;
}

async function purgeFlatPage(studentId, slug) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: ['flat_page_projects'] };
  let b2Prefix = null;
  let filesManifest = [];
  let hostedPath = null;

  if (isDbEnabled()) {
    const { rows } = await query(
      `SELECT b2_prefix, files_manifest, hosted_path FROM flat_page_projects
       WHERE student_id = $1 AND slug = $2`,
      [studentId, slug]
    );
    if (rows.length) {
      b2Prefix = rows[0].b2_prefix;
      filesManifest = Array.isArray(rows[0].files_manifest) ? rows[0].files_manifest : [];
      hostedPath = rows[0].hosted_path || null;
    }
  }

  if (b2Prefix) {
    manifest.b2Paths.push(b2Prefix);
    await deleteFlatPageB2Files(b2Prefix, filesManifest);
  }

  const diskCandidate = studentId ? `${studentHostedPrefix(studentId)}${slug}` : null;
  if (hostedPath) manifest.diskPaths.push(hostedPath);
  if (diskCandidate) manifest.diskPaths.push(diskCandidate);
  removeHostedFlatPageDir(studentId, slug, hostedPath);

  if (isDbEnabled()) {
    await query(`DELETE FROM flat_page_projects WHERE student_id = $1 AND slug = $2`, [
      studentId,
      slug,
    ]);
  }

  return manifest;
}

async function purgeVrTour(studentId, slug) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: ['student_published_tours'] };
  let hostedPath = null;

  if (isDbEnabled()) {
    const { rows } = await query(
      `SELECT hosted_path FROM student_published_tours WHERE student_id = $1 AND slug = $2`,
      [studentId, slug]
    );
    if (rows.length) hostedPath = rows[0].hosted_path;
  }

  if (!hostedPath && studentId) {
    const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
    hostedPath = `vr-${shortId}-${slug}`;
  }

  if (hostedPath) {
    manifest.diskPaths.push(hostedPath);
    removeHostedDir(hostedPath);
  }

  if (isDbEnabled() && studentId) {
    await query(`DELETE FROM student_published_tours WHERE student_id = $1 AND slug = $2`, [
      studentId,
      slug,
    ]);
  }

  return manifest;
}

async function purgeHostedSubmission({ versionId, fileName } = {}) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: [] };

  if (versionId && isDbEnabled()) {
    const version = await projectVersionsDb.getVersionById(versionId);
    if (version && version.hostedPath) {
      manifest.diskPaths.push(version.hostedPath);
      removeHostedDir(version.hostedPath);
      await projectVersionsDb.updateVersionHosting(version.id, {
        hostedPath: null,
        hostedUrl: null,
        isHosted: false,
      });
      manifest.dbTables.push('project_versions (hosting cleared)');
    }
    return manifest;
  }

  if (fileName) {
    if (isDbEnabled()) {
      const version = await projectVersionsDb.getVersionByFileName(fileName);
      if (version && version.hostedPath) {
        manifest.diskPaths.push(version.hostedPath);
        removeHostedDir(version.hostedPath);
        await projectVersionsDb.updateVersionHosting(version.id, {
          hostedPath: null,
          hostedUrl: null,
          isHosted: false,
        });
        manifest.dbTables.push('project_versions (hosting cleared)');
        return manifest;
      }
    }

    const logs = loadSubmissionsLog();
    const submission = logs.find((sub) => sub.fileName === fileName);
    if (submission && submission.hostedPath) {
      manifest.diskPaths.push(submission.hostedPath);
      removeHostedDir(submission.hostedPath);
      delete submission.hostedPath;
      delete submission.hostedUrl;
      delete submission.hostedAt;
      submission.isHosted = false;
      writeSubmissionsLog(logs);
      manifest.dbTables.push('submissions.json');
    }
    if (isDbEnabled()) {
      await submissionsDb.updateSubmissionHosting(fileName, {
        hostedPath: null,
        hostedUrl: null,
        isHosted: false,
      });
      manifest.dbTables.push('submissions (hosting cleared)');
    }
  }

  return manifest;
}

async function purgeCommonAsset(category, filename) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: ['asset_tags'] };
  const remotePath = buildRemotePath(category, filename);
  manifest.b2Paths.push(remotePath);
  await b2Service.deleteCommonAsset(remotePath);
  await deleteTagsForKey(buildCommonAssetKey(category, filename));
  try {
    const { invalidateCommonAssetsListCache } = require('../../routes/common-assets-routes');
    invalidateCommonAssetsListCache();
  } catch (_) {}
  return manifest;
}

async function purgeTemplate(id) {
  const { deleteTemplate } = require('../templates');
  await deleteTemplate(id);
  return { b2Paths: [], diskPaths: [], dbTables: ['project_templates'] };
}

async function purgeSnippet(id) {
  const { deleteSnippet } = require('../snippets');
  await deleteSnippet(id);
  return { b2Paths: [], diskPaths: [], dbTables: ['snippets'] };
}

function parseCommonAssetId(id, category, filename) {
  if (category && filename) return { category, filename };
  if (id && String(id).includes('::')) {
    const [cat, name] = String(id).split('::');
    return { category: cat, filename: name };
  }
  return { category, filename };
}

async function purgeAssetById(assetId) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: ['student_assets', 'asset_tags'] };
  const { rows } = await query(
    `SELECT id, student_id, category, filename, b2_path, ownership FROM student_assets WHERE id = $1`,
    [assetId]
  );
  if (!rows.length) return null;
  const row = rows[0];

  if (row.b2_path) {
    manifest.b2Paths.push(row.b2_path);
    try {
      await b2Service.deleteFile(row.b2_path);
      await recordPurgedB2Path(row.b2_path);
    } catch (err) {
      console.warn('B2 delete warning:', err.message);
    }
  }

  await query(`DELETE FROM student_assets WHERE id = $1`, [assetId]);

  if (row.ownership === 'orphaned') {
    await deleteTagsForKey(buildOrphanAssetKey(assetId));
  } else if (row.student_id) {
    await deleteTagsForKey(buildStudentAssetKey(row.student_id, row.category, row.filename));
  }

  return manifest;
}

async function purgeAsset({ studentId, category, filename }) {
  const { rows } = await query(
    `SELECT id FROM student_assets
     WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
    [studentId, category, filename]
  );
  if (!rows.length) return null;
  return purgeAssetById(rows[0].id);
}

async function purgeLegacySubmission(fileName) {
  const manifest = { b2Paths: [], diskPaths: [], dbTables: ['submissions', 'submissions.json'] };

  if (isDbEnabled()) {
    const version = await projectVersionsDb.getVersionByFileName(fileName);
    if (version && version.threadId) {
      const removed = await purgeProjectThread(version.threadId);
      return { removedVersions: removed, b2Paths: [], diskPaths: [], dbTables: ['project_threads'] };
    }
  }

  let remotePath = `student-projects/${fileName}`;
  try {
    remotePath = await resolveLegacyRemotePath(fileName);
  } catch (_) {}

  manifest.b2Paths.push(remotePath);
  try {
    await b2Service.deleteFile(remotePath);
    await recordPurgedB2Path(remotePath);
  } catch (err) {
    console.warn('B2 delete warning:', err.message);
  }

  if (fs.existsSync('submissions.json')) {
    const logs = loadSubmissionsLog();
    const submission = logs.find((sub) => sub.fileName === fileName);
    if (submission && submission.hostedPath) {
      manifest.diskPaths.push(submission.hostedPath);
      removeHostedDir(submission.hostedPath);
    }
    writeSubmissionsLog(logs.filter((sub) => sub.fileName !== fileName));
  }

  if (isDbEnabled()) {
    await submissionsDb.deleteSubmission(fileName);
  }

  return manifest;
}

async function resolveLegacyRemotePath(fileName) {
  if (isDbEnabled()) {
    const { rows } = await query(`SELECT remote_path FROM submissions WHERE file_name = $1`, [
      fileName,
    ]);
    if (rows.length && rows[0].remote_path) return rows[0].remote_path;
  }
  const logs = loadSubmissionsLog();
  const submission = logs.find((sub) => sub.fileName === fileName);
  if (submission && submission.remotePath) return submission.remotePath;
  return `student-projects/${fileName}`;
}

async function orphanStudentAssets(studentId) {
  if (!isDbEnabled()) return { orphaned: 0 };

  const { rows: studentRows } = await query(
    `SELECT s.display_name, s.username, c.name AS class_name
     FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`,
    [studentId]
  );
  if (!studentRows.length) return { orphaned: 0 };
  const student = studentRows[0];
  const meta = {
    studentId,
    displayName: student.display_name,
    username: student.username,
    className: student.class_name,
    deletedAt: new Date().toISOString(),
  };

  const { rowCount } = await query(
    `UPDATE student_assets
     SET ownership = 'orphaned', student_id = NULL, orphaned_from = $2::jsonb
     WHERE student_id = $1 AND ownership = 'student'`,
    [studentId, JSON.stringify(meta)]
  );

  return { orphaned: rowCount };
}

async function purgeStudentProjectsAndPages(studentId) {
  const summary = { threads: 0, flatPages: 0, vrTours: 0 };

  if (!isDbEnabled()) return summary;

  const { rows: threads } = await query(`SELECT id FROM project_threads WHERE student_id = $1`, [
    studentId,
  ]);
  for (const row of threads) {
    await purgeProjectThread(row.id);
    summary.threads++;
  }

  const { rows: flatPages } = await query(
    `SELECT slug FROM flat_page_projects WHERE student_id = $1`,
    [studentId]
  );
  for (const row of flatPages) {
    await purgeFlatPage(studentId, row.slug);
    summary.flatPages++;
  }

  const { rows: tours } = await query(
    `SELECT slug FROM student_published_tours WHERE student_id = $1`,
    [studentId]
  );
  for (const row of tours) {
    await purgeVrTour(studentId, row.slug);
    summary.vrTours++;
  }

  if (fs.existsSync(HOSTED_DIR)) {
    const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
    const prefixes = [`flat-${shortId}-`, `vr-${shortId}-`];
    for (const entry of fs.readdirSync(HOSTED_DIR)) {
      if (prefixes.some((p) => entry.startsWith(p))) {
        removeHostedDir(entry);
      }
    }
  }

  if (isDbEnabled()) {
    await query(`DELETE FROM submissions WHERE student_id = $1`, [studentId]);
  }

  return summary;
}

async function purgeStudentAccount(studentId) {
  await purgeStudentProjectsAndPages(studentId);
  const { orphaned } = await orphanStudentAssets(studentId);
  if (isDbEnabled()) {
    await query(`DELETE FROM students WHERE id = $1`, [studentId]);
  }
  return { orphaned };
}

async function describePurge({ type, id, studentId, slug, category, filename, fileName, versionId }) {
  const manifest = { type, id, willRemove: { b2Paths: [], diskPaths: [], dbTables: [] }, preserved: [] };

  switch (type) {
    case 'project':
      manifest.willRemove.dbTables.push(
        'project_versions',
        'project_threads',
        'submissions (legacy rows)'
      );
      manifest.preserved.push('student_assets (My Assets / content manager)');
      if (!isDbEnabled()) break;
      {
        const versions = await projectVersionsDb.listRawVersionsForThread(id);
        for (const v of versions) {
          if (v.b2_path) manifest.willRemove.b2Paths.push(v.b2_path);
          if (v.hosted_path) manifest.willRemove.diskPaths.push(v.hosted_path);
        }
      }
      break;
    case 'flat_page':
      if (isDbEnabled()) {
        const { rows } = await query(
          `SELECT b2_prefix, hosted_path FROM flat_page_projects WHERE student_id = $1 AND slug = $2`,
          [studentId, slug || id]
        );
        if (rows.length) {
          if (rows[0].b2_prefix) manifest.willRemove.b2Paths.push(rows[0].b2_prefix);
          if (rows[0].hosted_path) manifest.willRemove.diskPaths.push(rows[0].hosted_path);
        }
      }
      manifest.willRemove.dbTables.push('flat_page_projects');
      break;
    case 'vr_tour':
      if (isDbEnabled()) {
        const { rows } = await query(
          `SELECT hosted_path FROM student_published_tours WHERE student_id = $1 AND slug = $2`,
          [studentId, slug || id]
        );
        if (rows.length && rows[0].hosted_path) {
          manifest.willRemove.diskPaths.push(rows[0].hosted_path);
        }
      }
      manifest.willRemove.dbTables.push('student_published_tours');
      break;
    case 'asset':
    case 'orphan_asset':
      {
        const { rows } = await query(
          `SELECT b2_path FROM student_assets WHERE id = $1`,
          [id]
        );
        if (rows.length && rows[0].b2_path) manifest.willRemove.b2Paths.push(rows[0].b2_path);
        manifest.willRemove.dbTables.push('student_assets', 'asset_tags');
      }
      break;
    case 'legacy_submission':
      manifest.willRemove.b2Paths.push(`student-projects/${fileName || id}`);
      manifest.willRemove.dbTables.push('submissions', 'submissions.json');
      break;
    case 'common_asset': {
      const parsed = parseCommonAssetId(id, category, filename);
      if (parsed.category && parsed.filename) {
        manifest.willRemove.b2Paths.push(
          buildRemotePath(parsed.category, parsed.filename)
        );
      }
      manifest.willRemove.dbTables.push('asset_tags', 'common-assets (B2)');
      break;
    }
    case 'template':
      manifest.willRemove.dbTables.push('project_templates');
      break;
    case 'snippet':
      manifest.willRemove.dbTables.push('snippets');
      break;
    case 'hosted_submission':
      if (versionId) {
        const version = await projectVersionsDb.getVersionById(versionId);
        if (version && version.hostedPath) {
          manifest.willRemove.diskPaths.push(version.hostedPath);
        }
        manifest.willRemove.dbTables.push('project_versions (hosting cleared)');
      }
      break;
    default:
      break;
  }

  return manifest;
}

async function purgeContentItem({ type, id, studentId, slug, category, filename, fileName, versionId }) {
  switch (type) {
    case 'project':
      return { removedVersions: await purgeProjectThread(id) };
    case 'flat_page':
      return purgeFlatPage(studentId, slug || id);
    case 'vr_tour':
      return purgeVrTour(studentId, slug || id);
    case 'asset':
      return purgeAssetById(id);
    case 'orphan_asset':
      return purgeAssetById(id);
    case 'legacy_submission':
      return purgeLegacySubmission(fileName || id);
    case 'common_asset': {
      const parsed = parseCommonAssetId(id, category, filename);
      return purgeCommonAsset(parsed.category, parsed.filename);
    }
    case 'template':
      return purgeTemplate(id);
    case 'snippet':
      return purgeSnippet(id);
    case 'hosted_submission':
      return purgeHostedSubmission({ versionId: versionId || id, fileName });
    default:
      throw new Error(`Unknown content type: ${type}`);
  }
}

module.exports = {
  purgeProjectThread,
  purgeFlatPage,
  purgeVrTour,
  purgeHostedSubmission,
  purgeAsset,
  purgeAssetById,
  purgeLegacySubmission,
  purgeCommonAsset,
  purgeTemplate,
  purgeSnippet,
  orphanStudentAssets,
  purgeStudentProjectsAndPages,
  purgeStudentAccount,
  purgeContentItem,
  describePurge,
  recordPurgedB2Path,
  isB2PathPurged,
  removeHostedDir,
  HOSTED_DIR,
};
