/*
 * Flat Web Page routes — Render Postgres + Backblaze B2 storage for WebXRIDE-style
 * HTML/CSS/JS pages. This replaces the Supabase-backed persistence used by the
 * reference WebXRIDE app with the same backend stack the rest of this tool uses.
 */
const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled, slugify } = require('../services/db-service');
const { requireStudentStrict } = require('../student-auth');
const { assertAllowedFlatFilename, contentTypeForFilename } = require('../lib/flat-page-files');

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file is plenty for source code
const HOSTED_DIR = path.join(process.cwd(), 'hosted-projects');

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
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
  if (!isDbEnabled()) return;
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
  // List the signed-in student's flat pages (metadata only)
  app.get('/api/student/flat-pages', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) return res.json({ success: true, pages: [] });
      const studentId = req.studentSession.studentId;
      const { rows } = await query(
        `SELECT slug, name, files_manifest, hosted_url, is_hosted, updated_at
         FROM flat_page_projects WHERE student_id = $1 ORDER BY updated_at DESC`,
        [studentId]
      );
      res.json({
        success: true,
        pages: rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          files: r.files_manifest,
          hostedUrl: r.hosted_url,
          isHosted: r.is_hosted,
          updatedAt: r.updated_at,
        })),
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

    const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
    const hostedPath = `flat-${shortId}-${payload.slug}`;
    const targetDir = path.join(HOSTED_DIR, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });

    for (const file of payload.files) {
      fs.writeFileSync(path.join(targetDir, file.name), file.content, 'utf8');
    }

    const prefix = buildPrefix(classSlug, studentId, payload.slug);
    await uploadFlatPageFilesToB2(prefix, payload.files);

    const url = `${getServerBaseUrl(req)}/hosted/${hostedPath}/index.html`;

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

    res.json({ success: true, url, hostedPath, slug: payload.slug, name: payload.name });
  }

  // Publish a flat page to a live hosted URL (served from /hosted/<path>/)
  app.post('/api/student/flat-pages/publish', requireStudentStrict, async (req, res) => {
    try {
      await handlePublish(req, res);
    } catch (err) {
      console.error('Publish flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/student/flat-pages/:slug/publish', requireStudentStrict, async (req, res) => {
    try {
      await handlePublish(req, res, slugify(req.params.slug));
    } catch (err) {
      console.error('Publish flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Delete a flat page
  app.delete('/api/student/flat-pages/:slug', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const studentId = req.studentSession.studentId;
      const slug = slugify(req.params.slug);
      const { rows } = await query(
        `SELECT b2_prefix, files_manifest FROM flat_page_projects
         WHERE student_id = $1 AND slug = $2`,
        [studentId, slug]
      );
      if (rows.length) {
        const manifest = Array.isArray(rows[0].files_manifest) ? rows[0].files_manifest : [];
        for (const entry of manifest) {
          if (entry && entry.name) {
            try {
              await b2Service.deleteFile(`${rows[0].b2_prefix}${entry.name}`);
            } catch (_) {}
          }
        }
        await query(`DELETE FROM flat_page_projects WHERE student_id = $1 AND slug = $2`, [
          studentId,
          slug,
        ]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Delete flat page error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerFlatPageRoutes };
