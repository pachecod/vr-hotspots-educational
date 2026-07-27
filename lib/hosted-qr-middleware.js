const { renderTourQrBuffer, tourUrlFromHostedPath, QR_FILENAME } = require('../services/qr-service');
const {
  isGuestPreviewExpired,
  deleteGuestPreviewDir,
} = require('./guest-preview-cleanup');
const { hostedProjectExists, validateHostedPath } = require('./hosted-b2-storage');

/**
 * Serve /hosted/<path>/qr.png as a valid binary PNG (regenerate dynamically).
 * Must run before analytics HTML middleware, which must not read PNGs as UTF-8.
 */
function createHostedQrMiddleware({ getServerBaseUrl }) {
  return async function hostedQrMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const match = /^\/hosted\/([^/]+)\/qr\.png$/i.exec(req.path || '');
    if (!match) return next();

    const hostedPath = match[1];
    if (!validateHostedPath(hostedPath)) {
      return res.status(400).end();
    }

    try {
      if (await isGuestPreviewExpired(hostedPath)) {
        await deleteGuestPreviewDir(hostedPath);
        return res.status(404).end();
      }

      const exists = await hostedProjectExists(hostedPath);
      if (!exists) {
        return res.status(404).end();
      }

      const tourUrl = tourUrlFromHostedPath(hostedPath, getServerBaseUrl(req));
      const buffer = await renderTourQrBuffer(tourUrl);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.send(buffer);
    } catch (err) {
      console.error('Hosted QR serve error:', err);
      return res.status(500).end();
    }
  };
}

module.exports = { createHostedQrMiddleware, QR_FILENAME };
