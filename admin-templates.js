let templates = [];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg || 'Saved!';
  t.style.display = 'block';
  setTimeout(() => {
    t.style.display = 'none';
  }, 1800);
}

async function loadTemplates() {
  const res = await adminFetch('/admin/templates');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load');
  templates = data.templates || [];
  render();
}

function scopeLabel(scope) {
  return scope === 'combined' ? '360° + Web' : 'Flat page';
}

function render() {
  const el = document.getElementById('template-list');
  if (!templates.length) {
    el.innerHTML = '<p style="color:#666">No templates yet.</p>';
    return;
  }
  el.innerHTML = templates
    .map(
      (t) => `
    <div class="template-card" data-id="${t.id}">
      <strong>${escapeHtml(t.title)}</strong>
      ${t.is_default ? '<span style="background:#ffc107;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px">Default</span>' : ''}
      <div class="template-meta">${t.is_public ? 'Public' : 'Private'} · ${escapeHtml(t.slug)} · ${scopeLabel(t.scope)}</div>
      <div class="template-badges">
        ${t.is_playground ? '<span class="badge badge-playground">Welcome screen</span>' : ''}
        ${t.bundle_b2_key ? '<span class="badge badge-bundle">Bundle uploaded</span>' : ''}
      </div>
      ${t.description ? `<p style="font-size:13px;margin:8px 0 0">${escapeHtml(t.description)}</p>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${
          t.scope === 'flat'
            ? `<a href="admin-template-editor.html?edit=${t.id}" class="btn btn-primary">Edit in Editor</a>`
            : ''
        }
        <button class="btn btn-secondary btn-toggle-public" data-id="${t.id}">${t.is_public ? 'Make Private' : 'Make Public'}</button>
        <button class="btn btn-secondary btn-toggle-playground" data-id="${t.id}">${t.is_playground ? 'Remove from Welcome' : 'Show on Welcome'}</button>
        <button class="btn btn-secondary btn-toggle-default" data-id="${t.id}">${t.is_default ? 'Unset Default' : 'Set Default'}</button>
        <button class="btn btn-danger btn-delete" data-id="${t.id}">Delete</button>
      </div>
      ${
        t.scope === 'combined'
          ? `
      <div class="bundle-row">
        <label style="font-size:13px;font-weight:bold;display:block;margin-bottom:6px">Project bundle ZIP</label>
        <input type="file" accept=".zip,application/zip" class="bundle-file-input" data-id="${t.id}" />
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-upload-bundle" data-id="${t.id}">Upload bundle</button>
          ${
            t.bundle_b2_key
              ? `<button type="button" class="btn btn-secondary btn-delete-bundle" data-id="${t.id}">Remove bundle</button>`
              : ''
          }
        </div>
        <p style="font-size:12px;color:#666;margin:8px 0 0">Export from the main editor: Save Template → bundle mode, then upload here.</p>
      </div>
      `
          : ''
      }
      <div class="bundle-row" style="margin-top:10px">
        <label style="font-size:13px;font-weight:bold;display:block;margin-bottom:4px">Thumbnail</label>
        ${
          t.thumbnail_url
            ? `<p style="font-size:12px;color:#666;margin:0 0 6px;word-break:break-all">${escapeHtml(displayThumbnailUrl(t))}</p>`
            : '<p style="font-size:12px;color:#666;margin:0 0 6px">Auto-generated from a page screenshot. Use Regenerate below, or enable Show on Welcome to publish on the guest screen.</p>'
        }
        <input type="text" class="thumb-url-input" data-id="${t.id}" value="${escapeAttr(t.thumbnail_url || '')}" placeholder="Optional custom URL override" style="width:100%;max-width:480px;padding:6px;border:1px solid #ccc;border-radius:4px" />
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="btn btn-secondary btn-regen-thumb" data-id="${t.id}">Regenerate thumbnail</button>
          <button type="button" class="btn btn-secondary btn-save-thumb" data-id="${t.id}">Save custom URL</button>
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function displayThumbnailUrl(t) {
  if (!t?.thumbnail_url) return '';
  const url = String(t.thumbnail_url);
  if (url.startsWith('/api/playground/thumbnails/')) return url;
  if (t.slug) return `/api/playground/thumbnails/${encodeURIComponent(t.slug)}`;
  return url;
}

async function uploadBundle(id) {
  const input = document.querySelector(`.bundle-file-input[data-id="${id}"]`);
  if (!input || !input.files || !input.files[0]) {
    alert('Choose a ZIP file first.');
    return;
  }
  const formData = new FormData();
  formData.append('bundle', input.files[0]);
  const res = await adminFetch(`/admin/templates/${id}/bundle`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Upload failed');
  showToast('Bundle uploaded');
  input.value = '';
  await loadTemplates();
}

document.getElementById('template-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;

  try {
    if (btn.classList.contains('btn-toggle-public')) {
      const res = await adminFetch(`/admin/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !tpl.is_public }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Update failed');
      showToast(tpl.is_public ? 'Template is now private' : 'Template is now public');
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-toggle-playground')) {
      const enabling = !tpl.is_playground;
      const payload = { is_playground: enabling };
      if (enabling) payload.is_public = true;
      const res = await adminFetch(`/admin/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Update failed');
      if (enabling && tpl.scope === 'combined' && !tpl.bundle_b2_key) {
        showToast('On welcome screen — upload a bundle ZIP to open this sample');
      } else {
        showToast(enabling ? 'Now on welcome screen' : 'Removed from welcome screen');
      }
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-toggle-default')) {
      const res = await adminFetch(`/admin/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: !tpl.is_default }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Update failed');
      showToast('Default updated');
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-delete')) {
      if (!confirm(`Delete template "${tpl.title}"?`)) return;
      const res = await adminFetch(`/admin/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Delete failed');
      showToast('Deleted');
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-upload-bundle')) {
      await uploadBundle(id);
      return;
    }
    if (btn.classList.contains('btn-delete-bundle')) {
      if (!confirm('Remove the uploaded bundle from storage?')) return;
      const res = await adminFetch(`/admin/templates/${id}/bundle`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Remove failed');
      showToast('Bundle removed');
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-save-thumb')) {
      const input = document.querySelector(`.thumb-url-input[data-id="${id}"]`);
      const res = await adminFetch(`/admin/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail_url: input ? input.value.trim() : '' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');
      showToast('Thumbnail saved');
      await loadTemplates();
      return;
    }
    if (btn.classList.contains('btn-regen-thumb')) {
      btn.disabled = true;
      const res = await adminFetch(`/admin/templates/${id}/generate-thumbnail`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Regenerate failed');
      showToast('Thumbnail regenerated');
      await loadTemplates();
      return;
    }
  } catch (err) {
    alert(err.message || 'Action failed');
  }
});

document.getElementById('create-combined-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('combined-title').value.trim();
  if (!title) return;
  try {
    const res = await adminFetch('/admin/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: document.getElementById('combined-desc').value.trim(),
        scope: 'combined',
        is_public: document.getElementById('combined-public').checked,
        is_playground: document.getElementById('combined-playground').checked,
        files_manifest: [],
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Create failed');
    showToast('Combined sample created — upload a bundle ZIP next');
    e.target.reset();
    document.getElementById('combined-public').checked = true;
    document.getElementById('combined-playground').checked = true;
    await loadTemplates();
  } catch (err) {
    alert(err.message || 'Could not create template');
  }
});

function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('templates');
  loadTemplates().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load templates');
  });
}

requireAdminSession('login-root', initMainApp);
