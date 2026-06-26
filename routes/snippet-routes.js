const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const snippetsDb = require('../lib/snippets');
const { getRideyEnabled, setRideyEnabled, getBlockedExtensions, setBlockedExtensions } = require('../lib/app-settings');

function registerSnippetRoutes(app) {
  app.get('/api/snippets', async (_req, res) => {
    try {
      const snippets = await snippetsDb.listSnippets();
      res.json({ success: true, snippets });
    } catch (err) {
      console.error('GET /api/snippets:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/snippets', requireAdmin, async (_req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const snippets = await snippetsDb.listSnippets();
      res.json({ success: true, snippets });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/snippets', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const { title, code, language, sort_order } = req.body || {};
      if (!title || !code) {
        return res.status(400).json({ success: false, message: 'title and code are required' });
      }
      const snippet = await snippetsDb.createSnippet({ title, code, language, sort_order });
      res.json({ success: true, snippet });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/snippets/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const snippet = await snippetsDb.updateSnippet(req.params.id, req.body || {});
      if (!snippet) return res.status(404).json({ success: false, message: 'Snippet not found' });
      res.json({ success: true, snippet });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/snippets/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const ok = await snippetsDb.deleteSnippet(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'Snippet not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/editor-settings', requireAdmin, async (_req, res) => {
    try {
      const rideyEnabled = await getRideyEnabled();
      const blockedExtensions = await getBlockedExtensions();
      const hasApiKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
      res.json({
        success: true,
        rideyEnabled,
        blockedExtensions,
        hasApiKey,
        dbEnabled: isDbEnabled(),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/editor-settings/ridey', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      await setRideyEnabled(!!req.body?.enabled);
      res.json({ success: true, rideyEnabled: await getRideyEnabled() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/editor-settings/blocked-extensions', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      await setBlockedExtensions(req.body?.extensions || []);
      res.json({ success: true, blockedExtensions: await getBlockedExtensions() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerSnippetRoutes };
