const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { createSessionHelpers, parseCookies } = require('./lib/session');
const { query, isDbEnabled } = require('./services/db-service');
const {
  isLocalTestUserModeAvailable,
  getLocalTestSession,
  endLocalTestUser,
} = require('./lib/local-test-user');

const STUDENT_AUTH_REQUIRED = process.env.STUDENT_AUTH_REQUIRED === 'true';
const STUDENT_SESSION_SECRET =
  process.env.STUDENT_SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || 'admin123-student').digest('hex');
const COOKIE_NAME = 'student_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const session = createSessionHelpers({
  cookieName: COOKIE_NAME,
  secret: STUDENT_SESSION_SECRET,
  role: 'student',
  maxAgeMs: SESSION_MAX_AGE_MS,
});

const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in a minute.' },
});

function isStudentAuthRequired() {
  return STUDENT_AUTH_REQUIRED && isDbEnabled();
}

function getStudentSession(req) {
  return session.getSessionFromRequest(req, parseCookies);
}

function requireStudent(req, res, next) {
  if (!isStudentAuthRequired()) {
    req.studentSession = null;
    return next();
  }
  const sess = getStudentSession(req);
  if (!sess || !sess.studentId) {
    return res.status(401).json({ success: false, message: 'Team member or student authentication required' });
  }
  req.studentSession = sess;
  return next();
}

function requireStudentStrict(req, res, next) {
  const sess = getStudentSession(req);
  if (!sess || !sess.studentId) {
    return res.status(401).json({ success: false, message: 'Team member or student authentication required' });
  }
  req.studentSession = sess;
  return next();
}

async function verifyStudentPassword(classId, studentId, password) {
  const { rows } = await query(
    `SELECT s.id, s.class_id, s.display_name, s.username, s.password_hash, s.is_active,
            c.name AS class_name, c.slug AS class_slug
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.class_id = $2 AND s.is_active = TRUE`,
    [studentId, classId]
  );
  if (!rows.length) return null;
  const student = rows[0];
  const ok = await bcrypt.compare(password, student.password_hash);
  if (!ok) return null;
  return student;
}

async function handleStudentLogin(req, res) {
  if (!isDbEnabled()) {
    return res.status(503).json({ success: false, message: 'Database not configured' });
  }
  const { classId, studentId, password } = req.body || {};
  if (!classId || !studentId || !password) {
    return res.status(400).json({ success: false, message: 'classId, studentId, and password are required' });
  }
  try {
    const student = await verifyStudentPassword(classId, studentId, password);
    if (!student) {
      return res.status(401).json({ success: false, message: 'Invalid team or class, team member or student, or password' });
    }
    const token = session.createToken({
      studentId: student.id,
      classId: student.class_id,
      displayName: student.display_name,
      username: student.username,
      className: student.class_name,
      classSlug: student.class_slug,
    });
    endLocalTestUser(res);
    session.setCookie(res, token);
    return res.json({
      success: true,
      student: {
        id: student.id,
        displayName: student.display_name,
        username: student.username,
        classId: student.class_id,
        className: student.class_name,
      },
    });
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

function handleStudentLogout(req, res) {
  session.clearCookie(res);
  endLocalTestUser(res);
  return res.json({ success: true });
}

async function handleStudentSessionStatus(req, res) {
  const testUserModeAvailable = isLocalTestUserModeAvailable();
  const localTestSession = testUserModeAvailable ? getLocalTestSession(req) : null;

  const sess = getStudentSession(req);
  if (!sess || !sess.studentId) {
    if (localTestSession) {
      return res.json({
        authenticated: false,
        authRequired: isStudentAuthRequired(),
        testUserModeAvailable,
        localTestUser: true,
        mode: 'local_test',
      });
    }
    return res.json({
      authenticated: false,
      authRequired: isStudentAuthRequired(),
      testUserModeAvailable,
      localTestUser: false,
      mode: testUserModeAvailable ? 'none' : 'anonymous',
    });
  }
  if (!isDbEnabled()) {
    return res.json({ authenticated: true, authRequired: isStudentAuthRequired(), student: sess });
  }
  try {
    const { rows } = await query(
      `SELECT s.id, s.display_name, s.username, s.class_id, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND s.is_active = TRUE`,
      [sess.studentId]
    );
    if (!rows.length) {
      session.clearCookie(res);
      return res.json({
        authenticated: false,
        authRequired: isStudentAuthRequired(),
        testUserModeAvailable,
        localTestUser: !!localTestSession,
        mode: localTestSession ? 'local_test' : 'none',
      });
    }
    const student = rows[0];
    return res.json({
      authenticated: true,
      authRequired: isStudentAuthRequired(),
      testUserModeAvailable,
      localTestUser: false,
      mode: 'student',
      student: {
        id: student.id,
        displayName: student.display_name,
        username: student.username,
        classId: student.class_id,
        className: student.class_name,
      },
    });
  } catch (err) {
    console.error('Student session error:', err);
    return res.json({
      authenticated: false,
      authRequired: isStudentAuthRequired(),
      testUserModeAvailable,
      localTestUser: !!localTestSession,
      mode: localTestSession ? 'local_test' : 'none',
    });
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = {
  COOKIE_NAME,
  loginRateLimiter,
  isStudentAuthRequired,
  getStudentSession,
  requireStudent,
  requireStudentStrict,
  handleStudentLogin,
  handleStudentLogout,
  handleStudentSessionStatus,
  hashPassword,
  parseCookies,
};
