const { getSetting, setSetting } = require('./app-settings');
const { isDbEnabled } = require('../services/db-service');

const SYSTEM_TEXT_KEYS = ['welcome-screen', 'no-teams-signin', 'new-flat-page', 'no-samples'];

const SETTING_KEYS = {
  'welcome-screen': 'system_text_welcome_screen',
  'no-teams-signin': 'system_text_no_teams_signin',
  'new-flat-page': 'system_text_new_flat_page',
  'no-samples': 'system_text_no_samples',
};

const DEFAULT_WELCOME_SCREEN = {
  label: 'Welcome screen',
  content_html: `<h2>Welcome to the WebXRIDE<br/>Immersive Storytelling Tool</h2>
<p>Create 360° tours that work on desktop and mobile browsers and Quest headsets, along with traditional web pages that highlight your immersive content. You can also make storytelling worlds users can move through using WASD keys or thumbs (on mobile).</p>
<p>Choose how you'd like to get started.</p>`,
  updated_by: 'system',
};

const DEFAULT_NO_TEAMS_SIGNIN = {
  label: 'Sign-in: no teams or classes',
  content_html: `<p>No teams or classes currently exist in this install.</p>
<p>If you have admin access, open the <a href="/admin-users.html">Users</a> tab and add a team or class with a password. Then add users to that team or class.</p>
<p>After that, your users can sign in, upload their own content, and submit it to you to review as a team leader or teacher.</p>`,
  updated_by: 'system',
};

// Starter HTML for Welcome → Flat Web Page. Matches the flat editor's built-in page
// (flat-editor/defaults.js); until an admin saves their own, the editor keeps its built-in files.
const DEFAULT_NEW_FLAT_PAGE = {
  label: 'New flat page',
  content_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Flat Web Page</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>My Flat Web Page</h1>
    <p>Edit the HTML, CSS, and JavaScript tabs and watch the preview update live.</p>
    <button id="hello">Click me</button>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
  updated_by: 'system',
};

// Welcome / home samples column when no templates are marked as public samples.
const DEFAULT_NO_SAMPLES = {
  label: 'Samples: none available',
  content_html: `<h3 class="welcome-playground-title">Try a sample project</h3>
<p class="welcome-playground-empty">No public templates are available yet.</p>`,
  updated_by: 'system',
};

const DEFAULTS = {
  'welcome-screen': DEFAULT_WELCOME_SCREEN,
  'no-teams-signin': DEFAULT_NO_TEAMS_SIGNIN,
  'new-flat-page': DEFAULT_NEW_FLAT_PAGE,
  'no-samples': DEFAULT_NO_SAMPLES,
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
      customized: false,
    };
  }
  return {
    key,
    label: String(raw.label || fallback.label).trim() || fallback.label,
    content_html: String(raw.content_html ?? fallback.content_html),
    updated_by: raw.updated_by || fallback.updated_by || 'system',
    updated_at: raw.updated_at || new Date().toISOString(),
    customized: true,
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
