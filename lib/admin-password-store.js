const crypto = require('crypto');
const { isProduction } = require('./security/production-secrets');

const DEV_FALLBACK_KEY = 'vr-hotspots-dev-password-encryption-key';

function getEncryptionKey() {
  const dedicated = process.env.STUDENT_PASSWORD_ENCRYPTION_SECRET;
  if (isProduction()) {
    if (!dedicated || dedicated === DEV_FALLBACK_KEY) {
      throw new Error(
        'STUDENT_PASSWORD_ENCRYPTION_SECRET must be set to a strong unique value in production'
      );
    }
    return crypto.createHash('sha256').update(dedicated).digest();
  }

  const secret =
    dedicated ||
    process.env.STUDENT_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    DEV_FALLBACK_KEY;
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptAdminPassword(plainPassword) {
  if (!plainPassword) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainPassword), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptAdminPassword(encoded) {
  if (!encoded) return null;
  try {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

module.exports = {
  encryptAdminPassword,
  decryptAdminPassword,
};
