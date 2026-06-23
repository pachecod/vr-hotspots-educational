let assetsByCategory = {};
let activeCategory = 'images';
let searchFilter = { tags: [], text: '' };
let tagFilterBar = null;

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

function getUploadProgressEls() {
  return {
    panel: document.getElementById('upload-progress-panel'),
    uploadLabel: document.getElementById('upload-bytes-label'),
    uploadPct: document.getElementById('upload-bytes-pct'),
    uploadFill: document.getElementById('upload-bytes-fill'),
    transcodeStep: document.getElementById('transcode-progress-step'),
    transcodeLabel: document.getElementById('transcode-phase-label'),
    transcodePct: document.getElementById('transcode-phase-pct'),
    transcodeFill: document.getElementById('transcode-phase-fill'),
  };
}

function resetUploadProgress() {
  const els = getUploadProgressEls();
  if (!els.panel) return;
  els.panel.classList.remove('is-active');
  if (els.uploadFill) {
    els.uploadFill.style.width = '0%';
    els.uploadFill.classList.remove('is-indeterminate');
  }
  if (els.transcodeFill) {
    els.transcodeFill.style.width = '0%';
    els.transcodeFill.classList.remove('is-indeterminate');
  }
  if (els.transcodeStep) els.transcodeStep.style.display = 'none';
  if (els.uploadLabel) els.uploadLabel.textContent = 'Uploading file…';
  if (els.uploadPct) els.uploadPct.textContent = '0%';
  if (els.transcodeLabel) els.transcodeLabel.textContent = 'Compressing video…';
  if (els.transcodePct) els.transcodePct.textContent = '0%';
}

function showUploadByteProgress(file, loaded, total) {
  const els = getUploadProgressEls();
  if (!els.panel) return;
  els.panel.classList.add('is-active');
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  if (els.uploadFill) els.uploadFill.style.width = `${pct}%`;
  if (els.uploadPct) els.uploadPct.textContent = `${pct}%`;
  if (els.uploadLabel) {
    els.uploadLabel.textContent =
      total > 0
        ? `Uploading ${file.name} (${formatBytes(loaded)} / ${formatBytes(total)})`
        : `Uploading ${file.name}…`;
  }
}

function showTranscodeProgress(job) {
  const els = getUploadProgressEls();
  if (!els.panel || !els.transcodeStep) return;
  els.transcodeStep.style.display = 'block';
  if (els.uploadFill) els.uploadFill.style.width = '100%';
  if (els.uploadPct) els.uploadPct.textContent = '100%';
  if (els.uploadLabel) els.uploadLabel.textContent = 'Upload complete';

  const phase = job.phase || 'transcoding';
  const pct = typeof job.transcodePercent === 'number' ? job.transcodePercent : 0;
  const message = job.message || 'Compressing video…';

  if (els.transcodeLabel) els.transcodeLabel.textContent = message;
  if (els.transcodeFill) {
    els.transcodeFill.classList.remove('is-indeterminate');
    if (phase === 'transcoding' && pct <= 0) {
      els.transcodeFill.classList.add('is-indeterminate');
      if (els.transcodePct) els.transcodePct.textContent = '…';
    } else if (phase === 'storing') {
      els.transcodeFill.style.width = '100%';
      if (els.transcodePct) els.transcodePct.textContent = '100%';
    } else {
      els.transcodeFill.style.width = `${Math.max(pct, phase === 'done' ? 100 : 0)}%`;
      if (els.transcodePct) els.transcodePct.textContent = `${Math.max(pct, 0)}%`;
    }
  }
}

function postFormWithUploadProgress(url, formData, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', (e) => {
      const loaded = e.loaded || 0;
      const total = e.lengthComputable ? e.total : file.size || 0;
      if (onProgress) onProgress(loaded, total);
    });
    xhr.addEventListener('load', () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (_) {}
      if (xhr.status === 401) {
        const err = new Error('Admin authentication required');
        err.code = 'AUTH_REQUIRED';
        reject(err);
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve({ ok: true, data, status: xhr.status });
        return;
      }
      reject(new Error((data && data.message) || 'Upload failed'));
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.send(formData);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUploadJob(jobId, onUpdate) {
  for (let i = 0; i < 1200; i++) {
    const res = await adminFetch(`/admin/common-assets/upload-jobs/${jobId}`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Could not check upload status');
    }
    if (onUpdate) onUpdate(data);
    if (data.phase === 'done') return data;
    if (data.phase === 'error') {
      throw new Error(data.error || data.message || 'Video processing failed');
    }
    await wait(500);
  }
  throw new Error('Video processing timed out');
}

function describeUploadResult(fileName, asset) {
  if (asset.transcoded && asset.originalSize && asset.size) {
    return `Uploaded ${fileName} — compressed ${formatBytes(asset.originalSize)} → ${formatBytes(asset.size)}`;
  }
  if (activeCategory === '360-videos') {
    return `Uploaded ${fileName} (${formatBytes(asset.size)}) — stored original (compression not applied)`;
  }
  return `Uploaded ${fileName}`;
}

async function uploadFiles(fileList) {
  const status = document.getElementById('upload-status');
  const tagsInput = document.getElementById('upload-tags-input');
  const uploadTags = tagsInput && tagsInput.value.trim() ? tagsInput.value.trim() : '';
  const files = Array.from(fileList || []);
  if (!files.length) return;

  let hadFailure = false;
  let hadSuccess = false;

  resetUploadProgress();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.size) {
      status.textContent = `Skipped ${file.name}: file is empty (0 bytes).`;
      hadFailure = true;
      continue;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
    if (isVideo && activeCategory !== '360-videos') {
      status.textContent = `Select the 360 Videos tab before uploading ${file.name}.`;
      hadFailure = true;
      continue;
    }

    resetUploadProgress();
    status.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}...`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', activeCategory);
    if (uploadTags) fd.append('tags', uploadTags);

    try {
      const { data } = await postFormWithUploadProgress(
        '/admin/common-assets/upload',
        fd,
        file,
        (loaded, total) => showUploadByteProgress(file, loaded, total)
      );

      if (!data.success) {
        status.textContent = `Failed: ${file.name} — ${data.message}`;
        hadFailure = true;
        continue;
      }

      let asset = data.asset || null;

      if (data.async && data.jobId) {
        status.textContent = `Upload finished — compressing ${file.name}…`;
        const jobResult = await pollUploadJob(data.jobId, showTranscodeProgress);
        asset = jobResult.asset || null;
      }

      if (asset) {
        status.textContent = describeUploadResult(file.name, asset);
        hadSuccess = true;
      } else {
        status.textContent = `Uploaded ${file.name}`;
        hadSuccess = true;
      }
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') throw err;
      status.textContent = `Failed: ${file.name} — ${err.message}`;
      hadFailure = true;
    }
  }

  if (hadSuccess) {
    status.textContent = hadFailure
      ? 'Some uploads finished. Refreshing list…'
      : 'Upload complete. Refreshing list…';
    await loadAssets();
    if (!hadFailure) {
      status.textContent = 'Upload complete.';
    }
  }

  resetUploadProgress();

  if (tagsInput) tagsInput.value = '';
  setTimeout(() => {
    if (!hadFailure) status.textContent = '';
  }, 4000);
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
  initTagFilterBar();
  setupTabs();
  setupAssetList();
  refreshVideoPipelineBanner();
  loadStudentPeekDropdown();
  loadAssets().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load assets');
  });
}

requireAdminSession('login-root', initMainApp);
