/**
 * Flat-page Editing Tools for the admin template editor:
 * sidebar + shared Online Assets picker with insert-into-page support.
 */
const AdminFlatEditingTools = {
  assets: {},
  activeCategory: 'images',
  searchFilter: { tags: [], text: '' },
  tagFilterBar: null,
  onSelect: null,
  filterCategory: null,
  filterCategories: null,

  CATEGORIES: ['images', 'videos', '360-images', '360-videos', 'audio', '3d', 'other'],

  getVisibleCategories() {
    if (this.filterCategories?.length) {
      return this.filterCategories.filter((cat) => this.CATEGORIES.includes(cat));
    }
    if (this.filterCategory && this.CATEGORIES.includes(this.filterCategory)) {
      return [this.filterCategory];
    }
    return this.CATEGORIES;
  },

  isSelectMode() {
    return typeof this.onSelect === 'function';
  },

  isFlatPageEditorMode() {
    return (
      window.flatPageEditor &&
      typeof window.flatPageEditor.isVisible === 'function' &&
      window.flatPageEditor.isVisible()
    );
  },

  showModal() {
    const modal = document.getElementById('common-assets-modal');
    if (!modal) return null;
    modal.style.display = 'flex';
    return modal;
  },

  initSidebar() {
    const panel = document.getElementById('admin-editing-tools');
    const toggle = document.getElementById('admin-editing-tools-toggle');
    if (!panel || !toggle) return;

    toggle.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const icon = document.getElementById('admin-editing-tools-toggle-icon');
      if (icon) icon.textContent = collapsed ? '‹' : '›';
    });
  },

  initTagFilterBar() {
    if (!window.AssetTagsUI?.AssetTagFilterBar) return;
    const mount = document.getElementById('common-assets-tag-filter');
    if (!mount) return;
    if (this.tagFilterBar) {
      this.tagFilterBar.destroy();
      this.tagFilterBar = null;
    }
    const picker = this;
    this.tagFilterBar = AssetTagsUI.AssetTagFilterBar.create(mount, {
      theme: 'dark',
      placeholder: 'Filename...',
      storageKey: 'asset-tag-filter:shared',
      fetchRecentTags: async () => picker.collectAllTagsFromAssets().slice(0, 8),
      fetchAllTags: async () => picker.collectAllTagsFromAssets(),
      onChange: (state) => {
        picker.searchFilter = state;
        picker.render();
      },
    });
  },

  collectAllTagsFromAssets() {
    const tagCounts = {};
    for (const cat of Object.keys(this.assets)) {
      for (const asset of this.assets[cat] || []) {
        for (const tag of asset.tags || []) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  },

  getFilteredItems() {
    let items = this.assets[this.activeCategory] || [];
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

  renderTabs() {
    const visible = new Set(this.getVisibleCategories());
    document.querySelectorAll('#common-assets-tabs .ca-tab').forEach((tab) => {
      const cat = tab.dataset.category;
      const show = visible.has(cat);
      tab.style.display = show ? '' : 'none';
      tab.classList.toggle('active', show && cat === this.activeCategory);
    });
  },

  async load() {
    const list = document.getElementById('common-assets-list');
    if (!list) return;
    list.innerHTML = '<p style="color:#ccc;text-align:center;">Loading...</p>';
    try {
      const res = await fetch('/api/common-assets');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      this.assets = data.assets || {};
      this.renderTabs();
      this.initTagFilterBar();
      if (this.tagFilterBar) this.tagFilterBar.refreshTagLists();
      this.render();
    } catch (err) {
      list.innerHTML =
        '<p style="color:#f44336;text-align:center;padding:16px;">' +
        (err.message || 'Could not load assets') +
        '</p>';
    }
  },

  render() {
    const list = document.getElementById('common-assets-list');
    if (!list) return;
    const items = this.getFilteredItems();
    if (!items.length) {
      list.innerHTML =
        '<p style="color:#888;text-align:center;padding:20px;">No assets found in this category.</p>';
      return;
    }
    const selectMode = this.isSelectMode();
    const flatInsert = !selectMode && this.isFlatPageEditorMode();
    list.innerHTML = items
      .map((asset) => {
        const cat = asset.category || this.activeCategory;
        const icon = window.CommonAssetsPreview
          ? CommonAssetsPreview.renderPickerThumb(cat, asset)
          : '<div class="ca-item-thumb ca-item-thumb-fallback">📄</div>';
        const tagChips = window.AssetTagsUI ? AssetTagsUI.renderTagChips(asset.tags) : '';
        const selectBtn = selectMode
          ? `<button type="button" data-ca-action="select" data-name="${asset.name}" class="btn-insert-flat">Select</button>`
          : '';
        const insertBtn = flatInsert
          ? `<button type="button" data-ca-action="insert" data-name="${asset.name}" class="btn-insert-flat">Insert Into Page</button>`
          : '';
        return `<div class="ca-item">
          ${icon}
          <div class="ca-item-info"><div class="ca-item-name">${asset.name}</div>${tagChips}</div>
          <div class="ca-item-actions">
            <button type="button" data-ca-action="preview" data-name="${asset.name}">Preview</button>
            <button type="button" data-ca-action="copy" data-name="${asset.name}" style="background:#6f42c1;color:#fff;">Copy</button>
            ${selectBtn}
            ${insertBtn}
          </div>
        </div>`;
      })
      .join('');
  },

  openPreview(asset) {
    const items = this.getFilteredItems();
    const index = items.findIndex((a) => a.name === asset.name);
    const cat = asset.category || this.activeCategory;
    if (!window.AssetPreview) return;
    const selectMode = this.isSelectMode();
    const flatInsert = !selectMode && this.isFlatPageEditorMode();
    AssetPreview.open({
      category: cat,
      asset: { ...asset, category: cat },
      items: items.map((a) => ({ ...a, category: a.category || this.activeCategory })),
      index: index >= 0 ? index : 0,
      showCopyUrl: true,
      showSelect: selectMode,
      showInsertIntoPage: flatInsert,
      replaceHost: '#common-assets-modal',
      onSelect: selectMode ? (selected) => this.selectAsset(selected) : null,
      onInsertIntoPage: flatInsert ? (selected) => this.insertIntoFlatPage(selected) : null,
    });
  },

  insertIntoFlatPage(asset) {
    if (!this.isFlatPageEditorMode()) {
      alert('The code editor is not ready yet.');
      return;
    }
    if (!window.flatPageEditor || typeof window.flatPageEditor.insertAsset !== 'function') {
      alert('Could not insert — editor is unavailable.');
      return;
    }
    const cat = asset.category || this.activeCategory;
    const ok = window.flatPageEditor.insertAsset(cat, asset);
    if (!ok) {
      alert('Could not insert this asset into the page.');
      return;
    }
    if (window.AssetPreview?.close) {
      AssetPreview.close({ restoreHost: false });
    }
    this.close();
  },

  async copyUrl(url) {
    await navigator.clipboard.writeText(url);
    alert('URL copied to clipboard!');
  },

  selectAsset(asset) {
    const handler = this.onSelect;
    const cat = asset.category || this.activeCategory;
    const selected = { ...asset, category: cat };
    if (window.AssetPreview?.close) {
      AssetPreview.close({ restoreHost: false });
    }
    this.close();
    if (handler) handler(selected);
  },

  openFor({ category = null, categories = null, onSelect = null } = {}) {
    this.onSelect = typeof onSelect === 'function' ? onSelect : null;
    this.filterCategories = Array.isArray(categories) && categories.length ? categories : null;
    this.filterCategory = this.filterCategories ? null : category || null;
    if (this.filterCategories?.length) {
      this.activeCategory = this.filterCategories[0];
    } else if (category) {
      this.activeCategory = category;
    }
    this.searchFilter = { tags: [], text: '' };
    if (this.tagFilterBar?.clear) this.tagFilterBar.clear();
    this.renderTabs();
    this.showModal();
    this.load();
  },

  open() {
    this.onSelect = null;
    this.filterCategory = null;
    this.filterCategories = null;
    this.renderTabs();
    this.showModal();
    this.load();
  },

  close() {
    const modal = document.getElementById('common-assets-modal');
    if (modal) modal.style.display = 'none';
    this.onSelect = null;
    this.filterCategory = null;
    this.filterCategories = null;
    this.renderTabs();
  },

  initPicker() {
    const openBtn = document.getElementById('open-common-assets');
    const modal = document.getElementById('common-assets-modal');
    const closeBtn = document.getElementById('close-common-assets');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => this.open());
    closeBtn?.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    document.getElementById('common-assets-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.ca-tab');
      if (!tab) return;
      const cat = tab.dataset.category;
      if (!this.CATEGORIES.includes(cat)) return;
      this.activeCategory = cat;
      this.renderTabs();
      this.render();
    });

    document.getElementById('common-assets-list')?.addEventListener('click', (e) => {
      if (e.target.closest('audio, video')) return;

      const thumb = e.target.closest('[data-preview-thumb]');
      if (thumb) {
        const item = thumb.closest('.ca-item');
        const name = item?.querySelector('.ca-item-name')?.textContent;
        const asset = (this.assets[this.activeCategory] || []).find((a) => a.name === name);
        if (asset) this.openPreview(asset);
        return;
      }

      const btn = e.target.closest('button[data-ca-action]');
      if (!btn) return;
      const name = btn.dataset.name;
      const asset = (this.assets[this.activeCategory] || []).find((a) => a.name === name);
      if (!asset) return;
      if (btn.dataset.caAction === 'preview') this.openPreview(asset);
      if (btn.dataset.caAction === 'copy') this.copyUrl(asset.url);
      if (btn.dataset.caAction === 'select') this.selectAsset(asset);
      if (btn.dataset.caAction === 'insert') this.insertIntoFlatPage(asset);
    });

    if (window.AssetPreview) AssetPreview.init();
  },

  initUpload() {
    if (!window.AdminCommonAssetUpload) return;
    this.uploadController = AdminCommonAssetUpload.createUploadController({
      getActiveCategory: () => this.activeCategory,
      onSuccess: () => this.load(),
      ids: {
        zone: 'ca-upload-zone',
        fileInput: 'ca-upload-input',
        browseBtn: 'ca-upload-browse',
        toggleBtn: 'ca-upload-toggle',
        status: 'ca-upload-status',
        tagsInput: 'ca-upload-tags-input',
        panel: 'ca-upload-progress-panel',
        uploadLabel: 'ca-upload-bytes-label',
        uploadPct: 'ca-upload-bytes-pct',
        uploadFill: 'ca-upload-bytes-fill',
        transcodeStep: 'ca-transcode-progress-step',
        transcodeLabel: 'ca-transcode-phase-label',
        transcodePct: 'ca-transcode-phase-pct',
        transcodeFill: 'ca-transcode-phase-fill',
      },
    });
    this.uploadController.setup();
  },

  initCommonAssetsPickerBridge() {
    const tools = this;
    window.CommonAssetsPicker = {
      openFor(options = {}) {
        tools.openFor(options);
      },
      close() {
        tools.close();
      },
    };
  },

  init() {
    this.initSidebar();
    this.initPicker();
    this.initUpload();
    this.initCommonAssetsPickerBridge();
  },
};

window.AdminFlatEditingTools = AdminFlatEditingTools;
