const { requireAdmin } = require('../admin-auth');
const { requireStudentStrict } = require('../student-auth');
const { isStripeEnabled, createCheckoutSession, createPortalSession } = require('../services/stripe-service');
const { getUsageSummary, getClassBillingAccount } = require('../services/usage-quota');
const { query } = require('../services/db-service');
const {
  mergeLimitOverrides,
  PLAN_TIERS,
} = require('../lib/class-limits');

const VALID_PLAN_TIERS = Object.keys(PLAN_TIERS);

async function ensureClassBillingAccount(classId) {
  const existing = await getClassBillingAccount(classId);
  if (existing && existing.id) return existing;
  const inserted = await query(
    `INSERT INTO billing_accounts (scope_type, scope_id, plan_tier, status, limit_overrides)
     VALUES ('class', $1, 'free', 'active', '{}'::jsonb)
     RETURNING *`,
    [classId]
  );
  return inserted.rows[0];
}

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
      const billing = await ensureClassBillingAccount(classId);
      res.json({
        stripeEnabled: isStripeEnabled(),
        billing: {
          plan_tier: billing.plan_tier || 'free',
          status: billing.status || 'active',
          limit_overrides: billing.limit_overrides || {},
          current_period_end: billing.current_period_end || null,
        },
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

  app.patch('/admin/billing/class-settings', requireAdmin, async (req, res) => {
    try {
      const { classId, planTier, limitOverrides, clearOverrides } = req.body || {};
      if (!classId) {
        return res.status(400).json({ success: false, message: 'classId required' });
      }

      const billing = await ensureClassBillingAccount(classId);
      let nextTier = billing.plan_tier || 'free';
      if (planTier != null && planTier !== '') {
        if (!VALID_PLAN_TIERS.includes(planTier)) {
          return res.status(400).json({ success: false, message: 'Invalid plan tier' });
        }
        nextTier = planTier;
      }

      let nextOverrides = billing.limit_overrides || {};
      if (clearOverrides) {
        nextOverrides = {};
      } else if (limitOverrides && typeof limitOverrides === 'object') {
        nextOverrides = mergeLimitOverrides(nextOverrides, limitOverrides);
      }

      const { rows } = await query(
        `UPDATE billing_accounts
         SET plan_tier = $1,
             limit_overrides = $2::jsonb,
             updated_at = NOW()
         WHERE scope_type = 'class' AND scope_id = $3
         RETURNING *`,
        [nextTier, JSON.stringify(nextOverrides), classId]
      );

      const usage = await getUsageSummary({ classId });
      res.json({
        success: true,
        billing: rows[0],
        usage,
      });
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
