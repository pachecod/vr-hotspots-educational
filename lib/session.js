const crypto = require('crypto');
const { SESSION_BOOT_ID } = require('./session-boot-id');

function createSessionHelpers({ cookieName, secret, role, maxAgeMs = 7 * 24 * 60 * 60 * 1000 }) {
  function signSession(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  function verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (sig.length !== expected.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch (_) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (!payload || payload.role !== role) return null;
      if (payload.boot !== SESSION_BOOT_ID) return null;
      if (!payload.exp || Date.now() > payload.exp) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  function createToken(extra = {}) {
    return signSession({
      role,
      boot: SESSION_BOOT_ID,
      exp: Date.now() + maxAgeMs,
      ...extra,
    });
  }

  function setCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSec = Math.floor(maxAgeMs / 1000);
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`
    );
  }

  function clearCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`
    );
  }

  function getSessionFromRequest(req, parseCookies) {
    const cookies = parseCookies(req);
    return verifySession(cookies[cookieName]);
  }

  return {
    signSession,
    verifySession,
    createToken,
    setCookie,
    clearCookie,
    getSessionFromRequest,
    cookieName,
    maxAgeMs,
  };
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

module.exports = { createSessionHelpers, parseCookies };
