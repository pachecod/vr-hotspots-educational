/** Resolve same-origin asset paths in config for iframe preview (srcdoc + base href). */

function toAbsoluteAssetUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    trimmed.startsWith('/student-assets/') ||
    trimmed.startsWith('/common-assets/')
  ) {
    const base = String(origin || '').replace(/\/$/, '');
    return base ? `${base}${trimmed}` : trimmed;
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

/** Portable path for storing in config.json (same-origin proxy paths, full URL for remote). */
export function assetUrlForConfig(asset) {
  if (!asset) return '';
  if (typeof asset.url === 'string' && asset.url.startsWith('/student-assets/')) {
    return asset.url.split('#')[0];
  }
  if (asset.category && asset.name) {
    return `/common-assets/${encodeURIComponent(asset.category)}/${encodeURIComponent(asset.name)}`;
  }
  const raw = asset.proxyUrl || asset.url || '';
  if (!raw) return '';
  if (raw.startsWith('/')) return raw.split('#')[0];
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(raw, base);
    const path = parsed.pathname + parsed.search;
    if (
      path.startsWith('/common-assets/') ||
      path.startsWith('/student-assets/') ||
      path.startsWith('/api/')
    ) {
      return path;
    }
    return parsed.href;
  } catch (_) {
    return raw;
  }
}

/** Absolute URL for preview and display (origin + same-origin path). */
export function assetUrlForPreview(asset) {
  const embedPath = assetUrlForConfig(asset);
  if (!embedPath) return '';
  if (/^https?:\/\//i.test(embedPath)) return embedPath;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + (embedPath.startsWith('/') ? embedPath : `/${embedPath}`);
  }
  return embedPath;
}
