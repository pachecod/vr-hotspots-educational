let assetsByCategory = {};
let activeCategory = 'images';
let searchQuery = '';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message || 'Copied!';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1800);
}

function getFilteredItems() {
  let items = assetsByCategory[activeCategory] || [];
  if (searchQuery && searchQuery.trim()) {
    items = items.filter((a) =>
      window.AssetTagsUI
        ? AssetTagsUI.assetMatchesSearch(a, searchQuery)
        : a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }
  return items;
}

async function loadAssets() {
  const res = await adminFetch('/admin/common-assets');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load assets');
  assetsByCategory = data.assets || {};
  renderAssets();
}

function renderAssets() {
  const list = document.getElementById('asset-list');
  const items = getFilteredItems();

  if (!items.length) {
    const hasAny = (assetsByCategory[activeCategory] || []).length > 0;
    list.innerHTML = hasAny
      ? '<div class="empty">No assets match your search.</div>'
      : '<div class="empty">No assets in this category yet.</div>';
    list.className = '';
    return;
  }

  list.className = 'asset-grid';
  list.innerHTML = items
    .map((asset) => {
      const tagChips = window.AssetTagsUI ? AssetTagsUI.renderTagChips(asset.tags) : '';
      return `
    <div class="asset-card" data-name="${asset.name}">
      ${CommonAssetsPreview.renderGridThumb(asset.category, asset)}
      <div class="asset-name">${asset.name}</div>
      ${tagChips}
      <div class="asset-meta">${formatBytes(asset.size)} · ${new Date(asset.uploadedAt).toLocaleString()}</div>
      <div class="asset-actions">
        <button class="btn-preview" data-action="preview" data-name="${asset.name}">Preview</button>
        <button class="btn-copy" data-action="copy" data-name="${asset.name}">Copy URL</button>
        <button class="btn-tags-edit" data-action="tags" data-name="${asset.name}">Edit Tags</button>
        <button class="btn-delete" data-action="delete" data-name="${asset.name}">Delete</button>
      </div>
    </div>
  `;
    })
    .join('');
}

function findAsset(name) {
  return (assetsByCategory[activeCategory] || []).find((a) => a.name === name);
}

async function copyAssetUrl(asset) {
  await navigator.clipboard.writeText(asset.url);
  showToast('URL copied!');
}

function openPreview(asset) {
  const cat = asset.category || activeCategory;
  const items = getFilteredItems().map((a) => ({
    ...a,
    category: a.category || activeCategory,
  }));
  const index = items.findIndex((a) => a.name === asset.name);
  if (!window.AssetPreview) return;
  AssetPreview.open({
    category: cat,
    asset: { ...asset, category: cat },
    items,
    index: index >= 0 ? index : 0,
    showCopyUrl: true,
    onCopy: () => showToast('URL copied!'),
  });
}

async function editAssetTags(asset) {
  if (!window.AssetTagsUI) return;
  const cat = asset.category || activeCategory;
  await AssetTagsUI.openEditTagsModal({
    assetName: asset.name,
    tags: asset.tags || [],
    theme: 'light',
    onSave: async (tags) => {
      const res = await adminFetch(
        `/admin/common-assets/${encodeURIComponent(cat)}/${encodeURIComponent(asset.name)}/tags`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to save tags');
      asset.tags = data.tags || [];
      const listAsset = (assetsByCategory[cat] || []).find((a) => a.name === asset.name);
      if (listAsset) listAsset.tags = asset.tags;
      renderAssets();
      return true;
    },
  });
}

async function openTagBrowser() {
  if (!window.AssetTagsUI) return;
  try {
    const res = await adminFetch('/admin/common-assets/tags');
    const data = await res.json();
    const tags = data.success ? data.tags || [] : [];
    AssetTagsUI.openTagBrowserModal({
      tags,
      theme: 'light',
      onSelectTag: (tag) => {
        const input = document.getElementById('asset-search');
        if (!input) return;
        const current = input.value.trim();
        input.value = current ? `${current}, ${tag}` : tag;
        searchQuery = input.value;
        renderAssets();
      },
    });
  } catch (err) {
    if (err.code !== 'AUTH_REQUIRED') alert(err.message || 'Failed to load tags');
  }
}

async function deleteAsset(name) {
  if (!confirm(`Delete ${name}?`)) return;
  const res = await adminFetch(
    `/admin/common-assets/${encodeURIComponent(activeCategory)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Delete failed');
  await loadAssets();
}

async function uploadFiles(fileList) {
  const status = document.getElementById('upload-status');
  const tagsInput = document.getElementById('upload-tags-input');
  const uploadTags = tagsInput && tagsInput.value.trim() ? tagsInput.value.trim() : '';
  const files = Array.from(fileList || []);
  if (!files.length) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.size) {
      status.textContent = `Skipped ${file.name}: file is empty (0 bytes).`;
      continue;
    }
    status.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}...`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', activeCategory);
    if (uploadTags) fd.append('tags', uploadTags);
    const res = await adminFetch('/admin/common-assets/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.success) {
      status.textContent = `Failed: ${file.name} — ${data.message}`;
      continue;
    }
  }

  status.textContent = 'Upload complete.';
  if (tagsInput) tagsInput.value = '';
  await loadAssets();
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}

function setupUploadZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  document.getElementById('browse-btn').addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles(input.files));

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
  });
}

function setupTabs() {
  document.getElementById('category-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeCategory = tab.dataset.category;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderAssets();
  });
}

function setupSearch() {
  const input = document.getElementById('asset-search');
  if (input) {
    input.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderAssets();
    });
  }
  const showBtn = document.getElementById('show-tags-btn');
  if (showBtn) showBtn.addEventListener('click', () => openTagBrowser());
}

function setupAssetList() {
  document.getElementById('asset-list').addEventListener('click', async (e) => {
    if (e.target.closest('audio, video')) return;

    const thumb = e.target.closest('[data-preview-thumb]');
    if (thumb) {
      const card = thumb.closest('.asset-card');
      const asset = findAsset(card?.dataset.name);
      if (asset) openPreview(asset);
      return;
    }

    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const name = btn.dataset.name;
    const asset = findAsset(name);
    if (!asset) return;

    try {
      if (btn.dataset.action === 'preview') openPreview(asset);
      if (btn.dataset.action === 'copy') await copyAssetUrl(asset);
      if (btn.dataset.action === 'tags') await editAssetTags(asset);
      if (btn.dataset.action === 'delete') await deleteAsset(name);
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        location.reload();
        return;
      }
      alert(err.message || 'Action failed');
    }
  });
}

function setupUploadToggle() {
  const btn = document.getElementById('upload-common-toggle');
  const zone = document.getElementById('upload-zone');
  if (!btn || !zone) return;

  btn.addEventListener('click', () => {
    const open = !zone.classList.contains('is-open');
    zone.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function setupStudentPeekDropdown() {
  const select = document.getElementById('student-peek-select');
  if (!select) return;

  select.addEventListener('change', () => {
    const studentId = select.value;
    if (!studentId) return;
    window.location.href = `admin-users.html?peek=${encodeURIComponent(studentId)}&from=assets`;
  });
}

async function loadStudentPeekDropdown() {
  const select = document.getElementById('student-peek-select');
  if (!select) return;

  try {
    const res = await adminFetch('/admin/students');
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return;

    const sorted = [...list].sort((a, b) => {
      const classCmp = (a.class_name || '').localeCompare(b.class_name || '');
      if (classCmp !== 0) return classCmp;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

    sorted.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const classLabel = s.class_name ? ` (${s.class_name})` : '';
      opt.textContent = `${s.display_name || s.username || 'Student'}${classLabel}`;
      select.appendChild(opt);
    });
  } catch (err) {
    if (err.code !== 'AUTH_REQUIRED') {
      console.warn('Could not load students for peek dropdown:', err);
    }
  }
}

function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('assets');
  setupUploadToggle();
  setupStudentPeekDropdown();
  setupUploadZone();
  setupSearch();
  setupTabs();
  setupAssetList();
  loadStudentPeekDropdown();
  loadAssets().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load assets');
  });
}

requireAdminSession('login-root', initMainApp);
