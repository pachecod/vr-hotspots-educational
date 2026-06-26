const AFRAME_CDN = 'https://aframe.io/releases/1.7.1/aframe.min.js';
const MODEL_VIEWER_CDN = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
import { buildProjectVrInsertHtml } from './vrTourEmbed.js';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Prefer a same-origin proxy path so assets load in the flat editor preview and on Render. */
export function getAssetEmbedPath(asset) {
  if (!asset) return '';

  if (typeof asset.url === 'string' && asset.url.startsWith('/student-assets/')) {
    return asset.url.split('#')[0];
  }

  if (asset.category && asset.name) {
    return `/common-assets/${encodeURIComponent(asset.category)}/${encodeURIComponent(asset.name)}`;
  }

  const raw = asset.proxyUrl || asset.url || '';
  if (!raw) return '';

  if (raw.startsWith('/')) {
    return raw.split('#')[0];
  }

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

export function getAssetMediaUrl(asset) {
  const embedPath = getAssetEmbedPath(asset);
  if (!embedPath) return '';
  if (/^https?:\/\//i.test(embedPath)) return embedPath;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + (embedPath.startsWith('/') ? embedPath : `/${embedPath}`);
  }
  return embedPath;
}

export function defaultHtmlInsertPos(html) {
  const content = html || '';
  const mainClose = content.lastIndexOf('</main>');
  if (mainClose !== -1) return mainClose;
  const bodyClose = content.lastIndexOf('</body>');
  if (bodyClose !== -1) return bodyClose;
  return content.length;
}

/** Build HTML snippet to insert for a common-assets library item. */
export function buildInsertHtml(category, asset) {
  const url = getAssetMediaUrl(asset);
  if (!url) return '';
  const name = escapeAttr(asset?.name || 'asset');
  const urlAttr = escapeAttr(url);

  switch (category) {
    case 'images':
      return `<img src="${urlAttr}" alt="${name}" style="max-width:100%;height:auto;display:block;margin:1rem auto;" />`;

    case 'videos':
      return `<video src="${urlAttr}" controls playsinline style="max-width:100%;width:100%;display:block;margin:1rem auto;"></video>`;

    case 'audio':
      return `<audio src="${urlAttr}" controls style="width:100%;max-width:480px;display:block;margin:1rem auto;"></audio>`;

    case '360-images':
      return [
        '<!-- 360° image viewer -->',
        `<script src="${AFRAME_CDN}"></script>`,
        '<a-scene embedded style="height:400px;width:100%;">',
        `  <a-sky src="${urlAttr}" rotation="0 -90 0"></a-sky>`,
        '  <a-camera></a-camera>',
        '</a-scene>',
      ].join('\n');

    case '360-videos':
      return [
        '<!-- 360° video viewer -->',
        `<script src="${AFRAME_CDN}"></script>`,
        '<a-scene embedded style="height:400px;width:100%;">',
        `  <a-videosphere src="${urlAttr}" rotation="0 -90 0"></a-videosphere>`,
        '  <a-camera></a-camera>',
        '</a-scene>',
      ].join('\n');

    case '3d':
      // model-viewer works in the flat editor's srcdoc preview (nested A-Frame iframes do not).
      {
        const modelPath = getAssetEmbedPath(asset);
        const modelSrc = escapeAttr(getAssetMediaUrl({ ...asset, proxyUrl: modelPath, url: modelPath }));
        return [
          '<!-- 3D model viewer -->',
          `<script type="module" src="${MODEL_VIEWER_CDN}"></script>`,
          `<model-viewer src="${modelSrc}" alt="${name}" camera-controls auto-rotate shadow-intensity="1" style="width:100%;height:400px;background:#ececec;"></model-viewer>`,
        ].join('\n');
      }

    case 'project-vr':
      return buildProjectVrInsertHtml(asset?.name, asset?.embedUrl || asset?.url, asset?.qrUrl);

    default:
      return `<a href="${urlAttr}" target="_blank" rel="noopener noreferrer">${name}</a>`;
  }
}
