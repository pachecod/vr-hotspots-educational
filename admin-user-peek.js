const StudentPeek = {
  studentId: null,
  returnTo: 'users',
  assetsByCategory: {},
  activeCategory: 'images',
  searchFilter: { tags: [], text: '' },
  tagFilterBar: null,

  CATEGORIES: [
    { id: 'images', label: 'Flat Images' },
    { id: '360-images', label: '360 Photos' },
    { id: '360-videos', label: '360 Videos' },
    { id: 'audio', label: 'Audio' },
    { id: '3d', label: '3D' },
    { id: 'other', label: 'Other' },
  ],

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  kindBadge(kind) {
    const labels = {
      submitted: ['Submitted', 'version-badge-submitted'],
      draft: ['Draft', 'version-badge-draft'],
      admin_return: ['Teacher feedback', 'version-badge-return'],
    };
    const [text, cls] = labels[kind] || [kind, 'version-badge-draft'];
    return `<span class="version-badge ${cls}">${text}</span>`;
  },

  showToast(message) {
    const toast = document.getElementById('peek-toast');
    if (!toast) return;
    toast.textContent = message || 'Copied!';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 1800);
  },

  getReturnFromUrl() {
    return new URLSearchParams(window.location.search).get('from') === 'assets' ? 'assets' : 'users';
  },

  updateBackButton() {
    const btn = document.getElementById('peek-back-btn');
    if (!btn) return;
    btn.textContent =
      this.returnTo === 'assets' ? '← Back to Online Assets' : '← Back to Users';
  },

  async open(studentId, options = {}) {
    this.studentId = studentId;
    this.searchFilter = { tags: [], text: '' };
    this.returnTo = options.returnTo || this.getReturnFromUrl();
    const listView = document.getElementById('users-list-view');
    const peekView = document.getElementById('student-peek-view');
    if (listView) listView.style.display = 'none';
    if (peekView) peekView.style.display = 'block';

    const url = new URL(window.location.href);
    url.searchParams.set('peek', studentId);
    if (this.returnTo === 'assets') {
      url.searchParams.set('from', 'assets');
    } else {
      url.searchParams.delete('from');
    }
    window.history.replaceState({}, '', url);
    this.updateBackButton();

    await this.loadPeekData();
  },

  close() {
    if (this.returnTo === 'assets') {
      window.location.href = 'admin-common-assets.html';
      return;
    }

    this.studentId = null;
    this.returnTo = 'users';
    const listView = document.getElementById('users-list-view');
    const peekView = document.getElementById('student-peek-view');
    if (listView) listView.style.display = 'block';
    if (peekView) peekView.style.display = 'none';
    this.closePreview();

    const url = new URL(window.location.href);
    url.searchParams.delete('peek');
    url.searchParams.delete('from');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  },

  async loadPeekData() {
    const header = document.getElementById('peek-header');
    const versionsEl = document.getElementById('peek-versions-list');
    if (versionsEl) versionsEl.innerHTML = '<p style="color:#666;">Loading...</p>';

    try {
      const [metaRes, assetsRes, versionsRes] = await Promise.all([
        adminFetch(`/admin/students/${this.studentId}/peek`),
        adminFetch(`/admin/students/${this.studentId}/assets`),
        adminFetch(`/admin/students/${this.studentId}/versions`),
      ]);

      const metaData = await metaRes.json();
      const assetsData = await assetsRes.json();
      const versionsData = await versionsRes.json();

      if (!metaData.success) throw new Error(metaData.message || 'Student not found');

      const student = metaData.student;
      if (header) {
        header.innerHTML = `
          <h1>${this.escapeHtml(student.displayName)}</h1>
          <div class="sub">${this.escapeHtml(student.className || '')} · <code>${this.escapeHtml(student.username || '')}</code></div>`;
      }

      this.assetsByCategory = assetsData.assets || {};
      this.initTagFilterBar();
      if (this.tagFilterBar) this.tagFilterBar.clear();
      this.renderCategoryTabs();
      this.renderAssets();
      this.renderVersions(versionsData.versions || []);
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        requireAdminSession('admin-gate', () => {
          document.getElementById('admin-gate').style.display = 'none';
          document.getElementById('admin-content').style.display = 'block';
          renderAdminNav('users');
          initAdminUsers();
        });
        return;
      }
      if (header) header.innerHTML = '<p style="color:#dc3545;">Could not load student.</p>';
      if (versionsEl) versionsEl.innerHTML = '<p style="color:#dc3545;">Error loading data.</p>';
    }
  },

  renderVersions(versions) {
    const el = document.getElementById('peek-versions-list');
    if (!el) return;

    if (!versions.length) {
      el.innerHTML = '<p style="color:#666;">No projects or saves yet.</p>';
      return;
    }

    el.innerHTML = `<table class="version-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Version</th>
          <th>Date</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${versions
          .map((v) => {
            const date = v.submittedAt || v.createdAt;
            const studentNote = v.studentNote
              ? `<div class="version-note">Student: ${this.escapeHtml(v.studentNote)}</div>`
              : '';
            const adminNote = v.adminNote
              ? `<div class="version-note">Teacher: ${this.escapeHtml(v.adminNote)}</div>`
              : '';
            return `<tr>
              <td><strong>${this.escapeHtml(v.projectName)}</strong></td>
              <td>${this.kindBadge(v.kind)} v${v.versionNumber}</td>
              <td>${date ? new Date(date).toLocaleString() : '—'}</td>
              <td>${studentNote}${adminNote}</td>
              <td>
                <div class="version-actions">
                  <button type="button" class="btn-dl" data-version-id="${v.id}">Download</button>
                  <a class="btn-review" href="/index.html?adminReview=1&versionId=${v.id}">Review</a>
                </div>
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;

    el.querySelectorAll('[data-version-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.downloadVersion(btn.dataset.versionId));
    });
  },

  async downloadVersion(versionId) {
    try {
      const response = await adminFetch(`/admin/versions/${versionId}/download`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Download failed');
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const disp = response.headers.get('content-disposition') || '';
      const match = disp.match(/filename="([^"]+)"/);
      const fileName = match ? match[1] : `project-${versionId}.zip`;
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  },

  renderCategoryTabs() {
    const tabsEl = document.getElementById('peek-category-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = this.CATEGORIES.map(
      (c) =>
        `<button type="button" class="tab${c.id === this.activeCategory ? ' active' : ''}" data-category="${c.id}">${c.label}</button>`
    ).join('');

    tabsEl.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.dataset.category;
        this.renderCategoryTabs();
        this.renderAssets();
      });
    });
  },

  getFilteredAssets() {
    let items = this.assetsByCategory[this.activeCategory] || [];
    const filter = this.searchFilter || { tags: [], text: '' };
    const hasFilter =
      (filter.tags && filter.tags.length) || (filter.text && filter.text.trim());
    if (hasFilter) {
      items = items.filter((a) =>
        window.AssetTagsUI
          ? AssetTagsUI.assetMatchesSearch(a, filter)
          : a.name.toLowerCase().includes((filter.text || '').toLowerCase())
      );
    }
    return items;
  },

  collectAllTagsFromAssets() {
    const tagCounts = {};
    for (const cat of Object.keys(this.assetsByCategory)) {
      for (const asset of this.assetsByCategory[cat] || []) {
        for (const tag of asset.tags || []) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  },

  initTagFilterBar() {
    if (!window.AssetTagsUI?.AssetTagFilterBar || !this.studentId) return;
    const mount = document.getElementById('peek-asset-tag-filter');
    if (!mount) return;
    if (this.tagFilterBar) {
      this.tagFilterBar.destroy();
      this.tagFilterBar = null;
    }
    const studentId = this.studentId;
    this.tagFilterBar = AssetTagsUI.AssetTagFilterBar.create(mount, {
      theme: 'light',
      placeholder: 'Filename...',
      storageKey: `asset-tag-filter:peek:${studentId}`,
      fetchRecentTags: async () => {
        const res = await adminFetch(
          `/admin/students/${studentId}/assets/tags?sort=recent`
        );
        const data = await res.json();
        return data.success ? data.tags || [] : [];
      },
      fetchAllTags: async () => {
        const res = await adminFetch(
          `/admin/students/${studentId}/assets/tags?sort=alpha`
        );
        const data = await res.json();
        return data.success ? data.tags || [] : [];
      },
      onChange: (state) => {
        this.searchFilter = state;
        this.renderAssets();
      },
    });
  },

  renderAssets() {
    const list = document.getElementById('peek-asset-list');
    if (!list) return;
    const items = this.getFilteredAssets();
    const totalInCategory = (this.assetsByCategory[this.activeCategory] || []).length;

    if (!items.length) {
      list.innerHTML =
        totalInCategory > 0
          ? '<div class="empty">No assets match your search.</div>'
          : '<div class="empty">No assets in this category.</div>';
      list.className = '';
      return;
    }

    list.className = 'asset-grid';
    list.innerHTML = items
      .map(
        (asset) => `
      <div class="asset-card" data-name="${this.escapeHtml(asset.name)}">
        ${CommonAssetsPreview.renderGridThumb(asset.category, asset)}
        <div class="asset-name">${this.escapeHtml(asset.name)}</div>
        ${window.AssetTagsUI ? AssetTagsUI.renderTagChips(asset.tags) : ''}
        <div class="asset-meta">${this.formatBytes(asset.size)} · ${new Date(asset.uploadedAt).toLocaleString()}</div>
        <div class="asset-actions">
          <button type="button" class="btn-preview" data-action="preview" data-name="${this.escapeHtml(asset.name)}">Preview</button>
          <button type="button" class="btn-copy" data-action="copy" data-name="${this.escapeHtml(asset.name)}">Copy URL</button>
          <button type="button" class="btn-delete" data-action="delete" data-name="${this.escapeHtml(asset.name)}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asset = this.findAsset(btn.dataset.name);
        if (!asset) return;
        if (btn.dataset.action === 'preview') this.openPreview(asset);
        else if (btn.dataset.action === 'copy') this.copyAssetUrl(asset);
        else if (btn.dataset.action === 'delete') this.deleteAsset(asset.name);
      });
    });

    if (!list.dataset.previewBound) {
      list.dataset.previewBound = '1';
      list.addEventListener('click', (e) => {
        if (e.target.closest('audio, video, button')) return;
        const thumb = e.target.closest('[data-preview-thumb]');
        if (!thumb) return;
        const card = thumb.closest('.asset-card');
        const asset = this.findAsset(card?.dataset.name);
        if (asset) this.openPreview(asset);
      });
    }
  },

  findAsset(name) {
    return this.getFilteredAssets().find((a) => a.name === name) ||
      (this.assetsByCategory[this.activeCategory] || []).find((a) => a.name === name);
  },

  async copyAssetUrl(asset) {
    const fullUrl = window.location.origin + asset.url;
    await navigator.clipboard.writeText(fullUrl);
    this.showToast('URL copied!');
  },

  openPreview(asset) {
    const cat = asset.category || this.activeCategory;
    const items = this.getFilteredAssets().map((a) => ({
      ...a,
      category: a.category || this.activeCategory,
    }));
    const index = items.findIndex((a) => a.name === asset.name);
    if (!window.AssetPreview) return;
    AssetPreview.open({
      category: cat,
      asset: { ...asset, category: cat },
      items,
      index: index >= 0 ? index : 0,
      showCopyUrl: true,
      onCopy: () => this.showToast('URL copied!'),
    });
  },

  closePreview() {
    if (window.AssetPreview) AssetPreview.close();
  },

  async deleteAsset(name) {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      const res = await adminFetch(
        `/admin/students/${this.studentId}/assets/${encodeURIComponent(this.activeCategory)}/${encodeURIComponent(name)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Delete failed');
      const assetsRes = await adminFetch(`/admin/students/${this.studentId}/assets`);
      const assetsData = await assetsRes.json();
      this.assetsByCategory = assetsData.assets || {};
      if (this.tagFilterBar) this.tagFilterBar.refreshTagLists();
      this.renderAssets();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  },

  bindUi() {
    document.getElementById('peek-back-btn')?.addEventListener('click', () => this.close());
  },
};

window.StudentPeek = StudentPeek;
window.openStudentPeek = (id, returnTo) =>
  StudentPeek.open(id, { returnTo: returnTo || 'users' });

document.addEventListener('DOMContentLoaded', () => {
  StudentPeek.bindUi();
});
