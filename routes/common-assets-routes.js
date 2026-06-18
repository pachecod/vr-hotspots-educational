const fs = require('fs');
const b2Service = require('../services/b2-service');
const {
  COMMON_ASSET_CATEGORIES,
  buildRemotePath,
  getContentType,
  isValidCategory,
  sanitizeFilename,
  sanitizeAssetFilenameParam,
  validateCommonAssetFile,
} = require('../lib/common-assets');
const {
  requireAdmin,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSessionStatus,
} = require('../admin-auth');

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL && typeof process.env.SERVER_BASE_URL === 'string') {
    return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function buildProxyAssetUrl(req, category, filename) {
  return `${getServerBaseUrl(req)}/common-assets/${category}/${encodeURIComponent(filename)}`;
}

async function buildPublicAssetUrl(category, filename) {
  const remotePath = buildRemotePath(category, filename);
  return b2Service.getCommonAssetAccessUrl(remotePath);
}

async function listCommonAssets() {
  await b2Service.syncLegacyCommonAssetsToPublicBucket();
  const grouped = {};
  for (const category of COMMON_ASSET_CATEGORIES) {
    grouped[category] = [];
  }

  for (const category of COMMON_ASSET_CATEGORIES) {
    const prefix = `common-assets/${category}/`;
    const files = await b2Service.listCommonAssetFiles(prefix);
    for (const file of files) {
      const filename = file.fileName.replace(prefix, '');
      if (!filename || filename.includes('/')) continue;
      grouped[category].push({
        name: filename,
        category,
        size: file.contentLength,
        uploadedAt: new Date(file.uploadTimestamp).toISOString(),
        url: await b2Service.getCommonAssetAccessUrl(file.fileName),
        contentType: getContentType(filename),
      });
    }
    grouped[category].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  return grouped;
}

function registerCommonAssetRoutes(app, upload) {
  app.post('/admin/login', handleAdminLogin);
  app.post('/admin/logout', handleAdminLogout);
  app.get('/admin/session', handleAdminSessionStatus);

  app.get('/api/common-assets', async (req, res) => {
    try {
      const assets = await listCommonAssets();
      for (const category of Object.keys(assets)) {
        for (const asset of assets[category]) {
          asset.proxyUrl = buildProxyAssetUrl(req, asset.category, asset.name);
        }
      }
      res.json({ success: true, assets });
    } catch (err) {
      console.error('List common assets error:', err);
      const b2Message = b2Service.formatError(err);
      const hint =
        /bucket/i.test(b2Message) ?
          ' Check B2_BUCKET_ID and B2_BUCKET_NAME in Render Environment (or remove B2_BUCKET_ID to auto-resolve by name).'
        : '';
      res.status(500).json({
        success: false,
        message: (b2Message || err.message || 'Failed to list assets') + hint,
      });
    }
  });

  app.get('/admin/common-assets', requireAdmin, async (req, res) => {
    try {
      const assets = await listCommonAssets();
      for (const category of Object.keys(assets)) {
        for (const asset of assets[category]) {
          asset.proxyUrl = buildProxyAssetUrl(req, asset.category, asset.name);
        }
      }
      res.json({ success: true, assets });
    } catch (err) {
      console.error('Admin list common assets error:', err);
      const b2Message = b2Service.formatError(err);
      const hint =
        /bucket/i.test(b2Message) ?
          ' Check B2_BUCKET_ID and B2_BUCKET_NAME in Render Environment (or remove B2_BUCKET_ID to auto-resolve by name).'
        : '';
      res.status(500).json({
        success: false,
        message: (b2Message || err.message || 'Failed to list assets') + hint,
      });
    }
  });

  app.post('/admin/common-assets/upload', requireAdmin, upload.single('file'), async (req, res) => {
    const tempPath = req.file && req.file.path;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const validation = validateCommonAssetFile(req.file.originalname, req.file.size);
      if (!validation.ok) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      const storedFilename = sanitizeFilename(req.file.originalname);
      if (!storedFilename) {
        return res.status(400).json({ success: false, message: 'Invalid filename' });
      }

      const remotePath = buildRemotePath(validation.category, storedFilename);
      await b2Service.uploadCommonAsset(tempPath, remotePath, validation.contentType);

      res.json({
        success: true,
        asset: {
          name: storedFilename,
          category: validation.category,
          size: req.file.size,
          uploadedAt: new Date().toISOString(),
          url: await buildPublicAssetUrl(validation.category, storedFilename),
          contentType: validation.contentType,
        },
      });
    } catch (err) {
      console.error('Common asset upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  });

  app.delete('/admin/common-assets/:category/:filename', requireAdmin, async (req, res) => {
    try {
      const category = req.params.category;
      const filename = sanitizeAssetFilenameParam(req.params.filename);
      if (!isValidCategory(category) || !filename) {
        return res.status(400).json({ success: false, message: 'Invalid category or filename' });
      }

      const remotePath = buildRemotePath(category, filename);
      await b2Service.deleteCommonAsset(remotePath);
      res.json({ success: true, message: 'Asset deleted' });
    } catch (err) {
      console.error('Common asset delete error:', err);
      res.status(500).json({ success: false, message: err.message || 'Delete failed' });
    }
  });

  app.get('/common-assets/:category/:filename', async (req, res) => {
    try {
      const category = req.params.category;
      const filename = sanitizeAssetFilenameParam(req.params.filename);
      if (!isValidCategory(category) || !filename) {
        return res.status(400).send('Invalid asset path');
      }

      const remotePath = buildRemotePath(category, filename);
      const fileInfo = await b2Service.getCommonAssetFileInfo(remotePath);
      if (!fileInfo) {
        return res.status(404).send('Asset not found');
      }

      const totalSize = fileInfo.contentLength;
      const contentType = getContentType(filename);
      const rangeHeader = req.headers.range;

      let rangeOption = null;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          if (start <= end && end < totalSize) {
            rangeOption = `bytes=${start}-${end}`;
          }
        }
      }

      const { stream, statusCode, headers } = await b2Service.downloadCommonAssetStream(remotePath, {
        range: rangeOption,
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (rangeOption && (statusCode === 206 || headers['content-range'])) {
        const start = parseInt(rangeOption.split('=')[1].split('-')[0], 10);
        const end = parseInt(rangeOption.split('-')[1], 10);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', end - start + 1);
      } else {
        res.status(200);
        res.setHeader('Content-Length', totalSize);
      }

      stream.on('error', (err) => {
        console.error('Asset stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } catch (err) {
      console.error('Common asset proxy error:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to load asset');
      }
    }
  });
}

module.exports = { registerCommonAssetRoutes, buildPublicAssetUrl, buildProxyAssetUrl, listCommonAssets };
