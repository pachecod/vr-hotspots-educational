const fs = require('fs');
const path = require('path');

const GUEST_PREVIEW_META = '.guest-preview-meta.json';
const VR_PREVIEW_PREFIX = /^vr-preview-/i;

function getMetaPath(hostedDir) {
  return path.join(hostedDir, GUEST_PREVIEW_META);
}

function readGuestPreviewMeta(hostedDir) {
  const metaPath = getMetaPath(hostedDir);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function markGuestPreviewMeta(hostedRoot, hostedPath, meta) {
  const targetDir = path.join(hostedRoot, hostedPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(getMetaPath(targetDir), JSON.stringify(meta, null, 2));
}

function markGuestPreviewExpiry(hostedRoot, hostedPath, { expiresAt, timeoutSeconds } = {}) {
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
  markGuestPreviewMeta(hostedRoot, hostedPath, meta);
}

function isGuestPreviewPath(hostedPath) {
  return VR_PREVIEW_PREFIX.test(String(hostedPath || ''));
}

function isGuestPreviewExpired(hostedRoot, hostedPath) {
  if (!isGuestPreviewPath(hostedPath)) return false;
  const meta = readGuestPreviewMeta(path.join(hostedRoot, hostedPath));
  if (!meta || meta.expiresAt == null) return false;
  return Date.now() > Number(meta.expiresAt);
}

function deleteGuestPreviewDir(hostedRoot, hostedPath) {
  const targetDir = path.join(hostedRoot, hostedPath);
  if (!targetDir.startsWith(path.resolve(hostedRoot) + path.sep)) return;
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

function sweepExpiredGuestPreviews(hostedRoot) {
  const root = path.resolve(hostedRoot);
  if (!fs.existsSync(root)) return 0;
  let deleted = 0;
  for (const entry of fs.readdirSync(root)) {
    if (!isGuestPreviewPath(entry)) continue;
    if (isGuestPreviewExpired(root, entry)) {
      deleteGuestPreviewDir(root, entry);
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

function isExpiredGuestPreviewTourUrl(hostedRoot, tourUrl) {
  const hostedPath = hostedPathFromTourUrl(tourUrl);
  if (!hostedPath) return false;
  return isGuestPreviewExpired(hostedRoot, hostedPath);
}

function createGuestPreviewExpiryGuard({ hostedDir }) {
  const root = path.resolve(hostedDir);

  return function guestPreviewExpiryGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const hostedPath = hostedPathFromRequestPath(req.path);
    if (!hostedPath || !isGuestPreviewPath(hostedPath)) return next();

    if (isGuestPreviewExpired(root, hostedPath)) {
      deleteGuestPreviewDir(root, hostedPath);
      return res.status(404).end();
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
