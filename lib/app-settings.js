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

const GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT = 1200;
const GUEST_PREVIEW_TIMEOUT_SECONDS_MIN = 30;
const GUEST_PREVIEW_TIMEOUT_SECONDS_MAX = 3600;

function parseEnvBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function clampGuestPreviewTimeoutSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT;
  return Math.min(
    GUEST_PREVIEW_TIMEOUT_SECONDS_MAX,
    Math.max(GUEST_PREVIEW_TIMEOUT_SECONDS_MIN, Math.round(n))
  );
}

async function getGuestPreviewTimeoutEnabled() {
  const envDefault = parseEnvBoolean(process.env.GUEST_PREVIEW_TIMEOUT_ENABLED, true);
  const stored = await getSetting('guest_preview_timeout_enabled', null);
  if (stored === null) return envDefault;
  return stored === true || stored === 'true';
}

async function getGuestPreviewTimeoutSeconds() {
  const envRaw = process.env.GUEST_PREVIEW_TIMEOUT_SECONDS;
  const envDefault =
    envRaw !== undefined && envRaw !== ''
      ? clampGuestPreviewTimeoutSeconds(envRaw)
      : GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT;
  const stored = await getSetting('guest_preview_timeout_seconds', null);
  if (stored === null || stored === undefined) return envDefault;
  return clampGuestPreviewTimeoutSeconds(stored);
}

async function getGuestPreviewTimeoutMs() {
  const enabled = await getGuestPreviewTimeoutEnabled();
  if (!enabled) return null;
  const seconds = await getGuestPreviewTimeoutSeconds();
  return seconds * 1000;
}

async function setGuestPreviewTimeout({ enabled, seconds }) {
  await setSetting('guest_preview_timeout_enabled', !!enabled);
  if (seconds !== undefined) {
    await setSetting(
      'guest_preview_timeout_seconds',
      clampGuestPreviewTimeoutSeconds(seconds)
    );
  }
}

module.exports = {
  DEFAULT_BLOCKED_EXTENSIONS,
  GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT,
  GUEST_PREVIEW_TIMEOUT_SECONDS_MIN,
  GUEST_PREVIEW_TIMEOUT_SECONDS_MAX,
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
  getGuestPreviewTimeoutEnabled,
  getGuestPreviewTimeoutSeconds,
  getGuestPreviewTimeoutMs,
  setGuestPreviewTimeout,
  clampGuestPreviewTimeoutSeconds,
};
