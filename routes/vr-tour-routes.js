/*
 * Student VR tour hosting for flat-page embeds.
 * Publishes an exported project ZIP to /hosted/vr-<student>-<slug>/ (standalone viewer, not the editor).
 */
const path = require('path');
const fs = require('fs');
const { slugify } = require('../services/db-service');
const { writeTourQrPng, tourUrlToQrUrl } = require('../services/qr-service');
const { requireStudentStrict } = require('../student-auth');

const HOSTED_DIR = path.join(process.cwd(), 'hosted-projects');

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function registerVrTourRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe }) {
  app.post('/api/student/vr-tour/publish', requireStudentStrict, upload.single('project'), async (req, res) => {
    const tempPath = req.file?.path;
    try {
      const file = req.file;
      if (!file || !file.path) {
        return res.status(400).json({ success: false, message: 'Missing project ZIP upload' });
      }

      assertValidZipFile(file.path);

      const projectName =
        (typeof req.body?.projectName === 'string' && req.body.projectName.trim()) || 'vr-tour';
      const slug = slugify(projectName) || 'vr-tour';
      const studentId = req.studentSession.studentId;
      const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
      const hostedPath = `vr-${shortId}-${slug}`;
      const targetDir = path.join(HOSTED_DIR, hostedPath);

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      await extractZipToDirSafe(file.path, targetDir);

      const indexPath = path.join(targetDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ZIP — expected index.html at the root of the package.',
        });
      }

      const url = `${getServerBaseUrl(req)}/hosted/${hostedPath}/index.html`;
      await writeTourQrPng(targetDir, url);
      const qrUrl = tourUrlToQrUrl(url);
      res.json({ success: true, url, hostedPath, hostedUrl: url, qrUrl });
    } catch (err) {
      console.error('VR tour publish error:', err);
      res.status(500).json({ success: false, message: err.message || 'Publish failed' });
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
