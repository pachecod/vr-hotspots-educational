const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const systemText = require('../lib/system-text');

function registerSystemTextRoutes(app) {
  app.get('/api/system-text/:key', async (req, res) => {
    try {
      const key = systemText.normalizeKey(req.params.key);
      if (!key) {
        return res.status(404).json({ success: false, message: 'System text not found' });
      }
      const text = await systemText.getSystemText(key);
      if (!text) {
        return res.status(404).json({ success: false, message: 'System text not found' });
      }
      res.json({ success: true, text });
    } catch (err) {
      console.error('GET /api/system-text/:key:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/system-text/:key', requireAdmin, async (req, res) => {
    try {
      const key = systemText.normalizeKey(req.params.key);
      if (!key) {
        return res.status(404).json({ success: false, message: 'System text not found' });
      }
      const text = await systemText.getSystemText(key);
      res.json({
        success: true,
        text,
        dbEnabled: isDbEnabled(),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/system-text/:key', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const key = systemText.normalizeKey(req.params.key);
      if (!key) {
        return res.status(404).json({ success: false, message: 'System text not found' });
      }
      const text = await systemText.updateSystemText(key, req.body || {}, 'admin');
      res.json({ success: true, text });
    } catch (err) {
      const status = err.message.includes('required') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerSystemTextRoutes };
