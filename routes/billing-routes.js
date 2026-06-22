const { requireAdmin } = require('../admin-auth');
const { requireStudentStrict } = require('../student-auth');
const { isStripeEnabled, createCheckoutSession, createPortalSession } = require('../services/stripe-service');
const { getUsageSummary } = require('../services/usage-quota');
const { query } = require('../services/db-service');
const { PLAN_TIERS } = require('../lib/plan-tiers');

function getBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function registerBillingRoutes(app) {
  app.get('/api/billing/enabled', (req, res) => {
    res.json({
      enabled: isStripeEnabled(),
      allowStudentUpgrades: process.env.STRIPE_ALLOW_STUDENT_UPGRADES === 'true',
      tiers: PLAN_TIERS,
    });
  });

  app.get('/admin/billing', requireAdmin, async (req, res) => {
    try {
      const classId = req.query.classId;
      if (!classId) {
        const { rows } = await query(`SELECT id, name FROM classes ORDER BY name`);
        return res.json({ classes: rows, stripeEnabled: isStripeEnabled() });
      }
      const usage = await getUsageSummary({ classId });
      const { rows: billingRows } = await query(
        `SELECT * FROM billing_accounts WHERE scope_type = 'class' AND scope_id = $1`,
        [classId]
      );
      res.json({
        stripeEnabled: isStripeEnabled(),
        billing: billingRows[0] || { plan_tier: 'free', status: 'active' },
        usage,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/billing/usage', requireAdmin, async (req, res) => {
    try {
      const classId = req.query.classId;
      if (!classId) return res.status(400).json({ success: false, message: 'classId required' });
      res.json(await getUsageSummary({ classId }));
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/billing/checkout', requireAdmin, async (req, res) => {
    if (!isStripeEnabled()) {
      return res.status(503).json({ success: false, message: 'Stripe billing is not enabled' });
    }
    try {
      const { classId, tier } = req.body || {};
      if (!classId || !tier) {
        return res.status(400).json({ success: false, message: 'classId and tier are required' });
      }
      const base = getBaseUrl(req);
      const session = await createCheckoutSession({
        scopeType: 'class',
        scopeId: classId,
        tier,
        successUrl: `${base}/admin-billing.html?classId=${classId}&checkout=success`,
        cancelUrl: `${base}/admin-billing.html?classId=${classId}&checkout=cancel`,
        metadata: { class_id: classId },
      });
      res.json({ success: true, url: session.url });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/billing/portal', requireAdmin, async (req, res) => {
    if (!isStripeEnabled()) {
      return res.status(503).json({ success: false, message: 'Stripe billing is not enabled' });
    }
    try {
      const { classId } = req.body || {};
      if (!classId) return res.status(400).json({ success: false, message: 'classId required' });
      const base = getBaseUrl(req);
      const session = await createPortalSession({
        scopeType: 'class',
        scopeId: classId,
        returnUrl: `${base}/admin-billing.html?classId=${classId}`,
      });
      res.json({ success: true, url: session.url });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/student/billing', requireStudentStrict, async (req, res) => {
    try {
      const { studentId, classId } = req.studentSession;
      const usage = await getUsageSummary({ classId, studentId });
      res.json({
        stripeEnabled: isStripeEnabled(),
        allowStudentUpgrades: process.env.STRIPE_ALLOW_STUDENT_UPGRADES === 'true',
        usage,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/student/billing/checkout', requireStudentStrict, async (req, res) => {
    if (!isStripeEnabled() || process.env.STRIPE_ALLOW_STUDENT_UPGRADES !== 'true') {
      return res.status(403).json({ success: false, message: 'Student upgrades not available' });
    }
    try {
      const { tier } = req.body || {};
      const { studentId } = req.studentSession;
      if (!tier) return res.status(400).json({ success: false, message: 'tier required' });
      const base = getBaseUrl(req);
      const session = await createCheckoutSession({
        scopeType: 'student',
        scopeId: studentId,
        tier,
        successUrl: `${base}/index.html?billing=success`,
        cancelUrl: `${base}/index.html?billing=cancel`,
        metadata: { student_id: studentId },
      });
      res.json({ success: true, url: session.url });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerBillingRoutes };
