/*
 * Student VR tour hosting for flat-page embeds.
 * Publishes an exported project ZIP to /hosted/vr-<student>-<slug>/ (standalone viewer, not the editor).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { slugify, query, isDbEnabled } = require('../services/db-service');
const { writeTourQrPng, tourUrlToQrUrl } = require('../services/qr-service');
const { requireStudentStrict } = require('../student-auth');
const { parseCookies } = require('../lib/session');

const HOSTED_DIR = path.join(process.cwd(), 'hosted-projects');
const PREVIEW_COOKIE = 'vr_preview_sid';
const PREVIEW_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
}

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

  const targetDir = path.join(HOSTED_DIR, hostedPath);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  await extractZipToDirSafe(zipPath, targetDir);

  const indexPath = path.join(targetDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const err = new Error('Invalid project ZIP — expected index.html at the root of the package.');
    err.status = 400;
    throw err;
  }

  const url = `${getServerBaseUrl(req)}/hosted/${hostedPath}/index.html`;
  await writeTourQrPng(targetDir, url);
  const qrUrl = tourUrlToQrUrl(url);

  return { url, hostedPath, hostedUrl: url, qrUrl };
}

function registerVrTourRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe }) {
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

      res.json({ success: true, preview: true, ...result });
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
