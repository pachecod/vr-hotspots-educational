const fs = require('fs');
const path = require('path');
const { ensureTourQrPng, tourUrlFromHostedPath, QR_FILENAME } = require('../services/qr-service');

/**
 * Serve /hosted/<path>/qr.png as a valid binary PNG (regenerate if corrupt).
 * Must run before analytics HTML middleware, which must not read PNGs as UTF-8.
 */
function createHostedQrMiddleware({ hostedDir, getServerBaseUrl }) {
  const root = path.resolve(hostedDir);

  return async function hostedQrMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const match = /^\/hosted\/([^/]+)\/qr\.png$/i.exec(req.path || '');
    if (!match) return next();

    const hostedPath = match[1];
    if (!/^[a-zA-Z0-9_-]+$/.test(hostedPath)) {
      return res.status(400).end();
    }

    const targetDir = path.join(root, hostedPath);
    if (!targetDir.startsWith(root + path.sep) && targetDir !== root) {
      return res.status(400).end();
    }

    const indexPath = path.join(targetDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).end();
    }

    const tourUrl = tourUrlFromHostedPath(hostedPath, getServerBaseUrl(req));
    try {
      await ensureTourQrPng(targetDir, tourUrl);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.sendFile(path.join(targetDir, QR_FILENAME));
    } catch (err) {
      console.error('Hosted QR serve error:', err);
      return res.status(500).end();
    }
  };
}

module.exports = { createHostedQrMiddleware };
