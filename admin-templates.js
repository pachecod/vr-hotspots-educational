let templates = [];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg || 'Saved!';
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 1800);
}

async function loadTemplates() {
  const res = await adminFetch('/admin/templates');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load');
  templates = data.templates || [];
  render();
}

function render() {
  const el = document.getElementById('template-list');
  if (!templates.length) {
    el.innerHTML = '<p style="color:#666">No templates yet.</p>';
    return;
  }
  el.innerHTML = templates.map((t) => `
    <div class="template-card" data-id="${t.id}">
      <strong>${escapeHtml(t.title)}</strong>
      ${t.is_default ? '<span style="background:#ffc107;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px">Default</span>' : ''}
      <div class="template-meta">${t.is_public ? 'Public' : 'Private'} · ${escapeHtml(t.slug)}</div>
      ${t.description ? `<p style="font-size:13px;margin:8px 0 0">${escapeHtml(t.description)}</p>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-toggle-public" data-id="${t.id}">${t.is_public ? 'Make Private' : 'Make Public'}</button>
        <button class="btn btn-secondary btn-toggle-default" data-id="${t.id}">${t.is_default ? 'Unset Default' : 'Set Default'}</button>
        <button class="btn btn-danger btn-delete" data-id="${t.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('create-tpl-btn').addEventListener('click', async () => {
  const title = document.getElementById('tpl-title').value.trim();
  let files_manifest;
  try {
    files_manifest = JSON.parse(document.getElementById('tpl-files').value || '[]');
  } catch {
    document.getElementById('create-status').textContent = 'Invalid JSON in files field.';
    return;
  }
  if (!title || !files_manifest.length) {
    document.getElementById('create-status').textContent = 'Title and at least one file required.';
    return;
  }
  try {
    const res = await adminFetch('/admin/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: document.getElementById('tpl-desc').value.trim(),
        files_manifest,
        is_public: document.getElementById('tpl-public').checked,
        is_default: document.getElementById('tpl-default').checked,
        scope: 'flat',
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    document.getElementById('tpl-title').value = '';
    document.getElementById('tpl-desc').value = '';
    document.getElementById('tpl-files').value = '';
    document.getElementById('create-status').textContent = 'Template saved.';
    showToast('Template created');
    await loadTemplates();
  } catch (err) {
    document.getElementById('create-status').textContent = err.message;
  }
});

document.getElementById('template-list').addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;

  if (e.target.classList.contains('btn-toggle-public')) {
    const res = await adminFetch(`/admin/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !tpl.is_public }),
    });
    const data = await res.json();
    if (data.success) await loadTemplates();
    return;
  }
  if (e.target.classList.contains('btn-toggle-default')) {
    const res = await adminFetch(`/admin/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: !tpl.is_default }),
    });
    const data = await res.json();
    if (data.success) await loadTemplates();
    return;
  }
  if (e.target.classList.contains('btn-delete')) {
    if (!confirm(`Delete template "${tpl.title}"?`)) return;
    const res = await adminFetch(`/admin/templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Deleted');
      await loadTemplates();
    }
  }
});

requireAdminSession('login-root', loadTemplates);
