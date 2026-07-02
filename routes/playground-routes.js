const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const templatesDb = require('../lib/templates');
const { isPublicPlaygroundEnabled } = require('../lib/playground-config');
const b2Service = require('../services/b2-service');
const { refreshPlaygroundThumbnail, resolvePlaygroundThumbnailUrl, playgroundThumbLookupPaths, contentTypeForThumbPath, generatePlaygroundThumbnail, uploadCustomTemplateThumbnail, parsePlaygroundThumbnailSlug, getCanonicalPlaygroundThumbPath } = require('../lib/playground-thumbnail');
const { templateForStudent } = require('../lib/template-manifest');

const upload = multer({ dest: 'temp-uploads/' });
const thumbUpload = multer({
  dest: 'temp-uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|x-png|webp|gif|svg\+xml)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Thumbnail must be an image (JPEG, PNG, WebP, GIF, or SVG)'), ok);
  },
});

function playgroundBundleKey(slug) {
  return `playground-tours/${slug}.zip`;
}

function validateZipHasConfig(localPath) {
  const zip = new AdmZip(localPath);
  return zip.getEntry('config.json') != null;
}

function registerPlaygroundRoutes(app) {
  app.get('/api/playground/config', (_req, res) => {
    res.json({ success: true, enabled: isPublicPlaygroundEnabled() });
  });

  app.get('/api/playground/templates', async (_req, res) => {
    if (!isPublicPlaygroundEnabled()) {
      return res.json({ success: true, enabled: false, templates: [] });
    }
    try {
      const templates = await templatesDb.listPlaygroundTemplates();
      res.json({ success: true, enabled: true, templates });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/playground/thumbnails/:slug', async (req, res) => {
    const { slug, preferredExt } = parsePlaygroundThumbnailSlug(req.params.slug);
    if (!slug) {
      return res.status(400).send('Invalid thumbnail slug');
    }
    try {
      await b2Service.ensureCommonAssetsBucket();
      const lookupPaths = [];
      const canonicalPath = await getCanonicalPlaygroundThumbPath(slug);
      if (canonicalPath) lookupPaths.push(canonicalPath);
      for (const remotePath of playgroundThumbLookupPaths(slug, preferredExt)) {
        if (!lookupPaths.includes(remotePath)) lookupPaths.push(remotePath);
      }
      for (const remotePath of lookupPaths) {
        try {
          const { stream, statusCode, headers } = await b2Service.downloadCommonAssetStream(remotePath);
          if (statusCode === 404) continue;
          res.setHeader('Content-Type', headers['content-type'] || contentTypeForThumbPath(remotePath));
          res.setHeader(
            'Cache-Control',
            req.query.v ? 'private, max-age=0, must-revalidate' : 'public, max-age=300, must-revalidate'
          );
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (statusCode === 206) res.status(206);
          return stream.pipe(res);
        } catch (_) {}
      }
      res.status(404).send('Thumbnail not found');
    } catch (err) {
      console.error('Playground thumbnail error:', err);
      res.status(500).send('Could not load thumbnail');
    }
  });

  app.get('/api/playground/templates/:slug', async (req, res) => {
    if (!isPublicPlaygroundEnabled()) {
      return res.status(404).json({ success: false, message: 'Playground not enabled' });
    }
    try {
      const template = await templatesDb.getPlaygroundTemplateBySlug(req.params.slug);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      res.json({
        success: true,
        template: templateForStudent({
          id: template.id,
          title: template.title,
          slug: template.slug,
          description: template.description,
          scope: template.scope,
          thumbnail_url: resolvePlaygroundThumbnailUrl(template),
          has_bundle: !!template.bundle_b2_key,
          files_manifest: template.scope === 'flat' ? template.files_manifest : undefined,
        }),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/playground/templates/:slug/bundle', async (req, res) => {
    if (!isPublicPlaygroundEnabled()) {
      return res.status(404).json({ success: false, message: 'Playground not enabled' });
    }
    try {
      const template = await templatesDb.getPlaygroundTemplateBySlug(req.params.slug);
      if (!template || !template.bundle_b2_key) {
        return res.status(404).json({ success: false, message: 'Bundle not found' });
      }
      await b2Service.ensureCommonAssetsBucket();
      if (b2Service.commonAssetsPublicAccess) {
        const url = b2Service.getCommonAssetPublicUrl(template.bundle_b2_key);
        return res.redirect(302, url);
      }
      const streamResult = await b2Service.downloadCommonAssetStream(template.bundle_b2_key);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${template.slug}.zip"`);
      streamResult.stream.pipe(res);
    } catch (err) {
      console.error('Playground bundle download error:', err);
      res.status(500).json({ success: false, message: 'Could not download bundle' });
    }
  });

  app.post('/admin/templates/:id/bundle', requireAdmin, upload.single('bundle'), async (req, res) => {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ZIP file required' });
    }
    const localPath = req.file.path;
    try {
      const template = await templatesDb.getTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({ success: false, message: 'File must be a .zip archive' });
      }
      if (!validateZipHasConfig(localPath)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ZIP: config.json not found. Export from the editor using Save Template (bundle mode).',
        });
      }

      const remotePath = playgroundBundleKey(template.slug);
      if (template.bundle_b2_key && template.bundle_b2_key !== remotePath) {
        try {
          await b2Service.deleteCommonAsset(template.bundle_b2_key);
        } catch (_) {}
      }

      await b2Service.uploadCommonAsset(localPath, remotePath, 'application/zip');
      let updated = await templatesDb.updateTemplate(template.id, { bundle_b2_key: remotePath });
      if (updated?.is_playground) {
        updated = await refreshPlaygroundThumbnail(updated, { bundleLocalPath: localPath });
      }
      res.json({ success: true, template: updated });
    } catch (err) {
      console.error('Playground bundle upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    } finally {
      try {
        fs.unlinkSync(localPath);
      } catch (_) {}
    }
  });

  app.delete('/admin/templates/:id/bundle', requireAdmin, async (req, res) => {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    try {
      const template = await templatesDb.getTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      if (template.bundle_b2_key) {
        try {
          await b2Service.deleteCommonAsset(template.bundle_b2_key);
        } catch (err) {
          console.warn('Could not delete bundle from B2:', err.message);
        }
      }
      const updated = await templatesDb.clearTemplateBundle(template.id);
      res.json({ success: true, template: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/templates/:id/generate-thumbnail', requireAdmin, async (req, res) => {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    try {
      const template = await templatesDb.getTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      const thumbnail_url = await generatePlaygroundThumbnail(template);
      if (!thumbnail_url) {
        return res.status(400).json({
          success: false,
          message:
            template.scope === 'combined'
              ? 'Upload a bundle ZIP first, or ensure the project has a scene image'
              : 'Could not generate a thumbnail from this template',
        });
      }
      const updated = await templatesDb.updateTemplate(template.id, { thumbnail_url });
      res.json({ success: true, template: updated });
    } catch (err) {
      console.error('Generate thumbnail error:', err);
      res.status(500).json({ success: false, message: err.message || 'Thumbnail generation failed' });
    }
  });

  app.post('/admin/templates/:id/thumbnail', requireAdmin, (req, res) => {
    thumbUpload.single('thumbnail')(req, res, async (uploadErr) => {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      if (uploadErr) {
        return res.status(400).json({ success: false, message: uploadErr.message || 'Invalid thumbnail file' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file required' });
      }
      const localPath = req.file.path;
      try {
        const template = await templatesDb.getTemplateById(req.params.id);
        if (!template) {
          return res.status(404).json({ success: false, message: 'Template not found' });
        }
        const thumbnail_url = await uploadCustomTemplateThumbnail(
          template,
          localPath,
          req.file.mimetype,
          req.file.originalname
        );
        const updated = await templatesDb.updateTemplate(template.id, { thumbnail_url });
        res.json({ success: true, template: updated });
      } catch (err) {
        console.error('Thumbnail upload error:', err);
        res.status(500).json({ success: false, message: err.message || 'Thumbnail upload failed' });
      } finally {
        try {
          fs.unlinkSync(localPath);
        } catch (_) {}
      }
    });
  });
}

module.exports = { registerPlaygroundRoutes, playgroundBundleKey, validateZipHasConfig };
