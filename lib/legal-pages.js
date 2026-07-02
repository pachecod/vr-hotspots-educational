const { getSetting, setSetting } = require('./app-settings');
const { isDbEnabled } = require('../services/db-service');

const LEGAL_SLUGS = ['terms', 'privacy'];
const SETTING_KEYS = {
  terms: 'legal_terms',
  privacy: 'legal_privacy',
};

const DEFAULT_CSS = `body {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1.6;
  color: #111827;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  color: #111827;
  border-bottom: 3px solid #2563eb;
  padding-bottom: 10px;
  margin-bottom: 30px;
}`;

/** Minimal placeholders only — full legal copy is kept outside the repo for admin paste. */
const PLACEHOLDER_TERMS = {
  title: 'Terms of Use',
  content: `<h1>Terms of Use</h1>
<p>This page has not been published yet. An administrator can add content under Admin &rarr; Legal Pages.</p>`,
  css_content: DEFAULT_CSS,
  updated_by: 'system',
};

const PLACEHOLDER_PRIVACY = {
  title: 'Privacy Policy',
  content: `<h1>Privacy Policy</h1>
<p>This page has not been published yet. An administrator can add content under Admin &rarr; Legal Pages.</p>`,
  css_content: DEFAULT_CSS,
  updated_by: 'system',
};

const PLACEHOLDERS = {
  terms: PLACEHOLDER_TERMS,
  privacy: PLACEHOLDER_PRIVACY,
};

function normalizeSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return LEGAL_SLUGS.includes(s) ? s : null;
}

function normalizePage(raw, slug) {
  const fallback = PLACEHOLDERS[slug];
  if (!raw || typeof raw !== 'object') {
    return {
      slug,
      ...fallback,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    slug,
    title: String(raw.title || fallback.title).trim() || fallback.title,
    content: String(raw.content ?? fallback.content),
    css_content: String(raw.css_content ?? fallback.css_content),
    updated_by: raw.updated_by || fallback.updated_by || 'system',
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

async function getLegalPage(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;

  if (!isDbEnabled()) {
    return normalizePage(null, normalized);
  }

  const key = SETTING_KEYS[normalized];
  const stored = await getSetting(key, null);
  if (!stored) {
    return normalizePage(null, normalized);
  }
  return normalizePage(stored, normalized);
}

async function updateLegalPage(slug, payload, updatedBy = 'admin') {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    throw new Error('Invalid legal page slug');
  }
  if (!isDbEnabled()) {
    throw new Error('Database not configured');
  }

  const title = String(payload?.title || '').trim();
  const content = String(payload?.content ?? '');
  const css_content = String(payload?.css_content ?? '');
  if (!title) throw new Error('title is required');
  if (!content.trim()) throw new Error('content is required');

  const next = {
    title,
    content,
    css_content,
    updated_by: String(updatedBy || 'admin').trim() || 'admin',
    updated_at: new Date().toISOString(),
  };

  await setSetting(SETTING_KEYS[normalized], next);
  return normalizePage(next, normalized);
}

/** Legal copy is admin-managed; do not auto-seed prose from the repository. */
async function seedLegalPagesIfEmpty() {
  return;
}

module.exports = {
  LEGAL_SLUGS,
  DEFAULT_CSS,
  PLACEHOLDERS,
  getLegalPage,
  updateLegalPage,
  seedLegalPagesIfEmpty,
  normalizeSlug,
};
