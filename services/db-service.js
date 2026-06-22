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

function generateRandomPassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const crypto = require('crypto');
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
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
