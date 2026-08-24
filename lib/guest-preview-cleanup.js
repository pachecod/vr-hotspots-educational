const {
  uploadHostedUtf8,
  readHostedFileUtf8,
  deleteHostedProject,
  listHostedProjectPaths,
  hostedFileExists,
} = require('./hosted-b2-storage');

const GUEST_PREVIEW_META = '.guest-preview-meta.json';

/** Ephemeral guest-hosted dirs: 360 tours and flat pages. */
const GUEST_PREVIEW_PREFIX = /^(vr-preview-|flat-preview-)/i;

function isGuestPreviewPath(hostedPath) {
  return GUEST_PREVIEW_PREFIX.test(String(hostedPath || ''));
}

async function readGuestPreviewMeta(hostedPath) {
  try {
    const exists = await hostedFileExists(hostedPath, GUEST_PREVIEW_META);
    if (!exists) return null;
    const raw = await readHostedFileUtf8(hostedPath, GUEST_PREVIEW_META);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function markGuestPreviewExpiry(hostedPath, { expiresAt, timeoutSeconds } = {}) {
  const meta = {
    isGuest: true,
    hostedPath,
    timeoutEnabled: expiresAt != null,
    createdAt: Date.now(),
  };
  if (expiresAt != null) {
    meta.expiresAt = expiresAt;
    meta.timeoutSeconds = timeoutSeconds;
  }
  await uploadHostedUtf8(hostedPath, GUEST_PREVIEW_META, JSON.stringify(meta, null, 2));
}

async function isGuestPreviewExpired(hostedPath) {
  if (!isGuestPreviewPath(hostedPath)) return false;
  const meta = await readGuestPreviewMeta(hostedPath);
  if (!meta || meta.expiresAt == null) return false;
  return Date.now() > Number(meta.expiresAt);
}

async function deleteGuestPreviewDir(hostedPath) {
  await deleteHostedProject(hostedPath);
}

async function sweepExpiredGuestPreviews() {
  const paths = await listHostedProjectPaths();
  let deleted = 0;
  for (const hostedPath of paths) {
    if (!isGuestPreviewPath(hostedPath)) continue;
    if (await isGuestPreviewExpired(hostedPath)) {
      await deleteGuestPreviewDir(hostedPath);
      deleted++;
    }
  }
  return deleted;
}

function hostedPathFromRequestPath(reqPath) {
  const match = /^\/hosted\/([^/]+)/i.exec(reqPath || '');
  return match ? match[1] : null;
}

function hostedPathFromTourUrl(tourUrl) {
  if (!tourUrl || typeof tourUrl !== 'string') return null;
  try {
    const parsed = new URL(tourUrl);
    const match = /^\/hosted\/([^/]+)\/index\.html$/i.exec(parsed.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function isExpiredGuestPreviewTourUrl(tourUrl) {
  const hostedPath = hostedPathFromTourUrl(tourUrl);
  if (!hostedPath) return false;
  return isGuestPreviewExpired(hostedPath);
}

function createGuestPreviewExpiryGuard() {
  return async function guestPreviewExpiryGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const hostedPath = hostedPathFromRequestPath(req.path);
    if (!hostedPath || !isGuestPreviewPath(hostedPath)) return next();

    try {
      if (await isGuestPreviewExpired(hostedPath)) {
        await deleteGuestPreviewDir(hostedPath);
        return res.status(404).end();
      }
    } catch (err) {
      console.warn('Guest preview expiry check failed:', err.message);
    }

    return next();
  };
}

module.exports = {
  GUEST_PREVIEW_META,
  markGuestPreviewExpiry,
  readGuestPreviewMeta,
  isGuestPreviewPath,
  isGuestPreviewExpired,
  deleteGuestPreviewDir,
  sweepExpiredGuestPreviews,
  hostedPathFromTourUrl,
  isExpiredGuestPreviewTourUrl,
  createGuestPreviewExpiryGuard,
};
