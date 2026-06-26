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

export function deriveQrUrlFromTourUrl(embedUrl) {
  if (!embedUrl) return '';
  return resolveAbsoluteUrl(embedUrl).replace(/index\.html(\?.*)?$/i, 'qr.png');
}

const VR_TOUR_EMBED_STYLES = [
  '.vr-tour-embed{margin:1rem auto;max-width:100%;text-align:center;}',
  '.vr-tour-embed iframe{width:100%;min-height:480px;height:70vh;border:0;display:block;border-radius:8px;background:#111;}',
  '.vr-tour-mobile-label{margin:1rem 0 0.5rem;font-size:1rem;font-weight:600;color:#333;}',
  '.vr-tour-mobile-qr-img{display:inline-block;border-radius:4px;margin-bottom:1rem;}',
  '@media (max-width:767px){.vr-tour-mobile-label,.vr-tour-mobile-qr-img{display:none;}}',
].join('');

/** HTML snippet for embedding the project's hosted VR viewer in a flat page. */
export function buildProjectVrInsertHtml(name, embedUrl, qrUrl) {
  const title = escapeAttr(name || '360° VR Tour');
  const src = escapeAttr(resolveAbsoluteUrl(embedUrl));
  if (!src) return '';
  const qrSrc = escapeAttr(qrUrl ? resolveAbsoluteUrl(qrUrl) : deriveQrUrlFromTourUrl(embedUrl));
  return [
    '<!-- 360° VR tour from this project (Spherical Content) -->',
    `<style>${VR_TOUR_EMBED_STYLES}</style>`,
    `<div class="vr-tour-embed" data-vr-tour-embed="1" data-vr-tour-url="${src}">`,
    `<iframe src="${src}" title="${title}" allow="fullscreen; vr; accelerometer; gyroscope"></iframe>`,
    '<p class="vr-tour-mobile-label">View on Your Phone</p>',
    `<img class="vr-tour-mobile-qr-img" src="${qrSrc}" alt="Scan to open this 360° tour on your phone" width="160" height="160" />`,
    '</div>',
  ].join('\n');
}

function rewriteIframeOpenTag(attrs, targetSrc) {
  let next = attrs.replace(/\ssrc=(["'])[^"']*\1/i, '').trim();
  return `<iframe src="${escapeAttr(targetSrc)}" ${next}>`;
}

function rewriteWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl, qrSrc, showQr) {
  let updatedInner = inner.replace(/<iframe\b([^>]*)>/i, (m, attrs) => rewriteIframeOpenTag(attrs, targetSrc));

  if (showQr && qrSrc) {
    updatedInner = updatedInner.replace(
      /(<img\b[^>]*\bvr-tour-mobile-qr-img\b[^>]*\ssrc=)(["'])[^"']*\2/i,
      `$1"${escapeAttr(qrSrc)}"`
    );
    updatedInner = updatedInner.replace(
      /(<p\b[^>]*\bvr-tour-mobile-label\b[^>]*)(>)/i,
      (m, start, end) => start.replace(/\sstyle=(["'])[^"']*\1/i, '') + end
    );
    updatedInner = updatedInner.replace(
      /(<img\b[^>]*\bvr-tour-mobile-qr-img\b[^>]*)(>)/i,
      (m, start, end) => start.replace(/\sstyle=(["'])[^"']*\1/i, '') + end
    );
  } else {
    updatedInner = updatedInner.replace(
      /(<p\b[^>]*\bvr-tour-mobile-label\b[^>]*)(>)/i,
      '$1 style="display:none"$2'
    );
    updatedInner = updatedInner.replace(
      /(<img\b[^>]*\bvr-tour-mobile-qr-img\b[^>]*)(>)/i,
      '$1 style="display:none"$2'
    );
  }

  let updatedDivAttrs = divAttrs.replace(/\sdata-vr-tour-url=(["'])[^"']*\1/i, '').trim();
  return `<div ${updatedDivAttrs} data-vr-tour-url="${escapeAttr(tourUrl)}">${updatedInner}</div>`;
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
  const tourUrl = useOnlineUrl && onlineSrc ? onlineSrc : targetSrc;
  const qrSrc = useOnlineUrl && onlineSrc ? deriveQrUrlFromTourUrl(onlineSrc) : '';
  const showQr = Boolean(qrSrc);

  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let out = html.replace(wrapperRe, (match, divAttrs, inner) =>
    rewriteWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl, qrSrc, showQr)
  );

  const iframeRe = /<iframe\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>/gi;
  out = out.replace(iframeRe, (match, attrs) => rewriteIframeOpenTag(attrs, targetSrc));

  if (hostedUrl) {
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
