/** Build a self-contained HTML document for iframe preview (WebXRIDE-style). */
export function buildPreviewDocument(page) {
  const getContent = (id) => {
    const f = page.files.find((x) => x.id === id);
    return f ? f.content || '' : '';
  };
  let html = getContent('index.html') || '<!DOCTYPE html><html><head></head><body></body></html>';
  const css = getContent('style.css');
  const js = getContent('script.js');

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

  if (js) {
    const scriptTag = `<script>\n${js}\n<\/script>`;
    const srcRe = /<script[^>]*src=["']\.?\/?(?:script\.js)["'][^>]*>\s*<\/script>/i;
    if (srcRe.test(html)) {
      html = html.replace(srcRe, scriptTag);
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    } else {
      html = `${html}\n${scriptTag}`;
    }
  }
  return html;
}
