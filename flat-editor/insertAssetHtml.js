const AFRAME_CDN = 'https://aframe.io/releases/1.7.1/aframe.min.js';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function getAssetMediaUrl(asset) {
  if (!asset) return '';
  const raw = asset.proxyUrl || asset.url || '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + (raw.startsWith('/') ? raw : `/${raw}`);
  }
  return raw;
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
      return [
        '<!-- 3D model viewer -->',
        `<script src="${AFRAME_CDN}"></script>`,
        '<a-scene embedded style="height:400px;width:100%;">',
        `  <a-entity gltf-model="url: ${urlAttr}" position="0 1.6 -3"></a-entity>`,
        '  <a-camera position="0 1.6 0"></a-camera>',
        '</a-scene>',
      ].join('\n');

    default:
      return `<a href="${urlAttr}" target="_blank" rel="noopener noreferrer">${name}</a>`;
  }
}
