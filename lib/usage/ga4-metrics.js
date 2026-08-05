/**
 * GA4 Data API client for the Admin Usage dashboard.
 *
 * Env:
 *   GA4_PROPERTY_ID              — numeric property id (Admin → Property Settings)
 *   GA4_SERVICE_ACCOUNT_JSON     — full service-account JSON (string; base64 also accepted)
 *   GA4_SERVICE_ACCOUNT_FILE     — optional path to JSON key file
 *
 * The service account email must be added as a Viewer on the GA4 property.
 */

const fs = require('fs');
const path = require('path');

let AnalyticsDataClient = null;
try {
  ({ BetaAnalyticsDataClient: AnalyticsDataClient } = require('@google-analytics/data'));
} catch (_) {
  AnalyticsDataClient = null;
}

function parseCredentials() {
  const raw = (process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      if (raw.startsWith('{')) return JSON.parse(raw);
      // base64-encoded JSON (handy for Render env vars)
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) return JSON.parse(decoded);
    } catch (err) {
      const e = new Error(`GA4_SERVICE_ACCOUNT_JSON is invalid JSON: ${err.message}`);
      e.code = 'GA4_BAD_CREDENTIALS';
      throw e;
    }
  }

  const filePath = (process.env.GA4_SERVICE_ACCOUNT_FILE || '').trim();
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const text = fs.readFileSync(abs, 'utf8');
    return JSON.parse(text);
  }

  return null;
}

function getConfig() {
  const propertyId = String(process.env.GA4_PROPERTY_ID || '')
    .trim()
    .replace(/^properties\//, '');
  let credentials = null;
  let credentialsError = null;
  try {
    credentials = parseCredentials();
  } catch (err) {
    credentialsError = err.message;
  }
  const libraryAvailable = Boolean(AnalyticsDataClient);
  return {
    configured: Boolean(propertyId && credentials && libraryAvailable && !credentialsError),
    propertyIdConfigured: Boolean(propertyId),
    credentialsConfigured: Boolean(credentials) && !credentialsError,
    libraryAvailable,
    propertyId: propertyId || null,
    credentialsError,
    measurementId: (process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || '').trim() || null,
  };
}

function getClient() {
  const cfg = getConfig();
  if (!cfg.configured) {
    const err = new Error(
      cfg.credentialsError ||
        'GA4 not configured (need GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON/FILE)'
    );
    err.code = 'GA4_NOT_CONFIGURED';
    throw err;
  }
  const credentials = parseCredentials();
  return new AnalyticsDataClient({ credentials });
}

function dimensionValue(row, index = 0) {
  return row?.dimensionValues?.[index]?.value ?? null;
}

function metricValue(row, index = 0) {
  const raw = row?.metricValues?.[index]?.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** GA4 date dimension is YYYYMMDD → ISO date string. */
function gaDateToIso(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (!/^\d{8}$/.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function gaDateToTimestamp(yyyymmdd) {
  const iso = gaDateToIso(yyyymmdd);
  const ms = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : iso;
}

async function getDashboardMetrics({ days = 30 } = {}) {
  const cfg = getConfig();
  if (!cfg.configured) {
    return {
      configured: false,
      config: cfg,
      metrics: null,
      error: cfg.credentialsError || null,
    };
  }

  const dayCount = Math.max(1, Math.min(90, Number(days) || 30));
  const client = getClient();
  const property = `properties/${cfg.propertyId}`;

  try {
    const [[dailyRes], [pagesRes], [realtimeRes]] = await Promise.all([
      client.runReport({
        property,
        dateRanges: [{ startDate: `${dayCount}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      client.runReport({
        property,
        dateRanges: [{ startDate: `${dayCount}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      client
        .runRealtimeReport({
          property,
          metrics: [{ name: 'activeUsers' }],
        })
        .catch(() => [null]),
    ]);

    const activeUsers = [];
    const sessions = [];
    const pageViews = [];
    for (const row of dailyRes.rows || []) {
      const ts = gaDateToTimestamp(dimensionValue(row, 0));
      activeUsers.push({ timestamp: ts, value: metricValue(row, 0) });
      sessions.push({ timestamp: ts, value: metricValue(row, 1) });
      pageViews.push({ timestamp: ts, value: metricValue(row, 2) });
    }

    const topPages = (pagesRes.rows || []).map((row) => ({
      path: dimensionValue(row, 0) || '/',
      pageViews: metricValue(row, 0),
      activeUsers: metricValue(row, 1),
    }));

    const totals = {
      activeUsers: activeUsers.reduce((s, p) => s + p.value, 0),
      sessions: sessions.reduce((s, p) => s + p.value, 0),
      pageViews: pageViews.reduce((s, p) => s + p.value, 0),
    };

    // Sum of daily active users is not unique users — also expose last-day snapshot
    const lastDay = activeUsers.length ? activeUsers[activeUsers.length - 1] : null;
    const realtimeActive =
      realtimeRes && realtimeRes.rows && realtimeRes.rows[0]
        ? metricValue(realtimeRes.rows[0], 0)
        : null;

    const endMs = Date.now();
    const startMs = endMs - dayCount * 24 * 3600 * 1000;

    return {
      configured: true,
      config: {
        propertyId: cfg.propertyId,
        measurementId: cfg.measurementId,
      },
      range: {
        days: dayCount,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      },
      realtimeActiveUsers: realtimeActive,
      lastDayActiveUsers: lastDay ? lastDay.value : null,
      totals,
      metrics: {
        activeUsers: { series: activeUsers },
        sessions: { series: sessions },
        pageViews: { series: pageViews },
      },
      topPages,
      note: 'Daily activeUsers are per-day counts (not unique across the whole window). GA4 reporting can lag by several hours.',
      error: null,
    };
  } catch (err) {
    return {
      configured: true,
      config: { propertyId: cfg.propertyId, measurementId: cfg.measurementId },
      metrics: null,
      error: err.message || 'GA4 API request failed',
    };
  }
}

module.exports = {
  getConfig,
  getDashboardMetrics,
};
