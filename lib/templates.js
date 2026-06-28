const { query, isDbEnabled, slugify } = require('../services/db-service');

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
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    scope: row.scope || 'flat',
    thumbnail_url: row.thumbnail_url,
    sort_order: row.sort_order ?? 0,
    has_bundle: !!row.bundle_b2_key,
  };
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
    ...mapRow(r),
    files_manifest: undefined,
    bundle_b2_key: undefined,
  }));
}

async function listPlaygroundTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, sort_order, thumbnail_url, bundle_b2_key
     FROM project_templates
     WHERE is_playground = TRUE AND is_public = TRUE
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

async function createTemplate(payload) {
  const title = (payload.title || '').trim();
  const slug = slugify(payload.slug || title);
  const files = Array.isArray(payload.files_manifest) ? payload.files_manifest : [];
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
      payload.sort_order || 0,
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
  const { rows } = await query(
    `UPDATE project_templates
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         is_public = COALESCE($4, is_public),
         is_default = COALESCE($5, is_default),
         is_playground = COALESCE($6, is_playground),
         sort_order = COALESCE($7, sort_order),
         files_manifest = COALESCE($8::jsonb, files_manifest),
         thumbnail_url = COALESCE($9, thumbnail_url),
         scope = COALESCE($10, scope),
         bundle_b2_key = COALESCE($11, bundle_b2_key),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      payload.title,
      payload.description,
      payload.is_public,
      payload.is_default,
      payload.is_playground,
      payload.sort_order,
      payload.files_manifest ? JSON.stringify(payload.files_manifest) : null,
      payload.thumbnail_url,
      payload.scope,
      payload.bundle_b2_key,
    ]
  );
  if (rows[0] && payload.is_default) {
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
  createTemplate,
  updateTemplate,
  clearTemplateBundle,
  deleteTemplate,
};
