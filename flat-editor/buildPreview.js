/** Build a self-contained HTML document for iframe preview (WebXRIDE-style). */
export function buildPreviewDocument(page, options = {}) {
  const files = page?.files || [];
  const getContent = (id) => {
    const f = files.find((x) => x.id === id || x.name === id);
    return f ? f.content || '' : '';
  };

  let html = getContent('index.html') || '<!DOCTYPE html><html><head></head><body></body></html>';
  const css = getContent('style.css');
  const js = getContent('script.js');

  const baseHref = options.baseHref;
  if (baseHref && /<head[^>]*>/i.test(html)) {
    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${baseHref}" />`);
    }
  }

  if (css) {
    const styleTag = `<style>\n${css}\n</style>`;
    const linkRe = /<link[^>]*href=["']\.?\/?(?:styles?\.css)["'][^>]*>/i;
    if (linkRe.test(html)) {
      html = html.replace(linkRe, styleTag);
    } else if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${styleTag}\n</head>`);
    } else {
      html = `${styleTag}\n${html}`;
    }
  }

  // Additional CSS files referenced in HTML
  files
    .filter((f) => f.name && f.name.endsWith('.css') && f.name !== 'style.css')
    .forEach((f) => {
      const ref = new RegExp(`<link[^>]*href=["']\\.?/?${escapeReg(f.name)}["'][^>]*>`, 'i');
      const tag = `<style data-file="${f.name}">\n${f.content || ''}\n</style>`;
      if (ref.test(html)) html = html.replace(ref, tag);
      else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${tag}\n</head>`);
    });

  if (js) {
    const scriptTag = `<script>\n${js}\n</script>`;
    const srcRe = /<script[^>]*src=["']\.?\/?(?:script\.js)["'][^>]*>\s*<\/script>/i;
    if (srcRe.test(html)) {
      html = html.replace(srcRe, scriptTag);
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    } else {
      html = `${html}\n${scriptTag}`;
    }
  }

  files
    .filter((f) => f.name && (f.name.endsWith('.js') || f.name.endsWith('.mjs')) && f.name !== 'script.js')
    .forEach((f) => {
      const ref = new RegExp(
        `<script[^>]*src=["']\\.?/?${escapeReg(f.name)}["'][^>]*>\\s*</script>`,
        'i'
      );
      const tag = `<script data-file="${f.name}">\n${f.content || ''}\n</script>`;
      if (ref.test(html)) html = html.replace(ref, tag);
      else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${tag}\n</body>`);
    });

  return html;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
