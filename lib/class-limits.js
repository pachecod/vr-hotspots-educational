const { getTierLimits, isUnlimited, bytesFromMb, PLAN_TIERS } = require('./plan-tiers');

const LIMIT_OVERRIDE_KEYS = [
  'submissionsPerMonth',
  'hostedProjects',
  'personalStorageMbPooled',
  'personalStorageMbPerStudent',
  'maxAssetFilesPerStudent',
];

function normalizeLimitValue(value) {
  if (value === 'unlimited' || value === -1 || value === '-1') return -1;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < -1) return null;
  return Math.trunc(n);
}

function sanitizeLimitOverrides(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const key of LIMIT_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const normalized = normalizeLimitValue(input[key]);
    if (normalized === null) {
      out[key] = null;
    } else {
      out[key] = normalized;
    }
  }
  return out;
}

function mergeLimitOverrides(existing, patch) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  const clean = sanitizeLimitOverrides(patch);
  for (const [key, value] of Object.entries(clean)) {
    if (value === null) delete base[key];
    else base[key] = value;
  }
  return base;
}

function resolveClassLimits(planTier, limitOverrides) {
  const base = { ...getTierLimits(planTier || 'free') };
  const overrides =
    limitOverrides && typeof limitOverrides === 'object' && !Array.isArray(limitOverrides)
      ? limitOverrides
      : {};
  for (const key of LIMIT_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const v = normalizeLimitValue(overrides[key]);
    if (v === null) continue;
    base[key] = v;
  }
  return base;
}

function formatLimitLabel(value, suffix = '') {
  if (isUnlimited(value)) return 'Unlimited';
  return `${value}${suffix}`;
}

function getEffectiveStorageLimitMb(limits) {
  if (!limits) return 0;
  if (limits.personalStorageMbPooled != null && !isUnlimited(limits.personalStorageMbPooled)) {
    return limits.personalStorageMbPooled;
  }
  if (isUnlimited(limits.personalStorageMbPooled)) return -1;
  if (limits.personalStorageMbPerStudent != null) {
    return isUnlimited(limits.personalStorageMbPerStudent)
      ? -1
      : limits.personalStorageMbPerStudent;
  }
  return 100;
}

function storageOverrideKeyForTier(planTier) {
  const tier = getTierLimits(planTier || 'free');
  return tier.personalStorageMbPooled != null ? 'personalStorageMbPooled' : 'personalStorageMbPerStudent';
}

function buildStorageOverride(planTier, storageMb) {
  const key = storageOverrideKeyForTier(planTier);
  const otherKey =
    key === 'personalStorageMbPooled' ? 'personalStorageMbPerStudent' : 'personalStorageMbPooled';
  const normalized = normalizeLimitValue(storageMb);
  const patch = {};
  if (normalized === null) {
    patch[key] = null;
    patch[otherKey] = null;
  } else {
    patch[key] = normalized;
    patch[otherKey] = null;
  }
  return patch;
}

module.exports = {
  PLAN_TIERS,
  LIMIT_OVERRIDE_KEYS,
  normalizeLimitValue,
  sanitizeLimitOverrides,
  mergeLimitOverrides,
  resolveClassLimits,
  formatLimitLabel,
  getEffectiveStorageLimitMb,
  storageOverrideKeyForTier,
  buildStorageOverride,
  isUnlimited,
  bytesFromMb,
};
