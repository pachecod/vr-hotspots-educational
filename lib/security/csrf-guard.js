const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const EXEMPT_PATHS = new Set([
  '/stripe/webhook',
  '/admin/login',
  '/api/student/login',
  // Guest bootstrap — same-origin session start; Safari may omit Origin on bodyless POSTs.
  '/api/local/test-user/start',
  '/api/local/test-user/end',
  '/site-password',
]);

function hostMatchesOrigin(host, origin) {
  if (!host || !origin) return false;
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch (_) {
    return false;
  }
}

function refererMatchesHost(host, referer) {
  if (!host || !referer) return false;
  try {
    const r = new URL(referer);
    return r.host === host;
  } catch (_) {
    return false;
  }
}

function csrfGuard(req, res, next) {
  if (!MUTATING.has(req.method)) return next();

  const path = req.path || req.url || '';
  if (EXEMPT_PATHS.has(path)) return next();
  if (path.startsWith('/stripe/')) return next();

  const host = req.headers.host;
  const origin = req.headers.origin;

  // Do not trust X-Requested-With: any same-origin script can set it (including
  // student pages when HOSTED_ORIGIN is unset). Rely on Origin / Referer only.
  if (hostMatchesOrigin(host, origin)) return next();
  if (refererMatchesHost(host, req.headers.referer)) return next();

  if (process.env.NODE_ENV !== 'production' && !process.env.CSRF_GUARD_STRICT) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'CSRF validation failed' });
}

module.exports = { csrfGuard };
