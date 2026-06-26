const { getBlockedExtensions, DEFAULT_BLOCKED_EXTENSIONS } = require('./app-settings');

const ALLOWED_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'json',
  'md',
  'txt',
  'xml',
  'svg',
  'csv',
  'yaml',
  'yml',
]);

function sanitizeFlatFilename(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  return trimmed;
}

function getExtension(filename) {
  const parts = String(filename || '').split('.');
  if (parts.length < 2) return '';
  return parts.pop().toLowerCase();
}

async function assertAllowedFlatFilename(filename) {
  const safe = sanitizeFlatFilename(filename);
  if (!safe) return { ok: false, error: 'Invalid file name' };
  const ext = getExtension(safe);
  if (!ext) return { ok: false, error: 'File must have an extension' };
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported file type: .${ext}` };
  }
  const blocked = await getBlockedExtensions();
  if (blocked.includes(ext)) {
    return { ok: false, error: `File type ".${ext}" is not allowed.` };
  }
  return { ok: true, name: safe, extension: ext };
}

function contentTypeForFilename(filename) {
  const ext = getExtension(filename);
  if (ext === 'html' || ext === 'htm') return 'text/html; charset=utf-8';
  if (ext === 'css') return 'text/css; charset=utf-8';
  if (ext === 'js' || ext === 'mjs') return 'application/javascript; charset=utf-8';
  if (ext === 'json') return 'application/json; charset=utf-8';
  if (ext === 'svg') return 'image/svg+xml';
  return 'text/plain; charset=utf-8';
}

module.exports = {
  ALLOWED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  sanitizeFlatFilename,
  getExtension,
  assertAllowedFlatFilename,
  contentTypeForFilename,
};
