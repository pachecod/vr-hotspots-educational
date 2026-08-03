const { query, isDbEnabled } = require('./db-service');
const {
  hostedProjectExists,
  hostedFileExists,
} = require('../lib/hosted-b2-storage');
const { resolveHostedProjectUrls } = require('./hosted-project-urls');

function validateHostedPath(hostedPath) {
  return typeof hostedPath === 'string' && /^[a-zA-Z0-9_-]+$/.test(hostedPath);
}

async function isVrHotspotHostedProject(hostedPath) {
  if (!validateHostedPath(hostedPath)) return false;
  if (!(await hostedProjectExists(hostedPath))) return false;
  return hostedFileExists(hostedPath, 'config.json');
}

function formatHostedSlugTitle(slug) {
  return String(slug || 'Project')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function resolveClassBySlug(classSlug) {
  if (!isDbEnabled() || !classSlug) return null;
  const { rows } = await query(
    `SELECT id, name, description, slug, password_hash
     FROM classes
     WHERE LOWER(slug) = LOWER($1)
     LIMIT 1`,
    [String(classSlug).trim()]
  );
  return rows[0] || null;
}

/**
 * Admin-hosted VR projects for one class (inbox host + legacy submissions).
 * Excludes student self-published tours.
 */
async function listClassHostedGalleryProjects(classId) {
  const byPath = new Map();
  const studentPublishedPaths = new Set();

  if (isDbEnabled()) {
    const { rows: tourRows } = await query(
      `SELECT t.hosted_path
       FROM student_published_tours t
       JOIN students s ON s.id = t.student_id
       WHERE t.hosted_path IS NOT NULL AND s.class_id = $1`,
      [classId]
    );
    for (const row of tourRows) {
      if (row.hosted_path) studentPublishedPaths.add(row.hosted_path);
    }
  }

  const addItem = (item) => {
    if (!item?.hostedPath || !validateHostedPath(item.hostedPath)) return;
    if (studentPublishedPaths.has(item.hostedPath)) return;
    const existing = byPath.get(item.hostedPath);
    if (!existing || new Date(item.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      byPath.set(item.hostedPath, item);
    }
  };

  if (isDbEnabled()) {
    const { rows: versionRows } = await query(
      `SELECT DISTINCT ON (pv.hosted_path)
              pv.hosted_path, pv.hosted_url, pv.hosted_at,
              pt.project_name, s.display_name AS student_name, c.name AS class_name
       FROM project_versions pv
       JOIN project_threads pt ON pt.id = pv.thread_id
       JOIN students s ON s.id = pt.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE pv.is_hosted = TRUE AND pv.hosted_path IS NOT NULL
         AND s.class_id = $1
       ORDER BY pv.hosted_path, pv.version_number DESC`,
      [classId]
    );
    for (const row of versionRows) {
      addItem({
        hostedPath: row.hosted_path,
        tourUrl: row.hosted_url,
        title: row.project_name || formatHostedSlugTitle(row.hosted_path),
        studentName: row.student_name,
        className: row.class_name,
        updatedAt: row.hosted_at,
        sourceLabel: 'Hosted project',
      });
    }

    const { rows: legacyRows } = await query(
      `SELECT sub.project_name, sub.student_name, sub.hosted_path, sub.hosted_url, sub.hosted_at
       FROM submissions sub
       JOIN students s ON s.id = sub.student_id
       WHERE sub.is_hosted = TRUE AND sub.hosted_path IS NOT NULL
         AND s.class_id = $1
       ORDER BY sub.hosted_at DESC NULLS LAST`,
      [classId]
    );
    for (const row of legacyRows) {
      addItem({
        hostedPath: row.hosted_path,
        tourUrl: row.hosted_url,
        title: row.project_name || formatHostedSlugTitle(row.hosted_path),
        studentName: row.student_name,
        className: null,
        updatedAt: row.hosted_at,
        sourceLabel: 'Hosted project',
      });
    }
  }

  const items = [];
  for (const item of byPath.values()) {
    if (!(await isVrHotspotHostedProject(item.hostedPath))) continue;
    if (!item.tourUrl) {
      try {
        item.tourUrl = resolveHostedProjectUrls(item.hostedPath).tourUrl;
      } catch (_) {}
    }
    items.push(item);
  }

  items.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
  return items;
}

async function hasClassHostedGalleryProjects(classId) {
  if (!isDbEnabled() || !classId) return false;

  const { rows: versionRows } = await query(
    `SELECT 1
     FROM project_versions pv
     JOIN project_threads pt ON pt.id = pv.thread_id
     JOIN students s ON s.id = pt.student_id
     WHERE pv.is_hosted = TRUE AND pv.hosted_path IS NOT NULL
       AND s.class_id = $1
     LIMIT 1`,
    [classId]
  );
  if (versionRows.length) return true;

  const { rows: legacyRows } = await query(
    `SELECT 1
     FROM submissions sub
     JOIN students s ON s.id = sub.student_id
     WHERE sub.is_hosted = TRUE AND sub.hosted_path IS NOT NULL
       AND s.class_id = $1
     LIMIT 1`,
    [classId]
  );
  return legacyRows.length > 0;
}

module.exports = {
  resolveClassBySlug,
  listClassHostedGalleryProjects,
  hasClassHostedGalleryProjects,
};
