function sanitizeReturnTo(returnTo, baseUrl) {
  if (!returnTo || typeof returnTo !== 'string') return '/';
  const trimmed = returnTo.trim();
  if (!trimmed) return '/';

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (trimmed.includes('\\') || trimmed.includes('\0')) return '/';
    return trimmed;
  }

  try {
    const base = new URL(baseUrl);
    const target = new URL(trimmed, base);
    if (target.origin !== base.origin) return '/';
    return `${target.pathname}${target.search}${target.hash}` || '/';
  } catch (_) {
    return '/';
  }
}

module.exports = { sanitizeReturnTo };
