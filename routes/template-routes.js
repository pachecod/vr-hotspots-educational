const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const templatesDb = require('../lib/templates');
const { getBlockedExtensions } = require('../lib/app-settings');
const { refreshPlaygroundThumbnail } = require('../lib/playground-thumbnail');
const { templateForStudent } = require('../lib/template-manifest');
const {
  listStarterTemplates,
  loadStarterTemplate,
} = require('../lib/starter-templates');

async function maybeRefreshPlaygroundThumbnail(template, body = {}) {
  if (!template?.is_playground) return template;
  const manualThumb =
    body.thumbnail_url !== undefined && String(body.thumbnail_url || '').trim() !== '';
  if (manualThumb) return template;
  if (template.thumbnail_url && !body.forceThumbnailRefresh) return template;
  return (await refreshPlaygroundThumbnail(template, { force: !!body.forceThumbnailRefresh })) || template;
}

function registerTemplateRoutes(app) {
  app.get('/api/blocked-extensions', async (_req, res) => {
    try {
      const extensions = await getBlockedExtensions();
      res.json({ success: true, extensions });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/templates', async (_req, res) => {
    try {
      const templates = await templatesDb.listPublicTemplates();
      res.json({ success: true, templates });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/templates/default', async (_req, res) => {
    try {
      const template = await templatesDb.getDefaultTemplate();
      res.json({
        success: true,
        template: template ? templateForStudent(template) : null,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/templates/:slug', async (req, res) => {
    try {
      const template = await templatesDb.getTemplateBySlug(req.params.slug);
      if (!template || (!template.is_public && !req.adminSession)) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      res.json({ success: true, template: templateForStudent(template) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/starter-templates', requireAdmin, (_req, res) => {
    try {
      res.json({ success: true, templates: listStarterTemplates() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/starter-templates/:slug', requireAdmin, (req, res) => {
    try {
      const template = loadStarterTemplate(req.params.slug);
      res.json({ success: true, template });
    } catch (err) {
      res.status(404).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/templates', requireAdmin, async (_req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const templates = await templatesDb.listAllTemplates();
      res.json({ success: true, templates });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/templates/reorder', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const order = Array.isArray(req.body?.order) ? req.body.order : null;
      if (!order || !order.length) {
        return res.status(400).json({ success: false, message: 'order array is required' });
      }
      await templatesDb.reorderTemplates(order);
      const templates = await templatesDb.listAllTemplates();
      res.json({ success: true, templates });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/templates/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const template = await templatesDb.getTemplateById(req.params.id);
      if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
      res.json({ success: true, template });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/templates', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const { title, description, files_manifest, is_public, is_default, scope, is_playground, thumbnail_url } =
        req.body || {};
      if (!title) {
        return res.status(400).json({ success: false, message: 'title is required' });
      }
      let files = Array.isArray(files_manifest) ? files_manifest : [];
      const templateScope = scope === 'combined' ? 'combined' : 'flat';
      if (!files.length) {
        if (templateScope === 'combined') {
          files = [
            {
              name: 'index.html',
              content:
                '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Placeholder</title></head><body></body></html>',
            },
          ];
        } else {
          return res.status(400).json({ success: false, message: 'files_manifest required for flat templates' });
        }
      }
      let template = await templatesDb.createTemplate({
        title,
        description,
        files_manifest: files,
        is_public,
        is_default,
        is_playground,
        thumbnail_url,
        scope: templateScope,
      });
      template = await maybeRefreshPlaygroundThumbnail(template, req.body || {});
      res.json({ success: true, template });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/templates/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      let template = await templatesDb.updateTemplate(req.params.id, req.body || {});
      if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
      template = await maybeRefreshPlaygroundThumbnail(template, req.body || {});
      res.json({ success: true, template });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/templates/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const ok = await templatesDb.deleteTemplate(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'Template not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerTemplateRoutes };
