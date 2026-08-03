const { getSetting, setSetting } = require('./app-settings');
const { isDbEnabled } = require('../services/db-service');
const {
  COMMON_ASSET_CATEGORIES,
  COMMON_ASSET_CATEGORY_LABELS,
  FILE_SIZE_LIMITS,
} = require('./common-assets');

const SETTING_KEY = 'upload_size_limits';

const LIMIT_MB_MIN = 1;
const LIMIT_MB_MAX = 2048;

const DEFAULT_LIMITS_MB = {
  images: 10,
  videos: 50,
  '360-images': 50,
  '360-videos': 200,
  audio: 50,
  '3d': 100,
  html: 5,
  other: 25,
  fetchVideo: 500,
  playgroundBundle: 120,
};

let cachedLimits = null;

function mbToBytes(mb) {
  return Math.round(mb * 1024 * 1024);
}

function bytesToMb(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

function defaultLimitsMbFromBytes() {
  const categories = {};
  for (const cat of COMMON_ASSET_CATEGORIES) {
    categories[cat] = bytesToMb(FILE_SIZE_LIMITS[cat]);
  }
  return {
    categories,
    fetchVideo: DEFAULT_LIMITS_MB.fetchVideo,
    playgroundBundle: DEFAULT_LIMITS_MB.playgroundBundle,
  };
}

function clampLimitMb(value, fallbackMb) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallbackMb;
  return Math.min(LIMIT_MB_MAX, Math.max(LIMIT_MB_MIN, Math.round(n)));
}

function buildLimitsFromStored(stored) {
  const defaults = defaultLimitsMbFromBytes();
  const categoriesMb = {};
  const categories = {};

  for (const cat of COMMON_ASSET_CATEGORIES) {
    const fallbackMb = defaults.categories[cat] ?? DEFAULT_LIMITS_MB[cat] ?? 25;
    const mb =
      stored?.categories?.[cat] !== undefined && stored?.categories?.[cat] !== null
        ? clampLimitMb(stored.categories[cat], fallbackMb)
        : fallbackMb;
    categoriesMb[cat] = mb;
    categories[cat] = mbToBytes(mb);
  }

  const fetchVideoMb =
    stored?.fetchVideoMb !== undefined && stored?.fetchVideoMb !== null
      ? clampLimitMb(stored.fetchVideoMb, defaults.fetchVideo)
      : defaults.fetchVideo;
  const playgroundBundleMb =
    stored?.playgroundBundleMb !== undefined && stored?.playgroundBundleMb !== null
      ? clampLimitMb(stored.playgroundBundleMb, defaults.playgroundBundle)
      : defaults.playgroundBundle;

  return {
    categories,
    categoriesMb,
    fetchVideo: mbToBytes(fetchVideoMb),
    fetchVideoMb,
    playgroundBundle: mbToBytes(playgroundBundleMb),
    playgroundBundleMb,
    defaultsMb: defaults,
    categoryLabels: { ...COMMON_ASSET_CATEGORY_LABELS },
    updated_at: stored?.updated_at || null,
    updated_by: stored?.updated_by || null,
  };
}

function getUploadLimitsSync() {
  if (cachedLimits) return cachedLimits;
  return buildLimitsFromStored(null);
}

async function refreshUploadLimitsCache() {
  const stored = isDbEnabled() ? await getSetting(SETTING_KEY, null) : null;
  cachedLimits = buildLimitsFromStored(stored);
  return cachedLimits;
}

async function getUploadLimits() {
  if (cachedLimits) return cachedLimits;
  return refreshUploadLimitsCache();
}

function normalizeAdminPayload(payload) {
  const defaults = defaultLimitsMbFromBytes();
  const categories = {};
  const rawCategories = payload?.categories && typeof payload.categories === 'object' ? payload.categories : {};

  for (const cat of COMMON_ASSET_CATEGORIES) {
    if (rawCategories[cat] === undefined || rawCategories[cat] === null || rawCategories[cat] === '') {
      categories[cat] = defaults.categories[cat];
    } else {
      categories[cat] = clampLimitMb(rawCategories[cat], defaults.categories[cat]);
    }
  }

  return {
    categories,
    fetchVideoMb:
      payload?.fetchVideoMb === undefined || payload?.fetchVideoMb === null || payload?.fetchVideoMb === ''
        ? defaults.fetchVideo
        : clampLimitMb(payload.fetchVideoMb, defaults.fetchVideo),
    playgroundBundleMb:
      payload?.playgroundBundleMb === undefined ||
      payload?.playgroundBundleMb === null ||
      payload?.playgroundBundleMb === ''
        ? defaults.playgroundBundle
        : clampLimitMb(payload.playgroundBundleMb, defaults.playgroundBundle),
  };
}

async function setUploadLimits(payload, updatedBy = 'admin') {
  if (!isDbEnabled()) {
    throw new Error('Database not configured');
  }

  const normalized = normalizeAdminPayload(payload);
  const next = {
    categories: normalized.categories,
    fetchVideoMb: normalized.fetchVideoMb,
    playgroundBundleMb: normalized.playgroundBundleMb,
    updated_by: String(updatedBy || 'admin').trim() || 'admin',
    updated_at: new Date().toISOString(),
  };

  await setSetting(SETTING_KEY, next);
  cachedLimits = buildLimitsFromStored(next);
  return cachedLimits;
}

function getAdminUploadLimitsView(limits = getUploadLimitsSync()) {
  return {
    categoriesMb: limits.categoriesMb,
    fetchVideoMb: limits.fetchVideoMb,
    playgroundBundleMb: limits.playgroundBundleMb,
    defaultsMb: limits.defaultsMb,
    categoryLabels: limits.categoryLabels,
    updated_at: limits.updated_at,
    updated_by: limits.updated_by,
  };
}

module.exports = {
  SETTING_KEY,
  LIMIT_MB_MIN,
  LIMIT_MB_MAX,
  DEFAULT_LIMITS_MB,
  getUploadLimits,
  getUploadLimitsSync,
  refreshUploadLimitsCache,
  setUploadLimits,
  getAdminUploadLimitsView,
  normalizeAdminPayload,
};
