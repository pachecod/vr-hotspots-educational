const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const projectVersionsDb = require('../services/project-versions-db');
const { isDbEnabled } = require('../services/db-service');
const { getContentType } = require('../lib/common-assets');
const {
  buildContentInventory,
  buildContentSummary,
  CONTENT_TYPES,
} = require('../lib/student-content/inventory');
const {
  purgeContentItem,
  describePurge,
  purgeHostedSubmission,
} = require('../lib/student-content/purge');

function registerAdminContentRoutes(app, { requireAdmin }) {
  function requireDb(req, res, next) {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured (set DATABASE_URL)' });
    }
    return next();
  }

  app.get('/admin/content/summary', requireAdmin, requireDb, async (req, res) => {
    try {
      const filters = parseFilters(req.query);
      const summary = await buildContentSummary(filters);
      res.json({ success: true, summary });
    } catch (err) {
      console.error('Content summary error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/content', requireAdmin, async (req, res) => {
    try {
      const filters = parseFilters(req.query);
      const result = await buildContentInventory(filters);
      res.json({ success: true, ...result, types: CONTENT_TYPES });
    } catch (err) {
      console.error('Content inventory error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/content/project/:threadId/versions', requireAdmin, requireDb, async (req, res) => {
    try {
      const versions = await projectVersionsDb.listThreadVersions(req.params.threadId);
      res.json({ success: true, versions });
    } catch (err) {
      console.error('Content project versions error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/content/asset/:assetId', requireAdmin, requireDb, async (req, res) => {
    let tempPath = null;
    try {
      const { query } = require('../services/db-service');
      const { rows } = await query(`SELECT b2_path, filename FROM student_assets WHERE id = $1`, [
        req.params.assetId,
      ]);
      if (!rows.length) return res.status(404).send('Not found');
      tempPath = path.join('temp-uploads', `hub_sa_${Date.now()}_${rows[0].filename}`);
      await b2Service.downloadFile(rows[0].b2_path, tempPath);
      res.setHeader('Content-Type', getContentType(rows[0].filename));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(path.resolve(tempPath), () => {
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
      console.error('Stream orphan asset error:', err);
      res.status(500).send('Error loading asset');
    }
  });

  app.delete('/admin/content/:type/:id', requireAdmin, async (req, res) => {
    try {
      const { type, id } = req.params;
      const body = req.body || {};
      const studentId = req.query.studentId || body.studentId;
      const slug = req.query.slug || body.slug;
      const fileName = req.query.fileName || body.fileName || (type === 'legacy_submission' ? id : null);
      const versionId = req.query.versionId || body.versionId;

      const purgeParams = { type, id, studentId, slug, fileName, versionId };

      if (req.query.dryRun === '1' || req.query.dryRun === 'true') {
        const manifest = await describePurge(purgeParams);
        return res.json({ success: true, dryRun: true, manifest });
      }

      const result = await purgeContentItem(purgeParams);
      res.json({ success: true, result });
    } catch (err) {
      console.error('Content delete error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/content/:type/:id/unhost', requireAdmin, async (req, res) => {
    try {
      const { type, id } = req.params;
      if (type !== 'hosted_submission' && type !== 'project') {
        return res.status(400).json({ success: false, message: 'Unhost only applies to hosted submissions' });
      }
      const versionId = type === 'project' ? req.body?.versionId : id;
      const fileName = req.body?.fileName;
      const result = await purgeHostedSubmission({ versionId, fileName });
      res.json({ success: true, result });
    } catch (err) {
      console.error('Content unhost error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

function parseFilters(query) {
  return {
    classId: query.classId || null,
    studentId: query.studentId || null,
    type: query.type || null,
    orphaned: query.orphaned === '1' || query.orphaned === 'true',
    q: query.q || null,
    page: query.page || 1,
    limit: query.limit || 50,
  };
}

module.exports = { registerAdminContentRoutes };
