const rateLimit = require('express-rate-limit');
const { requireStudentStrict } = require('../student-auth');
const { getAdminSession } = require('../admin-auth');
const { getRideyEnabled, getRideyVersion } = require('../lib/app-settings');
const { analyzeCodeWithAI } = require('../services/ridey-service');

/** Ridey can spend OpenAI credits — always require a real student or admin session. */
function requireRideyUser(req, res, next) {
  const adminSession = getAdminSession(req);
  if (adminSession) {
    req.adminSession = adminSession;
    return next();
  }
  return requireStudentStrict(req, res, next);
}

const rideyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RIDEY_RATE_LIMIT_PER_HOUR || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    if (req.adminSession) return 'admin:session';
    if (req.studentSession?.studentId) return `student:${req.studentSession.studentId}`;
    return rateLimit.ipKeyGenerator(req.ip);
  },
  message: { success: false, message: 'Ridey rate limit reached. Try again later.' },
});

function registerRideyRoutes(app) {
  app.get('/api/ridey/status', async (_req, res) => {
    try {
      const enabled = await getRideyEnabled();
      const version = await getRideyVersion();
      const hasApiKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
      res.json({ success: true, enabled, version, hasApiKey });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/ridey/analyze', requireRideyUser, rideyRateLimiter, async (req, res) => {
    try {
      const enabled = await getRideyEnabled();
      if (!enabled) {
        return res.status(403).json({ success: false, message: 'Ridey is disabled by admin' });
      }

      const { code, language, fileName, prompt, temperature, projectFiles, activeFileName } =
        req.body || {};
      if (!code && (!Array.isArray(projectFiles) || !projectFiles.length)) {
        return res.status(400).json({ success: false, message: 'code or projectFiles is required' });
      }
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, message: 'prompt is required' });
      }

      const result = await analyzeCodeWithAI({
        code: code || '',
        language: language || 'html',
        fileName,
        prompt: prompt.trim(),
        context: 'WebXR development with A-Frame, Three.js, and modern web technologies',
        temperature,
        projectFiles: Array.isArray(projectFiles) ? projectFiles : undefined,
        activeFileName,
        version: await getRideyVersion(),
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error('POST /api/ridey/analyze:', err);
      const status = err.message && !String(err.message).includes('OpenAI') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerRideyRoutes };
