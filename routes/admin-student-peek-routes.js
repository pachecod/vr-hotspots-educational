const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled } = require('../services/db-service');
const projectVersionsDb = require('../services/project-versions-db');
const {
  isValidCategory,
  getContentType,
} = require('../lib/common-assets');
const {
  buildStudentAssetKey,
  buildStudentScopePrefix,
  attachTagsToStudentAssets,
  deleteTagsForKey,
  listTagsForScope,
  parseTagSortParam,
} = require('../lib/asset-tags');
const { purgeAssetById } = require('../lib/student-content/purge');

async function getStudentPeekMeta(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.display_name, s.username, s.class_id, c.name AS class_name, c.slug AS class_slug
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1`,
    [studentId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    displayName: r.display_name,
    username: r.username,
    classId: r.class_id,
    className: r.class_name,
    classSlug: r.class_slug,
  };
}

function registerAdminStudentPeekRoutes(app, { requireAdmin }) {
  function requireDb(req, res, next) {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured (set DATABASE_URL)' });
    }
    return next();
  }

  app.get('/admin/students/:studentId/peek', requireAdmin, requireDb, async (req, res) => {
    try {
      const meta = await getStudentPeekMeta(req.params.studentId);
      if (!meta) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      return res.json({ success: true, student: meta });
    } catch (err) {
      console.error('Student peek meta error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/students/:studentId/assets', requireAdmin, requireDb, async (req, res) => {
    try {
      const studentId = req.params.studentId;
      const meta = await getStudentPeekMeta(studentId);
      if (!meta) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const { rows } = await query(
        `SELECT category, filename, b2_path, size, uploaded_at
         FROM student_assets WHERE student_id = $1 AND ownership = 'student' ORDER BY uploaded_at DESC`,
        [studentId]
      );

      const grouped = {};
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        const assetPath = `/admin/students/${studentId}/assets/${encodeURIComponent(row.category)}/${encodeURIComponent(row.filename)}`;
        grouped[row.category].push({
          name: row.filename,
          category: row.category,
          size: Number(row.size),
          uploadedAt: row.uploaded_at,
          url: assetPath,
        });
      }

      await attachTagsToStudentAssets(grouped, studentId);

      return res.json({ success: true, assets: grouped, student: meta });
    } catch (err) {
      console.error('Admin list student assets error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/students/:studentId/assets/tags', requireAdmin, requireDb, async (req, res) => {
    try {
      const studentId = req.params.studentId;
      const meta = await getStudentPeekMeta(studentId);
      if (!meta) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      const tags = await listTagsForScope(buildStudentScopePrefix(studentId), {
        sort: parseTagSortParam(req.query.sort),
      });
      return res.json({ success: true, tags });
    } catch (err) {
      console.error('Admin list student asset tags error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get(
    '/admin/students/:studentId/assets/:category/:filename',
    requireAdmin,
    requireDb,
    async (req, res) => {
      let tempPath = null;
      try {
        const { studentId, category, filename } = req.params;
        if (!isValidCategory(category)) {
          return res.status(400).send('Invalid category');
        }

        const { rows } = await query(
          `SELECT b2_path FROM student_assets
           WHERE student_id = $1 AND category = $2 AND filename = $3`,
          [studentId, category, filename]
        );
        if (!rows.length) return res.status(404).send('Not found');

        tempPath = path.join('temp-uploads', `peek_sa_${Date.now()}_${filename}`);
        await b2Service.downloadFile(rows[0].b2_path, tempPath);
        res.setHeader('Content-Type', getContentType(filename));
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
        console.error('Admin stream student asset error:', err);
        res.status(500).send('Error loading asset');
      }
    }
  );

  app.delete(
    '/admin/students/:studentId/assets/:category/:filename',
    requireAdmin,
    requireDb,
    async (req, res) => {
      try {
        const { studentId, category, filename } = req.params;
        if (!isValidCategory(category)) {
          return res.status(400).json({ success: false, message: 'Invalid category' });
        }

        const { rows } = await query(
          `SELECT id FROM student_assets
           WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
          [studentId, category, filename]
        );
        if (!rows.length) {
          return res.status(404).json({ success: false, message: 'Asset not found' });
        }

        await purgeAssetById(rows[0].id);

        return res.json({ success: true });
      } catch (err) {
        console.error('Admin delete student asset error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  app.get('/admin/students/:studentId/versions', requireAdmin, requireDb, async (req, res) => {
    try {
      const meta = await getStudentPeekMeta(req.params.studentId);
      if (!meta) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      const versions = await projectVersionsDb.listAllVersionsForStudent(req.params.studentId);
      return res.json({ success: true, versions, student: meta });
    } catch (err) {
      console.error('Admin list student versions error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerAdminStudentPeekRoutes };
