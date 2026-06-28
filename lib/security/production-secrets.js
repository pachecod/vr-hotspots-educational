const crypto = require('crypto');

const WEAK_ADMIN_PASSWORDS = new Set(['admin123', 'password', 'changeme']);
const WEAK_SECRETS = new Set([
  'admin123-student',
  'vr-hotspots-dev-password-encryption-key',
]);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hashDefault(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertProductionSecrets() {
  if (!isProduction()) return;

  const errors = [];
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!process.env.ADMIN_PASSWORD || WEAK_ADMIN_PASSWORDS.has(adminPassword)) {
    errors.push('ADMIN_PASSWORD must be set to a strong value in production');
  }

  const adminSecret = process.env.ADMIN_SESSION_SECRET || hashDefault(adminPassword);
  if (!process.env.ADMIN_SESSION_SECRET || adminSecret === hashDefault('admin123')) {
    errors.push('ADMIN_SESSION_SECRET must be set to a unique random value in production');
  }

  const studentSecret =
    process.env.STUDENT_SESSION_SECRET || hashDefault(process.env.ADMIN_PASSWORD || 'admin123-student');
  if (!process.env.STUDENT_SESSION_SECRET || WEAK_SECRETS.has(process.env.STUDENT_SESSION_SECRET || '')) {
    errors.push('STUDENT_SESSION_SECRET must be set to a unique random value in production');
  }

  if (process.env.B2_KEY_ID && !process.env.B2_APP_KEY) {
    errors.push('B2_APP_KEY must be set when B2_KEY_ID is configured');
  }

  if (errors.length) {
    console.error('❌ Production security configuration errors:');
    errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }
}

module.exports = { assertProductionSecrets, isProduction };
