/** Self-contained playground / export bundles must embed the spherical viewer relatively. */
const LOCAL_VR_TOUR_EMBED_PATH = '../../index.html';

const HOSTED_URL_RE = /https?:\/\/[^"'\\s)]+\/hosted\/[^"'\\s)]+/i;
const ABSOLUTE_TOUR_URL_RE = /https?:\/\/[^"'\\s)]+/i;

function rewriteIframeOpenTag(attrs, targetSrc) {
  const withoutSrc = String(attrs || '').replace(/\ssrc=(["'])[^"']*\1/i, '').trim();
  return `<iframe src="${targetSrc}"${withoutSrc ? ` ${withoutSrc}` : ''}>`;
}

function sanitizeFlatPageVrEmbed(html) {
  if (!html) return html;
  let out = String(html);

  out = out.replace(/<p class="vr-tour-mobile-label"[^>]*>[\s\S]*?<\/p>\s*/gi, '');
  out = out.replace(/<img class="vr-tour-mobile-qr-img"[^>]*\/?>\s*/gi, '');

  const wrapperRe = /<div\b([^>]*\sdata-vr-tour-embed=["']1["'][^>]*)>([\s\S]*?)<\/div>/gi;
  out = out.replace(wrapperRe, (match, divAttrs, inner) => {
    const updatedInner = inner.replace(/<iframe\b([^>]*)>/i, (m, attrs) =>
      rewriteIframeOpenTag(attrs, LOCAL_VR_TOUR_EMBED_PATH)
    );
    const updatedAttrs = String(divAttrs)
      .replace(/\sdata-vr-tour-url=(["'])[^"']*\1/i, '')
      .trim();
    return `<div ${updatedAttrs} data-vr-tour-url="${LOCAL_VR_TOUR_EMBED_PATH}">${updatedInner}</div>`;
  });

  out = out.replace(
    /<iframe\b([^>]*)\ssrc=(["'])(?:https?:\/\/[^"']*|\/hosted\/[^"']*)\2([^>]*)>/gi,
    (match, before, quote, after) => {
      if (/data-vr-tour-embed/i.test(match)) return match;
      return rewriteIframeOpenTag(`${before}${after}`, LOCAL_VR_TOUR_EMBED_PATH);
    }
  );

  return out;
}

function findBundleEmbedIssues(html) {
  const issues = [];
  if (!html) return issues;
  const text = String(html);
  if (HOSTED_URL_RE.test(text)) issues.push('contains /hosted/ URL');
  if (/\/qr\.png/i.test(text) && ABSOLUTE_TOUR_URL_RE.test(text)) {
    issues.push('contains absolute QR image URL');
  }
  const iframeSrc = text.match(/<iframe[^>]+src=(["'])([^"']+)\1/i);
  if (iframeSrc && ABSOLUTE_TOUR_URL_RE.test(iframeSrc[2])) {
    issues.push(`iframe src is absolute: ${iframeSrc[2]}`);
  }
  if (iframeSrc && iframeSrc[2] !== LOCAL_VR_TOUR_EMBED_PATH && !ABSOLUTE_TOUR_URL_RE.test(iframeSrc[2])) {
    if (!iframeSrc[2].includes('index.html')) {
      issues.push(`iframe src is not the bundle viewer path: ${iframeSrc[2]}`);
    }
  }
  return issues;
}

function assertBundleSafeFlatPage(html, label = 'flat page') {
  const issues = findBundleEmbedIssues(html);
  if (issues.length) {
    throw new Error(`${label}: ${issues.join('; ')}`);
  }
}

module.exports = {
  LOCAL_VR_TOUR_EMBED_PATH,
  sanitizeFlatPageVrEmbed,
  findBundleEmbedIssues,
  assertBundleSafeFlatPage,
};
