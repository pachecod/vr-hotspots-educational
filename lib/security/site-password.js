const { escapeHtml } = require('../escape-html');
/**
 * Optional site-wide password gate.
 *
 * When SITE_PASSWORD is unset or empty, all helpers are no-ops and the app
 * behaves as if this module did not exist.
 *
 * When set, requests need a signed cookie issued after a successful
 * POST /site-password. Render health checks must use GET /health (exempt).
 */

const crypto = require('crypto');
const express = require('express');
const { createSessionHelpers, parseCookies } = require('../session');
const { getAnalyticsSnippetForRequest } = require('../analytics-html-inject');
const { sanitizeReturnTo } = require('./safe-redirect');

const COOKIE_NAME = 'site_access';
const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function getSitePassword() {
  const raw = process.env.SITE_PASSWORD;
  if (raw == null) return '';
  const trimmed = String(raw).trim();
  return trimmed;
}

function isSitePasswordEnabled() {
  return getSitePassword().length > 0;
}

function getSitePasswordSecret() {
  return (
    process.env.SITE_PASSWORD_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.STUDENT_SESSION_SECRET ||
    'site-password-dev-fallback'
  );
}

let _helpers = null;
function getHelpers() {
  if (_helpers) return _helpers;
  _helpers = createSessionHelpers({
    cookieName: COOKIE_NAME,
    secret: getSitePasswordSecret(),
    role: 'site',
    maxAgeMs: REMEMBER_MAX_AGE_MS,
    persistAcrossRestarts: true,
  });
  return _helpers;
}

function parseRememberChoice(value) {
  if (value === true) return true;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'on' || raw === 'true' || raw === 'yes';
}

function issueSiteAccessCookie(res, remember) {
  const helpers = getHelpers();
  if (remember) {
    const token = helpers.createToken({}, { maxAgeMs: REMEMBER_MAX_AGE_MS });
    helpers.setCookie(res, token, { maxAgeMs: REMEMBER_MAX_AGE_MS });
    return;
  }
  const token = helpers.createToken({}, { maxAgeMs: SESSION_MAX_AGE_MS });
  helpers.setCookie(res, token, { sessionOnly: true, maxAgeMs: SESSION_MAX_AGE_MS });
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // Still run a compare to reduce length-oracle noise for short secrets
    const padded = Buffer.alloc(bufA.length);
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function hasValidSiteAccess(req) {
  if (!isSitePasswordEnabled()) return true;
  const helpers = getHelpers();
  const payload = helpers.getSessionFromRequest(req, parseCookies);
  return !!(payload && payload.role === 'site');
}

function isExemptPath(req) {
  const p = req.path || '';
  if (p === '/health' || p === '/healthz') return true;
  if (p === '/site-password') return true;
  if (p.startsWith('/stripe/')) return true;
  if (p.startsWith('/api/stripe/')) return true;
  // Public hosted tours (admin Host, student publish) must load without the site gate.
  if (p.startsWith('/hosted/')) return true;
  return false;
}


function renderGatePage({
  returnTo = '/',
  error = '',
  analyticsSnippet = '',
  rememberChecked = true,
} = {}) {
  const errBlock = error
    ? `<p style="color:#f87171;margin:0 0 16px;font-size:14px;">${escapeHtml(error)}</p>`
    : '';
  const rememberAttr = rememberChecked ? ' checked' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${analyticsSnippet}
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site access</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(1200px 600px at 20% 0%, #1e3a5f 0%, #0b1220 55%, #070b14 100%);
      color: #e8eef7;
    }
    .card {
      width: min(420px, 92vw); background: rgba(18, 28, 44, 0.92);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
      padding: 28px 24px 22px; box-shadow: 0 20px 50px rgba(0,0,0,0.45);
    }
    h1 { margin: 0 0 8px; font-size: 1.35rem; font-weight: 650; }
    p.sub { margin: 0 0 20px; color: #9fb0c7; font-size: 0.95rem; line-height: 1.4; }
    label { display: block; margin-bottom: 8px; font-size: 0.85rem; color: #b7c5d8; }
    input[type="password"] {
      width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid #334155;
      background: #0f172a; color: #f8fafc; font-size: 1rem; outline: none;
    }
    input[type="password"]:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96,165,250,0.25); }
    .remember-row {
      display: flex; align-items: center; gap: 10px; margin-top: 14px;
      font-size: 0.9rem; color: #b7c5d8; cursor: pointer; user-select: none;
    }
    .remember-row input[type="checkbox"] {
      width: 16px; height: 16px; margin: 0; accent-color: #60a5fa; cursor: pointer;
    }
    button {
      margin-top: 14px; width: 100%; padding: 12px 14px; border: none; border-radius: 8px;
      background: #2563eb; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>This site is private</h1>
    <p class="sub">Enter the site password to continue. This is separate from team or admin login.</p>
    ${errBlock}
    <form method="POST" action="/site-password">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
      <label for="password">Site password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      <label class="remember-row" for="remember">
        <input id="remember" name="remember" type="checkbox" value="1"${rememberAttr} />
        <span>Remember me on this device</span>
      </label>
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`;
}

async function sendGatePage(req, res, { status = 401, error = '' } = {}) {
  const returnTo = sanitizeReturnTo(req.originalUrl || '/', `${req.protocol}://${req.get('host')}`);
  let analyticsSnippet = '';
  try {
    analyticsSnippet = await getAnalyticsSnippetForRequest(req);
  } catch (err) {
    console.error('Analytics gate injection error:', err);
  }
  res.status(status).type('html').send(renderGatePage({ returnTo, error, analyticsSnippet }));
}

function createSitePasswordMiddleware() {
  return function sitePasswordMiddleware(req, res, next) {
    if (!isSitePasswordEnabled()) return next();
    if (isExemptPath(req)) return next();
    if (hasValidSiteAccess(req)) return next();

    if (req.method === 'GET' || req.method === 'HEAD') {
      return sendGatePage(req, res, { status: 401 });
    }
    return res.status(401).json({
      success: false,
      message: 'Site password required',
      loginPath: '/site-password',
    });
  };
}

function registerSitePasswordRoutes(app) {
  app.get('/health', (req, res) => {
    res.status(200).type('text').send('ok');
  });
  app.get('/healthz', (req, res) => {
    res.status(200).type('text').send('ok');
  });

  if (!isSitePasswordEnabled()) {
    console.log('ℹ️  SITE_PASSWORD not set — site-wide password gate disabled');
    return;
  }

  console.log('🔒 SITE_PASSWORD is set — site-wide password gate enabled');

  app.get('/site-password', async (req, res) => {
    if (hasValidSiteAccess(req)) {
      const returnTo = sanitizeReturnTo(req.query.returnTo, `${req.protocol}://${req.get('host')}`);
      return res.redirect(returnTo || '/');
    }
    const returnTo = sanitizeReturnTo(req.query.returnTo, `${req.protocol}://${req.get('host')}`);
    let analyticsSnippet = '';
    try {
      analyticsSnippet = await getAnalyticsSnippetForRequest(req);
    } catch (err) {
      console.error('Analytics gate injection error:', err);
    }
    res.status(200).type('html').send(renderGatePage({ returnTo, analyticsSnippet }));
  });

  // Parse form bodies here so this works before the app-wide JSON parser.
  const parseForm = express.urlencoded({ extended: false, limit: '32kb' });
  app.post('/site-password', parseForm, async (req, res) => {
    const body = req.body || {};
    const submitted = typeof body.password === 'string' ? body.password : '';
    const returnTo = sanitizeReturnTo(body.returnTo, `${req.protocol}://${req.get('host')}`);
    const remember = parseRememberChoice(body.remember);

    if (!timingSafeEqualString(submitted, getSitePassword())) {
      let analyticsSnippet = '';
      try {
        analyticsSnippet = await getAnalyticsSnippetForRequest(req);
      } catch (err) {
        console.error('Analytics gate injection error:', err);
      }
      return res
        .status(401)
        .type('html')
        .send(
          renderGatePage({
            returnTo,
            error: 'Incorrect password. Try again.',
            analyticsSnippet,
            rememberChecked: remember,
          })
        );
    }

    issueSiteAccessCookie(res, remember);
    return res.redirect(returnTo || '/');
  });
}

module.exports = {
  isSitePasswordEnabled,
  createSitePasswordMiddleware,
  registerSitePasswordRoutes,
  COOKIE_NAME,
};
