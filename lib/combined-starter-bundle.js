const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { STARTER_DIR, safeSlug } = require('./starter-templates');
const { sanitizeFlatPageVrEmbed, assertBundleSafeFlatPage } = require('./bundle-vr-embed');

const SKIP_FILE_NAMES = new Set(['.DS_Store']);
const SKIP_FILE_PREFIXES = ['README', 'sync-', 'package-', 'validate-'];

function shouldIncludeZipEntry(relPath) {
  const base = path.basename(relPath);
  if (SKIP_FILE_NAMES.has(base)) return false;
  return !SKIP_FILE_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function isCombinedStarterDir(dir) {
  const configPath = path.join(dir, 'config.json');
  if (!fs.existsSync(configPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return !!(config.flatPages && config.scenes && Object.keys(config.scenes).length);
  } catch (_) {
    return false;
  }
}

function listCombinedStarterTemplates() {
  if (!fs.existsSync(STARTER_DIR)) return [];
  return fs
    .readdirSync(STARTER_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(STARTER_DIR, entry.name);
      if (!isCombinedStarterDir(dir)) return null;
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
      return {
        slug: entry.name,
        title: config.name || entry.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function syncFlatPagesFromDisk(config, starterDir) {
  const pageDir = path.join(starterDir, 'flat-pages', 'main');
  if (!fs.existsSync(pageDir)) return config;
  const fileDefs = [
    { id: 'index.html', name: 'index.html', type: 'html' },
    { id: 'style.css', name: 'style.css', type: 'css' },
    { id: 'script.js', name: 'script.js', type: 'javascript' },
  ];
  const files = fileDefs.map((def) => {
    let content = fs.readFileSync(path.join(pageDir, def.name), 'utf8');
    if (def.id === 'index.html') {
      content = sanitizeFlatPageVrEmbed(content);
      assertBundleSafeFlatPage(content, `${def.name}`);
    }
    return { ...def, content };
  });
  const manifestPath = path.join(pageDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { name: 'Landing Page' };
  config.flatPages = {
    version: '2.5',
    activePageId: 'main',
    pages: {
      main: {
        id: 'main',
        name: manifest.name || 'Landing Page',
        framework: 'html',
        files,
      },
    },
  };
  config.vrTourEmbed = {
    hostedUrl: null,
    hostedPath: null,
    qrUrl: null,
    publishedAt: null,
  };
  return config;
}

function prepareCombinedStarterConfig(starterDir) {
  const configPath = path.join(starterDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  syncFlatPagesFromDisk(config, starterDir);
  const indexHtml =
    config.flatPages?.pages?.main?.files?.find((f) => f.id === 'index.html')?.content || '';
  if (indexHtml) assertBundleSafeFlatPage(indexHtml, 'config.json flatPages');
  return config;
}

function addDirectoryToZip(zip, dir, zipPrefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (!shouldIncludeZipEntry(rel)) continue;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, full, rel);
    } else if (entry.name !== 'config.json') {
      zip.addFile(rel, fs.readFileSync(full));
    }
  }
}

function buildCombinedStarterZipBuffer(slug) {
  const safe = safeSlug(slug);
  if (!safe) throw new Error('Invalid starter template slug');
  const starterDir = path.join(STARTER_DIR, safe);
  if (!isCombinedStarterDir(starterDir)) {
    throw new Error(`"${safe}" is not a combined starter (needs scenes + flatPages in config.json)`);
  }

  const config = prepareCombinedStarterConfig(starterDir);
  const zip = new AdmZip();
  addDirectoryToZip(zip, starterDir);
  zip.addFile('config.json', Buffer.from(`${JSON.stringify(config, null, 2)}\n`, 'utf8'));
  return zip.toBuffer();
}

module.exports = {
  isCombinedStarterDir,
  listCombinedStarterTemplates,
  buildCombinedStarterZipBuffer,
  prepareCombinedStarterConfig,
};
