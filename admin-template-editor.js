let editingId = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg || 'Saved!';
  t.style.display = 'block';
  setTimeout(() => {
    t.style.display = 'none';
  }, 1800);
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function waitForFlatEditor() {
  return new Promise((resolve) => {
    if (window.flatPageEditor) {
      resolve(window.flatPageEditor);
      return;
    }
    window.addEventListener(
      'flat-editor-ready',
      (e) => resolve(e.detail.bridge),
      { once: true }
    );
  });
}

function updateThumbDisplay(url) {
  const el = document.getElementById('tpl-thumb-display');
  if (!el) return;
  el.textContent = url || 'Will be generated on save when shown on welcome.';
}

async function loadTemplateForEdit(id) {
  const res = await adminFetch(`/admin/templates/${id}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Template not found');
  const tpl = data.template;

  editingId = tpl.id;
  document.getElementById('tpl-title').value = tpl.title || '';
  document.getElementById('tpl-desc').value = tpl.description || '';
  document.getElementById('tpl-public').checked = !!tpl.is_public;
  document.getElementById('tpl-default').checked = !!tpl.is_default;
  document.getElementById('tpl-playground').checked = !!tpl.is_playground;
  updateThumbDisplay(tpl.thumbnail_url);
  document.title = `Edit: ${tpl.title} — VR Hotspots Admin`;

  const bridge = await waitForFlatEditor();
  bridge.loadTemplate(tpl);
}

async function downloadStarterZip() {
  const bridge = window.flatPageEditor;
  if (!bridge) {
    alert('Editor not ready yet.');
    return;
  }
  try {
    const folder = await bridge.downloadStarterZip();
    showToast(`Downloaded ${folder}.zip`);
  } catch (err) {
    alert(err.message || 'Download failed');
  }
}

async function saveTemplate() {
  const title = document.getElementById('tpl-title').value.trim();
  if (!title) {
    document.getElementById('save-status').textContent = 'Title is required.';
    return;
  }

  const bridge = window.flatPageEditor;
  if (!bridge) {
    document.getElementById('save-status').textContent = 'Editor not ready yet.';
    return;
  }

  const files_manifest = bridge.getTemplateFilesManifest();
  if (!files_manifest.some((f) => f.name === 'index.html')) {
    document.getElementById('save-status').textContent = 'Template must include index.html.';
    return;
  }

  const payload = {
    title,
    description: document.getElementById('tpl-desc').value.trim(),
    files_manifest,
    is_public: document.getElementById('tpl-public').checked,
    is_default: document.getElementById('tpl-default').checked,
    is_playground: document.getElementById('tpl-playground').checked,
    scope: 'flat',
  };

  document.getElementById('save-status').textContent = 'Saving…';
  try {
    const url = editingId ? `/admin/templates/${editingId}` : '/admin/templates';
    const method = editingId ? 'PUT' : 'POST';
    const res = await adminFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!editingId && data.template && data.template.id) {
      editingId = data.template.id;
      const url = new URL(window.location.href);
      url.searchParams.set('edit', editingId);
      window.history.replaceState({}, '', url);
    }

    document.getElementById('save-status').textContent = 'Saved.';
    if (data.template) {
      updateThumbDisplay(data.template.thumbnail_url);
    }
    showToast('Template saved');
  } catch (err) {
    document.getElementById('save-status').textContent = err.message || 'Save failed';
  }
}

function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  const main = document.getElementById('main-content');
  main.style.display = 'flex';
  renderAdminNav('templates');

  if (window.AdminFlatEditingTools) {
    AdminFlatEditingTools.init();
  }

  document.getElementById('save-tpl-btn').addEventListener('click', saveTemplate);
  document.getElementById('download-starter-zip-btn').addEventListener('click', downloadStarterZip);

  window.addEventListener('admin-starter-template-loaded', (e) => {
    const title = e.detail && e.detail.title;
    if (!title) return;
    const titleInput = document.getElementById('tpl-title');
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = title;
    }
  });

  const editId = getQueryParam('edit');
  if (editId) {
    loadTemplateForEdit(editId).catch((err) => {
      if (err.code === 'AUTH_REQUIRED') location.reload();
      else alert(err.message || 'Failed to load template');
    });
  } else {
    waitForFlatEditor().then((bridge) => {
      bridge.reset();
      bridge.show();
    });
  }
}

requireAdminSession('login-root', initMainApp);
