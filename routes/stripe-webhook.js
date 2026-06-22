const { isStripeEnabled, getStripe, handleStripeEvent } = require('../services/stripe-service');

function registerStripeWebhook(app) {
  app.post('/api/stripe/webhook', expressRaw, async (req, res) => {
    if (!isStripeEnabled()) {
      return res.status(503).json({ success: false, message: 'Stripe not enabled' });
    }
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }
    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Stripe webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook handler error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

// Raw body parser middleware for Stripe
function expressRaw(req, res, next) {
  if (req._stripeRawParsed) return next();
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    req.body = Buffer.concat(chunks);
    req._stripeRawParsed = true;
    next();
  });
}

module.exports = { registerStripeWebhook };
