const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const legalPages = require('../lib/legal-pages');

function registerLegalRoutes(app) {
  app.get('/api/legal/:slug', async (req, res) => {
    try {
      const slug = legalPages.normalizeSlug(req.params.slug);
      if (!slug) {
        return res.status(404).json({ success: false, message: 'Legal page not found' });
      }
      const page = await legalPages.getLegalPage(slug);
      if (!page) {
        return res.status(404).json({ success: false, message: 'Legal page not found' });
      }
      res.json({ success: true, page });
    } catch (err) {
      console.error('GET /api/legal/:slug:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/legal/:slug', requireAdmin, async (req, res) => {
    try {
      const slug = legalPages.normalizeSlug(req.params.slug);
      if (!slug) {
        return res.status(404).json({ success: false, message: 'Legal page not found' });
      }
      const page = await legalPages.getLegalPage(slug);
      res.json({
        success: true,
        page,
        dbEnabled: isDbEnabled(),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/legal/:slug', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const slug = legalPages.normalizeSlug(req.params.slug);
      if (!slug) {
        return res.status(404).json({ success: false, message: 'Legal page not found' });
      }
      const updatedBy = 'admin';
      const page = await legalPages.updateLegalPage(slug, req.body || {}, updatedBy);
      res.json({ success: true, page });
    } catch (err) {
      const status = err.message.includes('required') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerLegalRoutes };
