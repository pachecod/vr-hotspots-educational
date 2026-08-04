/**
 * Thin client for Render Metrics API.
 * Docs: https://api-docs.render.com/reference/get-cpu
 *
 * Env:
 *   RENDER_API_KEY      — required (Account Settings → API Keys)
 *   RENDER_SERVICE_ID   — auto-set on Render; set locally for testing
 */

const RENDER_API_BASE = 'https://api.render.com/v1';

const METRIC_PATHS = {
  cpu: '/metrics/cpu',
  memory: '/metrics/memory',
  cpuLimit: '/metrics/cpu-limit',
  memoryLimit: '/metrics/memory-limit',
  httpRequests: '/metrics/http-requests',
  httpLatency: '/metrics/http-latency',
  bandwidth: '/metrics/bandwidth',
  instanceCount: '/metrics/instance-count',
};

function getConfig() {
  const apiKey = (process.env.RENDER_API_KEY || '').trim();
  const serviceId = (process.env.RENDER_SERVICE_ID || process.env.USAGE_RENDER_SERVICE_ID || '').trim();
  return {
    configured: Boolean(apiKey && serviceId),
    apiKeyConfigured: Boolean(apiKey),
    serviceIdConfigured: Boolean(serviceId),
    serviceId: serviceId || null,
  };
}

function toDate(value, fallbackMs) {
  if (value == null || value === '') return new Date(fallbackMs);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms);
  }
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return new Date(fallbackMs);
  return new Date(parsed);
}

async function fetchMetric(path, { resourceId, startTime, endTime, resolutionSeconds, extra = {} } = {}) {
  // Do not pull apiKey from getConfig() — that helper is also sent to the admin UI
  // and intentionally omits the secret.
  const apiKey = (process.env.RENDER_API_KEY || '').trim();
  const { serviceId } = getConfig();
  const resource = resourceId || serviceId;
  if (!apiKey || !resource) {
    const err = new Error('Render metrics not configured (need RENDER_API_KEY and RENDER_SERVICE_ID)');
    err.code = 'RENDER_NOT_CONFIGURED';
    throw err;
  }

  const nowMs = Date.now();
  const end = toDate(endTime, nowMs);
  const start = toDate(startTime, end.getTime() - 24 * 3600 * 1000);
  const resolution = Math.max(30, Number(resolutionSeconds) || 300);

  const params = new URLSearchParams();
  params.append('resource', resource);
  params.set('startTime', start.toISOString());
  params.set('endTime', end.toISOString());
  params.set('resolutionSeconds', String(resolution));
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== '') params.set(k, String(v));
  }

  const url = `${RENDER_API_BASE}${path}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      (body && (body.message || body.error)) || `Render API ${res.status} for ${path}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function normalizeSeries(payload) {
  // Render returns shapes like { timeSeries: [ { values: [ { timestamp, value } ] } ] }
  // or arrays of series. Normalize to [{ timestamp, value }].
  if (!payload) return [];
  const seriesList = Array.isArray(payload)
    ? payload
    : payload.timeSeries || payload.timeseries || payload.series || [];
  if (!Array.isArray(seriesList) || !seriesList.length) {
    if (Array.isArray(payload.values)) return payload.values;
    return [];
  }

  // Prefer first series; for http request counts aggregated by status, sum values per timestamp.
  const byTs = new Map();
  for (const series of seriesList) {
    const values = series.values || series.points || [];
    for (const point of values) {
      const ts = point.timestamp || point.time || point.t;
      const val = Number(point.value != null ? point.value : point.v);
      if (ts == null || !Number.isFinite(val)) continue;
      const key = String(ts);
      byTs.set(key, (byTs.get(key) || 0) + val);
    }
  }
  return [...byTs.entries()]
    .map(([timestamp, value]) => ({ timestamp, value }))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

async function getDashboardMetrics({ hours = 24, resolutionSeconds = 300 } = {}) {
  const cfg = getConfig();
  if (!cfg.configured) {
    return {
      configured: false,
      config: cfg,
      metrics: null,
      error: null,
    };
  }

  const endMs = Date.now();
  const hoursN = Math.max(1, Math.min(24 * 30, Number(hours) || 24));
  const startMs = endMs - hoursN * 3600 * 1000;
  const common = {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    resolutionSeconds,
  };

  const keys = [
    ['cpu', METRIC_PATHS.cpu, {}],
    ['memory', METRIC_PATHS.memory, {}],
    ['cpuLimit', METRIC_PATHS.cpuLimit, {}],
    ['memoryLimit', METRIC_PATHS.memoryLimit, {}],
    ['httpRequests', METRIC_PATHS.httpRequests, {}],
    ['httpLatency', METRIC_PATHS.httpLatency, { quantile: '0.95' }],
    ['bandwidth', METRIC_PATHS.bandwidth, {}],
  ];

  const metrics = {};
  const errors = {};

  await Promise.all(
    keys.map(async ([name, path, extra]) => {
      try {
        const raw = await fetchMetric(path, { ...common, extra });
        metrics[name] = {
          series: normalizeSeries(raw),
          rawHint: Array.isArray(raw) ? `array(${raw.length})` : typeof raw,
        };
      } catch (err) {
        metrics[name] = { series: [], error: err.message };
        errors[name] = err.message;
      }
    })
  );

  return {
    configured: true,
    config: { serviceId: cfg.serviceId },
    range: {
      startTime: common.startTime,
      endTime: common.endTime,
      hours: hoursN,
      resolutionSeconds,
    },
    metrics,
    errors: Object.keys(errors).length ? errors : null,
  };
}

module.exports = {
  getConfig,
  getDashboardMetrics,
  fetchMetric,
  METRIC_PATHS,
};
