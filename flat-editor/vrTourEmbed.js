/** Relative path from flat-pages/<id>/index.html to the exported VR viewer at project root. */
export const LOCAL_VR_TOUR_EMBED_PATH = '../../index.html?embed=1';

/** Same-origin viewer URL when flat preview runs inside the live editor (not a bundle ZIP). */
export const EDITOR_PREVIEW_VR_TOUR_EMBED_PATH = '/index.html?embed=1';

export function isGuestEditor() {
  if (typeof window === 'undefined') return false;
  if (window.editorAccessMode === 'local_test') return true;
  if (typeof window.getEditorCapabilities === 'function') {
    return !!window.getEditorCapabilities().isTestUser;
  }
  return false;
}

export function getEditorPreviewVrTourEmbedUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${EDITOR_PREVIEW_VR_TOUR_EMBED_PATH}`;
  }
  return EDITOR_PREVIEW_VR_TOUR_EMBED_PATH;
}

function extractHostedTourUrl(divAttrs, inner) {
  const blob = `${divAttrs || ''} ${inner || ''}`;
  const match = blob.match(
    /(?:data-vr-tour-url|\ssrc)=(["'])(https?:\/\/[^"']+\/index\.html(?:\?[^"']*)?)\1/i
  );
  return match ? match[2] : '';
}

function tourQrPreviewSrc(tourUrl) {
  if (!tourUrl || !/\/hosted\/[^"']+\/index\.html/i.test(tourUrl)) return '';
  return `/api/vr-tour/qr?url=${encodeURIComponent(tourUrl)}`;
}

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

export function withEmbedQuery(url) {
  if (!url) return url;
  if (/[?&]embed=1(?:&|$)/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}embed=1`;
}

const VR_TOUR_EMBED_IFRAME_CSS =
  'width:100%;height:100dvh;min-height:100dvh;border:0;display:block;border-radius:8px;background:#111;';

const GUEST_VR_TOUR_EMBED_STYLES = [
  '.vr-tour-embed{margin:0 auto;max-width:100%;text-align:center;}',
  `.vr-tour-embed iframe{${VR_TOUR_EMBED_IFRAME_CSS}}`,
  '.vr-tour-mobile-label{margin:1rem 0 0.5rem;font-size:1rem;font-weight:600;color:#333;}',
  '.vr-tour-mobile-qr-img{display:inline-block;border-radius:4px;margin-bottom:1rem;}',
].join('');

function buildSignedInStyleBlock() {
  return `<style>
  .vr-tour-embed { margin: 0 auto; max-width: 100%; text-align: center; }
  .vr-tour-embed iframe { ${VR_TOUR_EMBED_IFRAME_CSS} }
  .vr-tour-mobile-section { margin-top: 1.5rem; text-align: center; }
  .vr-tour-mobile-label { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; color: #333; }
  .vr-tour-mobile-qr-img { display: inline-block; border-radius: 4px; }
</style>`;
}

function stripQrFromEmbedInner(inner) {
  return String(inner || '')
    .replace(/<div\b[^>]*\bvr-tour-mobile-section\b[^>]*>[\s\S]*?<\/div>\s*/gi, '')
    .replace(/<p\b[^>]*\bvr-tour-mobile-label\b[^>]*>[\s\S]*?<\/p>\s*/gi, '')
    .replace(/<img\b[^>]*\bvr-tour-mobile-qr-img\b[^>]*\/?>\s*/gi, '');
}

function buildMobileQrSectionHtml(qrSrc) {
  if (!qrSrc) return '';
  return [
    '<div class="vr-tour-mobile-section">',
    '<p class="vr-tour-mobile-label">View on Your Phone</p>',
    `<img class="vr-tour-mobile-qr-img" src="${escapeAttr(qrSrc)}" alt="Scan to open this 360° tour on your phone" width="160" height="160">`,
    '</div>',
  ].join('\n');
}

function rewriteIframeOpenTag(attrs, targetSrc) {
  let next = attrs.replace(/\ssrc=(["'])[^"']*\1/i, '').trim();
  return `<iframe src="${escapeAttr(targetSrc)}" ${next}>`;
}

function buildSignedInEmbedDivHtml(name, iframeSrc, tourUrl) {
  const title = escapeAttr(name || '360° VR Tour');
  const src = escapeAttr(withEmbedQuery(iframeSrc));
  const url = escapeAttr(tourUrl || iframeSrc);
  return [
    `<div class="vr-tour-embed" data-vr-tour-embed="1" data-vr-tour-url="${url}">`,
    `<iframe src="${src}" title="${title}" allow="fullscreen; vr; accelerometer; gyroscope"></iframe>`,
    '</div>',
  ].join('\n');
}

function removeMobileSection(html) {
  return String(html || '').replace(
    /<div\b[^>]*\bvr-tour-mobile-section\b[^>]*>[\s\S]*?<\/div>\s*/gi,
    ''
  );
}

function upsertMobileSection(html, qrSrc) {
  const section = buildMobileQrSectionHtml(qrSrc);
  if (!section) return removeMobileSection(html);
  if (/<div\b[^>]*\bvr-tour-mobile-section\b/i.test(html)) {
    return html.replace(/<div\b[^>]*\bvr-tour-mobile-section\b[^>]*>[\s\S]*?<\/div>/i, section);
  }
  return html.replace(
    /(<div\b[^>]*\sdata-vr-tour-embed=["']1["'][^>]*>[\s\S]*?<\/div>)/i,
    `$1\n\n${section}`
  );
}

function rewriteSignedInWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl) {
  const cleaned = stripQrFromEmbedInner(inner);
  const iframeMatch = cleaned.match(/<iframe\b([^>]*)>/i);
  const iframeHtml = iframeMatch
    ? rewriteIframeOpenTag(iframeMatch[1], targetSrc) + (cleaned.includes('</iframe>') ? '</iframe>' : '')
    : `<iframe src="${escapeAttr(targetSrc)}" title="360° VR Tour" allow="fullscreen; vr; accelerometer; gyroscope"></iframe>`;

  let updatedDivAttrs = divAttrs.replace(/\sdata-vr-tour-url=(["'])[^"']*\1/i, '').trim();
  if (!/\bclass=/i.test(updatedDivAttrs)) {
    updatedDivAttrs = `class="vr-tour-embed" ${updatedDivAttrs}`.trim();
  }
  return `<div ${updatedDivAttrs} data-vr-tour-url="${escapeAttr(tourUrl)}">${iframeHtml}</div>`;
}

function rewriteGuestWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl, qrSrc, showQr) {
  let updatedInner = inner.replace(/<iframe\b([^>]*)>/i, (m, attrs) => rewriteIframeOpenTag(attrs, targetSrc));
  updatedInner = stripQrFromEmbedInner(updatedInner);
  updatedInner = removeMobileSection(updatedInner);

  if (showQr && qrSrc) {
    updatedInner = [
      updatedInner.trimEnd(),
      '<p class="vr-tour-mobile-label">View on Your Phone</p>',
      `<img class="vr-tour-mobile-qr-img" src="${escapeAttr(qrSrc)}" alt="Scan to open this 360° tour on your phone" width="160" height="160" />`,
    ].join('\n');
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

function rewriteSignedInVrTourEmbedBlocks(html, { targetSrc, tourUrl, qrSrc, showQr }) {
  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let out = html.replace(wrapperRe, (match, divAttrs, inner) =>
    rewriteSignedInWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl)
  );

  if (showQr && qrSrc) {
    out = upsertMobileSection(out, qrSrc);
  } else {
    out = removeMobileSection(out);
  }

  return out;
}

function rewriteGuestVrTourEmbedBlocks(html, { targetSrc, tourUrl, qrSrc, showQr }) {
  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  return html.replace(wrapperRe, (match, divAttrs, inner) =>
    rewriteGuestWrapperEmbedBlock(divAttrs, inner, targetSrc, tourUrl, qrSrc, showQr)
  );
}

function rewriteGuestVrTourEmbedsForEditorPreview(html) {
  const embedUrl = getEditorPreviewVrTourEmbedUrl();
  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let out = html.replace(wrapperRe, (match, divAttrs, inner) => {
    const tourUrl = extractHostedTourUrl(divAttrs, inner);
    const previewQr = tourQrPreviewSrc(tourUrl);
    return rewriteGuestWrapperEmbedBlock(
      divAttrs,
      inner,
      embedUrl,
      embedUrl,
      previewQr,
      Boolean(previewQr)
    );
  });

  const legacyBlockRe =
    /(?:<!--\s*360° VR tour from this project \(Spherical Content\)\s*-->\s*)?<iframe\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>\s*<\/iframe>/gi;
  out = out.replace(legacyBlockRe, (match, attrs) =>
    `${rewriteIframeOpenTag(attrs, embedUrl)}</iframe>`
  );

  return out;
}

function rewriteSignedInVrTourEmbedsForEditorPreview(html) {
  const embedUrl = getEditorPreviewVrTourEmbedUrl();
  let previewQr = '';

  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let out = html.replace(wrapperRe, (match, divAttrs, inner) => {
    const hostedTourUrl = extractHostedTourUrl(divAttrs, inner);
    const qr = tourQrPreviewSrc(hostedTourUrl);
    if (qr) previewQr = qr;
    return rewriteSignedInWrapperEmbedBlock(divAttrs, inner, embedUrl, embedUrl);
  });

  out = removeMobileSection(out);
  if (previewQr) {
    out = upsertMobileSection(out, previewQr);
  }

  const legacyBlockRe =
    /(?:<!--\s*360° VR tour from this project \(Spherical Content\)\s*-->\s*)?<iframe\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>\s*<\/iframe>/gi;
  out = out.replace(legacyBlockRe, (match, attrs) => {
    const titleMatch = attrs.match(/\stitle=(["'])([^"']*)\1/i);
    const name = titleMatch ? titleMatch[2] : '360° VR Tour';
    return buildSignedInEmbedDivHtml(name, embedUrl, embedUrl);
  });

  return out;
}

/** Rewrite flat-page VR embeds for in-editor live preview (avoid loading the full editor UI). */
export function rewriteVrTourEmbedsForEditorPreview(html) {
  if (!html || !hasVrTourEmbed(html)) return html;
  return isGuestEditor()
    ? rewriteGuestVrTourEmbedsForEditorPreview(html)
    : rewriteSignedInVrTourEmbedsForEditorPreview(html);
}

/** Remove any existing VR tour embed blocks (legacy iframe-only or current wrapper format). */
export function stripExistingVrTourEmbeds(html) {
  if (!html) return html;
  let out = html;
  out = out.replace(
    /<!--\s*360° VR tour from this project \(Spherical Content\)\s*-->\s*<style>[\s\S]*?<\/style>\s*<div\b[^>]*\sdata-vr-tour-embed=["']1["'][^>]*>[\s\S]*?<\/div>\s*(?:<div\b[^>]*\bvr-tour-mobile-section\b[^>]*>[\s\S]*?<\/div>\s*)?/gi,
    ''
  );
  out = out.replace(
    /<!--\s*360° VR tour from this project \(Spherical Content\)\s*-->\s*<iframe\b[^>]*\sdata-vr-tour-embed=["']1["'][^>]*>\s*<\/iframe>\s*/gi,
    ''
  );
  out = out.replace(/<iframe\b[^>]*\sdata-vr-tour-embed=["']1["'][^>]*>\s*<\/iframe>\s*/gi, '');
  out = removeMobileSection(out);
  return out;
}

export function hasVrTourEmbed(html) {
  return /data-vr-tour-embed=["']1["']/i.test(html || '');
}

/** HTML snippet for bundle export — relative path to the spherical viewer at project root (admin). */
export function buildLocalBundleVrInsertHtml(name) {
  return [
    '<!-- 360° VR tour from this project (Spherical Content) -->',
    buildSignedInStyleBlock(),
    buildSignedInEmbedDivHtml(name, LOCAL_VR_TOUR_EMBED_PATH, LOCAL_VR_TOUR_EMBED_PATH),
  ].join('\n');
}

/** Guest flat-page embed — unchanged legacy format (QR inside embed wrapper). */
export function buildGuestProjectVrInsertHtml(name, embedUrl, qrUrl) {
  const title = escapeAttr(name || '360° VR Tour');
  const src = escapeAttr(withEmbedQuery(resolveAbsoluteUrl(embedUrl)));
  if (!src) return '';
  const qrSrc = escapeAttr(qrUrl ? resolveAbsoluteUrl(qrUrl) : deriveQrUrlFromTourUrl(embedUrl));
  return [
    '<!-- 360° VR tour from this project (Spherical Content) -->',
    `<style>${GUEST_VR_TOUR_EMBED_STYLES}</style>`,
    `<div class="vr-tour-embed" data-vr-tour-embed="1" data-vr-tour-url="${src}">`,
    `<iframe src="${src}" title="${title}" allow="fullscreen; vr; accelerometer; gyroscope"></iframe>`,
    '<p class="vr-tour-mobile-label">View on Your Phone</p>',
    `<img class="vr-tour-mobile-qr-img" src="${qrSrc}" alt="Scan to open this 360° tour on your phone" width="160" height="160" />`,
    '</div>',
  ].join('\n');
}

/** Signed-in student hosted embed — separate mobile QR section below iframe. */
export function buildProjectVrInsertHtml(name, embedUrl, qrUrl) {
  const src = resolveAbsoluteUrl(embedUrl);
  if (!src) return '';
  const qrSrc = qrUrl ? resolveAbsoluteUrl(qrUrl) : deriveQrUrlFromTourUrl(embedUrl);
  const lines = [
    '<!-- 360° VR tour from this project (Spherical Content) -->',
    buildSignedInStyleBlock(),
    buildSignedInEmbedDivHtml(name, src, src),
  ];
  if (qrSrc) {
    lines.push('', buildMobileQrSectionHtml(qrSrc));
  }
  return lines.join('\n');
}

/**
 * Rewrite VR tour iframe src in flat page HTML for export packaging (signed-in export paths).
 * @param {string} html
 * @param {{ hostedUrl?: string, useOnlineUrl?: boolean, guestMode?: boolean }} options
 */
export function rewriteVrTourEmbedsInHtml(
  html,
  { hostedUrl = '', useOnlineUrl = true, hideQr = false, guestMode = false } = {}
) {
  if (!html) return html;
  const onlineSrc = resolveAbsoluteUrl(hostedUrl);
  const rawTarget = useOnlineUrl && onlineSrc ? onlineSrc : LOCAL_VR_TOUR_EMBED_PATH;
  const targetSrc = withEmbedQuery(rawTarget);
  const tourUrl = useOnlineUrl && onlineSrc ? onlineSrc : rawTarget;
  const qrSrc = !hideQr && useOnlineUrl && onlineSrc ? deriveQrUrlFromTourUrl(onlineSrc) : '';
  const showQr = Boolean(qrSrc);

  let out = guestMode
    ? rewriteGuestVrTourEmbedBlocks(html, { targetSrc, tourUrl, qrSrc, showQr })
    : rewriteSignedInVrTourEmbedBlocks(html, { targetSrc, tourUrl, qrSrc, showQr });

  const legacyBlockRe =
    /(?:<!--\s*360° VR tour from this project \(Spherical Content\)\s*-->\s*)?<iframe\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>\s*<\/iframe>/gi;
  out = out.replace(legacyBlockRe, (match, attrs) => {
    if (showQr && qrSrc) {
      const titleMatch = attrs.match(/\stitle=(["'])([^"']*)\1/i);
      const name = titleMatch ? titleMatch[2] : '360° VR Tour';
      return guestMode
        ? buildGuestProjectVrInsertHtml(name, tourUrl, qrSrc)
        : buildProjectVrInsertHtml(name, tourUrl, qrSrc);
    }
    const titleMatch = attrs.match(/\stitle=(["'])([^"']*)\1/i);
    const name = titleMatch ? titleMatch[2] : '360° VR Tour';
    if (guestMode) {
      return [
        '<!-- 360° VR tour from this project (Spherical Content) -->',
        `<style>${GUEST_VR_TOUR_EMBED_STYLES}</style>`,
        buildSignedInEmbedDivHtml(name, targetSrc, tourUrl),
      ].join('\n');
    }
    return [
      '<!-- 360° VR tour from this project (Spherical Content) -->',
      buildSignedInStyleBlock(),
      buildSignedInEmbedDivHtml(name, targetSrc, tourUrl),
    ].join('\n');
  });

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
