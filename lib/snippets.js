const { query, isDbEnabled } = require('../services/db-service');

const SEED_SNIPPETS = [
  {
    id: 'seed-paragraph',
    title: 'Paragraph',
    code: '<p>A paragraph.</p>',
    language: 'html',
    sort_order: 0,
  },
  {
    id: 'seed-headline',
    title: 'Headline',
    code: '<h1>A Headline</h1>',
    language: 'html',
    sort_order: 1,
  },
  {
    id: 'seed-subheadline',
    title: 'Subheadline',
    code: '<h2>A Subheadline</h2>',
    language: 'html',
    sort_order: 2,
  },
  {
    id: 'seed-image',
    title: 'Image',
    code: '<img src="" width="300" alt="" /> <!-- Put your image URL inside src="" -->',
    language: 'html',
    sort_order: 3,
  },
];

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    language: row.language || 'html',
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listSnippets() {
  if (!isDbEnabled()) {
    return SEED_SNIPPETS.map((s) => ({ ...s, created_at: null, updated_at: null }));
  }
  const { rows } = await query(
    `SELECT id, title, code, language, sort_order, created_at, updated_at
     FROM snippets
     ORDER BY sort_order ASC, created_at ASC`
  );
  if (!rows.length) return SEED_SNIPPETS.map((s) => ({ ...s, created_at: null, updated_at: null }));
  return rows.map(mapRow);
}

async function createSnippet({ title, code, language = 'html', sort_order = 0 }) {
  const { rows } = await query(
    `INSERT INTO snippets (title, code, language, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, code, language, sort_order, created_at, updated_at`,
    [title.trim(), code, language || 'html', sort_order]
  );
  return mapRow(rows[0]);
}

async function updateSnippet(id, { title, code, language, sort_order }) {
  const { rows } = await query(
    `UPDATE snippets
     SET title = COALESCE($2, title),
         code = COALESCE($3, code),
         language = COALESCE($4, language),
         sort_order = COALESCE($5, sort_order),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, title, code, language, sort_order, created_at, updated_at`,
    [id, title, code, language, sort_order]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function deleteSnippet(id) {
  const { rowCount } = await query(`DELETE FROM snippets WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function seedSnippetsIfEmpty() {
  if (!isDbEnabled()) return;
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM snippets`);
  if (rows[0].n > 0) return;
  for (const s of SEED_SNIPPETS) {
    await query(
      `INSERT INTO snippets (title, code, language, sort_order) VALUES ($1, $2, $3, $4)`,
      [s.title, s.code, s.language, s.sort_order]
    );
  }
}

module.exports = {
  SEED_SNIPPETS,
  listSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  seedSnippetsIfEmpty,
};
