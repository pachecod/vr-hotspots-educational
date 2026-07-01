/** Parse A-Frame space-separated vector strings (e.g. "0 1.5 -3"). */
export function parseAframeVector(value, components = 3) {
  if (typeof value === 'string') {
    const parts = value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => {
        const n = Number(part);
        return Number.isFinite(n) ? n : 0;
      });
    while (parts.length < components) parts.push(0);
    return parts.slice(0, components);
  }
  if (Array.isArray(value)) {
    return value.slice(0, components).map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
  }
  return Array(components).fill(0);
}

export function formatAframeVector(parts) {
  return parts
    .map((n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return '0';
      return String(v);
    })
    .join(' ');
}

export function isAframeVectorString(value, components) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== components) return false;
  return parts.every((p) => /^-?\d+(\.\d+)?$/.test(p));
}

export function vectorAxisLabels(components) {
  if (components === 2) return ['X', 'Y'];
  return ['X', 'Y', 'Z'];
}
