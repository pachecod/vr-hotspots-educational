const fs = require('fs');
const path = require('path');
const { getAnalyticsConfig } = require('./analytics-config');

const ROOT_DIR = path.join(__dirname, '..');
const HOSTED_DIR = path.join(ROOT_DIR, 'hosted-projects');

function buildInjectionSnippet(config) {
  const payload = JSON.stringify({
    enabled: true,
    measurementId: config.measurementId,
  });
  return (
    `<script>window.__ANALYTICS__=${payload};</script>\n` +
    `<script src="/analytics.js" defer></script>\n`
  );
}

function injectAnalyticsIntoHtml(html, config) {
  const snippet = buildInjectionSnippet(config);
  if (html.includes('</head>')) {
    return html.replace('</head>', snippet + '</head>');
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', snippet + '</body>');
  }
  return html + snippet;
}

function resolveHtmlFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (!decoded || decoded.includes('..')) return null;

  if (decoded === '/' || decoded === '/index.html') {
    return path.join(ROOT_DIR, 'index.html');
  }

  if (decoded === '/admin' || decoded === '/admin/') {
    return path.join(ROOT_DIR, 'admin.html');
  }

  if (decoded.startsWith('/hosted/')) {
    let rel = decoded.slice('/hosted/'.length);
    if (!rel) return null;
    if (rel.endsWith('/')) rel += 'index.html';
    if (!rel.endsWith('.html') && !path.extname(rel)) {
      rel = path.join(rel, 'index.html');
    }
    if (!/\.html?$/i.test(rel)) return null;
    const filePath = path.join(HOSTED_DIR, rel);
    if (!filePath.startsWith(HOSTED_DIR)) return null;
    return filePath;
  }

  if (!decoded.endsWith('.html')) return null;
  const filePath = path.join(ROOT_DIR, decoded.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT_DIR)) return null;
  return filePath;
}

function shouldAttemptHtmlInjection(req) {
  if (req.method !== 'GET') return false;
  const urlPath = req.path || '/';
  if (urlPath === '/') return true;
  if (urlPath === '/admin' || urlPath === '/admin/') return true;
  if (urlPath.endsWith('.html')) return true;
  if (urlPath.startsWith('/hosted/')) {
    return /\.html?$/i.test(urlPath.split('?')[0]);
  }
  return false;
}

async function sendHtmlWithAnalytics(req, res, filePath) {
  const config = await getAnalyticsConfig(req);
  if (!config.enabled) return false;

  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(injectAnalyticsIntoHtml(html, config));
  return true;
}

function createAnalyticsHtmlMiddleware() {
  return async function analyticsHtmlMiddleware(req, res, next) {
    if (!shouldAttemptHtmlInjection(req)) return next();

    const filePath = resolveHtmlFilePath(req.path || '/');
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next();
    }

    try {
      const sent = await sendHtmlWithAnalytics(req, res, filePath);
      if (sent) return;
    } catch (err) {
      console.error('Analytics HTML injection error:', err);
    }

    return next();
  };
}

module.exports = {
  buildInjectionSnippet,
  injectAnalyticsIntoHtml,
  resolveHtmlFilePath,
  sendHtmlWithAnalytics,
  createAnalyticsHtmlMiddleware,
};
