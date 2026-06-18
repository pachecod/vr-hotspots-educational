const path = require('path');

const COMMON_ASSET_CATEGORIES = ['images', 'audio', '3d', 'other'];

const EXTENSION_TO_CATEGORY = {
  jpg: 'images',
  jpeg: 'images',
  png: 'images',
  gif: 'images',
  svg: 'images',
  webp: 'images',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  glb: '3d',
  gltf: '3d',
  obj: '3d',
  fbx: '3d',
  txt: 'other',
  json: 'other',
  xml: 'other',
  csv: 'other',
};

const FILE_SIZE_LIMITS = {
  images: 10 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  '3d': 100 * 1024 * 1024,
  other: 25 * 1024 * 1024,
};

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'text/plain',
  fbx: 'application/octet-stream',
  txt: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  csv: 'text/csv',
};

function getExtension(filename) {
  const parts = (filename || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function getCategoryFromExtension(ext) {
  return EXTENSION_TO_CATEGORY[(ext || '').toLowerCase()] || null;
}

function getCategoryFromFilename(filename) {
  return getCategoryFromExtension(getExtension(filename));
}

function getContentType(filename) {
  const ext = getExtension(filename);
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function isValidCategory(category) {
  return COMMON_ASSET_CATEGORIES.includes(category);
}

function sanitizeFilename(filename) {
  const base = path.basename(filename || 'file');
  const ext = getExtension(base);
  const nameWithoutExt = base.slice(0, base.length - (ext ? ext.length + 1 : 0));
  const safeName = nameWithoutExt
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  const safeExt = ext.replace(/[^a-z0-9]/g, '');
  if (!safeName || !safeExt) return null;
  return `${safeName}_${Date.now()}.${safeExt}`;
}

function buildRemotePath(category, storedFilename) {
  return `common-assets/${category}/${storedFilename}`;
}

function validateCommonAssetFile(originalName, sizeBytes) {
  const ext = getExtension(originalName);
  const category = getCategoryFromExtension(ext);
  if (!category) {
    return { ok: false, message: `Unsupported file type: .${ext || 'unknown'}` };
  }
  const limit = FILE_SIZE_LIMITS[category];
  if (typeof sizeBytes === 'number' && sizeBytes > limit) {
    const limitMb = Math.round(limit / (1024 * 1024));
    return { ok: false, message: `File too large for ${category} (max ${limitMb}MB)` };
  }
  return { ok: true, category, contentType: getContentType(originalName) };
}

function sanitizeAssetFilenameParam(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const base = path.basename(filename);
  if (!base || base.includes('..') || base !== filename.replace(/\\/g, '/').split('/').pop()) {
    return null;
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(base)) return null;
  return base;
}

module.exports = {
  COMMON_ASSET_CATEGORIES,
  EXTENSION_TO_CATEGORY,
  FILE_SIZE_LIMITS,
  getExtension,
  getCategoryFromExtension,
  getCategoryFromFilename,
  getContentType,
  isValidCategory,
  sanitizeFilename,
  buildRemotePath,
  validateCommonAssetFile,
  sanitizeAssetFilenameParam,
};
