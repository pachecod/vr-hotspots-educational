const { getSetting, setSetting } = require('./app-settings');
const { isDbEnabled } = require('../services/db-service');

const SYSTEM_TEXT_KEYS = ['welcome-screen'];

const SETTING_KEYS = {
  'welcome-screen': 'system_text_welcome_screen',
};

const DEFAULT_WELCOME_SCREEN = {
  label: 'Welcome screen',
  content_html: `<h2>Welcome to the WebXRIDE<br/>Immersive Storytelling Tool</h2>
<p>Create 360° tours that work on desktop and mobile browsers and Quest headsets, along with traditional web pages that highlight your immersive content. You can also make storytelling worlds users can move through using WASD keys or thumbs (on mobile).</p>
<p>Choose how you'd like to get started.</p>`,
  updated_by: 'system',
};

const DEFAULTS = {
  'welcome-screen': DEFAULT_WELCOME_SCREEN,
};

function normalizeKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return SYSTEM_TEXT_KEYS.includes(k) ? k : null;
}

function normalizeText(raw, key) {
  const fallback = DEFAULTS[key];
  if (!raw || typeof raw !== 'object') {
    return {
      key,
      label: fallback.label,
      content_html: fallback.content_html,
      updated_by: fallback.updated_by,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    key,
    label: String(raw.label || fallback.label).trim() || fallback.label,
    content_html: String(raw.content_html ?? fallback.content_html),
    updated_by: raw.updated_by || fallback.updated_by || 'system',
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

async function getSystemText(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return null;

  if (!isDbEnabled()) {
    return normalizeText(null, normalized);
  }

  const stored = await getSetting(SETTING_KEYS[normalized], null);
  if (!stored) {
    return normalizeText(null, normalized);
  }
  return normalizeText(stored, normalized);
}

async function updateSystemText(key, payload, updatedBy = 'admin') {
  const normalized = normalizeKey(key);
  if (!normalized) {
    throw new Error('Invalid system text key');
  }
  if (!isDbEnabled()) {
    throw new Error('Database not configured');
  }

  const content_html = String(payload?.content_html ?? '');
  if (!content_html.trim()) {
    throw new Error('content_html is required');
  }

  const fallback = DEFAULTS[normalized];
  const next = {
    label: String(payload?.label || fallback.label).trim() || fallback.label,
    content_html,
    updated_by: String(updatedBy || 'admin').trim() || 'admin',
    updated_at: new Date().toISOString(),
  };

  await setSetting(SETTING_KEYS[normalized], next);
  return normalizeText(next, normalized);
}

module.exports = {
  SYSTEM_TEXT_KEYS,
  DEFAULTS,
  getSystemText,
  updateSystemText,
  normalizeKey,
};
