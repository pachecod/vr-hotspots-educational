const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const archiver = require('archiver');
const { purgeProjectThread } = require('../lib/purge-project-thread');
const { purgeContentItem, purgeHostedSubmission } = require('../lib/student-content/purge');
const { setHostedGalleryFeatured } = require('../services/hosted-projects-gallery');
const projectVersionsDb = require('../services/project-versions-db');
const b2Service = require('../services/b2-service');
const { isDbEnabled } = require('../services/db-service');
const {
  requireStudentStrict,
  isStudentAuthRequired,
  getStudentSession,
} = require('../student-auth');
const { assertCanSubmit } = require('../services/usage-quota');
const { listLegacyInbox, mergeB2OrphansIntoInbox } = require('../lib/legacy-submissions');
const { resolveHostedProjectUrls, resolveHostedProjectUrlsAsync, enrichInboxHosting } = require('../services/hosted-project-urls');
const {
  uploadHostedDirectory,
  materializeHostedProjectToDir,
  hostedProjectExists,
  hostedFileExists,
  listHostedProjectPaths,
  validateHostedPath,
  getHostedProjectUpdatedAt,
} = require('../lib/hosted-b2-storage');
const { query } = require('../services/db-service');
const { logAppError } = require('../lib/error-log');
const { repairMediaExtensionsInZip } = require('../lib/repair-media-extensions');

function sessDisplayName(req) {
  const sess = getStudentSession(req);
  return (sess && (sess.displayName || sess.username)) || 'unknown';
}

const STAGED_PROJECT_TTL_MS = 60 * 60 * 1000;

function cleanupStagedProjects() {
  const dir = path.join(process.cwd(), 'temp-uploads', 'staged');
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - STAGED_PROJECT_TTL_MS;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.zip')) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch (_) {}
  }
}

async function getActiveStudentWithClass(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.display_name, s.is_active, c.slug AS class_slug, c.name AS class_name
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1`,
    [studentId]
  );
  return rows[0] || null;
}

function formatHostedSlugTitle(slug) {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function isVrHotspotHostedProject(hostedPath) {
  if (!validateHostedPath(hostedPath)) return false;
  if (!(await hostedProjectExists(hostedPath))) return false;
  return hostedFileExists(hostedPath, 'config.json');
}

async function listHostedAssignableProjects() {
  const byPath = new Map();

  const addItem = (item) => {
    if (!item?.hostedPath || !validateHostedPath(item.hostedPath)) return;
    const existing = byPath.get(item.hostedPath);
    if (!existing || new Date(item.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      byPath.set(item.hostedPath, item);
    }
  };

  if (isDbEnabled()) {
    const { rows: submissionRows } = await query(
      `SELECT DISTINCT ON (pv.hosted_path)
              pv.hosted_path, pv.hosted_url, pv.hosted_at, pv.kind,
              pt.project_name, s.display_name AS student_name, s.username AS student_username,
              c.name AS class_name
       FROM project_versions pv
       JOIN project_threads pt ON pt.id = pv.thread_id
       JOIN students s ON s.id = pt.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE pv.is_hosted = TRUE AND pv.hosted_path IS NOT NULL
       ORDER BY pv.hosted_path, pv.version_number DESC`
    );
    for (const row of submissionRows) {
      const isRepair = row.kind === 'admin_repair';
      const who = row.student_username || row.student_name;
      const pathLabel = row.hosted_path;
      const title = isRepair
        ? `${row.project_name} · repaired (${pathLabel})`
        : row.project_name;
      addItem({
        hostedPath: row.hosted_path,
        tourUrl: row.hosted_url,
        title,
        source: isRepair ? 'repair' : 'submission',
        sourceLabel: isRepair ? 'Repaired copy' : 'Hosted submission',
        studentName: who,
        className: row.class_name,
        updatedAt: row.hosted_at,
        kind: row.kind,
      });
    }

    const { rows: tourRows } = await query(
      `SELECT t.hosted_path, t.hosted_url, t.slug, t.published_at,
              s.display_name AS student_name, c.name AS class_name
       FROM student_published_tours t
       JOIN students s ON s.id = t.student_id
       JOIN classes c ON c.id = s.class_id
       ORDER BY t.published_at DESC`
    );
    for (const row of tourRows) {
      addItem({
        hostedPath: row.hosted_path,
        tourUrl: row.hosted_url,
        title: formatHostedSlugTitle(row.slug),
        source: 'published_tour',
        sourceLabel: 'Published tour',
        studentName: row.student_name,
        className: row.class_name,
        updatedAt: row.published_at,
      });
    }
  }

  for (const hostedPath of await listHostedProjectPaths()) {
    if (byPath.has(hostedPath)) continue;
    if (!(await isVrHotspotHostedProject(hostedPath))) continue;
    let tourUrl = null;
    try {
      tourUrl = resolveHostedProjectUrls(hostedPath).tourUrl;
    } catch (_) {}
    addItem({
      hostedPath,
      tourUrl,
      title: formatHostedSlugTitle(hostedPath.replace(/^vr-preview-[^-]+-/, '').replace(/^vr-[^-]+-/, '')),
      source: 'hosted',
      sourceLabel: 'Hosted project',
      studentName: null,
      className: null,
      updatedAt: await getHostedProjectUpdatedAt(hostedPath),
    });
  }

  const items = [];
  for (const item of byPath.values()) {
    if (!(await isVrHotspotHostedProject(item.hostedPath))) continue;
    items.push(item);
  }

  items.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
  return items;
}

function registerSubmissionVersionRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe }) {
  function zipDirectoryToFile(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  async function stageHostedProjectZip(hostedPath) {
    if (!validateHostedPath(hostedPath)) {
      throw new Error('Invalid hosted path');
    }
    if (!(await isVrHotspotHostedProject(hostedPath))) {
      throw new Error('Hosted path is not a VR hotspot project');
    }

    cleanupStagedProjects();
    const stagingId = crypto.randomUUID();
    const stagedDir = path.join(process.cwd(), 'temp-uploads', 'staged');
    const extractDir = path.join(
      os.tmpdir(),
      `vr-hotspot-hosted-assign_${Date.now()}_${hostedPath.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    );
    const stagedPath = path.join(stagedDir, `${stagingId}.zip`);
    fs.mkdirSync(stagedDir, { recursive: true });

    try {
      await materializeHostedProjectToDir(hostedPath, extractDir);
      await zipDirectoryToFile(extractDir, stagedPath);
      assertValidZipFile(stagedPath);
      return stagingId;
    } finally {
      try {
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  app.post('/api/student/projects/prepare-upload', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Team member or student authentication required' });
        }

        const { projectName, kind = 'submitted', threadId } = req.body || {};
        if (!projectName || !projectName.trim()) {
          return res.status(400).json({ success: false, message: 'Project name required' });
        }
        if (kind === 'submitted') {
          await assertCanSubmit({ classId: sess.classId });
        }

        if (!isDbEnabled()) {
          const safeStudent = (sess.displayName || 'student').replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `${safeStudent}_${Date.now()}.zip`;
          const remotePath =
            sess.classSlug && sess.studentId
              ? `student-projects/${sess.classSlug}/${sess.studentId}/${fileName}`
              : `student-projects/${fileName}`;
          return res.json({
            success: true,
            fileName,
            b2Path: remotePath,
            remotePath,
            threadId: null,
            versionNumber: 1,
          });
        }

        const reserved = await projectVersionsDb.reserveVersionPath({
          studentId: sess.studentId,
          classSlug: sess.classSlug || 'default',
          projectName: projectName.trim(),
          threadId: threadId || null,
        });

        return res.json({
          success: true,
          fileName: reserved.fileName,
          b2Path: reserved.b2Path,
          remotePath: reserved.b2Path,
          threadId: reserved.threadId,
          versionNumber: reserved.versionNumber,
        });
      } catch (err) {
        if (err.statusCode === 402) {
          logAppError({
            level: 'warning',
            code: 'usage_quota_blocked',
            message: (err.payload && err.payload.message) || 'Usage limit reached',
            userName: sessDisplayName(req),
            studentId: getStudentSession(req)?.studentId || null,
            source: 'prepare-upload',
            details: { endpoint: '/api/student/projects/prepare-upload', payload: err.payload || null },
          });
          return res.status(402).json({ success: false, ...err.payload });
        }
        console.error('prepare-upload error:', err);
        logAppError({
          level: 'error',
          code: 'prepare_upload_failed',
          message: err.message || 'prepare-upload failed',
          userName: sessDisplayName(req),
          studentId: getStudentSession(req)?.studentId || null,
          source: 'prepare-upload',
          details: { stack: err.stack ? String(err.stack).slice(0, 2000) : null },
        });
        return res.status(500).json({ success: false, message: err.message || 'Server error' });
      }
    };

    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.get('/api/student/projects', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!isDbEnabled()) {
          return res.json({ success: true, projects: [], unreadCount: 0, dbEnabled: false });
        }
        const projects = await projectVersionsDb.listStudentProjects(sess.studentId);
        const unreadCount = await projectVersionsDb.getUnreadFeedbackCount(sess.studentId);
        return res.json({ success: true, projects, unreadCount, dbEnabled: true });
      } catch (err) {
        console.error('list student projects error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.patch('/api/student/projects/:threadId', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!isDbEnabled()) {
          return res.status(503).json({ success: false, message: 'Database not configured' });
        }
        const { projectName } = req.body || {};
        const updated = await projectVersionsDb.updateThreadDisplayName({
          studentId: sess.studentId,
          threadId: req.params.threadId,
          projectName,
        });
        return res.json({
          success: true,
          threadId: updated.id,
          projectName: updated.project_name,
          projectSlug: updated.project_slug,
        });
      } catch (err) {
        const status = err.message === 'Project not found' ? 404 : 400;
        console.error('rename project error:', err);
        return res.status(status).json({ success: false, message: err.message || 'Server error' });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.get('/api/student/unread-feedback', async (req, res) => {
    const finish = async () => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!isDbEnabled()) {
          return res.json({ success: true, items: [], dbEnabled: false });
        }
        const items = await projectVersionsDb.listUnreadFeedback(sess.studentId);
        return res.json({ success: true, items, dbEnabled: true });
      } catch (err) {
        console.error('unread-feedback error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.get('/api/student/projects/:threadId/versions', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const versions = await projectVersionsDb.listThreadVersions(req.params.threadId, {
          studentId: sess.studentId,
        });
        return res.json({ success: true, versions });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.get('/api/student/versions/:versionId/download', async (req, res) => {
    const finish = async () => {
      let tempPath = null;
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const version = await projectVersionsDb.getVersionById(req.params.versionId);
        if (!version || version.studentId !== sess.studentId) {
          return res.status(404).json({ success: false, message: 'Version not found' });
        }
        tempPath = path.join('temp-uploads', `dl_${Date.now()}_${version.fileName}`);
        await b2Service.downloadFile(version.b2Path, tempPath);
        assertValidZipFile(tempPath);
        res.setHeader('Content-Disposition', `attachment; filename="${version.fileName}"`);
        res.setHeader('Content-Type', 'application/zip');
        res.download(tempPath, version.fileName, () => {
          try {
            if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch (_) {}
        });
      } catch (err) {
        if (tempPath) {
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch (_) {}
        }
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.post('/api/student/versions/:versionId/seen', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        await projectVersionsDb.markVersionSeen(req.params.versionId, sess.studentId);
        return res.json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.post('/api/student/projects/save-draft', async (req, res) => {
    const finish = async () => {
      try {
        const sess = getStudentSession(req);
        if (!sess || !sess.studentId) {
          return res.status(401).json({ success: false, message: 'Team member or student authentication required' });
        }
        const {
          projectName,
          fileName,
          remotePath,
          studentNote,
          threadId,
          versionNumber,
          byteSize,
          contentLength,
        } = req.body || {};
        if (!projectName || !fileName || !remotePath) {
          return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        if (!isDbEnabled()) {
          return res.json({
            success: true,
            message: 'Draft uploaded to cloud storage, but DATABASE_URL is not set so it cannot appear in My Cloud Saves.',
            dbEnabled: false,
            fileName,
          });
        }
        const result = await projectVersionsDb.createVersion({
          studentId: sess.studentId,
          projectName,
          fileName,
          b2Path: remotePath,
          kind: 'draft',
          createdBy: 'student',
          studentNote,
          threadId: threadId || null,
          versionNumber: versionNumber || null,
        });
        try {
          const { recordProjectUploadBytes } = require('../lib/usage/record-upload');
          await recordProjectUploadBytes({
            kind: 'draft',
            byteSize: byteSize != null ? byteSize : contentLength,
            remotePath,
            fileName,
            projectName,
            studentId: sess.studentId,
            classSlug: sess.classSlug || null,
          });
        } catch (_) {
          /* non-fatal */
        }
        return res.json({
          success: true,
          message: 'Draft saved to cloud',
          versionId: result.version.id,
          threadId: result.thread.id,
          versionNumber: result.versionNumber,
          fileName,
          dbEnabled: true,
        });
      } catch (err) {
        console.error('save-draft error:', err);
        logAppError({
          level: 'error',
          code: 'b2_upload_meta_orphan',
          message: err.message || 'save-draft failed after client upload',
          userName: sessDisplayName(req),
          studentId: getStudentSession(req)?.studentId || null,
          source: 'save-draft',
          details: {
            remotePath: (req.body && req.body.remotePath) || null,
            projectName: (req.body && req.body.projectName) || null,
            stack: err.stack ? String(err.stack).slice(0, 2000) : null,
          },
        });
        return res.status(500).json({ success: false, message: err.message });
      }
    };
    if (isStudentAuthRequired()) {
      return requireStudentStrict(req, res, finish);
    }
    return finish();
  });

  app.get('/admin/submissions-inbox', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const { classId, studentId, filter, hostedFilter, featuredFilter } = req.query;
      const filterVal = filter || 'all';
      const hostedFilterVal = hostedFilter || 'all';
      const featuredFilterVal = featuredFilter || 'all';

      if (!isDbEnabled()) {
        const inbox = await listLegacyInbox(b2Service, {
          filter: filterVal,
          hostedFilter: hostedFilterVal,
          featuredFilter: featuredFilterVal,
        });
        return res.json(enrichInboxHosting(inbox));
      }

      let inbox = await projectVersionsDb.listAdminInbox({
        classId: classId || null,
        studentId: studentId || null,
        filter: filterVal,
        hostedFilter: hostedFilterVal,
        featuredFilter: featuredFilterVal,
      });

      // Include B2 uploads that never received a DB row (e.g. local dev without DATABASE_URL).
      // Pass all version storage keys so admin_repair / admin_return ZIPs are not listed as orphans.
      if (!classId && !studentId) {
        const extraKnownKeys = await projectVersionsDb.listAllVersionStorageKeys();
        inbox = await mergeB2OrphansIntoInbox(inbox, b2Service, {
          filter: filterVal,
          hostedFilter: hostedFilterVal,
          featuredFilter: featuredFilterVal,
          extraKnownKeys,
        });
      }

      return res.json(enrichInboxHosting(inbox));
    } catch (err) {
      console.error('submissions-inbox error:', err);
      return res.json([]);
    }
  });

  app.get('/admin/projects/:threadId/versions', async (req, res) => {
    try {
      const versions = await projectVersionsDb.listThreadVersions(req.params.threadId);
      return res.json({ success: true, versions });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/versions/:versionId/download', async (req, res) => {
    let tempPath = null;
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      tempPath = path.join('temp-uploads', `adm_dl_${Date.now()}_${version.fileName}`);
      await b2Service.downloadFile(version.b2Path, tempPath);
      assertValidZipFile(tempPath);
      res.setHeader('Content-Disposition', `attachment; filename="${version.fileName}"`);
      res.setHeader('Content-Type', 'application/zip');
      res.download(tempPath, version.fileName, () => {
        try {
          if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      });
    } catch (err) {
      if (tempPath) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/versions/:versionId/zip', async (req, res) => {
    let tempPath = null;
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      tempPath = path.join('temp-uploads', `review_${Date.now()}_${version.fileName}`);
      await b2Service.downloadFile(version.b2Path, tempPath);
      assertValidZipFile(tempPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `inline; filename="${version.fileName}"`);
      const data = fs.readFileSync(tempPath);
      res.send(data);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (tempPath) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  });

  app.get('/admin/review/:versionId', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'admin-review.html'));
  });

  app.post('/admin/versions/:versionId/return', upload.single('project'), async (req, res) => {
    try {
      const parentVersion = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!parentVersion) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'ZIP file required' });
      }

      const adminNote = projectVersionsDb.trimNote(req.body?.adminNote || req.body?.admin_note);
      const classSlug = parentVersion.classSlug || 'default';

      const reserved = await projectVersionsDb.reserveVersionPath({
        studentId: parentVersion.studentId,
        classSlug,
        projectName: parentVersion.projectName,
        threadId: parentVersion.threadId,
      });

      await b2Service.uploadFile(req.file.path, reserved.b2Path);

      const result = await projectVersionsDb.createVersion({
        studentId: parentVersion.studentId,
        projectName: parentVersion.projectName,
        fileName: reserved.fileName,
        b2Path: reserved.b2Path,
        kind: 'admin_return',
        createdBy: 'admin',
        adminNote,
        parentVersionId: parentVersion.id,
        threadId: parentVersion.threadId,
        versionNumber: reserved.versionNumber,
      });

      try {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}

      return res.json({
        success: true,
        message: 'Feedback sent to student',
        versionId: result.version.id,
        versionNumber: result.versionNumber,
      });
    } catch (err) {
      console.error('admin return error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * Auto-rename extensionless images/videos in a submitted ZIP and save a new
   * admin_repair copy (hidden from students). Original ZIP is never overwritten.
   */
  app.post('/admin/versions/:versionId/repair-media', async (req, res) => {
    let tempPath = null;
    let repairedPath = null;
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database required for media repair' });
      }
      const parentVersion = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!parentVersion) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }

      tempPath = path.join(
        'temp-uploads',
        `repair_in_${Date.now()}_${parentVersion.fileName || 'project.zip'}`
      );
      repairedPath = path.join(
        'temp-uploads',
        `repair_out_${Date.now()}_${parentVersion.fileName || 'project.zip'}`
      );
      await b2Service.downloadFile(parentVersion.b2Path, tempPath);
      assertValidZipFile(tempPath);

      const summary = repairMediaExtensionsInZip(tempPath, repairedPath);
      if (!summary.repaired) {
        return res.json({
          success: true,
          repaired: false,
          message: 'No extensionless media found to rename.',
          renames: [],
          skipped: summary.skipped || [],
          configUpdated: false,
          parentVersionId: parentVersion.id,
        });
      }

      const classSlug = parentVersion.classSlug || 'default';
      const reserved = await projectVersionsDb.reserveVersionPath({
        studentId: parentVersion.studentId,
        classSlug,
        projectName: parentVersion.projectName,
        threadId: parentVersion.threadId,
      });

      await b2Service.uploadFile(repairedPath, reserved.b2Path);

      const renameNote = summary.renamed
        .slice(0, 8)
        .map((r) => `${path.posix.basename(r.from)} → ${path.posix.basename(r.to)}`)
        .join('; ');
      const adminNote = projectVersionsDb.trimNote(
        `Media filenames repaired (${summary.renamed.length} file${
          summary.renamed.length === 1 ? '' : 's'
        }): ${renameNote}${summary.renamed.length > 8 ? '…' : ''}`
      );

      const result = await projectVersionsDb.createVersion({
        studentId: parentVersion.studentId,
        projectName: parentVersion.projectName,
        fileName: reserved.fileName,
        b2Path: reserved.b2Path,
        kind: 'admin_repair',
        createdBy: 'admin',
        adminNote,
        parentVersionId: parentVersion.id,
        threadId: parentVersion.threadId,
        versionNumber: reserved.versionNumber,
      });

      return res.json({
        success: true,
        repaired: true,
        message: `Repaired ${summary.renamed.length} media file(s). Copy saved as v${result.versionNumber} (not visible to student until sent).`,
        versionId: result.version.id,
        versionNumber: result.versionNumber,
        fileName: reserved.fileName,
        renames: summary.renamed,
        skipped: summary.skipped || [],
        configUpdated: !!summary.configUpdated,
        parentVersionId: parentVersion.id,
        downloadUrl: `/admin/versions/${result.version.id}/download`,
      });
    } catch (err) {
      console.error('admin repair-media error:', err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      for (const p of [tempPath, repairedPath]) {
        if (!p) continue;
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch (_) {}
      }
    }
  });

  /**
   * Promote an admin_repair copy to admin_return so the student can open it.
   */
  app.post('/admin/versions/:versionId/send-repair', async (req, res) => {
    let tempPath = null;
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database required' });
      }
      const repairVersion = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!repairVersion) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      if (repairVersion.kind !== 'admin_repair') {
        return res.status(400).json({
          success: false,
          message: 'Only admin_repair versions can be sent with this action',
        });
      }

      const defaultNote =
        'Media filenames repaired so pictures display correctly. Please open this version and confirm your image hotspots look right.';
      const adminNote = projectVersionsDb.trimNote(
        req.body?.adminNote || req.body?.admin_note || defaultNote
      );
      const classSlug = repairVersion.classSlug || 'default';

      tempPath = path.join(
        'temp-uploads',
        `send_repair_${Date.now()}_${repairVersion.fileName || 'project.zip'}`
      );
      await b2Service.downloadFile(repairVersion.b2Path, tempPath);
      assertValidZipFile(tempPath);

      const reserved = await projectVersionsDb.reserveVersionPath({
        studentId: repairVersion.studentId,
        classSlug,
        projectName: repairVersion.projectName,
        threadId: repairVersion.threadId,
      });

      await b2Service.uploadFile(tempPath, reserved.b2Path);

      const result = await projectVersionsDb.createVersion({
        studentId: repairVersion.studentId,
        projectName: repairVersion.projectName,
        fileName: reserved.fileName,
        b2Path: reserved.b2Path,
        kind: 'admin_return',
        createdBy: 'admin',
        adminNote,
        parentVersionId: repairVersion.id,
        threadId: repairVersion.threadId,
        versionNumber: reserved.versionNumber,
      });

      return res.json({
        success: true,
        message: 'Repaired copy sent to student',
        versionId: result.version.id,
        versionNumber: result.versionNumber,
        repairVersionId: repairVersion.id,
      });
    } catch (err) {
      console.error('admin send-repair error:', err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (tempPath) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  });

  app.post('/admin/host-version/:versionId', async (req, res) => {
    const { urlPath } = req.body || {};
    if (!urlPath || !/^[a-zA-Z0-9_-]+$/.test(urlPath)) {
      return res.status(400).json({ error: 'Invalid urlPath' });
    }
    let tempPath = null;
    let tempExtractDir = null;
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      tempPath = path.join('temp-uploads', `host_${Date.now()}_${version.fileName}`);
      tempExtractDir = path.join('temp-uploads', `host_extract_${Date.now()}_${urlPath}`);
      await b2Service.downloadFile(version.b2Path, tempPath);
      assertValidZipFile(tempPath);
      fs.mkdirSync(tempExtractDir, { recursive: true });
      await extractZipToDirSafe(tempPath, tempExtractDir);
      await uploadHostedDirectory(tempExtractDir, urlPath);
      const urls = await resolveHostedProjectUrlsAsync(urlPath);
      await projectVersionsDb.updateVersionHosting(version.id, {
        hostedPath: urlPath,
        hostedUrl: urls.tourUrl,
        isHosted: true,
      });
      return res.json({
        success: true,
        hostedUrl: urls.tourUrl,
        tourUrl: urls.tourUrl,
        flatPageUrl: urls.flatPageUrl,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (tempPath) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      }
      if (tempExtractDir) {
        try {
          if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
        } catch (_) {}
      }
    }
  });

  app.post('/admin/unhost-version/:versionId', async (req, res) => {
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      if (!version.hostedPath && !version.isHosted && !version.hostedUrl) {
        return res.status(400).json({ success: false, message: 'This version is not hosted' });
      }
      const result = await purgeHostedSubmission({ versionId: version.id, fileName: version.fileName });
      const removed = Array.isArray(result.diskPaths) && result.diskPaths.length > 0;
      return res.json({
        success: true,
        message: removed
          ? 'Project unhosted successfully'
          : 'Hosting metadata cleared (no public files were found)',
        result,
      });
    } catch (err) {
      console.error('unhost-version error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/hosted-gallery-feature/:versionId', async (req, res) => {
    try {
      const featured = !!req.body?.featured;
      const versionId = req.params.versionId;
      const fileName = req.body?.fileName || null;
      const result = await setHostedGalleryFeatured({ versionId, fileName, featured });
      return res.json({
        success: true,
        featuredOnHostedGallery: result.featuredOnHostedGallery,
        message: result.featuredOnHostedGallery
          ? 'Project featured on the class hosted list'
          : 'Project removed from the class hosted list',
      });
    } catch (err) {
      console.error('hosted-gallery-feature error:', err);
      const status = /not found/i.test(err.message) ? 404 : 400;
      return res.status(status).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/delete-version/:versionId', async (req, res) => {
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      const removed = await purgeContentItem({ type: 'project', id: version.threadId });
      return res.json({ success: true, removedVersions: removed.removedVersions ?? removed });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/projects/hosted-assignable', async (req, res) => {
    try {
      const projects = await listHostedAssignableProjects();
      return res.json({ success: true, projects });
    } catch (err) {
      console.error('hosted-assignable error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/projects/stage-hosted', async (req, res) => {
    try {
      const hostedPath = (req.body?.hostedPath || '').trim();
      if (!hostedPath) {
        return res.status(400).json({ success: false, message: 'hostedPath required' });
      }
      const stagingId = await stageHostedProjectZip(hostedPath);
      return res.json({ success: true, stagingId });
    } catch (err) {
      console.error('stage-hosted error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/projects/stage-zip', upload.single('project'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'ZIP file required' });
      }
      assertValidZipFile(req.file.path);
      cleanupStagedProjects();
      const stagingId = crypto.randomUUID();
      const stagedDir = path.join(process.cwd(), 'temp-uploads', 'staged');
      fs.mkdirSync(stagedDir, { recursive: true });
      const stagedPath = path.join(stagedDir, `${stagingId}.zip`);
      fs.renameSync(req.file.path, stagedPath);
      return res.json({ success: true, stagingId });
    } catch (err) {
      console.error('stage-zip error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/projects/staged/:stagingId/zip', async (req, res) => {
    try {
      const stagingId = req.params.stagingId;
      if (!/^[0-9a-f-]{36}$/i.test(stagingId)) {
        return res.status(400).json({ success: false, message: 'Invalid staging id' });
      }
      const stagedPath = path.join(process.cwd(), 'temp-uploads', 'staged', `${stagingId}.zip`);
      if (!fs.existsSync(stagedPath)) {
        return res.status(404).json({ success: false, message: 'Staged project not found or expired' });
      }
      assertValidZipFile(stagedPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `inline; filename="staged_${stagingId}.zip"`);
      res.send(fs.readFileSync(stagedPath));
    } catch (err) {
      console.error('staged zip error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/projects/assign', upload.single('project'), async (req, res) => {
    let tempPath = null;
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database required for project assignment' });
      }

      const studentId = req.body?.studentId;
      const projectName = (req.body?.projectName || '').trim();
      const adminNote = projectVersionsDb.trimNote(req.body?.adminNote || req.body?.admin_note);
      const stagingId = req.body?.stagingId;
      const hostedPath = (req.body?.hostedPath || '').trim();

      if (!studentId) {
        return res.status(400).json({ success: false, message: 'studentId required' });
      }
      if (!projectName) {
        return res.status(400).json({ success: false, message: 'Project name required' });
      }

      const student = await getActiveStudentWithClass(studentId);
      if (!student || !student.is_active) {
        return res.status(404).json({ success: false, message: 'Student not found or inactive' });
      }

      let resolvedStagingId = stagingId;
      if (req.file) {
        tempPath = req.file.path;
        assertValidZipFile(tempPath);
      } else if (hostedPath && validateHostedPath(hostedPath)) {
        resolvedStagingId = await stageHostedProjectZip(hostedPath);
        tempPath = path.join(process.cwd(), 'temp-uploads', 'staged', `${resolvedStagingId}.zip`);
        assertValidZipFile(tempPath);
      } else if (stagingId && /^[0-9a-f-]{36}$/i.test(stagingId)) {
        tempPath = path.join(process.cwd(), 'temp-uploads', 'staged', `${stagingId}.zip`);
        if (!fs.existsSync(tempPath)) {
          return res.status(404).json({ success: false, message: 'Staged project not found or expired' });
        }
        assertValidZipFile(tempPath);
      } else {
        return res.status(400).json({ success: false, message: 'ZIP file, stagingId, or hostedPath required' });
      }

      const classSlug = student.class_slug || 'default';
      const reserved = await projectVersionsDb.reserveVersionPath({
        studentId,
        classSlug,
        projectName,
      });

      await b2Service.uploadFile(tempPath, reserved.b2Path);

      const result = await projectVersionsDb.createVersion({
        studentId,
        projectName,
        fileName: reserved.fileName,
        b2Path: reserved.b2Path,
        kind: 'admin_assigned',
        createdBy: 'admin',
        adminNote,
        threadId: reserved.threadId,
        versionNumber: reserved.versionNumber,
      });

      if (resolvedStagingId && tempPath.includes('staged')) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }

      return res.json({
        success: true,
        message: 'Project assigned to student',
        versionId: result.version.id,
        threadId: reserved.threadId,
        versionNumber: result.versionNumber,
      });
    } catch (err) {
      console.error('admin assign error:', err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (req.file?.path && tempPath === req.file.path) {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (_) {}
      }
    }
  });
}

module.exports = { registerSubmissionVersionRoutes };
