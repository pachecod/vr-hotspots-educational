const crypto = require('crypto');

function getEncryptionKey() {
  const secret =
    process.env.STUDENT_PASSWORD_ENCRYPTION_SECRET ||
    process.env.STUDENT_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    'vr-hotspots-dev-password-encryption-key';
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
