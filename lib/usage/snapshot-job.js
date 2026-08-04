const { isDbEnabled } = require('../../services/db-service');
const { runStorageSnapshot } = require('./storage-scan');

let timer = null;
let running = false;
let lastRun = null;

function intervalMs() {
  const raw = Number(process.env.USAGE_SNAPSHOT_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60 * 1000) return raw;
  // Default: every 6 hours
  return 6 * 60 * 60 * 1000;
}

async function runOnce(reason = 'scheduled') {
  if (running) {
    return { skipped: true, reason: 'already-running' };
  }
  if (!isDbEnabled()) {
    return { skipped: true, reason: 'db-disabled' };
  }
  running = true;
  try {
    console.log(`📊 Usage storage snapshot starting (${reason})…`);
    const result = await runStorageSnapshot({ persist: true });
    lastRun = {
      at: new Date().toISOString(),
      reason,
      ok: result.ok,
      error: result.error,
      inserted: result.inserted,
      durationMs: result.durationMs,
    };
    if (result.ok) {
      console.log(
        `📊 Usage storage snapshot done: ${result.inserted} row(s) in ${result.durationMs}ms`
      );
    } else {
      console.warn(`📊 Usage storage snapshot incomplete: ${result.error || 'unknown error'}`);
    }
    return result;
  } catch (err) {
    lastRun = {
      at: new Date().toISOString(),
      reason,
      ok: false,
      error: err.message,
    };
    console.error('📊 Usage storage snapshot failed:', err.message);
    return { ok: false, error: err.message };
  } finally {
    running = false;
  }
}

function startUsageSnapshotJob() {
  if (timer) return;
  if (String(process.env.USAGE_SNAPSHOT_DISABLED || '').toLowerCase() === 'true') {
    console.log('ℹ️  Usage snapshot job disabled (USAGE_SNAPSHOT_DISABLED=true)');
    return;
  }
  const ms = intervalMs();
  // Delay first run so boot / migrations settle
  setTimeout(() => {
    runOnce('startup').catch(() => {});
  }, 45 * 1000);
  timer = setInterval(() => {
    runOnce('interval').catch(() => {});
  }, ms);
  if (timer.unref) timer.unref();
  console.log(`ℹ️  Usage snapshot job scheduled every ${Math.round(ms / 60000)} minute(s)`);
}

function getSnapshotJobStatus() {
  return {
    running,
    lastRun,
    intervalMs: intervalMs(),
    disabled: String(process.env.USAGE_SNAPSHOT_DISABLED || '').toLowerCase() === 'true',
  };
}

module.exports = {
  startUsageSnapshotJob,
  runOnce,
  getSnapshotJobStatus,
};
