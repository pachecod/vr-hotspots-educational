/** Relative path from flat-pages/<id>/index.html to the exported VR viewer at project root. */
export const LOCAL_VR_TOUR_EMBED_PATH = '../../index.html';

export function resolveAbsoluteUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + (url.startsWith('/') ? url : `/${url}`);
  }
  return url;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** HTML snippet for embedding the project's hosted VR viewer in a flat page. */
export function buildProjectVrInsertHtml(name, embedUrl) {
  const title = escapeAttr(name || '360° VR Tour');
  const src = escapeAttr(resolveAbsoluteUrl(embedUrl));
  if (!src) return '';
  return [
    '<!-- 360° VR tour from this project (Spherical Content) -->',
    `<iframe src="${src}" title="${title}" data-vr-tour-embed="1" style="width:100%;min-height:480px;height:70vh;border:0;display:block;margin:1rem auto;border-radius:8px;background:#111;" allow="fullscreen; vr; accelerometer; gyroscope"></iframe>`,
  ].join('\n');
}

/**
 * Rewrite VR tour iframe src in flat page HTML for export packaging.
 * @param {string} html
 * @param {{ hostedUrl?: string, useOnlineUrl?: boolean }} options
 */
export function rewriteVrTourEmbedsInHtml(html, { hostedUrl = '', useOnlineUrl = true } = {}) {
  if (!html) return html;
  const onlineSrc = resolveAbsoluteUrl(hostedUrl);
  const targetSrc = useOnlineUrl && onlineSrc ? onlineSrc : LOCAL_VR_TOUR_EMBED_PATH;

  const iframeRe =
    /<iframe\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>/gi;
  let out = html.replace(iframeRe, (match, attrs) => {
    let next = attrs.replace(/\ssrc=(["'])[^"']*\1/i, '');
    next = next.trim();
    return `<iframe src="${escapeAttr(targetSrc)}" ${next}>`;
  });

  if (hostedUrl) {
    const hostedAbs = escapeAttr(onlineSrc);
    const hostedPath = hostedUrl.startsWith('/') ? hostedUrl : '';
    if (hostedPath) {
      const pathRe = new RegExp(
        `<iframe\\b([^>]*)\\ssrc=(["'])${hostedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\2([^>]*)>`,
        'gi'
      );
      out = out.replace(pathRe, (match, before, quote, after) => {
        const attrs = `${before}${after}`;
        if (/data-vr-tour-embed/i.test(attrs)) return match;
        const withoutSrc = attrs.replace(/\ssrc=(["'])[^"']*\1/i, '');
        return `<iframe src="${escapeAttr(targetSrc)}" data-vr-tour-embed="1"${withoutSrc}>`;
      });
    }
  }

  return out;
}
