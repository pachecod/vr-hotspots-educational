const http = require('http');
const https = require('https');
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

function fetchPinnedText(pinned, { timeoutMs = 10000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const protocol = pinned.url.protocol === 'https:' ? https : http;
    const req = protocol.get(
      pinned.url,
      {
        headers: { Host: pinned.hostname, ...headers },
        servername: pinned.hostname,
        lookup(hostname, options, callback) {
          callback(null, pinned.address, pinned.family);
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`Feed request failed (${res.statusCode})`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Feed request timed out'));
    });
    req.on('error', reject);
  });
}

async function fetchWelcomeNewsItems() {
  const feedUrl = (process.env.WELCOME_NEWS_RSS_URL || DEFAULT_FEED_URL).trim();
  const limit = Math.min(Math.max(parseInt(process.env.WELCOME_NEWS_RSS_LIMIT || '4', 10) || 4, 1), 10);
  const now = Date.now();

  if (cache.payload && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const pinned = await assertSafeOutboundUrl(feedUrl);
  const feedHref = pinned.url.toString();
  const xml = await fetchPinnedText(pinned, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': 'VR-Hotspots-Welcome-News/1.0',
    },
  });

  const items = parseRssItems(xml, limit);
  const payload = {
    success: true,
    feedUrl: feedHref,
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
