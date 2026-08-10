/**
 * Hosted student pages may run on a separate origin (HOSTED_ORIGIN) so their JS
 * cannot use app-host session cookies. Path shape stays /hosted/<project>/...
 */

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function getAppOrigin(req) {
  if (process.env.SERVER_BASE_URL) return stripTrailingSlash(process.env.SERVER_BASE_URL);
  if (req) {
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
    const host = req.get ? req.get('host') : req.headers?.host;
    if (host) return `${proto}://${host}`;
  }
  return '';
}

/** Public origin for student-hosted pages. Falls back to app origin when unset. */
function getHostedOrigin(req) {
  if (process.env.HOSTED_ORIGIN) return stripTrailingSlash(process.env.HOSTED_ORIGIN);
  return getAppOrigin(req);
}

function hostedOriginHostname() {
  const raw = process.env.HOSTED_ORIGIN;
  if (!raw) return null;
  try {
    return new URL(stripTrailingSlash(raw)).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function requestHost(req) {
  const host = req.get ? req.get('host') : req.headers?.host;
  if (!host) return '';
  return String(host).split(':')[0].toLowerCase();
}

/** True when this request's Host is the dedicated hosted subdomain. */
function isHostedOriginRequest(req) {
  const expected = hostedOriginHostname();
  if (!expected) return false;
  return requestHost(req) === expected;
}

/**
 * Build a URL under /hosted/...
 * @param {string} hostedPathOrRelative - project id, or path starting with /hosted/
 * @param {string} [suffix='index.html'] - ignored if hostedPathOrRelative already has a file path
 * @param {import('express').Request} [req]
 */
function buildHostedUrl(hostedPathOrRelative, suffix = 'index.html', req) {
  const origin = getHostedOrigin(req);
  let pathname;
  const raw = String(hostedPathOrRelative || '').trim();
  if (!raw) {
    pathname = `/hosted/${suffix || 'index.html'}`;
  } else if (raw.startsWith('/hosted/')) {
    pathname = raw;
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      pathname = u.pathname + (u.search || '');
    } catch (_) {
      pathname = `/hosted/${raw.replace(/^\/+/, '')}`;
    }
  } else {
    const id = raw.replace(/^\/+/, '').replace(/\/$/, '');
    const file = suffix ? String(suffix).replace(/^\/+/, '') : 'index.html';
    pathname = `/hosted/${id}/${file}`;
  }
  if (!origin) return pathname;
  return `${origin}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function hostedPathPrefix(urlPath) {
  const p = String(urlPath || '');
  return p === '/hosted' || p.startsWith('/hosted/');
}

/** Paths allowed when Host is the hosted-only origin. */
function isAllowedOnHostedOrigin(req) {
  const p = req.path || req.url || '';
  if (hostedPathPrefix(p)) return true;
  if (p === '/health' || p === '/favicon.ico') return true;
  return false;
}

function createHostedOriginGuard() {
  return function hostedOriginGuard(req, res, next) {
    if (!isHostedOriginRequest(req)) return next();
    if (isAllowedOnHostedOrigin(req)) return next();
    return res.status(404).type('text/plain').send('Not found');
  };
}

module.exports = {
  getAppOrigin,
  getHostedOrigin,
  buildHostedUrl,
  isHostedOriginRequest,
  isAllowedOnHostedOrigin,
  createHostedOriginGuard,
  hostedOriginHostname,
};
