const rateLimit = require('express-rate-limit');
const { requireStudent } = require('../student-auth');
const { getRideyEnabled } = require('../lib/app-settings');
const { analyzeCodeWithAI } = require('../services/ridey-service');

const rideyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RIDEY_RATE_LIMIT_PER_HOUR || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    if (req.studentSession?.studentId) return `student:${req.studentSession.studentId}`;
    return rateLimit.ipKeyGenerator(req.ip);
  },
  message: { success: false, message: 'Ridey rate limit reached. Try again later.' },
});

function registerRideyRoutes(app) {
  app.get('/api/ridey/status', async (_req, res) => {
    try {
      const enabled = await getRideyEnabled();
      const hasApiKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
      res.json({ success: true, enabled, hasApiKey });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/ridey/analyze', requireStudent, rideyRateLimiter, async (req, res) => {
    try {
      const enabled = await getRideyEnabled();
      if (!enabled) {
        return res.status(403).json({ success: false, message: 'Ridey is disabled by admin' });
      }

      const { code, language, fileName, prompt, temperature } = req.body || {};
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, message: 'code is required' });
      }
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, message: 'prompt is required' });
      }

      const result = await analyzeCodeWithAI({
        code,
        language: language || 'html',
        fileName,
        prompt: prompt.trim(),
        context: 'WebXR development with A-Frame, Three.js, and modern web technologies',
        temperature,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error('POST /api/ridey/analyze:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerRideyRoutes };
