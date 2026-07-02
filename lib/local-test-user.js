const crypto = require('crypto');
const { createSessionHelpers, parseCookies } = require('./session');
const { isProduction } = require('./security/production-secrets');

const COOKIE_NAME = 'local_test_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sessionSecret =
  process.env.LOCAL_TEST_SESSION_SECRET ||
  process.env.STUDENT_SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || 'admin123-local-test').digest('hex');

const localTestSession = createSessionHelpers({
  cookieName: COOKIE_NAME,
  secret: sessionSecret,
  role: 'local_test',
  maxAgeMs: SESSION_MAX_AGE_MS,
});

function isLocalTestUserModeAvailable() {
  if (process.env.LOCAL_TEST_USER_ENABLED !== 'true') return false;
  if (!isProduction()) return true;
  return process.env.LOCAL_TEST_USER_ALLOW_PRODUCTION === 'true';
}

function getLocalTestSession(req) {
  if (!isLocalTestUserModeAvailable()) return null;
  return localTestSession.getSessionFromRequest(req, parseCookies);
}

function isLocalTestUser(req) {
  return !!getLocalTestSession(req);
}

function startLocalTestUser(res) {
  const token = localTestSession.createToken({ mode: 'local_test' });
  localTestSession.setCookie(res, token);
}

function endLocalTestUser(res) {
  localTestSession.clearCookie(res);
}

const WRITE_ALLOWLIST = new Set([
  '/api/local/test-user/start',
  '/api/local/test-user/end',
  '/api/student/login',
  '/api/student/logout',
  '/api/vr-tour/preview-publish',
]);

function rejectLocalTestUserWrites(req, res, next) {
  if (!isLocalTestUser(req)) return next();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const path = req.path || '';
  if (WRITE_ALLOWLIST.has(path)) return next();

  return res.status(403).json({
    success: false,
    message: 'Test User mode is local-only. Sign in with your team or class account to save or upload.',
  });
}

module.exports = {
  COOKIE_NAME,
  isLocalTestUserModeAvailable,
  getLocalTestSession,
  isLocalTestUser,
  startLocalTestUser,
  endLocalTestUser,
  rejectLocalTestUserWrites,
  parseCookies,
};
