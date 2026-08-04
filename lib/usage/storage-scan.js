const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const b2Service = require('../../services/b2-service');
const { getHostedDir } = require('../hosted-b2-storage');
const usageDb = require('./usage-db');

const PAGE_SIZE = 1000;

async function listAllB2Files(prefix = '') {
  await b2Service.authorize();
  const files = [];
  let startFileName = prefix || '';
  let guard = 0;

  while (guard < 500) {
    guard += 1;
    const response = await b2Service._withReauthRetry('listFileNames(usage-scan)', async () =>
      b2Service.b2.listFileNames({
        bucketId: b2Service.bucketId,
        prefix: prefix || '',
        startFileName,
        maxFileCount: PAGE_SIZE,
      })
    );
    const page = (response.data && response.data.files) || [];
    files.push(...page);
    const next = response.data && response.data.nextFileName;
    if (!next || !page.length) break;
    startFileName = next;
  }
  return files;
}

function classifyB2File(fileName) {
  const name = String(fileName || '');
  if (name.startsWith('student-projects/')) {
    const parts = name.split('/');
    const classSlug = parts[1] || 'unknown';
    return {
      root: 'student-projects',
      classSlug,
      scopes: ['total', 'student-projects', `class:${classSlug}`],
    };
  }
  if (name.startsWith('hosted-projects/')) {
    return { root: 'hosted-projects', classSlug: null, scopes: ['total', 'hosted-projects'] };
  }
  return { root: 'other', classSlug: null, scopes: ['total', 'other'] };
}

function aggregateB2Files(files) {
  const byScope = new Map();
  const bump = (scope, bytes) => {
    const cur = byScope.get(scope) || { byteSize: 0, fileCount: 0 };
    cur.byteSize += bytes;
    cur.fileCount += 1;
    byScope.set(scope, cur);
  };

  for (const f of files) {
    const bytes = Number(f.contentLength) || 0;
    const { scopes } = classifyB2File(f.fileName);
    for (const scope of scopes) bump(scope, bytes);
  }

  return [...byScope.entries()].map(([scope, v]) => ({
    source: 'b2',
    scope,
    byteSize: v.byteSize,
    fileCount: v.fileCount,
    details: {},
  }));
}

async function walkLocalDir(dir) {
  let byteSize = 0;
  let fileCount = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        try {
          const st = await fsp.stat(full);
          byteSize += st.size;
          fileCount += 1;
        } catch (_) {
          /* ignore */
        }
      }
    }
  }
  if (fs.existsSync(dir)) await walk(dir);
  return { byteSize, fileCount };
}

async function scanHostedDisk() {
  const dir = getHostedDir();
  const { byteSize, fileCount } = await walkLocalDir(dir);
  return [
    {
      source: 'hosted_disk',
      scope: 'total',
      byteSize,
      fileCount,
      details: { path: dir },
    },
  ];
}

async function scanB2Storage() {
  try {
    await b2Service.authorize();
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'B2 not configured',
      rows: [],
    };
  }

  try {
    const files = await listAllB2Files('');
    return { ok: true, error: null, rows: aggregateB2Files(files), fileCount: files.length };
  } catch (err) {
    return { ok: false, error: err.message || 'B2 scan failed', rows: [] };
  }
}

async function runStorageSnapshot({ persist = true } = {}) {
  const startedAt = Date.now();
  const b2 = await scanB2Storage();
  let hostedRows = [];
  let hostedError = null;
  try {
    hostedRows = await scanHostedDisk();
  } catch (err) {
    hostedError = err.message;
  }

  const rows = [...(b2.rows || []), ...hostedRows];
  let inserted = 0;
  if (persist && rows.length) {
    try {
      inserted = await usageDb.insertSnapshots(rows);
    } catch (err) {
      return {
        ok: false,
        error: `Snapshot persist failed: ${err.message}`,
        b2,
        hostedError,
        rows,
        inserted: 0,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  return {
    ok: b2.ok !== false && !hostedError,
    error: b2.error || hostedError || null,
    b2,
    hostedError,
    rows,
    inserted,
    durationMs: Date.now() - startedAt,
  };
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v;
  let i = -1;
  do {
    x /= 1024;
    i += 1;
  } while (x >= 1024 && i < units.length - 1);
  return `${x.toFixed(x >= 10 || i === 0 ? 1 : 2)} ${units[i]}`;
}

module.exports = {
  listAllB2Files,
  scanB2Storage,
  scanHostedDisk,
  runStorageSnapshot,
  formatBytes,
  aggregateB2Files,
};
