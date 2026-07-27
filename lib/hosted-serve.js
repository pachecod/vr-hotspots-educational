const path = require('path');
const {
  validateHostedPath,
  normalizeRelativePath,
  downloadHostedStream,
  hostedProjectExists,
  contentTypeForRelativePath,
} = require('./hosted-b2-storage');

function parseHostedRequest(reqPath) {
  const decoded = decodeURIComponent(String(reqPath || '').split('?')[0].split('#')[0]);
  if (!decoded.startsWith('/hosted/')) return null;

  let remainder = decoded.slice('/hosted/'.length);
  if (!remainder) return null;

  const slashIdx = remainder.indexOf('/');
  const hostedPath = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
  if (!validateHostedPath(hostedPath)) return null;

  let relativePath = slashIdx === -1 ? 'index.html' : remainder.slice(slashIdx + 1);
  if (!relativePath) relativePath = 'index.html';
  if (relativePath.endsWith('/')) relativePath += 'index.html';

  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return null;

  return { hostedPath, relativePath: normalized };
}

function resolveHostedHtmlRelativePath(reqPath) {
  const parsed = parseHostedRequest(reqPath);
  if (!parsed) return null;
  if (!/\.html?$/i.test(parsed.relativePath) && !path.extname(parsed.relativePath)) {
    return { ...parsed, relativePath: path.posix.join(parsed.relativePath, 'index.html') };
  }
  if (!/\.html?$/i.test(parsed.relativePath)) return null;
  return parsed;
}

function createHostedStaticHandler() {
  return async function hostedStaticHandler(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const parsed = parseHostedRequest(req.path);
    if (!parsed) return next();

    try {
      const exists = await hostedProjectExists(parsed.hostedPath);
      if (!exists) return res.status(404).end();

      const fileExists =
        parsed.relativePath === 'index.html'
          ? true
          : await require('./hosted-b2-storage').hostedFileExists(
              parsed.hostedPath,
              parsed.relativePath
            );
      if (!fileExists) return res.status(404).end();

      const { stream, statusCode, headers } = await downloadHostedStream(
        parsed.hostedPath,
        parsed.relativePath
      );

      res.status(statusCode || 200);
      res.setHeader('Content-Type', contentTypeForRelativePath(parsed.relativePath));
      const ext = path.extname(parsed.relativePath).toLowerCase();
      if (
        ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.mp3', '.wav', '.ogg', '.mp4', '.webm'].includes(
          ext
        )
      ) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
      if (headers?.['content-length']) {
        res.setHeader('Content-Length', headers['content-length']);
      }
      if (headers?.['content-range']) {
        res.setHeader('Content-Range', headers['content-range']);
      }
      if (headers?.['accept-ranges']) {
        res.setHeader('Accept-Ranges', headers['accept-ranges']);
      }

      if (req.method === 'HEAD') {
        stream.destroy?.();
        return res.end();
      }

      stream.on('error', (err) => {
        console.error('Hosted stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).end();
      console.error('Hosted static error:', err.message);
      return res.status(500).end();
    }
  };
}

module.exports = {
  parseHostedRequest,
  resolveHostedHtmlRelativePath,
  createHostedStaticHandler,
};
