const rateLimit = require('express-rate-limit');
const { assertSafeOutboundUrl } = require('../lib/security/ssrf-guard');
const { parseRssItems } = require('../lib/rss-feed');

const DEFAULT_FEED_URL = 'https://danpacheco.com/category/webxride/feed/';
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = { fetchedAt: 0, payload: null };

const welcomeNewsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Try again shortly.' },
});

async function fetchWelcomeNewsItems() {
  const feedUrl = (process.env.WELCOME_NEWS_RSS_URL || DEFAULT_FEED_URL).trim();
  const limit = Math.min(Math.max(parseInt(process.env.WELCOME_NEWS_RSS_LIMIT || '4', 10) || 4, 1), 10);
  const now = Date.now();

  if (cache.payload && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const safeUrl = await assertSafeOutboundUrl(feedUrl);
  const response = await fetch(safeUrl.toString(), {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': 'VR-Hotspots-Welcome-News/1.0',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const xml = await response.text();
  const items = parseRssItems(xml, limit);
  const payload = {
    success: true,
    feedUrl: safeUrl.toString(),
    items,
  };

  cache = { fetchedAt: now, payload };
  return payload;
}

function registerWelcomeNewsRoutes(app) {
  app.get('/api/welcome/news', welcomeNewsRateLimiter, async (_req, res) => {
    try {
      const payload = await fetchWelcomeNewsItems();
      res.json(payload);
    } catch (err) {
      console.error('GET /api/welcome/news:', err.message);
      res.status(502).json({
        success: false,
        message: 'Could not load news feed',
        items: [],
      });
    }
  });
}

module.exports = { registerWelcomeNewsRoutes, fetchWelcomeNewsItems };
