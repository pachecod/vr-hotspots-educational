let assetsByCategory = {};
let activeCategory = 'images';
let previewAsset = null;

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

async function loadAssets() {
  const res = await adminFetch('/admin/common-assets');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load assets');
  assetsByCategory = data.assets || {};
  renderAssets();
}

function renderAssets() {
  const list = document.getElementById('asset-list');
  const items = assetsByCategory[activeCategory] || [];

  if (!items.length) {
    list.innerHTML = '<div class="empty">No assets in this category yet.</div>';
    list.className = '';
    return;
  }

  list.className = 'asset-grid';
  list.innerHTML = items
    .map(
      (asset) => `
    <div class="asset-card" data-name="${asset.name}">
      ${CommonAssetsPreview.renderGridThumb(asset.category, asset)}
      <div class="asset-name">${asset.name}</div>
      <div class="asset-meta">${formatBytes(asset.size)} · ${new Date(asset.uploadedAt).toLocaleString()}</div>
      <div class="asset-actions">
        <button class="btn-preview" data-action="preview" data-name="${asset.name}">Preview</button>
        <button class="btn-copy" data-action="copy" data-name="${asset.name}">Copy URL</button>
        <button class="btn-delete" data-action="delete" data-name="${asset.name}">Delete</button>
      </div>
    </div>
  `
    )
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
  previewAsset = asset;
  const modal = document.getElementById('preview-modal');
  const body = document.getElementById('preview-body');
  document.getElementById('preview-title').textContent = asset.name;
  document.getElementById('preview-url').textContent = asset.url;

  body.innerHTML = CommonAssetsPreview.renderModalBody(asset.category, asset);
  modal.style.display = 'flex';
}

function closePreview() {
  const body = document.getElementById('preview-body');
  CommonAssetsPreview.stopMedia(body);
  document.getElementById('preview-modal').style.display = 'none';
  body.innerHTML = '';
  previewAsset = null;
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
  const files = Array.from(fileList || []);
  if (!files.length) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    status.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}...`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', activeCategory);
    const res = await adminFetch('/admin/common-assets/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.success) {
      status.textContent = `Failed: ${file.name} — ${data.message}`;
      continue;
    }
  }

  status.textContent = 'Upload complete.';
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

function setupAssetList() {
  document.getElementById('asset-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const name = btn.dataset.name;
    const asset = findAsset(name);
    if (!asset) return;

    try {
      if (btn.dataset.action === 'preview') openPreview(asset);
      if (btn.dataset.action === 'copy') await copyAssetUrl(asset);
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

function setupPreviewModal() {
  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') closePreview();
  });
  document.getElementById('preview-copy-btn').addEventListener('click', async () => {
    if (previewAsset) await copyAssetUrl(previewAsset);
  });
}

function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  setupUploadZone();
  setupTabs();
  setupAssetList();
  setupPreviewModal();
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await adminLogout();
    location.reload();
  });
  loadAssets().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load assets');
  });
}

requireAdminSession('login-root', initMainApp);
