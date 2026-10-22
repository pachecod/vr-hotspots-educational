import { resolveAbsoluteUrl, deriveQrUrlFromTourUrl } from './vrTourEmbed.js';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Absolute QR image URL for a hosted flat page index.html URL. */
export function flatPageQrImageUrl(hostedUrl) {
  const absolute = resolveAbsoluteUrl(hostedUrl || '');
  if (!absolute) return '';
  return deriveQrUrlFromTourUrl(absolute) || '';
}

/** Prefer /api/vr-tour/qr?url=… so the PNG always encodes the current hosted URL. */
export function flatPageQrApiUrl(hostedUrl) {
  const absolute = resolveAbsoluteUrl(hostedUrl || '');
  if (!absolute) return '';
  return `/api/vr-tour/qr?url=${encodeURIComponent(absolute)}`;
}

export function resolveFlatPageQrSrc(hostedUrl, qrUrl) {
  if (qrUrl) return resolveAbsoluteUrl(qrUrl) || qrUrl;
  const api = flatPageQrApiUrl(hostedUrl);
  if (api) {
    if (typeof window !== 'undefined' && window.location?.origin && api.startsWith('/')) {
      return window.location.origin + api;
    }
    return api;
  }
  return flatPageQrImageUrl(hostedUrl);
}

export function stripExistingFlatPageQr(html) {
  if (!html || !html.includes('data-flat-page-qr')) return html || '';
  let next = String(html);
  next = next.replace(
    /<!--\s*Flat page QR[\s\S]*?-->\s*/gi,
    ''
  );
  // Legacy fixed-corner / figure wrappers from earlier 3.8.2 builds
  next = next.replace(
    /<style[^>]*>[\s\S]*?\.flat-page-qr-corner[\s\S]*?<\/style>\s*/gi,
    ''
  );
  next = next.replace(/<div[^>]*data-flat-page-qr="1"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  next = next.replace(/<figure[^>]*data-flat-page-qr="1"[^>]*>[\s\S]*?<\/figure>\s*/gi, '');
  next = next.replace(/<p\b[^>]*\bdata-flat-page-qr=["']1["'][^>]*>[\s\S]*?<\/p>\s*/gi, '');
  next = next.replace(/<img\b[^>]*\bdata-flat-page-qr=["']1["'][^>]*\/?>\s*/gi, '');
  return next;
}

export function hasFlatPageQr(html) {
  return /data-flat-page-qr\s*=\s*["']?1["']?/i.test(html || '');
}

/** Insert position strictly before </body> (or end of document). */
export function bodyCloseInsertPos(html) {
  const content = html || '';
  const bodyClose = content.lastIndexOf('</body>');
  if (bodyClose !== -1) return bodyClose;
  return content.length;
}

/** Flat-page QR (Editing Tools → QR Code): a self-contained, centered 160×160 block. */
export function buildFlatPageQrHtml(hostedUrl, qrUrl) {
  const pageUrl = resolveAbsoluteUrl(hostedUrl || '');
  const qrSrc = resolveFlatPageQrSrc(hostedUrl, qrUrl);
  if (!pageUrl || !qrSrc) return '';
  const pageAttr = escapeAttr(pageUrl);
  const qrAttr = escapeAttr(qrSrc);
  return [
    '<!-- Flat page QR (scan to open this hosted page) -->',
    `<div class="page-qr" data-flat-page-qr="1" data-flat-page-url="${pageAttr}" style="text-align:center;margin:24px auto;">`,
    '<p style="margin:0 0 8px;">View on Your Phone</p>',
    `<img src="${qrAttr}" alt="Scan to open this page on your phone" width="160" height="160">`,
    '</div>',
  ].join('\n');
}
