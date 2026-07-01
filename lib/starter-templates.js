const fs = require('fs');
const path = require('path');

const STARTER_DIR = path.join(__dirname, '..', 'starter-templates');
const STARTER_FILES = ['index.html', 'style.css', 'script.js', 'config.json', 'config.ui.json'];

function slugToTitle(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function safeSlug(slug) {
  const safe = String(slug || '')
    .trim()
    .replace(/[^a-z0-9-]/gi, '');
  if (!safe) return null;
  const base = path.resolve(STARTER_DIR);
  const dir = path.resolve(STARTER_DIR, safe);
  if (dir !== base && !dir.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  return safe;
}

function listStarterTemplates() {
  if (!fs.existsSync(STARTER_DIR)) return [];
  return fs
    .readdirSync(STARTER_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      const indexPath = path.join(STARTER_DIR, slug, 'index.html');
      if (!fs.existsSync(indexPath)) return null;
      return { slug, title: slugToTitle(slug) };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function loadStarterTemplate(slug) {
  const safe = safeSlug(slug);
  if (!safe) throw new Error('Invalid starter template slug');

  const dir = path.join(STARTER_DIR, safe);
  const files_manifest = [];

  for (const name of STARTER_FILES) {
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) continue;
    files_manifest.push({ name, content: fs.readFileSync(filePath, 'utf8') });
  }

  if (!files_manifest.some((f) => f.name === 'index.html')) {
    throw new Error(`Starter template "${safe}" is missing index.html`);
  }

  return {
    title: slugToTitle(safe),
    slug: safe,
    files_manifest,
    scope: 'flat',
  };
}

module.exports = {
  STARTER_DIR,
  listStarterTemplates,
  loadStarterTemplate,
};
