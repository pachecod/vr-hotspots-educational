function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

function formatChartTime(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (_) {
    return String(ms);
  }
}

function ensureChartTip(box) {
  if (!box) return null;
  let tip = box.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    box.appendChild(tip);
  }
  return tip;
}

function latestSeriesValue(series) {
  if (!series || !series.length) return null;
  const v = Number(series[series.length - 1].value);
  return Number.isFinite(v) ? v : null;
}

function parseTimestampMs(value) {
  if (value == null) return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Cluster errors that fall within ~2% of the chart window (min 10 minutes). */
function clusterErrorMarkers(logs, rangeStartMs, rangeEndMs) {
  const start = Number(rangeStartMs);
  const end = Number(rangeEndMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const span = end - start;
  const clusterMs = Math.max(10 * 60 * 1000, span * 0.02);

  const sorted = (logs || [])
    .map((log) => ({ ...log, t: parseTimestampMs(log.createdAt) }))
    .filter((log) => Number.isFinite(log.t) && log.t >= start && log.t <= end)
    .sort((a, b) => a.t - b.t);

  const clusters = [];
  for (const log of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && log.t - last.t <= clusterMs) {
      last.logs.push(log);
      last.t = Math.round(
        last.logs.reduce((sum, item) => sum + item.t, 0) / last.logs.length
      );
    } else {
      clusters.push({ t: log.t, logs: [log] });
    }
  }
  return clusters;
}

function showErrorClusterDetail(cluster) {
  const el = document.getElementById('error-detail');
  if (!el || !cluster) return;
  const logs = cluster.logs || [];
  const when = formatChartTime(cluster.t);
  el.className = 'error-detail open';
  el.innerHTML = `
    <button type="button" class="close-err" aria-label="Close">&times;</button>
    <h3>${logs.length} reported error${logs.length === 1 ? '' : 's'} near ${escapeHtml(when)}</h3>
    <ul>
      ${logs
        .slice(0, 12)
        .map((log) => {
          const time = log.timestampEdt || formatChartTime(log.t || log.createdAt);
          return `<li>
            <div><span class="code">${escapeHtml(log.code || 'unknown')}</span>
              · ${escapeHtml(time)}
              · ${escapeHtml(log.userName || 'unknown')}</div>
            <div>${escapeHtml(log.message || '')}</div>
          </li>`;
        })
        .join('')}
    </ul>
    ${
      logs.length > 12
        ? `<p class="hint">Showing 12 of ${logs.length}. See <a href="/admin-error-log.html">Error Log</a> for the full list.</p>`
        : `<p class="hint"><a href="/admin-error-log.html">Open Error Log</a></p>`
    }
  `;
  const closeBtn = el.querySelector('.close-err');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      el.className = 'error-detail';
      el.innerHTML = '';
    });
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markerLayout(state, w, h) {
  const pad = state.pad;
  const t0 = state.t0;
  const span = state.span;
  return (state.errorMarkers || [])
    .map((cluster, index) => {
      const x = pad + ((cluster.t - t0) / span) * (w - pad * 2);
      const y = pad + 10;
      return { index, cluster, x, y, hitR: 10 };
    })
    .filter((m) => Number.isFinite(m.x));
}

function paintChart(canvas, hoverIndex = -1, activeMarkerIndex = -1) {
  const state = canvas._chartState;
  if (!state) return;
  const { points, min, max, pad, t0, span, color, formatValue, emptyLabel, maxValue } = state;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const range = Math.max(1e-9, max - min);
  const hasSeries = points.length >= 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#e9ecef';
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(w, h - 0.5);
  ctx.stroke();

  if (!hasSeries) {
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial';
    ctx.fillText(emptyLabel || 'No data in this window', 10, h / 2);
  }

  const yForValue = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const xy = (p) => ({
    x: pad + ((p.t - t0) / span) * (w - pad * 2),
    y: yForValue(p.v),
  });

  if (hasSeries && Number.isFinite(maxValue)) {
    const yMax = yForValue(maxValue);
    ctx.strokeStyle = 'rgba(220, 53, 69, 0.65)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, yMax);
    ctx.lineTo(w - pad, yMax);
    ctx.stroke();
    ctx.setLineDash([]);
    const maxLabel = formatValue ? formatValue(maxValue) : String(maxValue);
    ctx.fillStyle = '#dc3545';
    ctx.font = '10px Arial';
    const maxText = `max ${maxLabel}`;
    const tw = ctx.measureText(maxText).width;
    ctx.fillText(maxText, w - pad - tw, Math.max(pad + 10, yMax - 4));
  }

  if (hasSeries) {
    ctx.strokeStyle = color || '#0d6efd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const { x, y } = xy(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.fillStyle = '#333';
    ctx.font = '11px Arial';
    const label = formatValue ? formatValue(last.v) : String(Math.round(last.v * 100) / 100);
    ctx.fillText(`latest ${label}`, 10, 14);
  }

  if (hasSeries && hoverIndex >= 0 && hoverIndex < points.length) {
    const p = points[hoverIndex];
    const { x, y } = xy(p);
    ctx.strokeStyle = 'rgba(108,117,125,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color || '#0d6efd';
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const markers = markerLayout(state, w, h);
  state._markerLayout = markers;
  for (const marker of markers) {
    const active = marker.index === activeMarkerIndex;
    const size = active ? 8 : 6;
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - size);
    ctx.lineTo(marker.x - size, marker.y + size);
    ctx.lineTo(marker.x + size, marker.y + size);
    ctx.closePath();
    ctx.fillStyle = active ? '#b02a37' : '#dc3545';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (marker.cluster.logs.length > 1) {
      ctx.fillStyle = '#842029';
      ctx.font = '9px Arial';
      ctx.fillText(String(marker.cluster.logs.length), marker.x + size + 1, marker.y + 3);
    }
  }
}

function findMarkerAt(state, canvasX, canvasY) {
  const markers = state._markerLayout || [];
  let best = null;
  let bestDist = Infinity;
  for (const marker of markers) {
    const dx = canvasX - marker.x;
    const dy = canvasY - marker.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= marker.hitR && dist < bestDist) {
      best = marker;
      bestDist = dist;
    }
  }
  return best;
}

function bindChartHover(canvas) {
  if (canvas._chartHoverBound) return;
  canvas._chartHoverBound = true;

  const hideTip = () => {
    const tip = canvas._chartTip;
    if (tip) tip.style.display = 'none';
    if (canvas._chartState) paintChart(canvas, -1, -1);
    canvas.style.cursor = 'crosshair';
  };

  canvas.addEventListener('mousemove', (ev) => {
    const state = canvas._chartState;
    if (!state) {
      hideTip();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    paintChart(canvas, -1, -1);

    const marker = findMarkerAt(state, x, y);
    const tip = ensureChartTip(canvas.parentElement);
    canvas._chartTip = tip;

    if (marker) {
      canvas.style.cursor = 'pointer';
      paintChart(canvas, -1, marker.index);
      if (tip) {
        const count = marker.cluster.logs.length;
        const first = marker.cluster.logs[0];
        tip.innerHTML = `<div class="tip-val">${count} error${count === 1 ? '' : 's'}</div>
          <div class="tip-time">${escapeHtml(formatChartTime(marker.cluster.t))}</div>
          <div class="tip-err">${escapeHtml(first.code || 'error')}: ${escapeHtml(
            (first.message || '').slice(0, 80)
          )}${count > 1 ? '…' : ''}</div>
          <div class="tip-err">Click for details</div>`;
        tip.style.display = 'block';
        const tipW = tip.offsetWidth || 160;
        const tipH = tip.offsetHeight || 48;
        let left = ev.clientX - rect.left + 12;
        let top = ev.clientY - rect.top - tipH - 8;
        if (left + tipW > rect.width - 4) left = ev.clientX - rect.left - tipW - 12;
        if (top < 4) top = ev.clientY - rect.top + 14;
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = `${Math.max(4, top)}px`;
      }
      return;
    }

    canvas.style.cursor = 'crosshair';
    if (state.points.length < 2) {
      if (tip) tip.style.display = 'none';
      return;
    }

    const { points, pad, t0, span } = state;
    const plotW = canvas.width - pad * 2;
    const ratio = Math.max(0, Math.min(1, (x - pad) / plotW));
    const targetT = t0 + ratio * span;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const d = Math.abs(points[i].t - targetT);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }

    paintChart(canvas, best, -1);
    if (!tip) return;
    const p = points[best];
    const valueLabel = state.formatValue
      ? state.formatValue(p.v)
      : String(Math.round(p.v * 100) / 100);
    tip.innerHTML = `<div class="tip-val">${escapeHtml(valueLabel)}</div><div class="tip-time">${escapeHtml(
      formatChartTime(p.t)
    )}</div>`;
    tip.style.display = 'block';

    const tipW = tip.offsetWidth || 120;
    const tipH = tip.offsetHeight || 36;
    let left = ev.clientX - rect.left + 12;
    let top = ev.clientY - rect.top - tipH - 8;
    if (left + tipW > rect.width - 4) left = ev.clientX - rect.left - tipW - 12;
    if (top < 4) top = ev.clientY - rect.top + 14;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  });

  canvas.addEventListener('click', (ev) => {
    const state = canvas._chartState;
    if (!state) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    paintChart(canvas, -1, -1);
    const marker = findMarkerAt(state, x, y);
    if (marker) showErrorClusterDetail(marker.cluster);
  });

  canvas.addEventListener('mouseleave', hideTip);
}

function drawSeries(canvas, series, opts = {}) {
  if (!canvas) return;

  const points = (series || [])
    .map((p) => ({
      t: parseTimestampMs(p.timestamp),
      v: Number(p.value),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));

  const maxValue =
    opts.maxValue != null && Number.isFinite(Number(opts.maxValue)) ? Number(opts.maxValue) : null;

  let min = points.length ? Math.min(...points.map((p) => p.v)) : 0;
  let max = points.length ? Math.max(...points.map((p) => p.v)) : 1;
  if (maxValue != null) {
    // Capacity charts: show headroom from 0 up through the plan limit.
    min = Math.min(0, min);
    max = Math.max(max, maxValue);
  } else if (min === max) {
    min = min * 0.9;
    max = max * 1.1 || 1;
  }
  const pad = 8;
  const rangeStart = parseTimestampMs(opts.rangeStart);
  const rangeEnd = parseTimestampMs(opts.rangeEnd);
  const t0 = Number.isFinite(rangeStart)
    ? rangeStart
    : points.length
      ? points[0].t
      : Date.now() - 24 * 3600 * 1000;
  const t1 = Number.isFinite(rangeEnd)
    ? rangeEnd
    : points.length
      ? points[points.length - 1].t
      : Date.now();
  const span = Math.max(1, t1 - t0);
  const errorMarkers = Array.isArray(opts.errorMarkers)
    ? opts.errorMarkers
    : clusterErrorMarkers(opts.errors || [], t0, t1);

  canvas._chartState = {
    points,
    min,
    max,
    pad,
    t0,
    span,
    color: opts.color || '#0d6efd',
    formatValue: opts.formatValue,
    emptyLabel: opts.emptyLabel,
    maxValue,
    errorMarkers,
  };

  bindChartHover(canvas);
  paintChart(canvas, -1, -1);
}

function seriesFromHistory(rows, pick) {
  return (rows || []).map((r) => ({
    timestamp: r.capturedAt || r.day,
    value: pick(r),
  }));
}

/** Shared X-axis window for every Usage chart (prefer server `window`, else Render). */
function getSharedChartRange(data) {
  const w = data?.window || {};
  let start = parseTimestampMs(w.startTime);
  let end = parseTimestampMs(w.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    start = parseTimestampMs(data?.render?.range?.startTime);
    end = parseTimestampMs(data?.render?.range?.endTime);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    const hours = Number(document.getElementById('window')?.value) || 168;
    end = Date.now();
    start = end - hours * 3600 * 1000;
  }
  return {
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
    hours: w.hours || data?.render?.range?.hours || null,
    days: w.days || data?.analytics?.range?.days || null,
  };
}

function formatWindowLabel(hours, days) {
  const h = Number(hours);
  if (Number.isFinite(h) && h < 48) return `last ${h} hours`;
  const d = Number(days) || (Number.isFinite(h) ? Math.ceil(h / 24) : null);
  if (d === 1) return 'last 24 hours';
  if (d) return `last ${d} days`;
  return 'selected window';
}

function capacityBarHtml(cap) {
  if (!cap || !(cap.max > 0) || !Number.isFinite(cap.used)) return '';
  const pct = Math.max(0, Math.min(100, (Number(cap.used) / Number(cap.max)) * 100));
  const tone = pct >= 90 ? 'crit' : pct >= 75 ? 'warn' : '';
  const usedLabel = cap.format ? cap.format(cap.used) : formatNum(cap.used);
  const maxLabel = cap.format ? cap.format(cap.max) : formatNum(cap.max);
  return `<div class="cap" title="${escapeHtml(usedLabel)} of ${escapeHtml(maxLabel)}">
      <div class="cap-track">
        <div class="cap-fill ${tone}" style="width:${pct.toFixed(2)}%"></div>
      </div>
      <div class="cap-meta">
        <span>${escapeHtml(pct.toFixed(1))}% used</span>
        <span>${escapeHtml(maxLabel)} cap</span>
      </div>
    </div>`;
}

function renderStats(data) {
  const grid = document.getElementById('stat-grid');
  const latest = data.storage?.latest || [];
  const b2Total = latest.find((r) => r.source === 'b2' && r.scope === 'total');
  const b2Students = latest.find((r) => r.source === 'b2' && r.scope === 'student-projects');
  const b2Hosted = latest.find((r) => r.source === 'b2' && r.scope === 'hosted-projects');
  const hostedLive = data.storage?.hostedLive;
  const cpuSeries = data.render?.metrics?.cpu?.series || [];
  const memSeries = data.render?.metrics?.memory?.series || [];
  const lastCpu = cpuSeries.length ? cpuSeries[cpuSeries.length - 1].value : null;
  const lastMem = memSeries.length ? memSeries[memSeries.length - 1].value : null;
  const cpuLimit = latestSeriesValue(data.render?.metrics?.cpuLimit?.series);
  const memoryLimit = latestSeriesValue(data.render?.metrics?.memoryLimit?.series);
  const maxB2 = data.storage?.limits?.b2MaxBytes || null;

  const cards = [
    {
      label: 'B2 total',
      value: b2Total ? formatBytes(b2Total.byteSize) : '—',
      sub: b2Total ? `${formatNum(b2Total.fileCount)} files` : 'Run a scan',
      capacity:
        b2Total && maxB2
          ? { used: Number(b2Total.byteSize) || 0, max: maxB2, format: formatBytes }
          : null,
    },
    {
      label: 'B2 student projects',
      value: b2Students ? formatBytes(b2Students.byteSize) : '—',
      sub: b2Students ? `${formatNum(b2Students.fileCount)} files` : '',
    },
    {
      label: 'B2 hosted projects',
      value: b2Hosted ? formatBytes(b2Hosted.byteSize) : '—',
      sub: b2Hosted ? `${formatNum(b2Hosted.fileCount)} files` : '',
    },
    {
      label: 'Hosted disk (instance)',
      value: hostedLive ? formatBytes(hostedLive.byteSize) : '—',
      sub: hostedLive ? `${formatNum(hostedLive.fileCount)} files` : '',
    },
    {
      label: 'Uploads (period)',
      value: formatBytes(data.uploads?.totalBytes),
      sub: `${formatNum(data.uploads?.totalEvents)} tracked saves`,
    },
    {
      label: 'GA users (last day)',
      value:
        data.analytics?.lastDayActiveUsers != null
          ? formatNum(data.analytics.lastDayActiveUsers)
          : '—',
      sub:
        data.analytics?.realtimeActiveUsers != null
          ? `${formatNum(data.analytics.realtimeActiveUsers)} active now`
          : data.analytics?.configured
            ? 'GA4 daily active users'
            : 'GA4 not configured',
    },
    {
      label: 'GA page views (period)',
      value: data.analytics?.totals?.pageViews != null ? formatNum(data.analytics.totals.pageViews) : '—',
      sub: data.analytics?.configured
        ? `${formatNum(data.analytics.totals?.sessions || 0)} sessions`
        : 'GA4 not configured',
    },
    {
      label: 'CPU (latest)',
      value: lastCpu == null ? '—' : `${(Number(lastCpu) * 100).toFixed(1)}%`,
      sub: data.render?.configured ? 'Render metric' : 'Render not configured',
      capacity:
        lastCpu != null && cpuLimit != null && cpuLimit > 0
          ? {
              used: Number(lastCpu),
              max: Number(cpuLimit),
              format: (v) => `${(Number(v) * 100).toFixed(1)}%`,
            }
          : null,
    },
    {
      label: 'Memory (latest)',
      value: lastMem == null ? '—' : formatBytes(lastMem),
      sub: data.render?.configured ? 'Render metric' : 'Render not configured',
      capacity:
        lastMem != null && memoryLimit != null && memoryLimit > 0
          ? { used: Number(lastMem), max: Number(memoryLimit), format: formatBytes }
          : null,
    },
    {
      label: 'Heap (this process)',
      value: data.memory ? `${data.memory.memory.heapUsedMB} MB` : '—',
      sub: data.memory ? `RSS ${data.memory.memory.rssMB} MB` : '',
    },
  ];

  grid.innerHTML = cards
    .map(
      (c) => `<div class="stat">
        <div class="label">${escapeHtml(c.label)}</div>
        <div class="value">${escapeHtml(c.value)}</div>
        <div class="sub">${escapeHtml(c.sub || '')}</div>
        ${capacityBarHtml(c.capacity)}
      </div>`
    )
    .join('');
}

function renderConfigWarn(data) {
  const el = document.getElementById('config-warn');
  const bits = [];
  if (!data.dbEnabled) {
    bits.push('DATABASE_URL is not set — storage history and upload tracking will not persist.');
  }
  const cfg = data.renderConfig || {};
  if (!cfg.configured) {
    const missing = [];
    if (!cfg.apiKeyConfigured) missing.push('RENDER_API_KEY');
    if (!cfg.serviceIdConfigured) missing.push('RENDER_SERVICE_ID');
    bits.push(
      `Render charts need ${missing.join(' and ')}. Create an API key in the Render dashboard and set it on the service. On Render, RENDER_SERVICE_ID is usually set automatically.`
    );
  }
  const ga = data.analyticsConfig || {};
  if (!ga.configured) {
    const missing = [];
    if (!ga.propertyIdConfigured) missing.push('GA4_PROPERTY_ID');
    if (!ga.credentialsConfigured) missing.push('GA4_SERVICE_ACCOUNT_JSON');
    if (!ga.libraryAvailable) missing.push('@google-analytics/data (npm install)');
    if (ga.credentialsError) {
      bits.push(`Google Analytics credentials error: ${ga.credentialsError}`);
    } else {
      bits.push(
        `Google Analytics charts need ${missing.join(
          ' and '
        )}. Create a GCP service account, enable the Analytics Data API, and add the service account as a Viewer on your GA4 property.`
      );
    }
  }
  if (!bits.length) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = bits.map((b) => escapeHtml(b)).join('<br>');
}

function renderAnalyticsCharts(data, sharedRange) {
  const meta = document.getElementById('analytics-meta');
  const root = document.getElementById('analytics-charts');
  const pagesEl = document.getElementById('analytics-pages');
  if (!meta || !root) return;

  if (!data.analytics?.configured) {
    meta.textContent =
      'Google Analytics unavailable until GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON are configured.';
    root.innerHTML = '';
    if (pagesEl) pagesEl.innerHTML = '';
    return;
  }

  if (data.analytics.error) {
    meta.innerHTML = `<span style="color:#dc3545">${escapeHtml(data.analytics.error)}</span>`;
    root.innerHTML = '';
    if (pagesEl) pagesEl.innerHTML = '';
    return;
  }

  const range = data.analytics.range || {};
  meta.textContent = `Property ${data.analytics.config?.propertyId || ''}${
    data.analytics.config?.measurementId ? ` · ${data.analytics.config.measurementId}` : ''
  } · ${formatWindowLabel(sharedRange.hours, range.days || sharedRange.days)} · daily buckets${
    data.analytics.realtimeActiveUsers != null
      ? ` · ${formatNum(data.analytics.realtimeActiveUsers)} active now`
      : ''
  }`;

  const charts = [
    {
      key: 'activeUsers',
      title: 'Active users (daily)',
      formatValue: (v) => formatNum(v),
      color: '#0d6efd',
    },
    {
      key: 'sessions',
      title: 'Sessions (daily)',
      formatValue: (v) => formatNum(v),
      color: '#198754',
    },
    {
      key: 'pageViews',
      title: 'Page views (daily)',
      formatValue: (v) => formatNum(v),
      color: '#fd7e14',
    },
  ];

  root.innerHTML = charts
    .map(
      (c) => `<div class="chart-box">
        <h3>${escapeHtml(c.title)}</h3>
        <canvas id="chart-ga-${c.key}" width="900" height="120"></canvas>
      </div>`
    )
    .join('');

  for (const c of charts) {
    drawSeries(
      document.getElementById(`chart-ga-${c.key}`),
      data.analytics.metrics?.[c.key]?.series || [],
      {
        color: c.color,
        formatValue: c.formatValue,
        emptyLabel: 'No GA4 data in this window',
        rangeStart: sharedRange.rangeStart,
        rangeEnd: sharedRange.rangeEnd,
      }
    );
  }

  if (pagesEl) {
    const pages = data.analytics.topPages || [];
    if (!pages.length) {
      pagesEl.innerHTML = '<div class="empty">No top pages yet.</div>';
    } else {
      pagesEl.innerHTML = `
        <table>
          <thead><tr><th>Path</th><th>Views</th><th>Users</th></tr></thead>
          <tbody>
            ${pages
              .map(
                (p) => `<tr>
                  <td class="code">${escapeHtml(p.path)}</td>
                  <td>${escapeHtml(formatNum(p.pageViews))}</td>
                  <td>${escapeHtml(formatNum(p.activeUsers))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <p class="hint" style="margin:8px 0 0">${escapeHtml(
          data.analytics.note || ''
        )}</p>`;
    }
  }
}

function renderRenderCharts(data, sharedRange) {
  const meta = document.getElementById('render-meta');
  const root = document.getElementById('render-charts');
  const hint = document.getElementById('error-markers-hint');
  const legend = document.getElementById('render-legend');
  const detail = document.getElementById('error-detail');
  if (detail) {
    detail.className = 'error-detail';
    detail.innerHTML = '';
  }
  if (!data.render?.configured) {
    meta.textContent = 'Render metrics unavailable until API key + service id are configured.';
    root.innerHTML = '';
    if (hint) hint.style.display = 'none';
    if (legend) legend.style.display = 'none';
    return;
  }
  if (legend) legend.style.display = 'flex';
  const range = data.render.range || {};
  const errorInfo = data.errors || { logs: [], total: 0 };
  meta.textContent = `Service ${data.render.config?.serviceId || ''} · ${formatWindowLabel(
    range.hours || sharedRange.hours,
    sharedRange.days
  )} · resolution ${range.resolutionSeconds || '?'}s${
    errorInfo.total
      ? ` · ${errorInfo.total} error${errorInfo.total === 1 ? '' : 's'} in window${
          errorInfo.truncated ? ' (showing first 200)' : ''
        }`
      : ''
  }`;
  if (hint) {
    hint.style.display = errorInfo.total ? 'block' : 'none';
  }

  const metrics = data.render.metrics || {};
  const cpuLimit = latestSeriesValue(metrics.cpuLimit?.series);
  const memoryLimit = latestSeriesValue(metrics.memoryLimit?.series);
  const rangeStart = sharedRange.rangeStart;
  const rangeEnd = sharedRange.rangeEnd;
  const errorMarkers = clusterErrorMarkers(
    errorInfo.logs || [],
    parseTimestampMs(rangeStart),
    parseTimestampMs(rangeEnd)
  );

  const charts = [
    {
      key: 'cpu',
      title: 'CPU usage',
      formatValue: (v) => `${(Number(v) * 100).toFixed(1)}%`,
      color: '#0d6efd',
      maxValue: cpuLimit,
      showErrors: true,
    },
    {
      key: 'memory',
      title: 'Memory usage',
      formatValue: (v) => formatBytes(v),
      color: '#6610f2',
      maxValue: memoryLimit,
      showErrors: true,
    },
    {
      key: 'httpRequests',
      title: 'HTTP requests',
      formatValue: (v) => formatNum(v),
      color: '#198754',
      showErrors: true,
    },
    {
      key: 'httpLatency',
      title: 'HTTP latency p95',
      formatValue: (v) => `${Math.round(Number(v))} ms`,
      color: '#fd7e14',
      showErrors: true,
    },
    {
      key: 'bandwidth',
      title: 'Bandwidth',
      formatValue: (v) => formatBytes(v),
      color: '#20c997',
      showErrors: true,
    },
  ];

  root.innerHTML = charts
    .map(
      (c) => `<div class="chart-box">
        <h3>${escapeHtml(c.title)}${
          metrics[c.key]?.error
            ? ` <span style="color:#dc3545">(${escapeHtml(metrics[c.key].error)})</span>`
            : ''
        }</h3>
        <canvas id="chart-${c.key}" width="900" height="120"></canvas>
      </div>`
    )
    .join('');

  for (const c of charts) {
    drawSeries(document.getElementById(`chart-${c.key}`), metrics[c.key]?.series, {
      color: c.color,
      formatValue: c.formatValue,
      emptyLabel: metrics[c.key]?.error || 'No data',
      maxValue: c.maxValue,
      rangeStart,
      rangeEnd,
      errorMarkers: c.showErrors ? errorMarkers : [],
    });
  }
}

function renderStorageLatest(data) {
  const el = document.getElementById('storage-latest');
  const latest = data.storage?.latest || [];
  const b2 = latest.filter((r) => r.source === 'b2').sort((a, b) => b.byteSize - a.byteSize);
  if (!b2.length) {
    el.innerHTML =
      '<div class="empty">No snapshots yet. Click <strong>Scan storage now</strong> to inventory B2 (may take a minute on large buckets).</div>';
    return;
  }
  const captured = b2[0]?.capturedAt ? new Date(b2[0].capturedAt).toLocaleString() : '';
  el.innerHTML = `
    <p class="hint" style="margin-top:0">Snapshot: ${escapeHtml(captured)}
      ${
        data.job?.lastRun
          ? ` · last job ${escapeHtml(data.job.lastRun.reason || '')} ${
              data.job.lastRun.ok ? 'ok' : 'error'
            }`
          : ''
      }
    </p>
    <table>
      <thead><tr><th>Scope</th><th>Size</th><th>Files</th></tr></thead>
      <tbody>
        ${b2
          .map(
            (r) => `<tr>
              <td class="code">${escapeHtml(r.scope)}</td>
              <td>${escapeHtml(formatBytes(r.byteSize))}</td>
              <td>${escapeHtml(formatNum(r.fileCount))}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderMemory(data) {
  const el = document.getElementById('memory-panel');
  const m = data.memory;
  if (!m) {
    el.innerHTML = '<div class="empty">Unavailable</div>';
    return;
  }
  el.innerHTML = `
    <div class="grid">
      <div class="stat"><div class="label">Heap used</div><div class="value">${m.memory.heapUsedMB} MB</div></div>
      <div class="stat"><div class="label">RSS</div><div class="value">${m.memory.rssMB} MB</div></div>
      <div class="stat"><div class="label">System free</div><div class="value">${m.system.freeMB} MB</div>
        <div class="sub">of ${m.system.totalMB} MB</div></div>
      <div class="stat"><div class="label">Uptime</div><div class="value">${Math.round(m.uptimeSec / 60)} min</div>
        <div class="sub">pid ${m.pid} · Node ${escapeHtml(m.node)}</div></div>
      <div class="stat"><div class="label">Load avg</div><div class="value">${
        Array.isArray(m.system.loadavg)
          ? m.system.loadavg.map((x) => Number(x).toFixed(2)).join(' / ')
          : '—'
      }</div></div>
    </div>`;
}

function renderRecent(data) {
  const el = document.getElementById('recent-uploads');
  const rows = data.recentUploads || [];
  if (!rows.length) {
    el.innerHTML =
      '<div class="empty">No tracked uploads yet. New draft/submit cloud saves will appear here with byte sizes.</div>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>When</th><th>Kind</th><th>Size</th><th>Class</th><th>Project</th><th>File</th></tr></thead>
    <tbody>
      ${rows
        .map((r) => {
          const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
          return `<tr>
            <td>${escapeHtml(when)}</td>
            <td>${escapeHtml(r.kind)}</td>
            <td>${escapeHtml(formatBytes(r.byteSize))}</td>
            <td class="code">${escapeHtml(r.classSlug || '')}</td>
            <td>${escapeHtml(r.projectName || '')}</td>
            <td class="code">${escapeHtml(r.fileName || '')}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>`;
}

async function readJsonResponse(res, fallbackLabel) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    const snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      res.ok
        ? `${fallbackLabel}: invalid JSON from server`
        : `${fallbackLabel} failed (${res.status}). Restart the local server so Usage routes are loaded.${
            snippet ? ` Response: ${snippet}` : ''
          }`
    );
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `${fallbackLabel} failed (${res.status})`);
  }
  return data;
}

async function loadUsage() {
  const status = document.getElementById('status');
  status.textContent = 'Loading…';
  status.className = 'status';
  const hours = Number(document.getElementById('window').value) || 168;
  const days = Math.max(1, Math.ceil(hours / 24));
  try {
    const res = await adminFetch(`/admin/usage/overview?hours=${hours}&days=${days}`);
    const data = await readJsonResponse(res, 'Usage overview');
    const sharedRange = getSharedChartRange(data);

    const windowMeta = document.getElementById('window-meta');
    if (windowMeta) {
      const startLabel = formatChartTime(parseTimestampMs(sharedRange.rangeStart));
      const endLabel = formatChartTime(parseTimestampMs(sharedRange.rangeEnd));
      windowMeta.textContent = `Aligned window: ${formatWindowLabel(
        sharedRange.hours || hours,
        sharedRange.days || days
      )} (${startLabel} → ${endLabel})`;
    }

    renderConfigWarn(data);
    renderStats(data);
    renderAnalyticsCharts(data, sharedRange);
    renderRenderCharts(data, sharedRange);
    renderStorageLatest(data);
    renderMemory(data);
    renderRecent(data);

    drawSeries(
      document.getElementById('chart-b2-growth'),
      seriesFromHistory(data.storage?.historyB2Total || [], (r) => Number(r.byteSize) || 0),
      {
        color: '#0d6efd',
        formatValue: formatBytes,
        emptyLabel: 'No B2 snapshots yet',
        maxValue: data.storage?.limits?.b2MaxBytes || null,
        rangeStart: sharedRange.rangeStart,
        rangeEnd: sharedRange.rangeEnd,
      }
    );
    drawSeries(
      document.getElementById('chart-uploads'),
      seriesFromHistory(data.uploads?.byDay || [], (r) => Number(r.byteSize) || 0),
      {
        color: '#198754',
        formatValue: formatBytes,
        emptyLabel: 'No upload events yet',
        rangeStart: sharedRange.rangeStart,
        rangeEnd: sharedRange.rangeEnd,
      }
    );

    status.textContent = 'Updated';
    status.className = 'status ok';
  } catch (err) {
    status.textContent = err.message || 'Error';
    status.className = 'status err';
  }
}

async function scanNow() {
  const btn = document.getElementById('btn-scan');
  const status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Scanning B2 (this can take a while)…';
  status.className = 'status';
  try {
    const res = await adminFetch('/admin/usage/scan-now', { method: 'POST' });
    const data = await readJsonResponse(res, 'Storage scan');
    status.textContent = data.result?.ok === false
      ? `Scan finished with issues: ${data.result.error || data.message || ''}`
      : 'Scan complete';
    status.className = data.result?.ok === false ? 'status err' : 'status ok';
    await loadUsage();
  } catch (err) {
    status.textContent = err.message || 'Scan failed';
    status.className = 'status err';
  } finally {
    btn.disabled = false;
  }
}

function isChartsOnlyView() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'charts';
}

function setChartsOnlyView(on) {
  const app = document.getElementById('usage-app');
  const btn = document.getElementById('btn-charts-only');
  if (!app) return;
  app.classList.toggle('charts-only', Boolean(on));
  if (btn) {
    btn.classList.toggle('active', Boolean(on));
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Full view' : 'Charts only';
  }
  const url = new URL(window.location.href);
  if (on) url.searchParams.set('view', 'charts');
  else url.searchParams.delete('view');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

function initMainApp() {
  document.getElementById('usage-app').style.display = 'block';
  document.getElementById('btn-refresh').addEventListener('click', loadUsage);
  document.getElementById('btn-scan').addEventListener('click', scanNow);
  document.getElementById('window').addEventListener('change', loadUsage);
  const chartsBtn = document.getElementById('btn-charts-only');
  if (chartsBtn) {
    chartsBtn.addEventListener('click', () => {
      setChartsOnlyView(!document.getElementById('usage-app').classList.contains('charts-only'));
    });
  }
  setChartsOnlyView(isChartsOnlyView());
  loadUsage();
}

requireAdminSession('login-root', initMainApp);
