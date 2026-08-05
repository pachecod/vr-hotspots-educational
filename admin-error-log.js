async function readAdminJson(res, fallbackLabel) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error(
      res.ok
        ? `${fallbackLabel}: invalid JSON from server`
        : `${fallbackLabel} failed (${res.status})`
    );
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `${fallbackLabel} failed (${res.status})`);
  }
  return data;
}

async function loadErrorLogs() {
  const status = document.getElementById('status');
  const root = document.getElementById('log-root');
  const meta = document.getElementById('list-meta');
  status.textContent = 'Loading…';
  status.className = 'status';

  const level = document.getElementById('filter-level').value;
  const code = document.getElementById('filter-code').value;
  const params = new URLSearchParams({ limit: '200' });
  if (level) params.set('level', level);
  if (code) params.set('code', code);

  try {
    const res = await adminFetch(`/admin/error-logs?${params.toString()}`);
    const data = await readAdminJson(res, 'Error log');
    const logs = data.logs || [];
    meta.textContent = `${logs.length} shown${data.total != null ? ` of ${data.total}` : ''} · times in Eastern Time`;

    if (!logs.length) {
      root.innerHTML = '<div class="empty">No error reports yet.</div>';
      status.textContent = '';
      return;
    }

    root.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Time (ET)</th>
            <th>User</th>
            <th>Level</th>
            <th>Code</th>
            <th>Message</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .map((log) => {
              const levelClass = `level level-${escapeHtml(log.level || 'error')}`;
              const details = log.details ? JSON.stringify(log.details, null, 2) : '';
              return `<tr>
                <td>${escapeHtml(log.timestampEdt || '')}<br><small style="color:#888">${escapeHtml(
                  log.appVersion ? `v${log.appVersion}` : ''
                )}</small></td>
                <td>${escapeHtml(log.userName || 'unknown')}</td>
                <td><span class="${levelClass}">${escapeHtml(log.level || '')}</span></td>
                <td class="code">${escapeHtml(log.code || '')}</td>
                <td class="msg">${escapeHtml(log.message || '')}
                  ${
                    details
                      ? `<details><summary>Details</summary><pre>${escapeHtml(details)}</pre></details>`
                      : ''
                  }
                </td>
                <td><button type="button" class="secondary" data-del="${escapeHtml(
                  log.id
                )}" style="padding:4px 8px;font-size:12px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;">Delete</button></td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;

    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this log entry?')) return;
        try {
          const delRes = await adminFetch(`/admin/error-logs/${btn.dataset.del}`, {
            method: 'DELETE',
          });
          await readAdminJson(delRes, 'Delete');
          await loadErrorLogs();
        } catch (err) {
          status.textContent = err.message || 'Delete failed';
          status.className = 'status err';
        }
      });
    });
    status.textContent = '';
  } catch (err) {
    root.innerHTML = '';
    status.textContent = err.message || 'Failed to load error log';
    status.className = 'status err';
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('errors');

  document.getElementById('refresh-btn').addEventListener('click', loadErrorLogs);
  document.getElementById('filter-level').addEventListener('change', loadErrorLogs);
  document.getElementById('filter-code').addEventListener('change', loadErrorLogs);

  document.getElementById('clear-old-btn').addEventListener('click', async () => {
    if (!confirm('Delete error logs older than 30 days?')) return;
    try {
      const res = await adminFetch('/admin/error-logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ olderThanDays: 30 }),
      });
      await readAdminJson(res, 'Clear');
      await loadErrorLogs();
    } catch (err) {
      document.getElementById('status').textContent = err.message || 'Clear failed';
      document.getElementById('status').className = 'status err';
    }
  });

  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Delete ALL error logs? This cannot be undone.')) return;
    try {
      const res = await adminFetch('/admin/error-logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await readAdminJson(res, 'Clear');
      await loadErrorLogs();
    } catch (err) {
      document.getElementById('status').textContent = err.message || 'Clear failed';
      document.getElementById('status').className = 'status err';
    }
  });

  await loadErrorLogs();
}

requireAdminSession('login-root', initMainApp);
