const PLAN_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    personalStorageMbPerStudent: 100,
    submissionsPerMonth: 10,
    hostedProjects: 0,
    maxAssetFilesPerStudent: 50,
  },
  class: {
    name: 'Class',
    price: 9,
    personalStorageMbPooled: 1024,
    submissionsPerMonth: 100,
    hostedProjects: 5,
    maxAssetFilesPerStudent: 500,
  },
  pro: {
    name: 'Pro',
    price: 29,
    personalStorageMbPooled: 10240,
    submissionsPerMonth: -1,
    hostedProjects: 25,
    maxAssetFilesPerStudent: -1,
  },
  enterprise: {
    name: 'Enterprise',
    price: null,
    personalStorageMbPooled: -1,
    submissionsPerMonth: -1,
    hostedProjects: -1,
    maxAssetFilesPerStudent: -1,
  },
};

function getTierLimits(tier) {
  return PLAN_TIERS[tier] || PLAN_TIERS.free;
}

function isUnlimited(value) {
  return value === -1 || value === null;
}

function bytesFromMb(mb) {
  if (isUnlimited(mb)) return -1;
  return mb * 1024 * 1024;
}

module.exports = { PLAN_TIERS, getTierLimits, isUnlimited, bytesFromMb };
