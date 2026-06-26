const path = require('path');
const QRCode = require('qrcode');

const QR_FILENAME = 'qr.png';

/**
 * Write a QR code PNG pointing at the tour URL into the hosted tour directory.
 * @param {string} targetDir - Hosted tour directory (e.g. hosted-projects/vr-abc12345-my-tour)
 * @param {string} url - Absolute URL encoded in the QR code
 * @returns {Promise<string>} Absolute or path-relative qr.png URL derived from tour url
 */
async function writeTourQrPng(targetDir, url) {
  const qrPath = path.join(targetDir, QR_FILENAME);
  await QRCode.toFile(qrPath, url, {
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  return qrPath;
}

function tourUrlToQrUrl(tourUrl) {
  if (!tourUrl) return '';
  return tourUrl.replace(/index\.html(\?.*)?$/i, 'qr.png');
}

module.exports = { writeTourQrPng, tourUrlToQrUrl, QR_FILENAME };
