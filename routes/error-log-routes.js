const { requireAdmin } = require('../admin-auth');
const { getStudentSession } = require('../student-auth');
const { isDbEnabled } = require('../services/db-service');
const errorLog = require('../lib/error-log');
const { buildDuplicateHotspotReport } = require('../lib/project-integrity');
const packageJson = require('../package.json');

const recentClientKeys = new Map();
const CLIENT_DEDUP_MS = 10 * 60 * 1000;

function pruneDedup(now) {
  for (const [k, t] of recentClientKeys.entries()) {
    if (now - t > CLIENT_DEDUP_MS) recentClientKeys.delete(k);
  }
}

function clientDedupKey(payload) {
  return [
    payload.code || '',
    payload.userName || '',
    payload.message || '',
    JSON.stringify(payload.details?.layoutFingerprint || payload.details?.groups?.[0]?.layoutFingerprint || ''),
  ].join('::');
}

function resolveUserName(req, body) {
  const sess = getStudentSession(req);
  if (sess && (sess.displayName || sess.username)) {
    return String(sess.displayName || sess.username);
  }
  if (body && body.userName) return String(body.userName).slice(0, 200);
  if (req.adminSession) return 'admin';
  return 'Guest / unknown';
}

function resolveStudentId(req, body) {
  const sess = getStudentSession(req);
  if (sess && sess.studentId) return sess.studentId;
  if (body && body.studentId) return body.studentId;
  return null;
}

function registerErrorLogRoutes(app) {
  /** Public/client reporter — authenticated students preferred; guests allowed. */
  app.post('/api/error-reports', async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const body = req.body || {};
      const userName = resolveUserName(req, body);
      const studentId = resolveStudentId(req, body);
      const code = String(body.code || 'client_error').slice(0, 120);
      const message = String(body.message || 'Client error').slice(0, 2000);
      const level = String(body.level || 'error').slice(0, 40);
      const source = String(body.source || 'client').slice(0, 200);
      const appVersion = String(body.appVersion || packageJson.version || '').slice(0, 40);
      const details = body.details && typeof body.details === 'object' ? body.details : {};

      const now = Date.now();
      pruneDedup(now);
      const dedup = clientDedupKey({ code, userName, message, details });
      if (recentClientKeys.has(dedup)) {
        return res.json({ success: true, deduplicated: true });
      }
      recentClientKeys.set(dedup, now);

      const entry = await errorLog.createErrorLog({
        level,
        code,
        message,
        userName,
        studentId,
        source,
        appVersion,
        details: {
          ...details,
          userAgent: typeof req.get === 'function' ? req.get('user-agent') : null,
          path: body.path || null,
        },
      });
      res.json({ success: true, log: entry });
    } catch (err) {
      console.error('POST /api/error-reports:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /** Scan a scenes object (from editor/export) and log if clone pattern found. */
  app.post('/api/error-reports/project-integrity', async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const body = req.body || {};
      const scenes = body.scenes;
      const report = buildDuplicateHotspotReport(scenes, {
        projectName: body.projectName || null,
        trigger: body.trigger || 'manual',
        currentScene: body.currentScene || null,
      });
      if (!report) {
        return res.json({ success: true, detected: false });
      }

      const userName = resolveUserName(req, body);
      const studentId = resolveStudentId(req, body);
      const now = Date.now();
      pruneDedup(now);
      const dedup = clientDedupKey({
        code: report.code,
        userName,
        message: report.message,
        details: report.details,
      });
      if (recentClientKeys.has(dedup)) {
        return res.json({ success: true, detected: true, deduplicated: true });
      }
      recentClientKeys.set(dedup, now);

      const entry = await errorLog.createErrorLog({
        level: report.level,
        code: report.code,
        message: report.message,
        userName,
        studentId,
        source: body.source || 'project-integrity',
        appVersion: String(body.appVersion || packageJson.version || '').slice(0, 40),
        details: report.details,
      });
      res.json({ success: true, detected: true, log: entry });
    } catch (err) {
      console.error('POST /api/error-reports/project-integrity:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/error-logs', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const result = await errorLog.listErrorLogs({
        limit: req.query.limit,
        offset: req.query.offset,
        code: req.query.code || null,
        level: req.query.level || null,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/error-logs/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const entry = await errorLog.getErrorLog(req.params.id);
      if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, log: entry });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/error-logs/:id', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const ok = await errorLog.deleteErrorLog(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/error-logs/clear', requireAdmin, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const olderThanDays = req.body?.olderThanDays;
      const deleted = await errorLog.clearErrorLogs({
        olderThanDays: olderThanDays != null ? olderThanDays : null,
      });
      res.json({ success: true, deleted });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerErrorLogRoutes };
