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
    sort_order: row.sort_order ?? 0,
    files_manifest: row.files_manifest || [],
    thumbnail_url: row.thumbnail_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listPublicTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, sort_order,
            files_manifest, thumbnail_url, created_at, updated_at
     FROM project_templates
     WHERE is_public = TRUE
     ORDER BY sort_order ASC, title ASC`
  );
  return rows.map((r) => ({
    ...mapRow(r),
    files_manifest: undefined,
  }));
}

async function getDefaultTemplate() {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, sort_order,
            files_manifest, thumbnail_url, created_at, updated_at
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
    `SELECT id, title, slug, description, scope, is_public, is_default, sort_order,
            files_manifest, thumbnail_url, created_at, updated_at
     FROM project_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function getTemplateBySlug(slug) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, sort_order,
            files_manifest, thumbnail_url, created_at, updated_at
     FROM project_templates
     WHERE slug = $1 AND is_public = TRUE`,
    [slug]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function listAllTemplates() {
  if (!isDbEnabled()) return [];
  const { rows } = await query(
    `SELECT id, title, slug, description, scope, is_public, is_default, sort_order,
            thumbnail_url, created_at, updated_at
     FROM project_templates
     ORDER BY sort_order ASC, title ASC`
  );
  return rows.map(mapRow);
}

async function createTemplate(payload) {
  const title = (payload.title || '').trim();
  const slug = slugify(payload.slug || title);
  const files = Array.isArray(payload.files_manifest) ? payload.files_manifest : [];
  const { rows } = await query(
    `INSERT INTO project_templates
      (title, slug, description, scope, is_public, is_default, sort_order, files_manifest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      title,
      slug,
      payload.description || '',
      payload.scope === 'combined' ? 'combined' : 'flat',
      !!payload.is_public,
      !!payload.is_default,
      payload.sort_order || 0,
      JSON.stringify(files),
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
         sort_order = COALESCE($6, sort_order),
         files_manifest = COALESCE($7::jsonb, files_manifest),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      payload.title,
      payload.description,
      payload.is_public,
      payload.is_default,
      payload.sort_order,
      payload.files_manifest ? JSON.stringify(payload.files_manifest) : null,
    ]
  );
  if (rows[0] && payload.is_default) {
    await query(`UPDATE project_templates SET is_default = FALSE WHERE id != $1`, [id]);
  }
  return rows[0] ? mapRow(rows[0]) : null;
}

async function deleteTemplate(id) {
  const { rowCount } = await query(`DELETE FROM project_templates WHERE id = $1`, [id]);
  return rowCount > 0;
}

module.exports = {
  listPublicTemplates,
  getDefaultTemplate,
  getTemplateBySlug,
  getTemplateById,
  listAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
