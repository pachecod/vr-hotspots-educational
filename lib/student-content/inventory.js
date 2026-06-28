const fs = require('fs');
const path = require('path');
const b2Service = require('../../services/b2-service');
const projectVersionsDb = require('../../services/project-versions-db');
const { query, isDbEnabled } = require('../../services/db-service');
const { resolveHostedProjectUrls } = require('../../services/hosted-project-urls');
const {
  HOSTED_DIR,
  studentHostedPrefix,
} = require('./flat-page-purge');
const { isB2PathPurged } = require('./purge');
const { submissionStorageKey } = require('../legacy-submissions');

const ADMIN_CONTENT_CLASS_ID = '__admin__';

const CONTENT_TYPES = [
  'project',
  'flat_page',
  'vr_tour',
  'hosted_submission',
  'asset',
  'orphan_asset',
  'legacy_submission',
  'common_asset',
  'template',
];

function itemBase(fields) {
  return {
    links: {
      tourUrl: null,
      flatUrl: null,
      downloadUrl: null,
      previewUrl: null,
      qrUrl: null,
    },
    storageHints: { b2Paths: [], diskPaths: [], dbTables: [] },
    versionCount: 0,
    ...fields,
  };
}

async function loadProjects({ classId, studentId, q } = {}) {
  if (!isDbEnabled()) return [];
  const params = [];
  let sql = `
    SELECT pt.id AS thread_id, pt.project_name, pt.project_slug, pt.created_at AS thread_created_at,
           pt.student_id, s.display_name AS student_name, c.name AS class_name, c.id AS class_id,
           (SELECT COUNT(*)::int FROM project_versions pv WHERE pv.thread_id = pt.id) AS version_count,
           (SELECT MAX(COALESCE(pv.submitted_at, pv.created_at)) FROM project_versions pv WHERE pv.thread_id = pt.id) AS updated_at,
           (SELECT pv.hosted_url FROM project_versions pv WHERE pv.thread_id = pt.id AND pv.is_hosted = TRUE ORDER BY pv.version_number DESC LIMIT 1) AS hosted_url,
           (SELECT pv.hosted_path FROM project_versions pv WHERE pv.thread_id = pt.id AND pv.is_hosted = TRUE ORDER BY pv.version_number DESC LIMIT 1) AS hosted_path,
           (SELECT pv.is_hosted FROM project_versions pv WHERE pv.thread_id = pt.id AND pv.is_hosted = TRUE LIMIT 1) AS is_hosted
    FROM project_threads pt
    JOIN students s ON s.id = pt.student_id
    JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;
  if (classId) {
    params.push(classId);
    sql += ` AND c.id = $${params.length}`;
  }
  if (studentId) {
    params.push(studentId);
    sql += ` AND pt.student_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND pt.project_name ILIKE $${params.length}`;
  }
  sql += ` ORDER BY updated_at DESC NULLS LAST`;

  const { rows } = await query(sql, params);
  return rows.map((row) => {
    const links = {
      tourUrl: row.hosted_url || null,
      flatUrl: null,
      downloadUrl: null,
      previewUrl: null,
      qrUrl: null,
    };
    if (row.hosted_path && row.is_hosted) {
      try {
        const hostedDir = path.join(HOSTED_DIR, row.hosted_path);
        const urls = resolveHostedProjectUrls(row.hosted_path, hostedDir);
        links.tourUrl = urls.tourUrl || links.tourUrl;
        links.flatUrl = urls.flatPageUrl || null;
      } catch (_) {}
    }
    return itemBase({
      id: row.thread_id,
      type: 'project',
      studentId: row.student_id,
      studentName: row.student_name,
      className: row.class_name,
      classId: row.class_id,
      title: row.project_name,
      slug: row.project_slug,
      createdAt: row.thread_created_at,
      updatedAt: row.updated_at || row.thread_created_at,
      versionCount: row.version_count,
      links,
      storageHints: { b2Paths: [], diskPaths: row.hosted_path ? [row.hosted_path] : [], dbTables: ['project_threads', 'project_versions'] },
    });
  });
}

async function loadFlatPages({ classId, studentId, q } = {}) {
  if (!isDbEnabled()) return [];
  const params = [];
  let sql = `
    SELECT f.*, s.display_name AS student_name, c.name AS class_name, c.id AS class_id
    FROM flat_page_projects f
    JOIN students s ON s.id = f.student_id
    JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;
  if (classId) {
    params.push(classId);
    sql += ` AND c.id = $${params.length}`;
  }
  if (studentId) {
    params.push(studentId);
    sql += ` AND f.student_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND f.name ILIKE $${params.length}`;
  }
  sql += ` ORDER BY f.updated_at DESC`;

  const { rows } = await query(sql, params);
  return rows.map((row) =>
    itemBase({
      id: row.slug,
      type: 'flat_page',
      studentId: row.student_id,
      studentName: row.student_name,
      className: row.class_name,
      classId: row.class_id,
      title: row.name,
      slug: row.slug,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      links: {
        tourUrl: null,
        flatUrl: row.hosted_url || null,
        downloadUrl: null,
        previewUrl: row.hosted_url || null,
        qrUrl: null,
      },
      storageHints: {
        b2Paths: row.b2_prefix ? [row.b2_prefix] : [],
        diskPaths: row.hosted_path ? [row.hosted_path] : [],
        dbTables: ['flat_page_projects'],
      },
      isHosted: row.is_hosted,
    })
  );
}

async function loadVrTours({ classId, studentId, q } = {}) {
  if (!isDbEnabled()) return [];
  const params = [];
  let sql = `
    SELECT t.*, s.display_name AS student_name, c.name AS class_name, c.id AS class_id
    FROM student_published_tours t
    JOIN students s ON s.id = t.student_id
    JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;
  if (classId) {
    params.push(classId);
    sql += ` AND c.id = $${params.length}`;
  }
  if (studentId) {
    params.push(studentId);
    sql += ` AND t.student_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND t.slug ILIKE $${params.length}`;
  }
  sql += ` ORDER BY t.published_at DESC`;

  const { rows } = await query(sql, params);
  return rows.map((row) =>
    itemBase({
      id: row.slug,
      type: 'vr_tour',
      studentId: row.student_id,
      studentName: row.student_name,
      className: row.class_name,
      classId: row.class_id,
      title: row.slug.replace(/-/g, ' '),
      slug: row.slug,
      createdAt: row.published_at,
      updatedAt: row.published_at,
      links: {
        tourUrl: row.hosted_url,
        flatUrl: null,
        downloadUrl: null,
        previewUrl: row.hosted_url,
        qrUrl: row.qr_url,
      },
      storageHints: {
        b2Paths: [],
        diskPaths: [row.hosted_path],
        dbTables: ['student_published_tours'],
      },
    })
  );
}

async function loadAssets({ classId, studentId, orphaned, q } = {}) {
  if (!isDbEnabled()) return [];
  const params = [];
  let sql = `
    SELECT sa.*, s.display_name AS student_name, c.name AS class_name, c.id AS class_id
    FROM student_assets sa
    LEFT JOIN students s ON s.id = sa.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;

  if (orphaned) {
    sql += ` AND sa.ownership = 'orphaned'`;
  } else {
    sql += ` AND sa.ownership = 'student'`;
    if (!studentId) {
      sql += ` AND sa.student_id IS NOT NULL`;
    }
  }

  if (classId && !orphaned) {
    params.push(classId);
    sql += ` AND c.id = $${params.length}`;
  }
  if (studentId && !orphaned) {
    params.push(studentId);
    sql += ` AND sa.student_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND sa.filename ILIKE $${params.length}`;
  }
  sql += ` ORDER BY sa.uploaded_at DESC`;

  const { rows } = await query(sql, params);
  return rows.map((row) => {
    const isOrphan = row.ownership === 'orphaned';
    const orphanMeta = row.orphaned_from || {};
    const studentLabel = isOrphan
      ? `Orphaned — ${orphanMeta.displayName || 'Unknown'}`
      : row.student_name;
    return itemBase({
      id: row.id,
      type: isOrphan ? 'orphan_asset' : 'asset',
      studentId: row.student_id,
      studentName: studentLabel,
      className: isOrphan ? orphanMeta.className || '—' : row.class_name,
      classId: row.class_id,
      title: `${row.category}/${row.filename}`,
      slug: row.filename,
      category: row.category,
      filename: row.filename,
      createdAt: row.uploaded_at,
      updatedAt: row.uploaded_at,
      orphanedFrom: isOrphan ? orphanMeta : null,
      links: {
        tourUrl: null,
        flatUrl: null,
        downloadUrl: null,
        previewUrl: isOrphan
          ? `/admin/content/asset/${row.id}`
          : `/admin/students/${row.student_id}/assets/${encodeURIComponent(row.category)}/${encodeURIComponent(row.filename)}`,
        qrUrl: null,
      },
      storageHints: {
        b2Paths: row.b2_path ? [row.b2_path] : [],
        diskPaths: [],
        dbTables: ['student_assets'],
      },
      size: Number(row.size),
    });
  });
}

async function loadLegacySubmissions({ q } = {}) {
  if (!process.env.B2_KEY_ID) return [];
  const dbInbox = isDbEnabled() ? await projectVersionsDb.listAdminInbox({}) : [];
  const knownKeys = new Set(dbInbox.map(submissionStorageKey));
  const b2Files = await b2Service.listFiles('student-projects/');
  const items = [];

  for (const b2File of b2Files) {
    const fileName = b2File.fileName.replace('student-projects/', '');
    if (!fileName || knownKeys.has(fileName)) continue;
    if (await isB2PathPurged(b2File.fileName)) continue;
    if (q && !fileName.toLowerCase().includes(q.toLowerCase())) continue;

    const nameParts = fileName.replace(/\.zip$/i, '').split('_');
    items.push(
      itemBase({
        id: fileName,
        type: 'legacy_submission',
        studentId: null,
        studentName: nameParts[0] || 'unknown',
        className: '—',
        title: fileName,
        createdAt: new Date(b2File.uploadTimestamp).toISOString(),
        updatedAt: new Date(b2File.uploadTimestamp).toISOString(),
        links: {
          tourUrl: null,
          flatUrl: null,
          downloadUrl: `/admin/download/${encodeURIComponent(fileName)}`,
          previewUrl: null,
          qrUrl: null,
        },
        storageHints: {
          b2Paths: [b2File.fileName],
          diskPaths: [],
          dbTables: [],
        },
        legacy: true,
      })
    );
  }
  return items;
}

async function loadCommonAssets({ q } = {}) {
  if (!process.env.B2_KEY_ID) return [];
  const { listCommonAssets } = require('../../routes/common-assets-routes');
  const grouped = await listCommonAssets();
  const items = [];
  for (const [category, assets] of Object.entries(grouped)) {
    for (const asset of assets || []) {
      if (q && !String(asset.name).toLowerCase().includes(q.toLowerCase())) continue;
      items.push(
        itemBase({
          id: `${category}::${asset.name}`,
          type: 'common_asset',
          studentId: null,
          studentName: 'Admin',
          className: 'Shared Online Assets',
          title: `${category}/${asset.name}`,
          category,
          filename: asset.name,
          createdAt: asset.uploadedAt,
          updatedAt: asset.uploadedAt,
          links: {
            tourUrl: null,
            flatUrl: null,
            downloadUrl: null,
            previewUrl: asset.url || `/common-assets/${category}/${encodeURIComponent(asset.name)}`,
            qrUrl: null,
          },
          storageHints: {
            b2Paths: [`common-assets/${category}/${asset.name}`],
            diskPaths: [],
            dbTables: ['asset_tags'],
          },
          size: Number(asset.size),
        })
      );
    }
  }
  return items;
}

async function loadTemplates({ q } = {}) {
  if (!isDbEnabled()) return [];
  const { listAllTemplates } = require('../templates');
  const rows = await listAllTemplates();
  return rows
    .filter((row) => !q || String(row.title).toLowerCase().includes(q.toLowerCase()))
    .map((row) =>
      itemBase({
        id: row.id,
        type: 'template',
        studentId: null,
        studentName: 'Admin',
        className: 'Flat Page Templates',
        title: row.title,
        slug: row.slug,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        links: {
          tourUrl: null,
          flatUrl: null,
          downloadUrl: null,
          previewUrl: `admin-template-editor.html?templateId=${encodeURIComponent(row.id)}`,
          qrUrl: null,
        },
        storageHints: {
          b2Paths: [],
          diskPaths: [],
          dbTables: ['project_templates'],
        },
        scope: row.scope,
        isPublic: row.is_public,
      })
    );
}

function isAdminContentClassFilter(filters) {
  return filters.classId === ADMIN_CONTENT_CLASS_ID || filters.adminOnly === true;
}

async function loadAdminSiteContent(filters) {
  const { type } = filters;
  let items = [];
  if (!type || type === 'common_asset') items = items.concat(await loadCommonAssets(filters));
  if (!type || type === 'template') items = items.concat(await loadTemplates(filters));
  return items;
}

async function buildContentInventory(filters = {}) {
  const { type, orphaned, page = 1, limit = 50 } = filters;

  let items = [];

  if (isAdminContentClassFilter(filters)) {
    items = await loadAdminSiteContent(filters);
  } else if (orphaned && !type) {
    items = await loadAssets({ ...filters, orphaned: true });
  } else {
    if (!type || type === 'project') items = items.concat(await loadProjects(filters));
    if (!type || type === 'flat_page') items = items.concat(await loadFlatPages(filters));
    if (!type || type === 'vr_tour') items = items.concat(await loadVrTours(filters));
    if (!type || type === 'asset' || type === 'orphan_asset') {
      items = items.concat(
        await loadAssets({ ...filters, orphaned: type === 'orphan_asset' })
      );
    }
    if (!type || type === 'legacy_submission') {
      if (!filters.classId && !filters.studentId) {
        items = items.concat(await loadLegacySubmissions(filters));
      }
    }
  }

  items.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );

  const total = items.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const start = (pageNum - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return { items: paged, total, page: pageNum, limit: pageSize };
}

async function buildContentSummary(filters = {}) {
  const { items } = await buildContentInventory({ ...filters, limit: 10000, page: 1 });
  const summary = {};
  for (const t of CONTENT_TYPES) summary[t] = 0;
  for (const item of items) {
    summary[item.type] = (summary[item.type] || 0) + 1;
  }
  summary.total = items.length;
  return summary;
}

module.exports = {
  ADMIN_CONTENT_CLASS_ID,
  CONTENT_TYPES,
  buildContentInventory,
  buildContentSummary,
  loadProjects,
};
