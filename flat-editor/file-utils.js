export const CORE_FILE_IDS = ['index.html', 'style.css', 'script.js'];
export const MAX_FILES_PER_PAGE = 20;

export function inferFileType(filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'mjs') return 'javascript';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'json') return 'json';
  if (ext === 'md') return 'markdown';
  return 'text';
}

export function sanitizeFilename(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  return trimmed;
}

export function getExtension(filename) {
  const parts = String(filename || '').split('.');
  if (parts.length < 2) return '';
  return parts.pop().toLowerCase();
}
