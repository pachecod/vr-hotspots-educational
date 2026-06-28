const crypto = require('crypto');

const GITHUB_SESSION_COOKIE = 'github_oauth_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** @type {Map<string, { token: string, user: object|null, createdAt: number }>} */
const sessions = new Map();

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

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, entry] of sessions.entries()) {
    if (entry.createdAt < cutoff) sessions.delete(id);
  }
}

function createGitHubSession(token, user) {
  pruneSessions();
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { token, user: user || null, createdAt: Date.now() });
  return id;
}

function getGitHubSession(req) {
  pruneSessions();
  const cookies = parseCookies(req);
  const id = cookies[GITHUB_SESSION_COOKIE];
  if (!id) return null;
  const entry = sessions.get(id);
  if (!entry) return null;
  return { id, ...entry };
}

function clearGitHubSession(req, res) {
  const cookies = parseCookies(req);
  const id = cookies[GITHUB_SESSION_COOKIE];
  if (id) sessions.delete(id);
  res.setHeader(
    'Set-Cookie',
    `${GITHUB_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

function setGitHubSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${GITHUB_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`
  );
}

function getGitHubToken(req) {
  const session = getGitHubSession(req);
  return session ? session.token : null;
}

module.exports = {
  GITHUB_SESSION_COOKIE,
  createGitHubSession,
  getGitHubSession,
  getGitHubToken,
  clearGitHubSession,
  setGitHubSessionCookie,
};
