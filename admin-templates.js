let templates = [];
let dragId = null;
let savingOrder = false;

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

function renderOrderControls(t, index) {
  const isFirst = index === 0;
  const isLast = index === templates.length - 1;
  return `
    <div class="template-order-row">
      <span class="template-order-handle" draggable="true" data-id="${t.id}" title="Drag to reorder">⋮⋮</span>
      <span class="template-order-num">#${index + 1}</span>
      <div class="template-order-btns">
        <button type="button" class="btn-order btn-order-up" data-id="${t.id}" title="Move up" ${isFirst ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn-order btn-order-down" data-id="${t.id}" title="Move down" ${isLast ? 'disabled' : ''}>↓</button>
      </div>
    </div>
  `;
}

function render() {
  const el = document.getElementById('template-list');
  if (!templates.length) {
    el.innerHTML = '<p style="color:#666">No templates yet.</p>';
    return;
  }
  el.innerHTML = templates
    .map(
      (t, index) => `
    <div class="template-card" data-id="${t.id}">
      ${renderOrderControls(t, index)}
      <div class="template-details">
        <p class="template-details-hint">Title and description appear on the welcome screen and in the template list.</p>
        <label>
          Title
          <input type="text" class="tpl-title-input" data-id="${t.id}" value="${escapeAttr(t.title)}" placeholder="Template title" />
        </label>
        <label>
          Description
          <textarea class="tpl-desc-input" data-id="${t.id}" placeholder="Short description for the welcome screen">${escapeHtml(t.description || '')}</textarea>
        </label>
        <div>
          <button type="button" class="btn btn-primary btn-save-details" data-id="${t.id}">Save title &amp; description</button>
        </div>
      </div>
      ${t.is_default ? '<span style="background:#ffc107;padding:2px 6px;border-radius:4px;font-size:11px;margin:8px 0 0;display:inline-block">Default</span>' : ''}
      <div class="template-meta">${t.is_public ? 'Public' : 'Private'} · ${escapeHtml(t.slug)} · ${scopeLabel(t.scope)}</div>
      <div class="template-badges">
        ${t.is_playground ? '<span class="badge badge-playground">Welcome screen</span>' : ''}
        ${t.bundle_b2_key ? '<span class="badge badge-bundle">Bundle uploaded</span>' : ''}
      </div>
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
          displayThumbnailUrl(t)
            ? `<img class="thumb-preview" src="${escapeAttr(displayThumbnailUrl(t))}" alt="Thumbnail preview for ${escapeAttr(t.title)}" />`
            : ''
        }
        <p style="font-size:12px;color:#666;margin:0 0 6px">Upload a custom image, paste an external URL, or auto-generate. The thumbnail URL stays under <code>/api/playground/thumbnails/&lt;slug&gt;</code> (the file extension may change after upload).</p>
        <div class="thumb-upload-row">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" class="thumb-file-input" data-id="${t.id}" />
          <button type="button" class="btn btn-primary btn-upload-thumb" data-id="${t.id}">Upload image</button>
        </div>
        <input type="text" class="thumb-url-input" data-id="${t.id}" value="${escapeAttr(t.thumbnail_url || '')}" placeholder="Or paste a custom image URL" style="width:100%;max-width:480px;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:8px" />
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

function moveTemplate(id, direction) {
  const idx = templates.findIndex((t) => String(t.id) === String(id));
  if (idx < 0) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= templates.length) return;
  const [item] = templates.splice(idx, 1);
  templates.splice(newIdx, 0, item);
  render();
  saveOrder();
}

function moveTemplateBefore(draggedId, targetId) {
  if (!draggedId || !targetId || String(draggedId) === String(targetId)) return;
  const fromIdx = templates.findIndex((t) => String(t.id) === String(draggedId));
  const toIdx = templates.findIndex((t) => String(t.id) === String(targetId));
  if (fromIdx < 0 || toIdx < 0) return;
  const [item] = templates.splice(fromIdx, 1);
  templates.splice(toIdx, 0, item);
  render();
  saveOrder();
}

async function saveOrder() {
  if (savingOrder) return;
  savingOrder = true;
  try {
    const res = await adminFetch('/admin/templates/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: templates.map((t) => t.id) }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not save order');
    templates = data.templates || templates;
    showToast('Order saved');
  } catch (err) {
    alert(err.message || 'Could not save template order');
    await loadTemplates();
  } finally {
    savingOrder = false;
  }
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
  let base = '';
  if (url.startsWith('/api/playground/thumbnails/')) base = url.split('?')[0];
  else if (t.slug) base = `/api/playground/thumbnails/${encodeURIComponent(t.slug)}`;
  else base = url.split('?')[0];
  if (!base.startsWith('/api/playground/thumbnails/')) return base;
  const stamp = t.updated_at ? new Date(t.updated_at).getTime() : Date.now();
  return `${base}?v=${stamp}`;
}

async function uploadThumbnail(id) {
  const input = document.querySelector(`.thumb-file-input[data-id="${id}"]`);
  if (!input || !input.files || !input.files[0]) {
    alert('Choose an image file first.');
    return;
  }
  const formData = new FormData();
  formData.append('thumbnail', input.files[0]);
  const res = await adminFetch(`/admin/templates/${id}/thumbnail`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Upload failed');
  showToast('Thumbnail uploaded');
  input.value = '';
  await loadTemplates();
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

const templateListEl = document.getElementById('template-list');

templateListEl.addEventListener('click', async (e) => {
  const orderBtn = e.target.closest('.btn-order');
  if (orderBtn && orderBtn.dataset.id) {
    if (orderBtn.classList.contains('btn-order-up')) moveTemplate(orderBtn.dataset.id, 'up');
    if (orderBtn.classList.contains('btn-order-down')) moveTemplate(orderBtn.dataset.id, 'down');
    return;
  }

  const btn = e.target.closest('button[data-id]');
  if (!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  const tpl = templates.find((t) => String(t.id) === String(id));
  if (!tpl) return;

  try {
    if (btn.classList.contains('btn-save-details')) {
      const titleInput = document.querySelector(`.tpl-title-input[data-id="${id}"]`);
      const descInput = document.querySelector(`.tpl-desc-input[data-id="${id}"]`);
      const title = titleInput ? titleInput.value.trim() : '';
      if (!title) {
        alert('Title is required.');
        return;
      }
      const res = await adminFetch(`/admin/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: descInput ? descInput.value.trim() : '',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Update failed');
      showToast('Title and description saved');
      await loadTemplates();
      return;
    }
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
    if (btn.classList.contains('btn-upload-thumb')) {
      await uploadThumbnail(id);
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

templateListEl.addEventListener('dragstart', (e) => {
  const handle = e.target.closest('.template-order-handle');
  if (!handle) return;
  dragId = handle.dataset.id;
  const card = handle.closest('.template-card');
  if (card) card.classList.add('template-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});

templateListEl.addEventListener('dragend', () => {
  dragId = null;
  templateListEl.querySelectorAll('.template-card').forEach((card) => {
    card.classList.remove('template-dragging', 'template-drag-over');
  });
});

templateListEl.addEventListener('dragover', (e) => {
  const card = e.target.closest('.template-card');
  if (!card || !dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  templateListEl.querySelectorAll('.template-card').forEach((el) => el.classList.remove('template-drag-over'));
  card.classList.add('template-drag-over');
});

templateListEl.addEventListener('dragleave', (e) => {
  const card = e.target.closest('.template-card');
  if (card && !card.contains(e.relatedTarget)) {
    card.classList.remove('template-drag-over');
  }
});

templateListEl.addEventListener('drop', (e) => {
  const card = e.target.closest('.template-card');
  if (!card || !dragId) return;
  e.preventDefault();
  moveTemplateBefore(dragId, card.dataset.id);
  dragId = null;
  templateListEl.querySelectorAll('.template-card').forEach((el) => {
    el.classList.remove('template-dragging', 'template-drag-over');
  });
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
