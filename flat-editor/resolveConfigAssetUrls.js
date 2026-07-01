/** Resolve same-origin asset paths in config for iframe preview (srcdoc + base href). */

const COMMON_ASSET_PATH_RE = /common-assets\/([^/]+)\/([^/?#]+)/;
const STUDENT_ASSET_PATH_RE = /student-assets\/([^/]+)\/([^/]+)\/([^/?#]+)/;

/** Extract category + filename from B2 or proxy URLs (mirrors lib/common-assets.js). */
export function parseCommonAssetFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(COMMON_ASSET_PATH_RE);
  if (!match) return null;
  try {
    const category = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    if (!category || !name) return null;
    return { category, name };
  } catch (_) {
    return null;
  }
}

export function toCommonAssetProxyPath(url) {
  const parsed = parseCommonAssetFromUrl(url);
  if (!parsed) return null;
  return `/common-assets/${encodeURIComponent(parsed.category)}/${encodeURIComponent(parsed.name)}`;
}

function toStudentAssetProxyPath(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/student-assets/')) return url.split(/[?#]/)[0];
  const match = url.match(STUDENT_ASSET_PATH_RE);
  if (!match) return null;
  try {
    const studentId = decodeURIComponent(match[1]);
    const category = decodeURIComponent(match[2]);
    const name = decodeURIComponent(match[3]);
    return `/student-assets/${studentId}/${category}/${encodeURIComponent(name)}`;
  } catch (_) {
    return null;
  }
}

function toProxyAssetPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/common-assets/') || trimmed.startsWith('/student-assets/')) {
    return trimmed.split(/[?#]/)[0];
  }
  return toCommonAssetProxyPath(trimmed) || toStudentAssetProxyPath(trimmed);
}

function toAbsoluteAssetUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const trimmed = value.trim();
  const proxy = toProxyAssetPath(trimmed);
  const base = String(origin || '').replace(/\/$/, '');

  if (proxy) {
    return base ? `${base}${proxy}` : proxy;
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (trimmed.startsWith('/student-assets/') || trimmed.startsWith('/common-assets/')) {
    return base ? `${base}${trimmed.split(/[?#]/)[0]}` : trimmed;
  }

  return value;
}

function walkResolve(node, origin) {
  if (typeof node === 'string') {
    return toAbsoluteAssetUrl(node, origin);
  }
  if (Array.isArray(node)) {
    return node.map((item) => walkResolve(item, origin));
  }
  if (node && typeof node === 'object') {
    const out = {};
    Object.keys(node).forEach((key) => {
      out[key] = walkResolve(node[key], origin);
    });
    return out;
  }
  return node;
}

export function resolveConfigAssetUrls(config, origin) {
  if (!config || typeof config !== 'object' || !origin) return config;
  try {
    return walkResolve(JSON.parse(JSON.stringify(config)), origin);
  } catch (_) {
    return config;
  }
}

/** Normalize a stored config string to a portable same-origin proxy path when possible. */
export function normalizeConfigAssetUrl(value) {
  if (value == null || value === '') return value;
  const proxy = toProxyAssetPath(String(value));
  return proxy || value;
}

/** Portable path for storing in config.json (same-origin proxy paths, full URL for remote). */
export function assetUrlForConfig(asset) {
  if (!asset) return '';

  if (typeof asset.proxyUrl === 'string' && asset.proxyUrl.trim()) {
    const fromProxy = toProxyAssetPath(asset.proxyUrl);
    if (fromProxy) return fromProxy;
  }

  if (typeof asset.url === 'string' && asset.url.startsWith('/student-assets/')) {
    return asset.url.split(/[?#]/)[0];
  }

  if (asset.category && asset.name) {
    return `/common-assets/${encodeURIComponent(asset.category)}/${encodeURIComponent(asset.name)}`;
  }

  const raw = asset.url || '';
  if (!raw) return '';

  const fromUrl = toProxyAssetPath(raw);
  if (fromUrl) return fromUrl;

  if (raw.startsWith('/')) return raw.split(/[?#]/)[0];

  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(raw, base);
    const pathOnly = parsed.pathname;
    if (pathOnly.startsWith('/common-assets/') || pathOnly.startsWith('/student-assets/')) {
      return pathOnly;
    }
    const fromB2Path = toCommonAssetProxyPath(parsed.href);
    if (fromB2Path) return fromB2Path;
    // External URLs (Unsplash, modelviewer.dev, etc.) — keep without auth noise
    if (parsed.search && /authorization=/i.test(parsed.search)) {
      return `${parsed.origin}${parsed.pathname}`;
    }
    return parsed.href;
  } catch (_) {
    return raw;
  }
}

/** Absolute URL for preview display (origin + same-origin path). */
export function assetUrlForPreview(asset) {
  const embedPath = assetUrlForConfig(asset);
  if (!embedPath) return '';
  if (/^https?:\/\//i.test(embedPath)) return embedPath;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + (embedPath.startsWith('/') ? embedPath : `/${embedPath}`);
  }
  return embedPath;
}
