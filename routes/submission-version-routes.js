const path = require('path');
const fs = require('fs');
const { purgeProjectThread } = require('../lib/purge-project-thread');
const { purgeContentItem } = require('../lib/student-content/purge');
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
const { resolveHostedProjectUrls, enrichInboxHosting } = require('../services/hosted-project-urls');

function registerSubmissionVersionRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe }) {
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
          return res.status(402).json({ success: false, ...err.payload });
        }
        console.error('prepare-upload error:', err);
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
          return res.json({ success: true, projects: [], unreadCount: 0 });
        }
        const projects = await projectVersionsDb.listStudentProjects(sess.studentId);
        const unreadCount = await projectVersionsDb.getUnreadFeedbackCount(sess.studentId);
        return res.json({ success: true, projects, unreadCount });
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
        const { projectName, fileName, remotePath, studentNote, threadId, versionNumber } =
          req.body || {};
        if (!projectName || !fileName || !remotePath) {
          return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        if (!isDbEnabled()) {
          return res.json({ success: true, message: 'Draft saved (no database)' });
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
        return res.json({
          success: true,
          message: 'Draft saved to cloud',
          versionId: result.version.id,
          threadId: result.thread.id,
          versionNumber: result.versionNumber,
        });
      } catch (err) {
        console.error('save-draft error:', err);
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
      const { classId, studentId, filter } = req.query;
      const filterVal = filter || 'all';

      if (!isDbEnabled()) {
        const inbox = await listLegacyInbox(b2Service, { filter: filterVal });
        return res.json(enrichInboxHosting(inbox));
      }

      let inbox = await projectVersionsDb.listAdminInbox({
        classId: classId || null,
        studentId: studentId || null,
        filter: filterVal,
      });

      // Include B2 uploads that never received a DB row (e.g. local dev without DATABASE_URL).
      if (!classId && !studentId) {
        inbox = await mergeB2OrphansIntoInbox(inbox, b2Service, { filter: filterVal });
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

  app.post('/admin/host-version/:versionId', async (req, res) => {
    const { urlPath } = req.body || {};
    if (!urlPath || !/^[a-zA-Z0-9_-]+$/.test(urlPath)) {
      return res.status(400).json({ error: 'Invalid urlPath' });
    }
    let tempPath = null;
    try {
      const version = await projectVersionsDb.getVersionById(req.params.versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }
      tempPath = path.join('temp-uploads', `host_${Date.now()}_${version.fileName}`);
      const hostedDir = path.join('hosted-projects', urlPath);
      await b2Service.downloadFile(version.b2Path, tempPath);
      assertValidZipFile(tempPath);
      if (fs.existsSync(hostedDir)) {
        fs.rmSync(hostedDir, { recursive: true, force: true });
      }
      fs.mkdirSync(hostedDir, { recursive: true });
      await extractZipToDirSafe(tempPath, hostedDir);
      const urls = resolveHostedProjectUrls(urlPath, hostedDir);
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
}

module.exports = { registerSubmissionVersionRoutes };
