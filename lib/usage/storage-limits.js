/**
 * Optional configured storage / download ceilings for the Usage dashboard.
 *
 * Env (either works per cap):
 *   USAGE_B2_MAX_GB=50
 *   USAGE_B2_MAX_BYTES=...
 *   USAGE_B2_DOWNLOAD_MAX_GB=200
 *   USAGE_B2_DOWNLOAD_MAX_BYTES=...
 *
 * Admin overrides (app_settings) win over env when set:
 *   usage_b2_max_gb
 *   usage_b2_download_max_gb
 */

const { isDbEnabled } = require('../../services/db-service');
const { getSetting, setSetting } = require('../app-settings');

const SETTING_B2_MAX_GB = 'usage_b2_max_gb';
const SETTING_B2_DOWNLOAD_MAX_GB = 'usage_b2_download_max_gb';
const GB = 1024 * 1024 * 1024;

function parsePositiveNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim().replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function gbToBytes(gb) {
  if (gb == null) return null;
  return Math.floor(gb * GB);
}

function bytesFromEnv(bytesKey, gbKey) {
  const fromBytes = parsePositiveNumber(process.env[bytesKey]);
  if (fromBytes != null) return Math.floor(fromBytes);
  const fromGb = parsePositiveNumber(process.env[gbKey]);
  if (fromGb != null) return gbToBytes(fromGb);
  return null;
}

function getB2MaxBytesFromEnv() {
  return bytesFromEnv('USAGE_B2_MAX_BYTES', 'USAGE_B2_MAX_GB');
}

function getB2DownloadMaxBytesFromEnv() {
  return bytesFromEnv('USAGE_B2_DOWNLOAD_MAX_BYTES', 'USAGE_B2_DOWNLOAD_MAX_GB');
}

async function readOverrideGb(key) {
  if (!isDbEnabled()) return null;
  try {
    const stored = await getSetting(key, null);
    return parsePositiveNumber(stored);
  } catch (_) {
    return null;
  }
}

async function getStorageLimits() {
  const overrideStorageGb = await readOverrideGb(SETTING_B2_MAX_GB);
  const overrideDownloadGb = await readOverrideGb(SETTING_B2_DOWNLOAD_MAX_GB);

  const b2MaxBytes =
    overrideStorageGb != null ? gbToBytes(overrideStorageGb) : getB2MaxBytesFromEnv();
  const b2DownloadMaxBytes =
    overrideDownloadGb != null
      ? gbToBytes(overrideDownloadGb)
      : getB2DownloadMaxBytesFromEnv();

  return {
    b2MaxBytes,
    b2MaxConfigured: b2MaxBytes != null,
    b2MaxGb: b2MaxBytes != null ? b2MaxBytes / GB : null,
    b2MaxSource: overrideStorageGb != null ? 'admin' : b2MaxBytes != null ? 'env' : null,
    b2DownloadMaxBytes,
    b2DownloadMaxConfigured: b2DownloadMaxBytes != null,
    b2DownloadMaxGb: b2DownloadMaxBytes != null ? b2DownloadMaxBytes / GB : null,
    b2DownloadMaxSource:
      overrideDownloadGb != null ? 'admin' : b2DownloadMaxBytes != null ? 'env' : null,
    overrides: {
      b2MaxGb: overrideStorageGb,
      b2DownloadMaxGb: overrideDownloadGb,
    },
  };
}

/** Sync helper used by older call sites that cannot await. Prefers env only. */
function getB2MaxBytes() {
  return getB2MaxBytesFromEnv();
}

async function saveStorageLimitOverrides({ b2MaxGb = undefined, b2DownloadMaxGb = undefined } = {}) {
  if (!isDbEnabled()) {
    throw Object.assign(new Error('Database not configured'), { statusCode: 503 });
  }

  if (b2MaxGb !== undefined) {
    if (b2MaxGb === null || b2MaxGb === '') {
      await setSetting(SETTING_B2_MAX_GB, null);
    } else {
      const n = parsePositiveNumber(b2MaxGb);
      if (n == null) throw Object.assign(new Error('Invalid B2 storage max GB'), { statusCode: 400 });
      await setSetting(SETTING_B2_MAX_GB, n);
    }
  }

  if (b2DownloadMaxGb !== undefined) {
    if (b2DownloadMaxGb === null || b2DownloadMaxGb === '') {
      await setSetting(SETTING_B2_DOWNLOAD_MAX_GB, null);
    } else {
      const n = parsePositiveNumber(b2DownloadMaxGb);
      if (n == null) {
        throw Object.assign(new Error('Invalid B2 download max GB'), { statusCode: 400 });
      }
      await setSetting(SETTING_B2_DOWNLOAD_MAX_GB, n);
    }
  }

  return getStorageLimits();
}

module.exports = {
  getB2MaxBytes,
  getB2MaxBytesFromEnv,
  getB2DownloadMaxBytesFromEnv,
  getStorageLimits,
  saveStorageLimitOverrides,
  SETTING_B2_MAX_GB,
  SETTING_B2_DOWNLOAD_MAX_GB,
};
