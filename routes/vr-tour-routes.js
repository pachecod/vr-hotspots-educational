/*
 * Student VR tour hosting for flat-page embeds.
 * Publishes an exported project ZIP to /hosted/vr-<student>-<slug>/ (standalone viewer, not the editor).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { slugify, query, isDbEnabled } = require('../services/db-service');
const { tourUrlToQrUrl } = require('../services/qr-service');
const { requireStudentStrict } = require('../student-auth');
const { parseCookies } = require('../lib/session');
const { isLocalTestUser } = require('../lib/local-test-user');
const { getGuestPreviewTimeoutMs, getGuestPreviewTimeoutSeconds } = require('../lib/app-settings');
const {
  markGuestPreviewExpiry,
  isExpiredGuestPreviewTourUrl,
  deleteGuestPreviewDir,
  hostedPathFromTourUrl,
} = require('../lib/guest-preview-cleanup');
const { uploadHostedDirectory } = require('../lib/hosted-b2-storage');
const { getHostedOrigin, getAppOrigin, buildHostedUrl } = require('../lib/hosted-origin');

const PREVIEW_COOKIE = 'vr_preview_sid';
const PREVIEW_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function getOrSetPreviewSessionId(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies[PREVIEW_COOKIE];
  if (!sid || !/^[a-f0-9]{8,32}$/i.test(sid)) {
    sid = crypto.randomBytes(8).toString('hex');
  }
  res.setHeader(
    'Set-Cookie',
    `${PREVIEW_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PREVIEW_COOKIE_MAX_AGE_SEC}`
  );
  return sid.toLowerCase();
}

async function publishZipToHostedDir({ zipPath, hostedPath, req, assertValidZipFile, extractZipToDirSafe }) {
  assertValidZipFile(zipPath);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-publish-'));
  try {
    await extractZipToDirSafe(zipPath, tempDir);

    const indexPath = path.join(tempDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      const err = new Error('Invalid project ZIP — expected index.html at the root of the package.');
      err.status = 400;
      throw err;
    }

    await uploadHostedDirectory(tempDir, hostedPath);

    const url = buildHostedUrl(hostedPath, 'index.html', req);
    const qrUrl = tourUrlToQrUrl(url);

    return { url, hostedPath, hostedUrl: url, qrUrl };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function isAllowedTourQrUrl(url, req) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (!/\/hosted\/[^/]+\/index\.html$/i.test(parsed.pathname)) return false;
    const allowedOrigins = new Set();
    try {
      allowedOrigins.add(new URL(getHostedOrigin(req)).origin);
    } catch (_) {}
    try {
      const app = getAppOrigin(req);
      if (app) allowedOrigins.add(new URL(app).origin);
    } catch (_) {}
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

function registerVrTourRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe }) {
  /** Dynamic QR image for flat-page preview (avoids stale/corrupt qr.png on disk). */
  app.get('/api/vr-tour/qr', async (req, res) => {
    const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!isAllowedTourQrUrl(url, req)) {
      return res.status(400).json({ success: false, message: 'Invalid tour URL' });
    }
    const hostedPath = hostedPathFromTourUrl(url);
    if (hostedPath && (await isExpiredGuestPreviewTourUrl(url))) {
      await deleteGuestPreviewDir(hostedPath);
      return res.status(404).json({ success: false, message: 'Guest preview expired' });
    }
    try {
      const { renderTourQrBuffer } = require('../services/qr-service');
      const buffer = await renderTourQrBuffer(url);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.send(buffer);
    } catch (err) {
      console.error('VR tour QR render error:', err);
      res.status(500).json({ success: false, message: 'Could not generate QR code' });
    }
  });

  /** Ephemeral preview tour for flat-page editing (guests + students, no sign-in). */
  app.post('/api/vr-tour/preview-publish', upload.single('project'), async (req, res) => {
    const tempPath = req.file?.path;
    try {
      const file = req.file;
      if (!file || !file.path) {
        return res.status(400).json({ success: false, message: 'Missing project ZIP upload' });
      }

      const projectName =
        (typeof req.body?.projectName === 'string' && req.body.projectName.trim()) || 'vr-tour';
      const slug = slugify(projectName) || 'vr-tour';
      const previewSid = getOrSetPreviewSessionId(req, res);
      const hostedPath = `vr-preview-${previewSid}-${slug}`;

      const result = await publishZipToHostedDir({
        zipPath: file.path,
        hostedPath,
        req,
        assertValidZipFile,
        extractZipToDirSafe,
      });

      let expiresAt = null;
      if (isLocalTestUser(req)) {
        const ttlMs = await getGuestPreviewTimeoutMs();
        if (ttlMs != null) {
          expiresAt = Date.now() + ttlMs;
          const timeoutSeconds = await getGuestPreviewTimeoutSeconds();
          await markGuestPreviewExpiry(hostedPath, { expiresAt, timeoutSeconds });
        } else {
          await markGuestPreviewExpiry(hostedPath, {});
        }
      }

      res.json({ success: true, preview: true, expiresAt, ...result });
    } catch (err) {
      console.error('VR tour preview publish error:', err);
      res.status(err.status || 500).json({ success: false, message: err.message || 'Publish failed' });
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  });

  app.post('/api/student/vr-tour/publish', requireStudentStrict, upload.single('project'), async (req, res) => {
    const tempPath = req.file?.path;
    try {
      const file = req.file;
      if (!file || !file.path) {
        return res.status(400).json({ success: false, message: 'Missing project ZIP upload' });
      }

      const projectName =
        (typeof req.body?.projectName === 'string' && req.body.projectName.trim()) || 'vr-tour';
      const slug = slugify(projectName) || 'vr-tour';
      const studentId = req.studentSession.studentId;
      const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
      const hostedPath = `vr-${shortId}-${slug}`;

      const result = await publishZipToHostedDir({
        zipPath: file.path,
        hostedPath,
        req,
        assertValidZipFile,
        extractZipToDirSafe,
      });

      if (isDbEnabled()) {
        await query(
          `INSERT INTO student_published_tours (student_id, slug, hosted_path, hosted_url, qr_url, published_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (student_id, slug)
           DO UPDATE SET hosted_path = EXCLUDED.hosted_path, hosted_url = EXCLUDED.hosted_url,
                         qr_url = EXCLUDED.qr_url, published_at = NOW()`,
          [studentId, slug, hostedPath, result.url, result.qrUrl]
        );
      }

      res.json({ success: true, ...result });
    } catch (err) {
      console.error('VR tour publish error:', err);
      res.status(err.status || 500).json({ success: false, message: err.message || 'Publish failed' });
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  });
}

module.exports = { registerVrTourRoutes };
