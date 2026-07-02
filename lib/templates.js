const { query, isDbEnabled, slugify } = require('../services/db-service');
const { resolvePlaygroundThumbnailUrl } = require('./playground-thumbnail');

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    scope: row.scope || 'flat',
    is_public: !!row.is_public,
    is_default: !!row.is_default,
    is_playground: !!row.is_playground,
    sort_order: row.sort_order ?? 0,
    files_manifest: row.files_manifest || [],
    thumbnail_url: row.thumbnail_url,
    bundle_b2_key: row.bundle_b2_key || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPlaygroundCard(row) {
  const card = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    scope: row.scope || 'flat',
    thumbnail_url: row.thumbnail_url,
    sort_order: row.sort_order ?? 0,
    has_bundle: !!row.bundle_b2_key,
  };
  card.thumbnail_url = resolvePlaygroundThumbnailUrl(card);
  return card;
}

async function listPublicTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            files_manifest, thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates
     WHERE is_public = TRUE
     ORDER BY sort_order ASC, title ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description || '',
    scope: r.scope || 'flat',
    is_default: !!r.is_default,
    is_playground: !!r.is_playground,
    sort_order: r.sort_order ?? 0,
    has_bundle: !!r.bundle_b2_key,
    thumbnail_url: r.thumbnail_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function listPlaygroundTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, sort_order, thumbnail_url, bundle_b2_key
     FROM project_templates
     WHERE is_playground = TRUE
       AND is_public = TRUE
       AND (
         scope = 'flat'
         OR (scope = 'combined' AND bundle_b2_key IS NOT NULL)
       )
     ORDER BY sort_order ASC, title ASC`
  );
  return rows.map(mapPlaygroundCard);
}

async function getDefaultTemplate() {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            files_manifest, thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates
     WHERE is_default = TRUE
     ORDER BY sort_order ASC
     LIMIT 1`
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function getTemplateById(id) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            files_manifest, thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function getTemplateBySlug(slug) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            files_manifest, thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates
     WHERE slug = $1 AND is_public = TRUE`,
    [slug]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function getPlaygroundTemplateBySlug(slug) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            files_manifest, thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates
     WHERE slug = $1 AND is_playground = TRUE AND is_public = TRUE`,
    [slug]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function listAllTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, is_playground, sort_order,
            thumbnail_url, bundle_b2_key, created_at, updated_at
     FROM project_templates
     ORDER BY sort_order ASC, title ASC`
  );
  return rows.map((r) => ({
    ...mapRow(r),
    files_manifest: undefined,
  }));
}

async function getNextSortOrder() {
  if (!isDbEnabled()) return 0;
  const { rows } = await query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_templates`
  );
  return rows[0]?.next_order ?? 0;
}

function normalizeTemplateId(id) {
  return String(id || '').trim().toLowerCase();
}

async function reorderTemplates(orderedIds) {
  if (!isDbEnabled()) return false;
  const ids = (orderedIds || []).map((id) => normalizeTemplateId(id)).filter(Boolean);
  if (!ids.length) return true;

  const { rows } = await query(`SELECT id FROM project_templates ORDER BY sort_order ASC, title ASC`);
  const allIds = rows.map((r) => normalizeTemplateId(r.id));
  if (ids.length !== allIds.length) {
    throw new Error('Order must include every template exactly once');
  }

  const allSet = new Set(allIds);
  const seen = new Set();
  for (const id of ids) {
    if (!allSet.has(id) || seen.has(id)) {
      throw new Error('Order must include every template exactly once');
    }
    seen.add(id);
  }

  await query(
    `UPDATE project_templates AS t
     SET sort_order = o.sort_order, updated_at = NOW()
     FROM unnest($1::uuid[], $2::int[]) AS o(id, sort_order)
     WHERE t.id = o.id`,
    [ids, ids.map((_, index) => index)]
  );
  return true;
}

async function createTemplate(payload) {
  const title = (payload.title || '').trim();
  const slug = slugify(payload.slug || title);
  const files = Array.isArray(payload.files_manifest) ? payload.files_manifest : [];
  const sort_order =
    payload.sort_order !== undefined && payload.sort_order !== null
      ? payload.sort_order
      : await getNextSortOrder();
  const { rows } = await query(
    `INSERT INTO project_templates
      (title, slug, description, scope, is_public, is_default, is_playground, sort_order, files_manifest, thumbnail_url, bundle_b2_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     RETURNING *`,
    [
      title,
      slug,
      payload.description || '',
      payload.scope === 'combined' ? 'combined' : 'flat',
      !!payload.is_public,
      !!payload.is_default,
      !!payload.is_playground,
      sort_order,
      JSON.stringify(files),
      payload.thumbnail_url || null,
      payload.bundle_b2_key || null,
    ]
  );
  if (payload.is_default) {
    await query(`UPDATE project_templates SET is_default = FALSE WHERE id != $1`, [rows[0].id]);
  }
  return mapRow(rows[0]);
}

async function updateTemplate(id, payload) {
  const current = await getTemplateById(id);
  if (!current) return null;

  const title = payload.title !== undefined ? payload.title : current.title;
  const description = payload.description !== undefined ? payload.description : current.description;
  const is_public = payload.is_public !== undefined ? !!payload.is_public : current.is_public;
  const is_default = payload.is_default !== undefined ? !!payload.is_default : current.is_default;
  const is_playground =
    payload.is_playground !== undefined ? !!payload.is_playground : current.is_playground;
  const sort_order = payload.sort_order !== undefined ? payload.sort_order : current.sort_order;
  const files_manifest =
    payload.files_manifest !== undefined ? payload.files_manifest : current.files_manifest;
  const thumbnail_url =
    payload.thumbnail_url !== undefined ? payload.thumbnail_url : current.thumbnail_url;
  const scope = payload.scope !== undefined ? payload.scope : current.scope;
  const bundle_b2_key =
    payload.bundle_b2_key !== undefined ? payload.bundle_b2_key : current.bundle_b2_key;

  const { rows } = await query(
    `UPDATE project_templates
     SET title = $2,
         description = $3,
         is_public = $4,
         is_default = $5,
         is_playground = $6,
         sort_order = $7,
         files_manifest = $8::jsonb,
         thumbnail_url = $9,
         scope = $10,
         bundle_b2_key = $11,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      title,
      description,
      is_public,
      is_default,
      is_playground,
      sort_order,
      JSON.stringify(Array.isArray(files_manifest) ? files_manifest : []),
      thumbnail_url,
      scope === 'combined' ? 'combined' : 'flat',
      bundle_b2_key,
    ]
  );
  if (rows[0] && is_default) {
    await query(`UPDATE project_templates SET is_default = FALSE WHERE id != $1`, [id]);
  }
  return rows[0] ? mapRow(rows[0]) : null;
}

async function clearTemplateBundle(id) {
  const { rows } = await query(
    `UPDATE project_templates
     SET bundle_b2_key = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function deleteTemplate(id) {
  const { rowCount } = await query(`DELETE FROM project_templates WHERE id = $1`, [id]);
  return rowCount > 0;
}

module.exports = {
  listPublicTemplates,
  listPlaygroundTemplates,
  getDefaultTemplate,
  getTemplateBySlug,
  getPlaygroundTemplateBySlug,
  getTemplateById,
  listAllTemplates,
  getNextSortOrder,
  reorderTemplates,
  createTemplate,
  updateTemplate,
  clearTemplateBundle,
  deleteTemplate,
};
