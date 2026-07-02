const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled } = require('../services/db-service');
const {
  buildRemotePath,
  buildAdminRemotePath,
  ADMIN_ASSETS_PREFIX,
  sanitizeFilename,
  getContentType,
  isValidCategory,
} = require('./common-assets');
const {
  buildAdminAssetKey,
  buildCommonAssetKey,
  getTagsForKeys,
  setTagsForKey,
  deleteTagsForKey,
} = require('./asset-tags');

function parseAssetPath(remotePath) {
  const value = String(remotePath || '');
  const prefixes = [
    { prefix: 'common-assets/', visibility: 'shared' },
    { prefix: ADMIN_ASSETS_PREFIX, visibility: 'admin' },
  ];
  for (const { prefix, visibility } of prefixes) {
    if (!value.startsWith(prefix)) continue;
    const rest = value.slice(prefix.length);
    const parts = rest.split('/');
    if (parts.length !== 2) return null;
    const [category, filename] = parts;
    if (!isValidCategory(category) || !filename) return null;
    return { category, filename, visibility, b2_path: value };
  }
  return null;
}

async function registerSiteAsset({
  b2_path,
  category,
  filename,
  visibility = 'admin',
  source = 'upload',
  size = 0,
  content_type = null,
}) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `INSERT INTO site_assets (b2_path, category, filename, visibility, source, size, content_type, shared_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (b2_path) DO UPDATE
       SET category = EXCLUDED.category,
           filename = EXCLUDED.filename,
           visibility = EXCLUDED.visibility,
           source = EXCLUDED.source,
           size = EXCLUDED.size,
           content_type = EXCLUDED.content_type,
           uploaded_at = NOW(),
           shared_at = CASE
             WHEN EXCLUDED.visibility = 'shared' THEN COALESCE(site_assets.shared_at, NOW())
             ELSE NULL
           END
     RETURNING *`,
    [
      b2_path,
      category,
      filename,
      visibility,
      source,
      size,
      content_type,
      visibility === 'shared' ? new Date().toISOString() : null,
    ]
  );
  return rows[0] || null;
}

async function deleteSiteAssetRecord(b2_path) {
  if (!isDbEnabled()) return;
  await query(`DELETE FROM site_assets WHERE b2_path = $1`, [b2_path]);
}

async function resolveUniqueSharedFilename(category, filename) {
  const base = path.basename(filename);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length) || 'asset';
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const remotePath = buildRemotePath(category, candidate);
    try {
      const info = await b2Service.getCommonAssetFileInfo(remotePath);
      if (!info) return candidate;
    } catch (err) {
      if (err?.response?.status === 404 || /not found/i.test(err.message || '')) {
        return candidate;
      }
      throw err;
    }
    attempt += 1;
    candidate = `${stem}_${Date.now()}_${attempt}${ext}`;
  }
  return sanitizeFilename(base) || `${stem}_${Date.now()}${ext || '.bin'}`;
}

async function copyCommonAssetObject(sourcePath, destPath, contentType) {
  const tmp = path.join(os.tmpdir(), `site-asset-copy-${Date.now()}${path.extname(destPath) || ''}`);
  try {
    const { stream } = await b2Service.downloadCommonAssetStream(sourcePath);
    await pipeline(stream, fs.createWriteStream(tmp));
    await b2Service.uploadCommonAsset(tmp, destPath, contentType || 'application/octet-stream');
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

async function resolveUniqueAdminFilename(category, filename) {
  const base = path.basename(filename);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length) || 'asset';
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const remotePath = buildAdminRemotePath(category, candidate);
    try {
      const info = await b2Service.getCommonAssetFileInfo(remotePath);
      if (!info) return candidate;
    } catch (err) {
      if (err?.response?.status === 404 || /not found/i.test(err.message || '')) {
        return candidate;
      }
      throw err;
    }
    attempt += 1;
    candidate = `${stem}_${Date.now()}_${attempt}${ext}`;
  }
  return sanitizeFilename(base) || `${stem}_${Date.now()}${ext || '.bin'}`;
}

async function demoteSharedAssetToAdmin(category, filename) {
  if (!isValidCategory(category) || !filename) {
    throw new Error('Invalid category or filename');
  }
  const sharedPath = buildRemotePath(category, filename);
  const contentType = getContentType(filename);
  const adminFilename = await resolveUniqueAdminFilename(category, filename);
  const adminPath = buildAdminRemotePath(category, adminFilename);

  await copyCommonAssetObject(sharedPath, adminPath, contentType);
  await b2Service.deleteCommonAsset(sharedPath);

  const commonKey = buildCommonAssetKey(category, filename);
  const adminKey = buildAdminAssetKey(category, adminFilename);
  const tagMap = await getTagsForKeys([commonKey]);
  const tags = tagMap.get(commonKey) || [];
  if (tags.length) {
    await setTagsForKey(adminKey, tags);
    await deleteTagsForKey(commonKey);
  }

  await deleteSiteAssetRecord(sharedPath);
  await registerSiteAsset({
    b2_path: adminPath,
    category,
    filename: adminFilename,
    visibility: 'admin',
    source: 'upload',
    content_type: contentType,
  });

  return {
    category,
    filename: adminFilename,
    b2_path: adminPath,
    previewUrl: `/admin/admin-assets/${encodeURIComponent(category)}/${encodeURIComponent(adminFilename)}`,
  };
}

async function promoteAdminAssetToShared(category, filename) {
  if (!isValidCategory(category) || !filename) {
    throw new Error('Invalid category or filename');
  }
  const adminPath = buildAdminRemotePath(category, filename);
  const contentType = getContentType(filename);
  const sharedFilename = await resolveUniqueSharedFilename(category, filename);
  const sharedPath = buildRemotePath(category, sharedFilename);

  await copyCommonAssetObject(adminPath, sharedPath, contentType);
  await b2Service.deleteCommonAsset(adminPath);

  const adminKey = buildAdminAssetKey(category, filename);
  const commonKey = buildCommonAssetKey(category, sharedFilename);
  const tagMap = await getTagsForKeys([adminKey]);
  const tags = tagMap.get(adminKey) || [];
  if (tags.length) {
    await setTagsForKey(commonKey, tags);
    await deleteTagsForKey(adminKey);
  }

  await deleteSiteAssetRecord(adminPath);
  await registerSiteAsset({
    b2_path: sharedPath,
    category,
    filename: sharedFilename,
    visibility: 'shared',
    source: 'promoted',
    content_type: contentType,
  });

  return {
    category,
    filename: sharedFilename,
    b2_path: sharedPath,
    url: b2Service.getCommonAssetAccessUrl(sharedPath),
  };
}

async function listAdminAssetFilesFromB2() {
  await b2Service.ensureCommonAssetsBucket();
  const prefix = ADMIN_ASSETS_PREFIX;
  const allFiles = await b2Service.listCommonAssetFiles(prefix);
  const grouped = {};
  for (const file of allFiles) {
    const remotePath = file.fileName || '';
    const parsed = parseAssetPath(remotePath);
    if (!parsed || parsed.visibility !== 'admin') continue;
    if (!grouped[parsed.category]) grouped[parsed.category] = [];
    grouped[parsed.category].push({
      name: parsed.filename,
      category: parsed.category,
      size: file.contentLength,
      uploadedAt: new Date(file.uploadTimestamp).toISOString(),
      b2_path: remotePath,
      contentType: getContentType(parsed.filename),
    });
  }
  return grouped;
}

module.exports = {
  ADMIN_ASSETS_PREFIX,
  parseAssetPath,
  registerSiteAsset,
  deleteSiteAssetRecord,
  promoteAdminAssetToShared,
  demoteSharedAssetToAdmin,
  listAdminAssetFilesFromB2,
  copyCommonAssetObject,
};
