const os = require('os');
const { requireAdmin } = require('../admin-auth');
const { isDbEnabled } = require('../services/db-service');
const usageDb = require('../lib/usage/usage-db');
const renderMetrics = require('../lib/usage/render-metrics');
const { runStorageSnapshot, formatBytes, scanHostedDisk } = require('../lib/usage/storage-scan');
const { runOnce, getSnapshotJobStatus } = require('../lib/usage/snapshot-job');
const {
  getStorageLimits,
  saveStorageLimitOverrides,
} = require('../lib/usage/storage-limits');
const errorLog = require('../lib/error-log');
const ga4Metrics = require('../lib/usage/ga4-metrics');

function memorySnapshot() {
  const mu = process.memoryUsage();
  return {
    ok: true,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    memory: {
      rssMB: Math.round((mu.rss / 1024 / 1024) * 10) / 10,
      heapUsedMB: Math.round((mu.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMB: Math.round((mu.heapTotal / 1024 / 1024) * 10) / 10,
      externalMB: Math.round((mu.external / 1024 / 1024) * 10) / 10,
      arrayBuffersMB: Math.round(((mu.arrayBuffers || 0) / 1024 / 1024) * 10) / 10,
    },
    system: {
      totalMB: Math.round((os.totalmem() / 1024 / 1024) * 10) / 10,
      freeMB: Math.round((os.freemem() / 1024 / 1024) * 10) / 10,
      loadavg: os.loadavg ? os.loadavg() : null,
    },
  };
}

function registerAdminUsageRoutes(app) {
  app.get('/admin/usage/overview', requireAdmin, async (req, res) => {
    try {
      // One shared window: hours drives Render; days (ceil) drives GA/B2/uploads.
      const hours = Math.max(1, Math.min(24 * 30, Number(req.query.hours) || 168));
      const days = Math.max(
        1,
        Math.min(90, Number(req.query.days) || Math.ceil(hours / 24))
      );
      const endMs = Date.now();
      const startMs = endMs - hours * 3600 * 1000;
      const sharedWindow = {
        hours,
        days,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      };

      const [render, latest, history, uploads, recent, hostedLive, errors, analytics, limits, downloadsToday] =
        await Promise.all([
          renderMetrics.getDashboardMetrics({ hours, resolutionSeconds: hours > 72 ? 900 : 300 }),
          usageDb.getLatestSnapshots().catch(() => []),
          usageDb.getSnapshotHistory({ source: 'b2', scope: 'total', days }).catch(() => []),
          usageDb.getUploadTotals({ days }).catch(() => ({
            days,
            totalBytes: 0,
            totalEvents: 0,
            byKind: [],
            byDay: [],
          })),
          usageDb.getRecentUploads(20).catch(() => []),
          scanHostedDisk().catch(() => []),
          errorLog.listErrorLogsForWindow({ hours, limit: 200 }).catch(() => ({
            hours,
            total: 0,
            truncated: false,
            logs: [],
          })),
          ga4Metrics.getDashboardMetrics({ days }).catch((err) => ({
            configured: false,
            config: ga4Metrics.getConfig(),
            metrics: null,
            error: err.message || 'GA4 request failed',
          })),
          getStorageLimits().catch(() => ({})),
          usageDb.getDownloadTotalsToday().catch(() => ({
            dayGmt: new Date().toISOString().slice(0, 10),
            byteSize: 0,
            eventCount: 0,
          })),
        ]);

      res.json({
        success: true,
        dbEnabled: isDbEnabled(),
        window: sharedWindow,
        renderConfig: renderMetrics.getConfig(),
        analyticsConfig: ga4Metrics.getConfig(),
        job: getSnapshotJobStatus(),
        memory: memorySnapshot(),
        render,
        analytics,
        storage: {
          latest,
          historyB2Total: history,
          hostedLive: hostedLive[0] || null,
          formatHint: 'bytes',
          limits,
          downloadsToday,
        },
        uploads,
        recentUploads: recent,
        errors,
      });
    } catch (err) {
      console.error('usage overview error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/usage/render', requireAdmin, async (req, res) => {
    try {
      const hours = Math.max(1, Math.min(24 * 30, Number(req.query.hours) || 24));
      const data = await renderMetrics.getDashboardMetrics({
        hours,
        resolutionSeconds: Number(req.query.resolution) || (hours > 72 ? 900 : 300),
      });
      res.json({ success: true, ...data });
    } catch (err) {
      console.error('usage render error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/usage/analytics', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const data = await ga4Metrics.getDashboardMetrics({ days });
      res.json({ success: true, ...data });
    } catch (err) {
      console.error('usage analytics error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/usage/storage', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const [latest, history, uploads] = await Promise.all([
        usageDb.getLatestSnapshots(),
        usageDb.getSnapshotHistory({ days }),
        usageDb.getUploadTotals({ days }),
      ]);
      res.json({
        success: true,
        latest,
        history,
        uploads,
        job: getSnapshotJobStatus(),
      });
    } catch (err) {
      console.error('usage storage error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.post('/admin/usage/scan-now', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        const live = await runStorageSnapshot({ persist: false });
        return res.json({
          success: true,
          persisted: false,
          message: 'DATABASE_URL not set — scanned live but did not persist history',
          result: live,
          formatted: (live.rows || []).map((r) => ({
            ...r,
            byteSizeLabel: formatBytes(r.byteSize),
          })),
        });
      }
      const result = await runOnce('manual');
      res.json({
        success: true,
        persisted: true,
        result,
        job: getSnapshotJobStatus(),
      });
    } catch (err) {
      console.error('usage scan-now error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/admin/usage/memory', requireAdmin, (req, res) => {
    res.json(memorySnapshot());
  });

  app.get('/admin/usage/limits', requireAdmin, async (_req, res) => {
    try {
      const limits = await getStorageLimits();
      res.json({ success: true, limits });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.put('/admin/usage/limits', requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const limits = await saveStorageLimitOverrides({
        b2MaxGb: Object.prototype.hasOwnProperty.call(body, 'b2MaxGb')
          ? body.b2MaxGb
          : undefined,
        b2DownloadMaxGb: Object.prototype.hasOwnProperty.call(body, 'b2DownloadMaxGb')
          ? body.b2DownloadMaxGb
          : undefined,
      });
      res.json({ success: true, limits });
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ success: false, message: err.message || 'Server error' });
    }
  });
}

module.exports = { registerAdminUsageRoutes, memorySnapshot };
