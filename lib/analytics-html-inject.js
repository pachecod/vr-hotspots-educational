const path = require('path');
const { getAnalyticsConfig } = require('./analytics-config');
const { resolveHostedHtmlRelativePath } = require('./hosted-serve');
const { readHostedFileUtf8 } = require('./hosted-b2-storage');

const ROOT_DIR = path.join(__dirname, '..');

function buildGoogleTagSnippet(measurementId) {
  const id = String(measurementId || '').trim();
  if (!/^G-[A-Z0-9]+$/i.test(id)) return '';
  return (
    `<!-- Google tag (gtag.js) -->\n` +
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>\n` +
    `<script>\n` +
    `  window.dataLayer = window.dataLayer || [];\n` +
    `  function gtag(){dataLayer.push(arguments);}\n` +
    `  gtag('js', new Date());\n` +
    `  gtag('config', '${id}');\n` +
    `</script>\n`
  );
}

function buildInjectionSnippet(config) {
  return buildGoogleTagSnippet(config.measurementId);
}

async function getAnalyticsSnippetForRequest(req) {
  const config = await getAnalyticsConfig(req);
  if (!config.enabled || !config.measurementId) return '';
  return buildGoogleTagSnippet(config.measurementId);
}

function injectAnalyticsIntoHtml(html, config) {
  const snippet = buildInjectionSnippet(config);
  if (!snippet) return html;
  const headMatch = html.match(/<head(\s[^>]*)?>/i);
  if (headMatch) {
    return html.replace(headMatch[0], headMatch[0] + '\n' + snippet);
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', snippet + '</head>');
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', snippet + '</body>');
  }
  return html + snippet;
}

function resolveRootHtmlFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (!decoded || decoded.includes('..')) return null;

  if (decoded === '/' || decoded === '/index.html') {
    return path.join(ROOT_DIR, 'index.html');
  }

  if (decoded === '/admin' || decoded === '/admin/') {
    return path.join(ROOT_DIR, 'admin.html');
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

  const fs = require('fs');
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

async function sendHostedHtmlWithAnalytics(req, res) {
  const config = await getAnalyticsConfig(req);
  if (!config.enabled) return false;

  const parsed = resolveHostedHtmlRelativePath(req.path || '/');
  if (!parsed) return false;

  let html;
  try {
    html = await readHostedFileUtf8(parsed.hostedPath, parsed.relativePath);
  } catch {
    return false;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(injectAnalyticsIntoHtml(html, config));
  return true;
}

function createAnalyticsHtmlMiddleware() {
  return async function analyticsHtmlMiddleware(req, res, next) {
    if (!shouldAttemptHtmlInjection(req)) return next();

    if (req.path.startsWith('/hosted/')) {
      try {
        const sent = await sendHostedHtmlWithAnalytics(req, res);
        if (sent) return;
      } catch (err) {
        console.error('Analytics hosted HTML injection error:', err);
      }
      return next();
    }

    const filePath = resolveRootHtmlFilePath(req.path || '/');
    if (!filePath) return next();

    const fs = require('fs');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
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
  buildGoogleTagSnippet,
  injectAnalyticsIntoHtml,
  getAnalyticsSnippetForRequest,
  createAnalyticsHtmlMiddleware,
};
