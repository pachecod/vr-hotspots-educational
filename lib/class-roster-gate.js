const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { createSessionHelpers, parseCookies } = require('./session');
const { query } = require('../services/db-service');

const COOKIE_NAME = 'class_roster_session';
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const sessionSecret =
  process.env.STUDENT_SESSION_SECRET ||
  process.env.CLASS_ROSTER_SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || 'admin123-class-roster').digest('hex');

const rosterSession = createSessionHelpers({
  cookieName: COOKIE_NAME,
  secret: sessionSecret,
  role: 'class_roster',
  maxAgeMs: SESSION_MAX_AGE_MS,
});

async function getClassPasswordHash(classId) {
  const { rows } = await query(`SELECT password_hash FROM classes WHERE id = $1`, [classId]);
  return rows[0]?.password_hash || null;
}

async function isClassPasswordRequired(classId) {
  const { rows } = await query(
    `SELECT require_sign_in_password FROM classes WHERE id = $1`,
    [classId]
  );
  return !!rows[0]?.require_sign_in_password;
}

/** @deprecated Use isClassPasswordRequired */
async function isClassSignInConfigured(classId) {
  return isClassPasswordRequired(classId);
}

async function verifyClassPassword(classId, password) {
  const hash = await getClassPasswordHash(classId);
  if (!hash) return { ok: false, reason: 'not_configured' };
  const match = await bcrypt.compare(String(password || ''), hash);
  return { ok: match, reason: match ? null : 'invalid' };
}

function hasClassRosterAccess(req, classId) {
  const sess = rosterSession.getSessionFromRequest(req, parseCookies);
  if (!sess || sess.role !== 'class_roster') return false;
  return String(sess.classId) === String(classId);
}

function grantClassRosterAccess(res, classId) {
  const token = rosterSession.createToken({ classId: String(classId) });
  rosterSession.setCookie(res, token);
}

function clearClassRosterAccess(res) {
  rosterSession.clearCookie(res);
}

module.exports = {
  COOKIE_NAME,
  getClassPasswordHash,
  isClassPasswordRequired,
  isClassSignInConfigured,
  verifyClassPassword,
  hasClassRosterAccess,
  grantClassRosterAccess,
  clearClassRosterAccess,
  rosterSession,
};
