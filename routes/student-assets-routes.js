const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled } = require('../services/db-service');
const { requireStudentStrict } = require('../student-auth');
const {
  isValidCategory,
  sanitizeFilename,
  getContentType,
  isExtensionAllowedForCategory,
  getExtension,
  FILE_SIZE_LIMITS,
} = require('../lib/common-assets');
const { assertCanUploadAsset } = require('../services/usage-quota');
const {
  buildStudentAssetKey,
  buildStudentScopePrefix,
  parseTagsFromBody,
  attachTagsToStudentAssets,
  setTagsForKey,
  deleteTagsForKey,
  listTagsForScope,
  parseTagSortParam,
} = require('../lib/asset-tags');
const { prepareVideoForStorage, cleanupTempFiles } = require('../lib/video-pipeline');

function buildStudentAssetPath(classSlug, studentId, category, filename) {
  return `student-assets/${classSlug}/${studentId}/${category}/${filename}`;
}

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
}

async function getStudentContext(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.class_id, c.slug AS class_slug
     FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.is_active = TRUE`,
    [studentId]
  );
  return rows[0] || null;
}

function registerStudentAssetRoutes(app, upload) {
  app.get('/api/student-assets/tags', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.json({ success: true, tags: [] });
      }
      const studentId = req.studentSession.studentId;
      const sort = parseTagSortParam(req.query.sort);
      const tags = await listTagsForScope(buildStudentScopePrefix(studentId), { sort });
      res.json({ success: true, tags });
    } catch (err) {
      console.error('List student asset tags error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/student-assets', requireStudentStrict, async (req, res) => {
    try {
      const studentId = req.studentSession.studentId;
      const { rows } = await query(
        `SELECT category, filename, b2_path, size, uploaded_at
         FROM student_assets WHERE student_id = $1 AND ownership = 'student' ORDER BY uploaded_at DESC`,
        [studentId]
      );
      const grouped = {};
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          name: row.filename,
          category: row.category,
          size: Number(row.size),
          uploadedAt: row.uploaded_at,
          url: `/student-assets/${studentId}/${row.category}/${encodeURIComponent(row.filename)}`,
        });
      }
      await attachTagsToStudentAssets(grouped, studentId);
      res.json({ success: true, assets: grouped });
    } catch (err) {
      console.error('List student assets error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post(
    '/api/student-assets/upload',
    requireStudentStrict,
    upload.single('file'),
    async (req, res) => {
      const tempPath = req.file && req.file.path;
      const cleanupPaths = tempPath ? [tempPath] : [];
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const category = (req.body && req.body.category) || '';
        if (!isValidCategory(category)) {
          return res.status(400).json({ success: false, message: 'Invalid category' });
        }
        const ext = getExtension(req.file.originalname);
        if (!isExtensionAllowedForCategory(ext, category)) {
          return res.status(400).json({ success: false, message: 'File type not allowed for category' });
        }
        const { isExtensionBlocked } = require('../lib/blocked-extensions');
        if (await isExtensionBlocked(req.file.originalname)) {
          return res.status(400).json({ success: false, message: `File type ".${ext}" is not allowed.` });
        }
        const limit = FILE_SIZE_LIMITS[category] || 25 * 1024 * 1024;
        if (req.file.size > limit) {
          return res.status(400).json({ success: false, message: 'File too large for category' });
        }

        const studentId = req.studentSession.studentId;
        const ctx = await getStudentContext(studentId);
        if (!ctx) return res.status(401).json({ success: false, message: 'Student not found' });

        const prepared = await prepareVideoForStorage({
          tempPath,
          originalName: req.file.originalname,
          category,
          context: 'student-asset',
        });
        if (prepared.path !== tempPath) {
          cleanupPaths.push(prepared.path);
        }

        await assertCanUploadAsset({
          classId: ctx.class_id,
          studentId,
          additionalBytes: prepared.size,
        });

        const storedFilename = prepared.storedFilename || sanitizeFilename(req.file.originalname);
        if (!storedFilename) {
          return res.status(400).json({ success: false, message: 'Invalid filename' });
        }
        const b2Path = buildStudentAssetPath(ctx.class_slug, studentId, category, storedFilename);
        const contentType = prepared.contentType || getContentType(storedFilename);

        await b2Service.uploadFile(prepared.path, b2Path, contentType);
        await query(
          `INSERT INTO student_assets (student_id, category, filename, b2_path, size, ownership)
           VALUES ($1, $2, $3, $4, $5, 'student')
           ON CONFLICT (student_id, category, filename) WHERE ownership = 'student' AND student_id IS NOT NULL
           DO UPDATE SET b2_path = EXCLUDED.b2_path, size = EXCLUDED.size, uploaded_at = NOW()`,
          [studentId, category, storedFilename, b2Path, prepared.size]
        );

        const tags = parseTagsFromBody(req.body);
        let savedTags = [];
        if (tags.length && isDbEnabled()) {
          savedTags = await setTagsForKey(
            buildStudentAssetKey(studentId, category, storedFilename),
            tags
          );
        }

        res.json({
          success: true,
          asset: {
            name: storedFilename,
            category,
            url: `/student-assets/${studentId}/${category}/${encodeURIComponent(storedFilename)}`,
            size: prepared.size,
            tags: savedTags,
            transcoded: Boolean(prepared.transcoded),
            originalSize: prepared.originalSize || req.file.size,
          },
        });
      } catch (err) {
        if (err.statusCode === 402) {
          return res.status(402).json({ success: false, ...err.payload });
        }
        console.error('Student asset upload error:', err);
        res.status(500).json({ success: false, message: err.message || 'Upload failed' });
      } finally {
        cleanupTempFiles(cleanupPaths);
      }
    }
  );

  app.put(
    '/api/student-assets/:category/:filename/tags',
    requireStudentStrict,
    async (req, res) => {
      try {
        const studentId = req.studentSession.studentId;
        const category = req.params.category;
        const filename = req.params.filename;
        if (!isValidCategory(category)) {
          return res.status(400).json({ success: false, message: 'Invalid category' });
        }
        const { rows } = await query(
          `SELECT 1 FROM student_assets
           WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
          [studentId, category, filename]
        );
        if (!rows.length) {
          return res.status(404).json({ success: false, message: 'Asset not found' });
        }
        const tags = await setTagsForKey(
          buildStudentAssetKey(studentId, category, filename),
          req.body && req.body.tags
        );
        res.json({ success: true, tags });
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({ success: false, message: err.message });
        }
        console.error('Update student asset tags error:', err);
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  app.delete(
    '/api/student-assets/:category/:filename',
    requireStudentStrict,
    async (req, res) => {
      try {
        const studentId = req.studentSession.studentId;
        const category = req.params.category;
        const filename = req.params.filename;
        if (!isValidCategory(category)) {
          return res.status(400).json({ success: false, message: 'Invalid category' });
        }
        const { rows } = await query(
          `SELECT id, b2_path FROM student_assets
           WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
          [studentId, category, filename]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Asset not found' });
        const { purgeAssetById } = require('../lib/student-content/purge');
        await purgeAssetById(rows[0].id);
        res.json({ success: true });
      } catch (err) {
        console.error('Delete student asset error:', err);
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  app.get('/student-assets/:studentId/:category/:filename', requireStudentStrict, async (req, res) => {
    try {
      if (req.params.studentId !== req.studentSession.studentId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const { studentId, category, filename } = req.params;
      const { rows } = await query(
        `SELECT b2_path FROM student_assets
         WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
        [studentId, category, filename]
      );
      if (!rows.length) return res.status(404).send('Not found');
      const tempPath = path.join('temp-uploads', `sa_${Date.now()}_${filename}`);
      await b2Service.downloadFile(rows[0].b2_path, tempPath);
      res.setHeader('Content-Type', getContentType(filename));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(path.resolve(tempPath), () => {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      });
    } catch (err) {
      console.error('Stream student asset error:', err);
      res.status(500).send('Error loading asset');
    }
  });
}

module.exports = { registerStudentAssetRoutes, buildStudentAssetPath };
