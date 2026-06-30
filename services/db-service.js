const { Pool } = require('pg');

let pool = null;

function isDbEnabled() {
  return !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool() {
  if (!isDbEnabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 10,
    });
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('Database not configured (DATABASE_URL missing)');
  return p.query(text, params);
}

async function withClient(fn) {
  const p = getPool();
  if (!p) throw new Error('Database not configured (DATABASE_URL missing)');
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function generateUsername(displayName) {
  const base = slugify(displayName).replace(/-/g, '') || 'student';
  return base.slice(0, 40);
}

function generateRandomPassword() {
  const crypto = require('crypto');
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';

  function randomChar(pool) {
    const bytes = crypto.randomBytes(1);
    return pool[bytes[0] % pool.length];
  }

  function generateLowerSegment(len = 6) {
    let seg = '';
    for (let i = 0; i < len; i++) seg += randomChar(lowercase);
    return seg;
  }

  function generateMixedSegment(len = 6) {
    const bytes = crypto.randomBytes(len);
    let seg = '';
    for (let i = 0; i < len; i++) {
      seg += lowercase[bytes[i] % lowercase.length];
    }
    const pos = crypto.randomInt(1, len - 1);
    const mixPool = crypto.randomInt(0, 2) === 0 ? uppercase : digits;
    seg = seg.slice(0, pos) + randomChar(mixPool) + seg.slice(pos + 1);
    return seg;
  }

  return [generateLowerSegment(), generateMixedSegment(), generateLowerSegment()].join('-');
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  isDbEnabled,
  getPool,
  query,
  withClient,
  slugify,
  generateUsername,
  generateRandomPassword,
  closePool,
};
