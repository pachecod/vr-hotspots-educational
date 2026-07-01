let assetsByCategory = {};
let activeCategory = 'images';
let searchFilter = { tags: [], text: '' };
let tagFilterBar = null;
let uploadController = null;

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
  const hasFilter =
    (searchFilter.tags && searchFilter.tags.length) ||
    (searchFilter.text && searchFilter.text.trim());
  if (hasFilter) {
    items = items.filter((a) =>
      window.AssetTagsUI
        ? AssetTagsUI.assetMatchesSearch(a, searchFilter)
        : a.name.toLowerCase().includes((searchFilter.text || '').toLowerCase())
    );
  }
  return items;
}

async function loadAssets() {
  const res = await adminFetch('/admin/common-assets');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load assets');
  assetsByCategory = data.assets || {};
  if (tagFilterBar) tagFilterBar.refreshTagLists();
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
      if (tagFilterBar) tagFilterBar.refreshTagLists();
      return true;
    },
  });
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

async function refreshVideoPipelineBanner() {
  const banner = document.getElementById('video-pipeline-banner');
  if (!banner) return;
  if (activeCategory !== '360-videos') {
    banner.style.display = 'none';
    return;
  }
  try {
    const res = await fetch('/api/video-pipeline/status');
    const data = await res.json();
    if (!data.success) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'block';
    if (!data.transcodeEnabled) {
      banner.style.background = '#fff3cd';
      banner.style.color = '#856404';
      banner.style.border = '1px solid #ffeeba';
      banner.textContent =
        'Video compression is OFF on this server (VIDEO_TRANSCODE_ENABLED is not true). Uploads store the original file. Enable the flag in Render Environment and restart the service to compress 360° videos on upload.';
      return;
    }
    if (!data.ffmpegAvailable) {
      banner.style.background = '#f8d7da';
      banner.style.color = '#721c24';
      banner.style.border = '1px solid #f5c6cb';
      banner.textContent =
        'VIDEO_TRANSCODE_ENABLED is on, but FFmpeg is unavailable on this server. Uploads will store the original file.';
      return;
    }
    banner.style.background = '#d4edda';
    banner.style.color = '#155724';
    banner.style.border = '1px solid #c3e6cb';
    banner.textContent =
      'Video compression is ON. New 360° video uploads are transcoded on the server before storage.';
  } catch (_) {
    banner.style.display = 'none';
  }
}

function setupUpload() {
  if (!window.AdminCommonAssetUpload) return;
  uploadController = AdminCommonAssetUpload.createUploadController({
    getActiveCategory: () => activeCategory,
    onSuccess: loadAssets,
  });
  uploadController.setup();
}

function setupTabs() {
  document.getElementById('category-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeCategory = tab.dataset.category;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    refreshVideoPipelineBanner();
    renderAssets();
  });
}

function initTagFilterBar() {
  if (!window.AssetTagsUI?.AssetTagFilterBar) return;
  const mount = document.getElementById('asset-tag-filter');
  if (!mount) return;
  if (tagFilterBar) {
    tagFilterBar.destroy();
    tagFilterBar = null;
  }
  tagFilterBar = AssetTagsUI.AssetTagFilterBar.create(mount, {
    theme: 'light',
    placeholder: 'Filename...',
    storageKey: 'asset-tag-filter:common',
    fetchRecentTags: async () => {
      const res = await adminFetch('/admin/common-assets/tags?sort=recent');
      const data = await res.json();
      return data.success ? data.tags || [] : [];
    },
    fetchAllTags: async () => {
      const res = await adminFetch('/admin/common-assets/tags?sort=alpha');
      const data = await res.json();
      return data.success ? data.tags || [] : [];
    },
    onChange: (state) => {
      searchFilter = state;
      renderAssets();
    },
  });
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
      opt.textContent = `${s.display_name || s.username || 'Team member or student'}${classLabel}`;
      select.appendChild(opt);
    });
  } catch (err) {
    if (err.code !== 'AUTH_REQUIRED') {
      console.warn('Could not load students for peek dropdown:', err);
    }
  }
}

function setupContentHubButton() {
  const btn = document.getElementById('open-content-hub-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'content');
    window.history.replaceState({}, '', url.pathname + url.search);
    if (window.ContentHub) ContentHub.open();
  });
}

window.refreshAssetsAfterContentDelete = function (item) {
  if (item && item.type === 'common_asset' && typeof loadAssets === 'function') {
    loadAssets().catch(() => {});
  }
};

function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('assets');
  setupUpload();
  setupStudentPeekDropdown();
  setupContentHubButton();
  initTagFilterBar();
  setupTabs();
  setupAssetList();
  refreshVideoPipelineBanner();
  loadStudentPeekDropdown();
  if (window.ContentHub) ContentHub.init();
  loadAssets().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load assets');
  });
}

requireAdminSession('login-root', initMainApp);
