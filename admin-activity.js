var escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
  ? window.escapeHtml
  : function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
const ALL_PAGE_LIMIT = 5000;

let authPage = 0;
let uploadsPage = 0;
let lastAuthTotal = 0;
let lastUploadsTotal = 0;


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

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return String(iso || '');
  }
}

function studentLabel(row) {
  if (row.studentDisplayName || row.displayName) {
    const name = row.studentDisplayName || row.displayName;
    const user = row.studentUsername || row.username;
    return user ? `${name} (${user})` : name;
  }
  if (row.studentUsername || row.username) return row.studentUsername || row.username;
  if (row.studentId) return String(row.studentId).slice(0, 8);
  return '—';
}

function badge(kind, cls) {
  return `<span class="badge ${cls}">${escapeHtml(kind)}</span>`;
}

async function readJsonResponse(res, fallbackLabel) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error(
      res.ok
        ? `${fallbackLabel}: invalid JSON`
        : `${fallbackLabel} failed (${res.status}). Restart the local server if routes are missing.`
    );
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `${fallbackLabel} failed (${res.status})`);
  }
  return data;
}

function currentTab() {
  const active = document.querySelector('.toolbar button.tab.active');
  return (active && active.dataset.tab) || 'all';
}

function pageSizeValue() {
  const raw = document.getElementById('page-size')?.value || '50';
  if (raw === 'all') return 'all';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

function effectiveLimit() {
  const size = pageSizeValue();
  return size === 'all' ? ALL_PAGE_LIMIT : size;
}

function resetPages() {
  authPage = 0;
  uploadsPage = 0;
}

function updateSectionVisibility(tab) {
  const auth = document.getElementById('section-auth');
  const uploads = document.getElementById('section-uploads');
  const kindWrap = document.getElementById('kind-wrap');
  const showAuth = tab === 'all' || tab === 'logins' || tab === 'logouts';
  const showUploads = tab === 'all' || tab === 'uploads';
  auth.classList.toggle('visible', showAuth);
  uploads.classList.toggle('visible', showUploads);
  kindWrap.style.display = tab === 'uploads' ? '' : 'none';
}

function pageCount(total, limit) {
  if (!total) return 1;
  if (pageSizeValue() === 'all') return 1;
  return Math.max(1, Math.ceil(total / limit));
}

function renderPager(ids, { total, page, limit, which }) {
  const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!nodes.length) return;

  const size = pageSizeValue();
  if (!total || size === 'all' || total <= limit) {
    const label =
      total > 0
        ? size === 'all'
          ? `Showing all ${total}`
          : `Showing ${total}`
        : '';
    nodes.forEach((el) => {
      if (!label) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
      }
      el.style.display = 'flex';
      el.innerHTML = `<span class="pager-range">${escapeHtml(label)}</span>`;
    });
    return;
  }

  const pages = pageCount(total, limit);
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const start = safePage * limit + 1;
  const end = Math.min(total, (safePage + 1) * limit);
  const html = `
    <button type="button" class="pager-prev" data-which="${which}" ${
      safePage <= 0 ? 'disabled' : ''
    }>Previous</button>
    <span class="pager-range">Showing ${start}–${end} of ${total} · Page ${
      safePage + 1
    } of ${pages}</span>
    <button type="button" class="pager-next" data-which="${which}" ${
      safePage >= pages - 1 ? 'disabled' : ''
    }>Next</button>
  `;
  nodes.forEach((el) => {
    el.style.display = 'flex';
    el.innerHTML = html;
    el.querySelectorAll('.pager-prev').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (which === 'auth') authPage = Math.max(0, authPage - 1);
        else uploadsPage = Math.max(0, uploadsPage - 1);
        loadActivity({ preservePage: true });
      });
    });
    el.querySelectorAll('.pager-next').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (which === 'auth') authPage += 1;
        else uploadsPage += 1;
        loadActivity({ preservePage: true });
      });
    });
  });
}

function renderAuthTable(events) {
  const el = document.getElementById('auth-table');
  if (!events.length) {
    el.innerHTML = '<div class="empty">No login/logout events in this window.</div>';
    return;
  }
  el.innerHTML = `<table>
    <thead>
      <tr>
        <th>When</th>
        <th>Event</th>
        <th>Role</th>
        <th>Student</th>
        <th>Class</th>
      </tr>
    </thead>
    <tbody>
      ${events
        .map((e) => {
          const cls = e.event === 'login' ? 'badge-login' : 'badge-logout';
          return `<tr>
            <td>${escapeHtml(formatWhen(e.createdAt))}</td>
            <td>${badge(e.event, cls)}</td>
            <td>${escapeHtml(e.role || '')}</td>
            <td>${escapeHtml(e.role === 'admin' ? '—' : studentLabel(e))}</td>
            <td class="code">${escapeHtml(e.classSlug || '')}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>`;
}

function canDownloadUpload(u) {
  return !!(u && u.id && u.b2Path && u.fileName);
}

function downloadLabel(u) {
  const name = String(u.fileName || '');
  if (/\.zip$/i.test(name) || u.kind === 'draft' || u.kind === 'submitted') {
    return 'Download ZIP';
  }
  return 'Download';
}

function downloadCell(u) {
  if (!canDownloadUpload(u)) {
    return `<span title="No cloud path stored for this event">—</span>`;
  }
  return `<button type="button" class="dl-btn dl-upload" data-id="${escapeHtml(
    u.id
  )}" data-name="${escapeHtml(u.fileName)}" title="Download ${escapeHtml(
    u.fileName
  )} from cloud storage">${escapeHtml(downloadLabel(u))}</button>`;
}

async function downloadUploadEvent(id, fileName) {
  try {
    const response = await adminFetch(`/admin/activity/uploads/${encodeURIComponent(id)}/download`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Download failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download.bin';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + (err.message || 'unknown error'));
  }
}

function bindDownloadButtons(root) {
  if (!root) return;
  root.querySelectorAll('button.dl-upload').forEach((btn) => {
    btn.addEventListener('click', () => {
      downloadUploadEvent(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
    });
  });
}

function renderUploadsTable(events) {
  const el = document.getElementById('uploads-table');
  if (!events.length) {
    el.innerHTML = '<div class="empty">No upload events in this window.</div>';
    return;
  }
  const downloadable = events.filter(canDownloadUpload).length;
  el.innerHTML = `<p class="meta" style="margin:0 0 8px">${downloadable} of ${
    events.length
  } shown can be downloaded from cloud storage.</p>
  <table>
    <thead>
      <tr>
        <th>When</th>
        <th>Kind</th>
        <th>Student</th>
        <th>Class</th>
        <th>Project / package</th>
        <th>File</th>
        <th>Size</th>
        <th>Download</th>
      </tr>
    </thead>
    <tbody>
      ${events
        .map((u) => {
          const kindCls =
            u.kind === 'submitted'
              ? 'badge-submitted'
              : u.kind === 'asset'
                ? 'badge-asset'
                : 'badge-draft';
          return `<tr>
            <td>${escapeHtml(formatWhen(u.createdAt))}</td>
            <td>${badge(u.kind || 'other', kindCls)}</td>
            <td>${escapeHtml(studentLabel(u))}</td>
            <td class="code">${escapeHtml(u.classSlug || '')}</td>
            <td>${escapeHtml(u.projectName || '')}</td>
            <td class="code">${escapeHtml(u.fileName || '—')}</td>
            <td>${escapeHtml(formatBytes(u.byteSize))}</td>
            <td>${downloadCell(u)}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>`;
  bindDownloadButtons(el);
}

function clampPages(limit) {
  const authPages = pageCount(lastAuthTotal, limit);
  const uploadPages = pageCount(lastUploadsTotal, limit);
  if (authPage >= authPages) authPage = Math.max(0, authPages - 1);
  if (uploadsPage >= uploadPages) uploadsPage = Math.max(0, uploadPages - 1);
}

async function loadActivity(options = {}) {
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');
  const dbWarn = document.getElementById('db-warn');
  status.textContent = 'Loading…';
  status.className = 'status';
  const days = document.getElementById('days').value;
  const tab = currentTab();
  const kind = document.getElementById('kind').value;
  const limit = effectiveLimit();
  if (!options.preservePage) resetPages();
  updateSectionVisibility(tab);

  try {
    clampPages(limit);
    const qs = new URLSearchParams({
      days,
      tab,
      limit: String(limit),
      authOffset: String(authPage * (pageSizeValue() === 'all' ? 0 : limit)),
      uploadsOffset: String(uploadsPage * (pageSizeValue() === 'all' ? 0 : limit)),
    });
    if (tab === 'uploads' && kind) qs.set('kind', kind);
    const res = await adminFetch(`/admin/activity/overview?${qs.toString()}`);
    const data = await readJsonResponse(res, 'Activity');

    dbWarn.style.display = data.dbEnabled === false ? 'block' : 'none';
    lastAuthTotal = data.auth?.total || 0;
    lastUploadsTotal = data.uploads?.total || 0;
    clampPages(limit);

    const sizeLabel = pageSizeValue() === 'all' ? 'all rows' : `${limit} per page`;
    meta.textContent = `Showing last ${data.days} day(s) · ${sizeLabel} · ${lastAuthTotal} auth event(s) · ${lastUploadsTotal} upload event(s)`;

    renderAuthTable(data.auth?.events || []);
    renderUploadsTable(data.uploads?.events || []);
    renderPager(['auth-pager', 'auth-pager-bottom'], {
      total: lastAuthTotal,
      page: authPage,
      limit,
      which: 'auth',
    });
    renderPager(['uploads-pager', 'uploads-pager-bottom'], {
      total: lastUploadsTotal,
      page: uploadsPage,
      limit,
      which: 'uploads',
    });

    status.textContent = 'Updated';
    status.className = 'status ok';
  } catch (err) {
    status.textContent = err.message || 'Error';
    status.className = 'status err';
  }
}

function initMainApp() {
  document.getElementById('activity-app').style.display = 'block';
  document.getElementById('btn-refresh').addEventListener('click', () => loadActivity());
  document.getElementById('days').addEventListener('change', () => loadActivity());
  document.getElementById('kind').addEventListener('change', () => loadActivity());
  document.getElementById('page-size').addEventListener('change', () => loadActivity());
  document.querySelectorAll('.toolbar button.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toolbar button.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadActivity();
    });
  });
  // Default to Uploads so ZIP downloads are front and center for classroom ops.
  const uploadsTab = document.querySelector('.toolbar button.tab[data-tab="uploads"]');
  if (uploadsTab) {
    document.querySelectorAll('.toolbar button.tab').forEach((b) => b.classList.remove('active'));
    uploadsTab.classList.add('active');
  }
  loadActivity();
}

requireAdminSession('login-root', initMainApp);
