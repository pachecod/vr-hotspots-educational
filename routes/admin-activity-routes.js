const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const { listAuthEvents } = require('../lib/usage/auth-events');
const usageDb = require('../lib/usage/usage-db');
const b2Service = require('../services/b2-service');

const ALLOWED_B2_PREFIXES = ['student-projects/', 'student-assets/'];

function isAllowedB2Path(remotePath) {
  const p = String(remotePath || '').replace(/\\/g, '/');
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  return ALLOWED_B2_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function contentTypeForName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

function registerAdminActivityRoutes(app) {
  app.get('/admin/activity/uploads/:id/download', requireAdmin, async (req, res) => {
    let tempPath = null;
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const event = await usageDb.getUploadEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ success: false, message: 'Upload event not found' });
      }
      const remotePath = event.b2Path;
      if (!isAllowedB2Path(remotePath)) {
        return res.status(404).json({
          success: false,
          message: 'No downloadable cloud path for this upload event',
        });
      }

      const safeName =
        path.basename(String(event.fileName || remotePath).replace(/\\/g, '/')) || 'download.bin';
      tempPath = path.join('temp-uploads', `activity_dl_${Date.now()}_${safeName}`);
      if (!fs.existsSync('temp-uploads')) fs.mkdirSync('temp-uploads', { recursive: true });

      await b2Service.downloadFile(remotePath, tempPath);
      try {
        const st = fs.statSync(tempPath);
        if (st && st.size > 0) {
          usageDb.recordDownloadBytes(st.size, { source: 'activity-download' }).catch(() => {});
        }
      } catch (_) {
        /* ignore metering */
      }
      res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/"/g, '')}"`);
      res.setHeader('Content-Type', contentTypeForName(safeName));
      res.download(tempPath, safeName, () => {
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
      console.error('activity upload download error:', err);
      const notFound =
        err.response?.status === 404 || /404|not found/i.test(String(err.message || ''));
      res.status(notFound ? 404 : 500).json({
        success: false,
        message: notFound
          ? 'File not found in cloud storage (it may have been deleted).'
          : err.message || 'Download failed',
      });
    }
  });

  app.get('/admin/activity/auth', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 200));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const event = req.query.event || null;
      const role = req.query.role || null;
      const data = await listAuthEvents({ days, limit, offset, event, role });
      res.json({
        success: true,
        dbEnabled: isDbEnabled(),
        ...data,
      });
    } catch (err) {
      console.error('activity auth error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/activity/uploads', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 200));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const kind = req.query.kind || null;
      const data = await usageDb.listUploadEvents({ days, limit, offset, kind });
      res.json({
        success: true,
        dbEnabled: isDbEnabled(),
        ...data,
      });
    } catch (err) {
      console.error('activity uploads error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/activity/overview', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 50));
      const tab = String(req.query.tab || 'all');
      const uploadKind = req.query.kind || null;
      const authOffset = Math.max(0, Number(req.query.authOffset) || 0);
      const uploadsOffset = Math.max(0, Number(req.query.uploadsOffset) || 0);

      let auth = { days, total: 0, limit, offset: 0, events: [] };
      let uploads = { days, total: 0, limit, offset: 0, events: [] };

      if (tab === 'all' || tab === 'logins' || tab === 'logouts') {
        auth = await listAuthEvents({
          days,
          limit,
          offset: authOffset,
          event: tab === 'logins' ? 'login' : tab === 'logouts' ? 'logout' : null,
        });
      }
      if (tab === 'all' || tab === 'uploads') {
        uploads = await usageDb.listUploadEvents({
          days,
          limit,
          offset: uploadsOffset,
          kind: uploadKind || null,
        });
      }

      res.json({
        success: true,
        dbEnabled: isDbEnabled(),
        days,
        limit,
        auth,
        uploads,
      });
    } catch (err) {
      console.error('activity overview error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });
}

module.exports = { registerAdminActivityRoutes };
