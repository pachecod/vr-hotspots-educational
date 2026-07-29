const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const QR_FILENAME = 'qr.png';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isValidPngFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return buf.equals(PNG_MAGIC);
  } catch {
    return false;
  }
}

async function renderTourQrBuffer(url) {
  return QRCode.toBuffer(url, {
    type: 'png',
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Write a QR code PNG pointing at the tour URL into the hosted tour directory.
 * @param {string} targetDir - Hosted tour directory (e.g. hosted-projects/vr-abc12345-my-tour)
 * @param {string} url - Absolute URL encoded in the QR code
 * @returns {Promise<string>} Path to qr.png on disk
 */
async function writeTourQrPng(targetDir, url) {
  const qrPath = path.join(targetDir, QR_FILENAME);
  const buffer = await renderTourQrBuffer(url);
  await fs.promises.writeFile(qrPath, buffer);
  return qrPath;
}

/** Regenerate qr.png when missing or corrupted (e.g. after a UTF-8 round-trip). */
async function ensureTourQrPng(targetDir, url) {
  const qrPath = path.join(targetDir, QR_FILENAME);
  if (isValidPngFile(qrPath)) return qrPath;
  return writeTourQrPng(targetDir, url);
}

function tourUrlToQrUrl(tourUrl) {
  if (!tourUrl) return '';
  return tourUrl.replace(/index\.html(\?.*)?$/i, 'qr.png');
}

function tourUrlFromHostedPath(hostedPath, baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return `${base}/hosted/${hostedPath}/index.html`;
}

module.exports = {
  writeTourQrPng,
  ensureTourQrPng,
  renderTourQrBuffer,
  isValidPngFile,
  tourUrlToQrUrl,
  tourUrlFromHostedPath,
  QR_FILENAME,
  PNG_MAGIC,
};
