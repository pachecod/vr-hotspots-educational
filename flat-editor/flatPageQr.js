import { resolveAbsoluteUrl, deriveQrUrlFromTourUrl } from './vrTourEmbed.js';

const FLAT_PAGE_QR_MARKER = 'data-flat-page-qr="1"';

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
  // Remove style + block blocks that carry the marker.
  next = next.replace(
    /<!--\s*Flat page QR[\s\S]*?-->\s*<style[^>]*>[\s\S]*?<\/style>\s*<div[^>]*data-flat-page-qr="1"[^>]*>[\s\S]*?<\/div>\s*/gi,
    ''
  );
  next = next.replace(/<div[^>]*data-flat-page-qr="1"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
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

/** Fixed bottom-right corner QR (button inject). */
export function buildFlatPageQrCornerHtml(hostedUrl, qrUrl) {
  const pageUrl = resolveAbsoluteUrl(hostedUrl || '');
  const qrSrc = resolveFlatPageQrSrc(hostedUrl, qrUrl);
  if (!pageUrl || !qrSrc) return '';
  const pageAttr = escapeAttr(pageUrl);
  const qrAttr = escapeAttr(qrSrc);
  return [
    '<!-- Flat page QR (scan to open this hosted page) -->',
    `<style>
  .flat-page-qr-corner[${FLAT_PAGE_QR_MARKER}] {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 9999;
    margin: 0;
    padding: 10px 10px 8px;
    background: rgba(255,255,255,0.95);
    border: 1px solid #ddd;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    text-align: center;
    max-width: 160px;
    font-family: system-ui, sans-serif;
  }
  .flat-page-qr-corner .flat-page-qr-label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: #333;
    line-height: 1.3;
  }
  .flat-page-qr-corner img {
    display: block;
    width: 120px;
    height: 120px;
    margin: 0 auto;
    border-radius: 4px;
  }
</style>`,
    `<div class="flat-page-qr-corner" ${FLAT_PAGE_QR_MARKER} data-flat-page-url="${pageAttr}">
  <p class="flat-page-qr-label">Scan to open this page</p>
  <img src="${qrAttr}" alt="QR code to open this web page" width="120" height="120" />
</div>`,
  ].join('\n');
}

/** Inline/block QR for cursor insert via Online Assets. */
export function buildFlatPageQrInlineHtml(hostedUrl, qrUrl) {
  const pageUrl = resolveAbsoluteUrl(hostedUrl || '');
  const qrSrc = resolveFlatPageQrSrc(hostedUrl, qrUrl);
  if (!pageUrl || !qrSrc) return '';
  const pageAttr = escapeAttr(pageUrl);
  const qrAttr = escapeAttr(qrSrc);
  return [
    '<!-- Flat page QR (inline) -->',
    `<figure class="flat-page-qr-inline" ${FLAT_PAGE_QR_MARKER} data-flat-page-url="${pageAttr}" style="display:inline-block;margin:1rem;text-align:center;max-width:160px;">
  <img src="${qrAttr}" alt="QR code to open this web page" width="120" height="120" style="display:block;border-radius:4px;background:#fff;padding:4px;" />
  <figcaption style="margin-top:6px;font-size:12px;color:#555;">Scan to open this page</figcaption>
</figure>`,
  ].join('\n');
}
