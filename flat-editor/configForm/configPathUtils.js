/** Parse "exhibits[0].hotspot.info" into ["exhibits", "0", "hotspot", "info"]. */
export function parsePath(path) {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

export function getPath(obj, path) {
  const parts = parsePath(path);
  if (!parts.length) return undefined;
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setPath(obj, path, value) {
  const parts = parsePath(path);
  if (!parts.length) return obj;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    if (cur[p] == null || typeof cur[p] !== 'object') {
      cur[p] = /^\d+$/.test(next) ? [] : {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/** Join base path with relative field path for repeat sections. */
export function joinPath(base, relative) {
  const b = String(base || '').replace(/\.$/, '');
  const r = String(relative || '').replace(/^\./, '');
  if (!b) return r;
  if (!r) return b;
  return `${b}.${r}`;
}
