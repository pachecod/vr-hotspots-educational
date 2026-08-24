/*
 * Flat Web Page routes — Render Postgres + Backblaze B2 storage for WebXRIDE-style
 * HTML/CSS/JS pages. This replaces the Supabase-backed persistence used by the
 * reference WebXRIDE app with the same backend stack the rest of this tool uses.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled, slugify } = require('../services/db-service');
const { requireStudentStrict } = require('../student-auth');
const { assertAllowedFlatFilename, contentTypeForFilename } = require('../lib/flat-page-files');
const { parseCookies } = require('../lib/session');
const { isLocalTestUser } = require('../lib/local-test-user');
const { getGuestPreviewTimeoutMs, getGuestPreviewTimeoutSeconds } = require('../lib/app-settings');
const { markGuestPreviewExpiry } = require('../lib/guest-preview-cleanup');
const { tourUrlToQrUrl } = require('../services/qr-service');

const {
  deleteFlatPageB2Files,
  studentHostedPrefix,
  removeHostedFlatPageDir,
} = require('../lib/student-content/flat-page-purge');
const { uploadHostedUtf8, getHostedDir } = require('../lib/hosted-b2-storage');
const { logAppError } = require('../lib/error-log');
const { buildHostedUrl } = require('../lib/hosted-origin');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
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

async function getStudentContext(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.class_id, c.slug AS class_slug
     FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.is_active = TRUE`,
    [studentId]
  );
  return rows[0] || null;
}

async function resolveClassSlug(studentId, session) {
  const ctx = await getStudentContext(studentId);
  if (ctx?.class_slug) return ctx.class_slug;
  if (session?.classSlug && typeof session.classSlug === 'string') {
    return session.classSlug;
  }
  return 'local';
}

async function uploadFlatPageFilesToB2(prefix, files) {
  if (!process.env.B2_KEY_ID) return;
  for (const file of files) {
    try {
      await b2Service.uploadBuffer(
        Buffer.from(file.content, 'utf8'),
        `${prefix}${file.name}`,
        contentTypeForFilename(file.name)
      );
    } catch (err) {
      console.warn('Flat page B2 upload failed:', err.message);
      logAppError({
        level: 'error',
        code: 'flat_page_b2_upload_failed',
        message: err.message || 'Flat page B2 upload failed',
        source: 'flat-page-b2',
        details: { prefix, fileName: file && file.name },
      });
    }
  }
}

async function upsertFlatPageRecord({
  studentId,
  classSlug,
  name,
  slug,
  files,
  hostedPath = null,
  hostedUrl = null,
  isHosted = false,
}) {
  if (!isDbEnabled()) {
    throw new Error('Database not configured');
  }
  const prefix = buildPrefix(classSlug, studentId, slug);
  const manifest = files.map((f) => ({ name: f.name }));
  if (isHosted && hostedPath && hostedUrl) {
    await query(
      `INSERT INTO flat_page_projects
        (student_id, name, slug, b2_prefix, files_manifest, hosted_path, hosted_url, hosted_at, is_hosted, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), TRUE, NOW())
       ON CONFLICT (student_id, slug)
       DO UPDATE SET name = EXCLUDED.name, b2_prefix = EXCLUDED.b2_prefix,
                     files_manifest = EXCLUDED.files_manifest, hosted_path = EXCLUDED.hosted_path,
                     hosted_url = EXCLUDED.hosted_url, hosted_at = NOW(), is_hosted = TRUE, updated_at = NOW()`,
      [studentId, name, slug, prefix, JSON.stringify(manifest), hostedPath, hostedUrl]
    );
  } else {
    await query(
      `INSERT INTO flat_page_projects (student_id, name, slug, b2_prefix, files_manifest, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (student_id, slug)
       DO UPDATE SET name = EXCLUDED.name, b2_prefix = EXCLUDED.b2_prefix,
                     files_manifest = EXCLUDED.files_manifest, updated_at = NOW()`,
      [studentId, name, slug, prefix, JSON.stringify(manifest)]
    );
  }
}

function buildPrefix(classSlug, studentId, slug) {
  return `student-pages/${classSlug}/${studentId}/${slug}/`;
}

// Re-export for student-hosted prefix used below

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Hosted flat pages on disk/B2 (covers publishes even when DB upsert lagged or failed). */
function listHostedFlatPagesFromDisk(studentId, req) {
  const hostedDir = getHostedDir();
  if (!fs.existsSync(hostedDir)) return [];
  const dirPrefix = studentHostedPrefix(studentId);
  const pages = [];
  for (const entry of fs.readdirSync(hostedDir)) {
    if (!entry.startsWith(dirPrefix)) continue;
    const slug = entry.slice(dirPrefix.length);
    if (!slug) continue;
    const indexPath = path.join(hostedDir, entry, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    let updatedAt = new Date().toISOString();
    try {
      updatedAt = fs.statSync(indexPath).mtime.toISOString();
    } catch (_) {}
    pages.push({
      slug,
      name: humanizeSlug(slug),
      files: [{ name: 'index.html' }],
      hostedUrl: buildHostedUrl(entry, 'index.html', req),
      isHosted: true,
      updatedAt,
      hostedPath: entry,
    });
  }
  return pages;
}

function mergeFlatPageLists(dbPages, diskPages) {
  const bySlug = new Map();
  for (const page of dbPages || []) {
    if (page?.slug) bySlug.set(page.slug, page);
  }
  for (const page of diskPages || []) {
    if (!page?.slug) continue;
    const existing = bySlug.get(page.slug);
    if (!existing) {
      bySlug.set(page.slug, page);
      continue;
    }
    bySlug.set(page.slug, {
      ...existing,
      hostedUrl: existing.hostedUrl || page.hostedUrl,
      hostedPath: existing.hostedPath || page.hostedPath,
      isHosted: Boolean(existing.isHosted || page.isHosted),
      updatedAt:
        new Date(page.updatedAt || 0) > new Date(existing.updatedAt || 0)
          ? page.updatedAt
          : existing.updatedAt,
    });
  }
  return [...bySlug.values()].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
}

// Validate + normalize an incoming { name, files } payload.
async function normalizePayload(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid request body' };
  }
  const name = (typeof body.name === 'string' && body.name.trim()) || 'Flat Web Page';
  const slug = slugify(name);
  const inFiles = Array.isArray(body.files) ? body.files : [];
  const files = [];
  for (const f of inFiles) {
    if (!f || typeof f.name !== 'string') continue;
    const fname = f.name.trim();
    const allowed = await assertAllowedFlatFilename(fname);
    if (!allowed.ok) return { error: allowed.error || `Unsupported file: ${fname}` };
    const content = typeof f.content === 'string' ? f.content : '';
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      return { error: `File ${fname} is too large (max 2MB)` };
    }
    files.push({ name: fname, content });
  }
  if (!files.some((f) => f.name === 'index.html')) {
    return { error: 'A flat web page must include index.html' };
  }
  return { name, slug, files };
}

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function registerFlatPageRoutes(app) {
  /**
   * Ephemeral flat-page host for guests (and anyone editing without a student session).
   * Uses the same admin guest-preview timeout as temporary 360 tours.
   */
  app.post('/api/flat-pages/preview-publish', async (req, res) => {
    try {
      const payload = await normalizePayload(req.body);
      if (payload.error) return res.status(400).json({ success: false, message: payload.error });

      const previewSid = getOrSetPreviewSessionId(req, res);
      const hostedPath = `flat-preview-${previewSid}-${payload.slug}`;

      for (const file of payload.files) {
        await uploadHostedUtf8(hostedPath, file.name, file.content);
      }

      const url = buildHostedUrl(hostedPath, 'index.html', req);
      const qrUrl = tourUrlToQrUrl(url);

      let expiresAt = null;
      let timeoutSeconds = null;
      if (isLocalTestUser(req)) {
        const ttlMs = await getGuestPreviewTimeoutMs();
        if (ttlMs != null) {
          expiresAt = Date.now() + ttlMs;
          timeoutSeconds = await getGuestPreviewTimeoutSeconds();
          await markGuestPreviewExpiry(hostedPath, { expiresAt, timeoutSeconds });
        } else {
          await markGuestPreviewExpiry(hostedPath, {});
        }
      }

      res.json({
        success: true,
        preview: true,
        url,
        hostedUrl: url,
        hostedPath,
        qrUrl,
        slug: payload.slug,
        name: payload.name,
        expiresAt,
        timeoutSeconds,
      });
    } catch (err) {
      console.error('Flat page preview publish error:', err);
      logAppError({
        level: 'error',
        code: 'flat_page_preview_publish_failed',
        message: err.message || 'Flat page preview publish failed',
        source: 'flat-pages/preview-publish',
        details: { stack: err.stack ? String(err.stack).slice(0, 2000) : null },
      });
      res.status(500).json({ success: false, message: err.message || 'Preview publish failed' });
    }
  });

  // List the signed-in student's flat pages (metadata only)
  app.get('/api/student/flat-pages', requireStudentStrict, async (req, res) => {
    try {
      const studentId = req.studentSession.studentId;
      let dbPages = [];
      if (isDbEnabled()) {
        const { rows } = await query(
          `SELECT slug, name, files_manifest, hosted_path, hosted_url, is_hosted, updated_at
           FROM flat_page_projects WHERE student_id = $1 ORDER BY updated_at DESC`,
          [studentId]
        );
        dbPages = rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          files: r.files_manifest,
          hostedUrl: r.hosted_url,
          hostedPath: r.hosted_path,
          isHosted: r.is_hosted,
          updatedAt: r.updated_at,
        }));
      }
      const diskPages = listHostedFlatPagesFromDisk(studentId, req);
      res.json({
        success: true,
        pages: mergeFlatPageLists(dbPages, diskPages),
      });
    } catch (err) {
      console.error('List flat pages error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Fetch a single flat page including file contents (downloaded from B2)
  app.get('/api/student/flat-pages/:slug', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const studentId = req.studentSession.studentId;
      const slug = slugify(req.params.slug);
      const { rows } = await query(
        `SELECT name, b2_prefix, files_manifest FROM flat_page_projects
         WHERE student_id = $1 AND slug = $2`,
        [studentId, slug]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: 'Page not found' });

      const row = rows[0];
      const manifest = Array.isArray(row.files_manifest) ? row.files_manifest : [];
      const files = [];
      for (const entry of manifest) {
        const fname = entry && entry.name;
        if (!fname) continue;
        const allowed = await assertAllowedFlatFilename(fname);
        if (!allowed.ok) continue;
        try {
          const { stream } = await b2Service.downloadStream(`${row.b2_prefix}${fname}`);
          files.push({ name: fname, content: await streamToString(stream) });
        } catch (err) {
          files.push({ name: fname, content: '' });
        }
      }
      res.json({ success: true, page: { name: row.name, slug, files } });
    } catch (err) {
      console.error('Get flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Create or update a flat page (upsert by slug)
  app.post('/api/student/flat-pages', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const payload = await normalizePayload(req.body);
      if (payload.error) return res.status(400).json({ success: false, message: payload.error });

      const studentId = req.studentSession.studentId;
      const classSlug = await resolveClassSlug(studentId, req.studentSession);

      const prefix = buildPrefix(classSlug, studentId, payload.slug);
      for (const file of payload.files) {
        await b2Service.uploadBuffer(
          Buffer.from(file.content, 'utf8'),
          `${prefix}${file.name}`,
          contentTypeForFilename(file.name)
        );
      }

      const manifest = payload.files.map((f) => ({ name: f.name }));
      await upsertFlatPageRecord({
        studentId,
        classSlug,
        name: payload.name,
        slug: payload.slug,
        files: payload.files,
      });

      res.json({ success: true, slug: payload.slug, name: payload.name });
    } catch (err) {
      console.error('Save flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Update an existing flat page by slug
  app.put('/api/student/flat-pages/:slug', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const payload = await normalizePayload(req.body);
      if (payload.error) return res.status(400).json({ success: false, message: payload.error });

      const slug = slugify(req.params.slug);
      const studentId = req.studentSession.studentId;
      const classSlug = await resolveClassSlug(studentId, req.studentSession);

      const prefix = buildPrefix(classSlug, studentId, slug);
      for (const file of payload.files) {
        await b2Service.uploadBuffer(
          Buffer.from(file.content, 'utf8'),
          `${prefix}${file.name}`,
          contentTypeForFilename(file.name)
        );
      }

      await upsertFlatPageRecord({
        studentId,
        classSlug,
        name: payload.name,
        slug,
        files: payload.files,
      });

      res.json({ success: true, slug, name: payload.name });
    } catch (err) {
      console.error('Update flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  async function handlePublish(req, res, slugOverride) {
    const payload = await normalizePayload(req.body);
    if (payload.error) return res.status(400).json({ success: false, message: payload.error });
    if (slugOverride) payload.slug = slugOverride;

    const studentId = req.studentSession.studentId;
    const classSlug = await resolveClassSlug(studentId, req.studentSession);

    const hostedPath = `${studentHostedPrefix(studentId)}${payload.slug}`;

    for (const file of payload.files) {
      await uploadHostedUtf8(hostedPath, file.name, file.content);
    }

    const prefix = buildPrefix(classSlug, studentId, payload.slug);
    await uploadFlatPageFilesToB2(prefix, payload.files);

    const url = buildHostedUrl(hostedPath, 'index.html', req);

    let savedToLibrary = false;
    if (isDbEnabled()) {
      try {
        await upsertFlatPageRecord({
          studentId,
          classSlug,
          name: payload.name,
          slug: payload.slug,
          files: payload.files,
          hostedPath,
          hostedUrl: url,
          isHosted: true,
        });
        savedToLibrary = true;
      } catch (err) {
        console.error('Publish flat page DB upsert failed:', err);
      }
    }

    res.json({
      success: true,
      url,
      hostedPath,
      slug: payload.slug,
      name: payload.name,
      savedToLibrary,
    });
  }

  // Publish a flat page to a live hosted URL (served from /hosted/<path>/)
  app.post('/api/student/flat-pages/publish', requireStudentStrict, async (req, res) => {
    try {
      await handlePublish(req, res);
    } catch (err) {
      console.error('Publish flat page error:', err);
      logAppError({
        level: 'error',
        code: 'flat_page_publish_failed',
        message: err.message || 'Flat page publish failed',
        userName: req.studentSession?.displayName || 'unknown',
        studentId: req.studentSession?.studentId || null,
        source: 'flat-pages/publish',
        details: { stack: err.stack ? String(err.stack).slice(0, 2000) : null },
      });
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/student/flat-pages/:slug/publish', requireStudentStrict, async (req, res) => {
    try {
      await handlePublish(req, res, slugify(req.params.slug));
    } catch (err) {
      console.error('Publish flat page error:', err);
      logAppError({
        level: 'error',
        code: 'flat_page_publish_failed',
        message: err.message || 'Flat page publish failed',
        userName: req.studentSession?.displayName || 'unknown',
        studentId: req.studentSession?.studentId || null,
        source: 'flat-pages/publish',
        details: { slug: req.params.slug, stack: err.stack ? String(err.stack).slice(0, 2000) : null },
      });
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Delete a flat page (Backblaze, hosted files, and database record)
  app.delete('/api/student/flat-pages/:slug', requireStudentStrict, async (req, res) => {
    try {
      const studentId = req.studentSession.studentId;
      const slug = slugify(req.params.slug);
      const classSlug = await resolveClassSlug(studentId, req.studentSession);

      let b2Prefix = buildPrefix(classSlug, studentId, slug);
      let manifest = [];
      let hostedPath = null;

      if (isDbEnabled()) {
        const { rows } = await query(
          `SELECT b2_prefix, files_manifest, hosted_path FROM flat_page_projects
           WHERE student_id = $1 AND slug = $2`,
          [studentId, slug]
        );
        if (rows.length) {
          if (rows[0].b2_prefix) b2Prefix = rows[0].b2_prefix;
          manifest = Array.isArray(rows[0].files_manifest) ? rows[0].files_manifest : [];
          hostedPath = rows[0].hosted_path || null;
        }
      }

      await deleteFlatPageB2Files(b2Prefix, manifest);
      await removeHostedFlatPageDir(studentId, slug, hostedPath);

      if (isDbEnabled()) {
        await query(`DELETE FROM flat_page_projects WHERE student_id = $1 AND slug = $2`, [
          studentId,
          slug,
        ]);
      }

      res.json({ success: true, slug });
    } catch (err) {
      console.error('Delete flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerFlatPageRoutes };
