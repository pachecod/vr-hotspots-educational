const { isDbEnabled } = require('../../services/db-service');
const { requireStudentStrict, isStudentAuthRequired } = require('../../student-auth');
const { isProduction } = require('./production-secrets');

function isB2Configured() {
  return !!(
    process.env.B2_KEY_ID &&
    process.env.B2_APP_KEY &&
    process.env.B2_BUCKET_NAME
  );
}

function cloudWritesRequireAuth() {
  if (isProduction()) return true;
  if (isStudentAuthRequired()) return true;
  if (isDbEnabled()) return true;
  if (isB2Configured()) return true;
  return false;
}

function requireAuthForCloudWrites(req, res, next) {
  if (!cloudWritesRequireAuth()) return next();
  return requireStudentStrict(req, res, next);
}

module.exports = {
  cloudWritesRequireAuth,
  requireAuthForCloudWrites,
  isB2Configured,
};
