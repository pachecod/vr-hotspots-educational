const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { SESSION_BOOT_ID } = require('./lib/session-boot-id');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');
const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many admin login attempts. Try again in a minute.' },
});

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin') return null;
    if (payload.boot !== SESSION_BOOT_ID) return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function createAdminSessionToken() {
  return signSession({
    role: 'admin',
    boot: SESSION_BOOT_ID,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAgeSec = Math.floor(SESSION_MAX_AGE_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const session = verifySession(cookies[COOKIE_NAME]);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  req.adminSession = session;
  return next();
}

function handleAdminLogin(req, res) {
  const password = req.body && req.body.password;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin password' });
  }
  const token = createAdminSessionToken();
  setSessionCookie(res, token);
  return res.json({ success: true });
}

function handleAdminLogout(req, res) {
  clearSessionCookie(res);
  return res.json({ success: true });
}

function handleAdminSessionStatus(req, res) {
  const cookies = parseCookies(req);
  const session = verifySession(cookies[COOKIE_NAME]);
  return res.json({ authenticated: !!session });
}

module.exports = {
  requireAdmin,
  loginRateLimiter,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSessionStatus,
  COOKIE_NAME,
  verifySession,
  parseCookies,
};
