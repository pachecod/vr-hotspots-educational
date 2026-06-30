/** Lightweight HTML/CSS/JS formatter (ported from webxride prettier.ts). */

function formatHTML(html) {
  const tabSize = 2;
  const indent = ' '.repeat(tabSize);
  let formatted = html.replace(/>\s*</g, '>\n<').replace(/\n\s*\n/g, '\n').trim();
  let result = '';
  let level = 0;
  const lines = formatted.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('<!DOCTYPE')) {
      result += line + '\n';
      continue;
    }
    if (line.startsWith('<!--')) {
      result += indent.repeat(level) + line + '\n';
      continue;
    }
    if (line.startsWith('</') && !line.startsWith('</!')) {
      level = Math.max(0, level - 1);
    }
    result += indent.repeat(level) + line + '\n';
    if (
      line.startsWith('<') &&
      !line.startsWith('</') &&
      !line.endsWith('/>') &&
      !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(line)
    ) {
      level++;
    }
  }
  return result.trimEnd();
}

function formatCSS(css) {
  let out = css.replace(/\{/g, ' {\n').replace(/\}/g, '\n}\n').replace(/;/g, ';\n');
  const lines = out.split('\n');
  let level = 0;
  return lines
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      if (t === '}') level = Math.max(0, level - 1);
      const indented = '  '.repeat(level) + t;
      if (t.endsWith('{')) level++;
      return indented;
    })
    .filter(Boolean)
    .join('\n');
}

function formatJS(js) {
  let level = 0;
  const lines = js.split('\n');
  return lines
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      if (t.startsWith('}') || t.startsWith(']') || t.startsWith(')')) {
        level = Math.max(0, level - 1);
      }
      const indented = '  '.repeat(level) + t;
      if (t.endsWith('{') || t.endsWith('[') || (t.endsWith('(') && !t.includes(')'))) {
        level++;
      }
      return indented;
    })
    .join('\n');
}

function formatJSON(json) {
  const parsed = JSON.parse(json);
  return JSON.stringify(parsed, null, 2);
}

export function formatCode(content, fileId) {
  const id = String(fileId || '').toLowerCase();
  if (id.endsWith('.json')) {
    try {
      return formatJSON(content);
    } catch (_) {
      return content;
    }
  }
  if (id.endsWith('.css')) return formatCSS(content);
  if (id.endsWith('.js') || id.endsWith('.mjs')) return formatJS(content);
  return formatHTML(content);
}
