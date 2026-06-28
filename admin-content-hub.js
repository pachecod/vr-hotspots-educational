let pendingDelete = null;
const expandedProjects = new Set();
let contentItems = [];

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeLabel(type) {
  const labels = {
    project: 'VR Project',
    flat_page: 'Flat Page',
    vr_tour: 'VR Tour',
    asset: 'Asset',
    orphan_asset: 'Orphaned Asset',
    legacy_submission: 'Legacy B2',
    hosted_submission: 'Hosted',
  };
  return labels[type] || type;
}

function formatLinks(links) {
  if (!links) return '—';
  const parts = [];
  if (links.tourUrl) parts.push(`<a href="${escapeHtml(links.tourUrl)}" target="_blank" rel="noopener">Tour</a>`);
  if (links.flatUrl) parts.push(`<a href="${escapeHtml(links.flatUrl)}" target="_blank" rel="noopener">Flat</a>`);
  if (links.previewUrl) parts.push(`<a href="${escapeHtml(links.previewUrl)}" target="_blank" rel="noopener">Preview</a>`);
  if (links.downloadUrl) parts.push(`<a href="${escapeHtml(links.downloadUrl)}" target="_blank" rel="noopener">Download</a>`);
  if (links.qrUrl) parts.push(`<a href="${escapeHtml(links.qrUrl)}" target="_blank" rel="noopener">QR</a>`);
  return parts.length ? `<div class="links">${parts.join(' ')}</div>` : '—';
}

function buildQueryParams() {
  const params = new URLSearchParams();
  const classId = document.getElementById('filter-class')?.value;
  const studentId = document.getElementById('filter-student')?.value;
  const type = document.getElementById('filter-type')?.value;
  const orphaned = document.getElementById('filter-orphaned')?.checked;
  const q = document.getElementById('filter-q')?.value?.trim();
  if (classId) params.set('classId', classId);
  if (studentId) params.set('studentId', studentId);
  if (type) params.set('type', type);
  if (orphaned) params.set('orphaned', '1');
  if (q) params.set('q', q);
  return params;
}

async function loadSummary() {
  const params = buildQueryParams();
  const res = await adminFetch('/admin/content/summary?' + params.toString());
  const data = await res.json();
  if (!data.success) return;
  const chips = document.getElementById('summary-chips');
  const s = data.summary || {};
  chips.innerHTML = [
    `<span class="chip"><strong>${s.total || 0}</strong> total</span>`,
    `<span class="chip">${s.project || 0} projects</span>`,
    `<span class="chip">${s.flat_page || 0} flat pages</span>`,
    `<span class="chip">${s.vr_tour || 0} VR tours</span>`,
    `<span class="chip">${s.asset || 0} assets</span>`,
    `<span class="chip">${s.orphan_asset || 0} orphaned</span>`,
    `<span class="chip">${s.legacy_submission || 0} legacy B2</span>`,
  ].join('');
}

async function loadContent() {
  const container = document.getElementById('content-list');
  container.textContent = 'Loading…';
  try {
    const params = buildQueryParams();
    params.set('limit', '100');
    const res = await adminFetch('/admin/content?' + params.toString());
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Load failed');

    await loadSummary();

    if (!data.items?.length) {
      container.innerHTML = '<p>No content found.</p>';
      contentItems = [];
      return;
    }

    contentItems = data.items;

    const rows = data.items
      .map((item, idx) => {
        const expandBtn =
          item.type === 'project'
            ? `<button type="button" class="btn-secondary btn-sm" onclick="toggleVersions('${item.id}')">${expandedProjects.has(item.id) ? '▼' : '▶'} ${item.versionCount || 0} versions</button>`
            : '';
        const reviewBtn =
          item.type === 'project'
            ? `<a class="btn-secondary btn-sm" href="admin-submissions.html?studentId=${encodeURIComponent(item.studentId || '')}">Inbox</a>`
            : '';
        const deleteBtn = `<button type="button" class="btn-danger btn-sm" onclick="confirmDeleteByIndex(${idx})">Delete</button>`;
        const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
        return `<tr data-item-id="${escapeHtml(item.id)}" data-item-type="${escapeHtml(item.type)}">
          <td>${escapeHtml(item.studentName || '—')}<br><small>${escapeHtml(item.className || '')}</small></td>
          <td><span class="type-badge type-${escapeHtml(item.type)}">${typeLabel(item.type)}</span></td>
          <td>${escapeHtml(item.title)}</td>
          <td>${formatLinks(item.links)}</td>
          <td>${escapeHtml(updated)}</td>
          <td>${expandBtn} ${reviewBtn} ${deleteBtn}</td>
        </tr>
        ${item.type === 'project' && expandedProjects.has(item.id) ? `<tr class="version-row" id="versions-${escapeHtml(item.id)}"><td colspan="6">Loading versions…</td></tr>` : ''}`;
      })
      .join('');

    container.innerHTML = `<table class="content-table">
      <thead><tr><th>Student</th><th>Type</th><th>Title</th><th>Links</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="color:#666;font-size:13px;">Showing ${data.items.length} of ${data.total} items</p>`;

    for (const item of data.items) {
      if (item.type === 'project' && expandedProjects.has(item.id)) {
        loadVersions(item.id);
      }
    }
  } catch (err) {
    container.innerHTML = `<p style="color:#c00;">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadVersions(threadId) {
  const row = document.getElementById('versions-' + threadId);
  if (!row) return;
  try {
    const res = await adminFetch('/admin/content/project/' + encodeURIComponent(threadId) + '/versions');
    const data = await res.json();
    if (!data.success || !data.versions?.length) {
      row.innerHTML = '<td colspan="6">No versions.</td>';
      return;
    }
    row.innerHTML = `<td colspan="6"><table style="width:100%;font-size:13px;">
      <thead><tr><th>#</th><th>Kind</th><th>Date</th><th>Notes</th><th>Actions</th></tr></thead>
      <tbody>${data.versions
        .map(
          (v) => `<tr>
            <td>v${v.versionNumber}</td>
            <td>${escapeHtml(v.kind)}</td>
            <td>${escapeHtml(new Date(v.submittedAt || v.createdAt).toLocaleString())}</td>
            <td>${escapeHtml(v.studentNote || v.adminNote || '')}</td>
            <td>
              <a href="/admin/versions/${encodeURIComponent(v.id)}/download">Download</a>
              <a href="/index.html?adminReview=1&versionId=${encodeURIComponent(v.id)}">Review</a>
            </td>
          </tr>`
        )
        .join('')}</tbody></table></td>`;
  } catch (err) {
    row.innerHTML = `<td colspan="6">Error loading versions: ${escapeHtml(err.message)}</td>`;
  }
}

function toggleVersions(threadId) {
  if (expandedProjects.has(threadId)) expandedProjects.delete(threadId);
  else expandedProjects.add(threadId);
  loadContent();
}

async function confirmDelete(item) {
  if (!item) return;
  pendingDelete = item;
  const params = new URLSearchParams();
  params.set('dryRun', '1');
  if (item.studentId) params.set('studentId', item.studentId);
  if (item.slug) params.set('slug', item.slug);
  if (item.type === 'legacy_submission') params.set('fileName', item.id);

  const res = await adminFetch(
    `/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}?` + params.toString(),
    { method: 'DELETE' }
  );
  const data = await res.json();
  const manifest = data.manifest || {};
  document.getElementById('delete-modal-title').textContent = `Delete ${typeLabel(item.type)}?`;
  document.getElementById('delete-modal-note').textContent =
    item.type === 'project'
      ? 'This removes all versions, cloud ZIPs, and hosted copies. My Assets uploads will be kept.'
      : 'This permanently removes the selected content and related storage.';
  document.getElementById('delete-modal-manifest').textContent = JSON.stringify(
    manifest.willRemove || manifest,
    null,
    2
  );
  document.getElementById('delete-modal').style.display = 'flex';
}

async function executeDelete() {
  if (!pendingDelete) return;
  const item = pendingDelete;
  const body = {};
  if (item.studentId) body.studentId = item.studentId;
  if (item.slug) body.slug = item.slug;
  if (item.type === 'legacy_submission') body.fileName = item.id;

  const res = await adminFetch(
    `/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  document.getElementById('delete-modal').style.display = 'none';
  pendingDelete = null;
  if (!data.success) {
    alert(data.message || 'Delete failed');
    return;
  }
  loadContent();
}

async function loadClassesAndStudents() {
  try {
    const res = await adminFetch('/api/classes');
    const classes = await res.json();
    const classSel = document.getElementById('filter-class');
    const studentSel = document.getElementById('filter-student');
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      classSel.appendChild(opt);
    });

    classSel.addEventListener('change', async () => {
      studentSel.innerHTML = '<option value="">All students</option>';
      const classId = classSel.value;
      if (!classId) return;
      const sRes = await adminFetch(`/api/classes/${classId}/students`);
      const students = await sRes.json();
      students.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.displayName || s.display_name;
        studentSel.appendChild(opt);
      });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const presetStudent = urlParams.get('studentId');
    const presetClass = urlParams.get('classId');
    const presetOrphaned = urlParams.get('orphaned');
    if (presetClass) classSel.value = presetClass;
    if (presetClass) classSel.dispatchEvent(new Event('change'));
    if (presetStudent) {
      setTimeout(() => {
        studentSel.value = presetStudent;
      }, 300);
    }
    if (presetOrphaned === '1') {
      document.getElementById('filter-orphaned').checked = true;
    }
  } catch (err) {
    console.warn('Could not load filters:', err);
  }
}

function bindEvents() {
  document.getElementById('apply-filters').addEventListener('click', loadContent);
  document.getElementById('delete-confirm-btn').addEventListener('click', executeDelete);
  document.getElementById('delete-cancel-btn').addEventListener('click', () => {
    document.getElementById('delete-modal').style.display = 'none';
    pendingDelete = null;
  });
}

async function initContentHub() {
  bindEvents();
  await loadClassesAndStudents();
  await loadContent();
}

window.toggleVersions = toggleVersions;
window.confirmDelete = confirmDelete;
window.confirmDeleteByIndex = (idx) => confirmDelete(contentItems[idx]);

requireAdminSession('login-root', initContentHub);
