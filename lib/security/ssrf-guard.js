const dns = require('dns').promises;
const net = require('net');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateOrMetadataIp(ip) {
  if (!ip || !net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80')) return true;
  return false;
}

function hostnameLooksBlocked(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h === '127.0.0.1' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (net.isIP(h) && isPrivateOrMetadataIp(h)) return true;
  return false;
}

async function assertSafeOutboundUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid URL. Must be http or https.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostnameLooksBlocked(hostname)) {
    throw new Error('Cannot fetch from private or local addresses.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrMetadataIp(hostname)) {
      throw new Error('Cannot fetch from private or local addresses.');
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (_) {
    throw new Error('Could not resolve hostname.');
  }

  for (const entry of addresses) {
    if (isPrivateOrMetadataIp(entry.address)) {
      throw new Error('Cannot fetch from private or local addresses.');
    }
  }

  return parsed;
}

module.exports = {
  assertSafeOutboundUrl,
  hostnameLooksBlocked,
  isPrivateOrMetadataIp,
};
