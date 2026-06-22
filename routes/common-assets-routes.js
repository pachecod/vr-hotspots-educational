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
const {
  buildCommonAssetKey,
  COMMON_SCOPE_PREFIX,
  parseTagsFromBody,
  attachTagsToCommonAssets,
  setTagsForKey,
  deleteTagsForKey,
  listTagsForScope,
  parseTagSortParam,
} = require('../lib/asset-tags');

const COMMON_ASSETS_LIST_CACHE_MS = 2 * 60 * 1000;
let commonAssetsListCache = { data: null, expiresAt: 0 };

function invalidateCommonAssetsListCache() {
  commonAssetsListCache = { data: null, expiresAt: 0 };
  b2Service.invalidateCommonAssetsCaches();
}

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
  const grouped = {};
  for (const category of COMMON_ASSET_CATEGORIES) {
    grouped[category] = [];
  }

  await b2Service.ensureCommonAssetsBucket();
  const prefix = 'common-assets/';
  const allFiles = await b2Service.listCommonAssetFiles(prefix);

  let sharedToken = null;
  if (!b2Service.commonAssetsPublicAccess) {
    sharedToken = await b2Service.getCommonAssetsPrefixAuthorization();
  }

  for (const file of allFiles) {
    const remotePath = file.fileName || '';
    if (!remotePath.startsWith(prefix)) continue;
    const rest = remotePath.slice(prefix.length);
    const parts = rest.split('/');
    if (parts.length !== 2) continue;
    const [category, filename] = parts;
    if (!isValidCategory(category) || !filename) continue;

    const url = b2Service.commonAssetsPublicAccess
      ? b2Service.getCommonAssetPublicUrl(remotePath)
      : b2Service.buildCommonAssetAccessUrl(remotePath, sharedToken);

    grouped[category].push({
      name: filename,
      category,
      size: file.contentLength,
      uploadedAt: new Date(file.uploadTimestamp).toISOString(),
      url,
      contentType: getContentType(filename),
    });
  }

  for (const category of COMMON_ASSET_CATEGORIES) {
    grouped[category].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  await attachTagsToCommonAssets(grouped);
  return grouped;
}

async function getCachedCommonAssets() {
  const now = Date.now();
  if (commonAssetsListCache.data && now < commonAssetsListCache.expiresAt) {
    return commonAssetsListCache.data;
  }
  const data = await listCommonAssets();
  commonAssetsListCache = {
    data,
    expiresAt: now + COMMON_ASSETS_LIST_CACHE_MS,
  };
  return data;
}

function registerCommonAssetRoutes(app, upload) {
  app.post('/admin/login', handleAdminLogin);
  app.post('/admin/logout', handleAdminLogout);
  app.get('/admin/session', handleAdminSessionStatus);

  app.get('/api/common-assets', async (req, res) => {
    try {
      const assets = await getCachedCommonAssets();
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

  app.get('/admin/common-assets/tags', requireAdmin, async (req, res) => {
    try {
      const sort = parseTagSortParam(req.query.sort);
      const tags = await listTagsForScope(COMMON_SCOPE_PREFIX, { sort });
      res.json({ success: true, tags });
    } catch (err) {
      console.error('List common asset tags error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/common-assets', requireAdmin, async (req, res) => {
    try {
      const assets = await getCachedCommonAssets();
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

      const validation = validateCommonAssetFile(
        req.file.originalname,
        req.file.size,
        (req.body && req.body.category) || null
      );
      if (!validation.ok) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      const diskSize = fs.statSync(tempPath).size;
      if (diskSize <= 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty (0 bytes). Choose a valid file and try again.',
        });
      }

      const storedFilename = sanitizeFilename(req.file.originalname);
      if (!storedFilename) {
        return res.status(400).json({ success: false, message: 'Invalid filename' });
      }

      const remotePath = buildRemotePath(validation.category, storedFilename);
      await b2Service.uploadCommonAsset(tempPath, remotePath, validation.contentType);
      invalidateCommonAssetsListCache();

      const tags = parseTagsFromBody(req.body);
      let savedTags = [];
      if (tags.length) {
        savedTags = await setTagsForKey(
          buildCommonAssetKey(validation.category, storedFilename),
          tags
        );
        invalidateCommonAssetsListCache();
      }

      res.json({
        success: true,
        asset: {
          name: storedFilename,
          category: validation.category,
          size: req.file.size,
          uploadedAt: new Date().toISOString(),
          url: await buildPublicAssetUrl(validation.category, storedFilename),
          contentType: validation.contentType,
          tags: savedTags,
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

  app.put('/admin/common-assets/:category/:filename/tags', requireAdmin, async (req, res) => {
    try {
      const category = req.params.category;
      const filename = sanitizeAssetFilenameParam(req.params.filename);
      if (!isValidCategory(category) || !filename) {
        return res.status(400).json({ success: false, message: 'Invalid category or filename' });
      }

      const tags = await setTagsForKey(buildCommonAssetKey(category, filename), req.body && req.body.tags);
      invalidateCommonAssetsListCache();
      res.json({ success: true, tags });
    } catch (err) {
      if (err.statusCode === 503) {
        return res.status(503).json({ success: false, message: err.message });
      }
      console.error('Update common asset tags error:', err);
      res.status(500).json({ success: false, message: err.message });
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
      await deleteTagsForKey(buildCommonAssetKey(category, filename));
      invalidateCommonAssetsListCache();
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
      const contentType = getContentType(filename);
      const rangeHeader = req.headers.range;

      let rangeOption = null;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : null;
          if (end === null || start <= end) {
            rangeOption = end === null ? `bytes=${start}-` : `bytes=${start}-${end}`;
          }
        }
      }

      let stream;
      let statusCode;
      let headers;
      try {
        ({ stream, statusCode, headers } = await b2Service.downloadCommonAssetStream(remotePath, {
          range: rangeOption,
        }));
      } catch (err) {
        const status = err && err.response && err.response.status;
        if (status === 404) {
          return res.status(404).send('Asset not found');
        }
        throw err;
      }

      if (statusCode === 404) {
        return res.status(404).send('Asset not found');
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const contentLength = headers['content-length'];
      const contentRange = headers['content-range'];

      if (statusCode === 206 || contentRange) {
        res.status(206);
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (contentLength) res.setHeader('Content-Length', contentLength);
      } else {
        res.status(200);
        if (contentLength) res.setHeader('Content-Length', contentLength);
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

module.exports = {
  registerCommonAssetRoutes,
  buildPublicAssetUrl,
  buildProxyAssetUrl,
  listCommonAssets,
  invalidateCommonAssetsListCache,
};
