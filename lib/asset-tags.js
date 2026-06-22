const { query, isDbEnabled, withClient } = require('../services/db-service');

const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_ASSET = 20;

function buildStudentAssetKey(studentId, category, filename) {
  return `student:${studentId}:${category}:${filename}`;
}

function buildCommonAssetKey(category, filename) {
  return `common:${category}:${filename}`;
}

function buildStudentScopePrefix(studentId) {
  return `student:${studentId}:`;
}

const COMMON_SCOPE_PREFIX = 'common:';

function normalizeTag(raw) {
  if (raw == null) return null;
  let tag = String(raw).toLowerCase().trim().replace(/\s+/g, '-');
  tag = tag.replace(/[^a-z0-9_-]/g, '');
  if (!tag || tag.length > MAX_TAG_LENGTH) return null;
  return tag;
}

function normalizeTags(input) {
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    rawList = input.split(',');
  } else {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const raw of rawList) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_ASSET) break;
  }
  return out;
}

function parseTagsFromBody(body) {
  if (!body) return [];
  if (body.tags != null) {
    if (typeof body.tags === 'string') {
      try {
        const parsed = JSON.parse(body.tags);
        if (Array.isArray(parsed)) return normalizeTags(parsed);
      } catch (_) {
        return normalizeTags(body.tags);
      }
      return normalizeTags(body.tags);
    }
    if (Array.isArray(body.tags)) return normalizeTags(body.tags);
  }
  return [];
}

function parseTagSortParam(raw) {
  const sort = String(raw || 'popular').toLowerCase();
  if (sort === 'recent' || sort === 'alpha' || sort === 'popular') return sort;
  return 'popular';
}

async function getTagsForKeys(assetKeys) {
  const map = new Map();
  if (!isDbEnabled() || !assetKeys.length) return map;

  const { rows } = await query(
    `SELECT asset_key, tag FROM asset_tags WHERE asset_key = ANY($1::text[]) ORDER BY tag`,
    [assetKeys]
  );
  for (const row of rows) {
    if (!map.has(row.asset_key)) map.set(row.asset_key, []);
    map.get(row.asset_key).push(row.tag);
  }
  return map;
}

async function attachTagsToGroupedAssets(grouped, keyBuilder) {
  if (!isDbEnabled() || !grouped) return grouped;

  const keys = [];
  for (const category of Object.keys(grouped)) {
    for (const asset of grouped[category] || []) {
      keys.push(keyBuilder(category, asset.name));
    }
  }
  const tagMap = await getTagsForKeys(keys);

  for (const category of Object.keys(grouped)) {
    grouped[category] = (grouped[category] || []).map((asset) => ({
      ...asset,
      tags: tagMap.get(keyBuilder(category, asset.name)) || [],
    }));
  }
  return grouped;
}

async function attachTagsToStudentAssets(grouped, studentId) {
  return attachTagsToGroupedAssets(grouped, (category, filename) =>
    buildStudentAssetKey(studentId, category, filename)
  );
}

async function attachTagsToCommonAssets(grouped) {
  return attachTagsToGroupedAssets(grouped, (category, filename) =>
    buildCommonAssetKey(category, filename)
  );
}

async function setTagsForKey(assetKey, tags) {
  if (!isDbEnabled()) {
    const err = new Error('Database not configured');
    err.statusCode = 503;
    throw err;
  }
  const normalized = normalizeTags(tags);
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM asset_tags WHERE asset_key = $1', [assetKey]);
      for (const tag of normalized) {
        await client.query(
          `INSERT INTO asset_tags (asset_key, tag) VALUES ($1, $2)
           ON CONFLICT (asset_key, tag) DO NOTHING`,
          [assetKey, tag]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
  return normalized;
}

async function deleteTagsForKey(assetKey) {
  if (!isDbEnabled()) return;
  await query('DELETE FROM asset_tags WHERE asset_key = $1', [assetKey]);
}

async function listTagsForScope(prefix, { sort = 'popular' } = {}) {
  if (!isDbEnabled()) return [];

  let orderClause = 'count DESC, tag ASC';
  if (sort === 'recent') {
    orderClause = 'last_used_at DESC, tag ASC';
  } else if (sort === 'alpha') {
    orderClause = 'tag ASC';
  }

  const { rows } = await query(
    `SELECT tag, COUNT(*)::int AS count, MAX(created_at) AS last_used_at
     FROM asset_tags
     WHERE asset_key LIKE $1
     GROUP BY tag
     ORDER BY ${orderClause}`,
    [`${prefix}%`]
  );
  return rows.map((r) => ({
    tag: r.tag,
    count: r.count,
    lastUsedAt: r.last_used_at,
  }));
}

module.exports = {
  MAX_TAGS_PER_ASSET,
  buildStudentAssetKey,
  buildCommonAssetKey,
  buildStudentScopePrefix,
  COMMON_SCOPE_PREFIX,
  normalizeTag,
  normalizeTags,
  parseTagsFromBody,
  parseTagSortParam,
  getTagsForKeys,
  attachTagsToStudentAssets,
  attachTagsToCommonAssets,
  setTagsForKey,
  deleteTagsForKey,
  listTagsForScope,
};
