const { query } = require('./db-service');

const STRIPE_ENABLED = process.env.STRIPE_ENABLED === 'true';

let stripe = null;

function isStripeEnabled() {
  return STRIPE_ENABLED && !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  if (!isStripeEnabled()) return null;
  if (!stripe) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function getOrCreateBillingAccount(scopeType, scopeId) {
  const existing = await query(
    `SELECT * FROM billing_accounts WHERE scope_type = $1 AND scope_id = $2`,
    [scopeType, scopeId]
  );
  if (existing.rows.length) return existing.rows[0];

  const inserted = await query(
    `INSERT INTO billing_accounts (scope_type, scope_id, plan_tier, status, limit_overrides)
     VALUES ($1, $2, 'free', 'active', '{}'::jsonb) RETURNING *`,
    [scopeType, scopeId]
  );
  return inserted.rows[0];
}

async function getOrCreateStripeCustomer(billingAccount, metadata = {}) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');

  if (billingAccount.stripe_customer_id) {
    return billingAccount.stripe_customer_id;
  }

  const customer = await s.customers.create({
    metadata: {
      billing_account_id: billingAccount.id,
      scope_type: billingAccount.scope_type,
      scope_id: billingAccount.scope_id,
      ...metadata,
    },
  });

  await query(
    `UPDATE billing_accounts SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
    [customer.id, billingAccount.id]
  );
  return customer.id;
}

function getPriceIdForTier(tier) {
  if (tier === 'class') return process.env.STRIPE_PRICE_CLASS;
  if (tier === 'pro') return process.env.STRIPE_PRICE_PRO;
  return null;
}

async function createCheckoutSession({ scopeType, scopeId, tier, successUrl, cancelUrl, metadata = {} }) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  const priceId = getPriceIdForTier(tier);
  if (!priceId) throw new Error(`No Stripe price configured for tier: ${tier}`);

  const billingAccount = await getOrCreateBillingAccount(scopeType, scopeId);
  const customerId = await getOrCreateStripeCustomer(billingAccount, metadata);

  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      billing_account_id: billingAccount.id,
      scope_type: scopeType,
      scope_id: scopeId,
      plan_tier: tier,
      ...metadata,
    },
  });
  return session;
}

async function createPortalSession({ scopeType, scopeId, returnUrl }) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  const billingAccount = await getOrCreateBillingAccount(scopeType, scopeId);
  if (!billingAccount.stripe_customer_id) {
    throw new Error('No Stripe customer for this account');
  }
  const session = await s.billingPortal.sessions.create({
    customer: billingAccount.stripe_customer_id,
    return_url: returnUrl,
  });
  return session;
}

async function isEventProcessed(stripeEventId) {
  const { rows } = await query(`SELECT id FROM stripe_events WHERE stripe_event_id = $1`, [stripeEventId]);
  return rows.length > 0;
}

async function markEventProcessed(stripeEventId, type) {
  await query(`INSERT INTO stripe_events (stripe_event_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    stripeEventId,
    type,
  ]);
}

async function updateBillingFromSubscription(subscription, planTier) {
  const customerId = subscription.customer;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const status = subscription.status || 'active';

  await query(
    `UPDATE billing_accounts
     SET plan_tier = COALESCE($1, plan_tier),
         status = $2,
         current_period_end = $3,
         updated_at = NOW()
     WHERE stripe_customer_id = $4`,
    [planTier, status, periodEnd, customerId]
  );
}

async function handleStripeEvent(event) {
  if (await isEventProcessed(event.id)) return { duplicate: true };

  const s = getStripe();
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tier = session.metadata && session.metadata.plan_tier;
      if (session.subscription && tier) {
        const sub = await s.subscriptions.retrieve(session.subscription);
        await updateBillingFromSubscription(sub, tier);
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object;
      const tier = (sub.metadata && sub.metadata.plan_tier) || null;
      await updateBillingFromSubscription(sub, tier);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await query(
        `UPDATE billing_accounts SET plan_tier = 'free', status = 'canceled', updated_at = NOW()
         WHERE stripe_customer_id = $1`,
        [sub.customer]
      );
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await query(
        `UPDATE billing_accounts SET status = 'past_due', updated_at = NOW()
         WHERE stripe_customer_id = $1`,
        [invoice.customer]
      );
      break;
    }
    default:
      break;
  }

  await markEventProcessed(event.id, event.type);
  return { duplicate: false };
}

module.exports = {
  isStripeEnabled,
  getStripe,
  getOrCreateBillingAccount,
  createCheckoutSession,
  createPortalSession,
  handleStripeEvent,
  getPriceIdForTier,
};
