/**
 * Optional configured storage ceilings for the Usage dashboard.
 *
 * Env (either works):
 *   USAGE_B2_MAX_GB=10
 *   USAGE_B2_MAX_BYTES=10737418240
 */

function parsePositiveNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim().replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getB2MaxBytes() {
  const fromBytes = parsePositiveNumber(process.env.USAGE_B2_MAX_BYTES);
  if (fromBytes != null) return Math.floor(fromBytes);

  const fromGb = parsePositiveNumber(process.env.USAGE_B2_MAX_GB);
  if (fromGb != null) return Math.floor(fromGb * 1024 * 1024 * 1024);

  return null;
}

function getStorageLimits() {
  const b2MaxBytes = getB2MaxBytes();
  return {
    b2MaxBytes,
    b2MaxConfigured: b2MaxBytes != null,
  };
}

module.exports = {
  getB2MaxBytes,
  getStorageLimits,
};
