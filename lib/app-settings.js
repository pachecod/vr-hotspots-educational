const { query, isDbEnabled } = require('../services/db-service');

const DEFAULT_BLOCKED_EXTENSIONS = ['exe', 'bat', 'sh', 'cmd', 'com', 'heic', 'heif'];

async function getSetting(key, fallback = null) {
  if (!isDbEnabled()) return fallback;
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  if (!rows.length) return fallback;
  return rows[0].value;
}

async function setSetting(key, value) {
  if (!isDbEnabled()) throw new Error('Database not configured');
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

async function getRideyEnabled() {
  const envDefault = process.env.RIDEY_ENABLED === 'true';
  const stored = await getSetting('ridey_enabled', null);
  if (stored === null) return envDefault;
  return stored === true || stored === 'true';
}

async function setRideyEnabled(enabled) {
  await setSetting('ridey_enabled', !!enabled);
}

const RIDEY_VERSIONS = ['1.0', '2.0'];

function normalizeRideyVersion(value) {
  const v = String(value || '1.0').trim();
  return RIDEY_VERSIONS.includes(v) ? v : '1.0';
}

async function getRideyVersion() {
  const stored = await getSetting('ridey_version', null);
  if (stored === null || stored === undefined) {
    return normalizeRideyVersion(process.env.RIDEY_VERSION);
  }
  return normalizeRideyVersion(stored);
}

async function setRideyVersion(version) {
  await setSetting('ridey_version', normalizeRideyVersion(version));
}

async function getBlockedExtensions() {
  const stored = await getSetting('blocked_extensions', null);
  if (Array.isArray(stored) && stored.length) return stored.map((e) => String(e).toLowerCase());
  return [...DEFAULT_BLOCKED_EXTENSIONS];
}

async function setBlockedExtensions(extensions) {
  const normalized = (extensions || [])
    .map((e) => String(e).trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  await setSetting('blocked_extensions', normalized);
}

module.exports = {
  DEFAULT_BLOCKED_EXTENSIONS,
  getSetting,
  setSetting,
  getRideyEnabled,
  setRideyEnabled,
  getRideyVersion,
  setRideyVersion,
  normalizeRideyVersion,
  RIDEY_VERSIONS,
  getBlockedExtensions,
  setBlockedExtensions,
};
