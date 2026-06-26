const path = require('path');
const fs = require('fs');

const FLAT_PAGES_FOLDER = 'flat-pages';
const DEFAULT_PAGE_ID = 'main';
const HOSTED_ROOT = 'hosted-projects';

function findFlatPageRelativePath(hostedDir) {
  if (!hostedDir || !fs.existsSync(hostedDir)) return null;

  const flatRoot = path.join(hostedDir, FLAT_PAGES_FOLDER);
  if (!fs.existsSync(flatRoot)) return null;

  let pageId = null;
  const configPath = path.join(hostedDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const flatPages = config.flatPages;
      if (flatPages && typeof flatPages === 'object') {
        if (flatPages.activePageId && flatPages.pages && flatPages.pages[flatPages.activePageId]) {
          pageId = flatPages.activePageId;
        } else if (flatPages.pages && typeof flatPages.pages === 'object') {
          pageId = Object.keys(flatPages.pages)[0];
        }
      }
    } catch (_) {}
  }

  if (pageId) {
    const candidate = path.join(flatRoot, pageId, 'index.html');
    if (fs.existsSync(candidate)) {
      return `${FLAT_PAGES_FOLDER}/${pageId}/index.html`;
    }
  }

  if (fs.existsSync(path.join(flatRoot, DEFAULT_PAGE_ID, 'index.html'))) {
    return `${FLAT_PAGES_FOLDER}/${DEFAULT_PAGE_ID}/index.html`;
  }

  try {
    const dirs = fs.readdirSync(flatRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      if (fs.existsSync(path.join(flatRoot, dir.name, 'index.html'))) {
        return `${FLAT_PAGES_FOLDER}/${dir.name}/index.html`;
      }
    }
  } catch (_) {}

  return null;
}

function resolveHostedProjectUrls(urlPath, hostedDirOptional) {
  const dir = hostedDirOptional || path.join(process.cwd(), HOSTED_ROOT, urlPath);
  const tourUrl = `/hosted/${urlPath}/index.html`;
  const flatRel = findFlatPageRelativePath(dir);
  const flatPageUrl = flatRel ? `/hosted/${urlPath}/${flatRel.replace(/\\/g, '/')}` : null;
  return {
    tourUrl,
    flatPageUrl,
    hostedPath: urlPath,
  };
}

function enrichInboxItem(item) {
  if (!item.hostedPath && !item.hostedUrl) return item;
  const urlPath =
    item.hostedPath ||
    (item.hostedUrl && item.hostedUrl.match(/^\/hosted\/([^/]+)/)?.[1]);
  if (!urlPath) return item;
  const urls = resolveHostedProjectUrls(urlPath);
  return {
    ...item,
    hostedUrl: item.hostedUrl || urls.tourUrl,
    tourUrl: urls.tourUrl,
    flatPageUrl: urls.flatPageUrl,
  };
}

function enrichInboxHosting(inbox) {
  return inbox.map(enrichInboxItem);
}

module.exports = {
  resolveHostedProjectUrls,
  enrichInboxHosting,
  findFlatPageRelativePath,
};
