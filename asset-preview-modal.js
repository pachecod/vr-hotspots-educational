/**
 * Shared full-size asset preview modal for student picker and admin pages.
 */
const AssetPreview = {
  movementMode: 'move',
  currentItems: [],
  currentIndex: 0,
  currentCategory: '',
  currentAsset: null,
  options: {},
  replacedHostEl: null,
  _hostDisplay: '',

  init() {
    if (this._bound) return;
    this._bound = true;

    const modal = document.getElementById('asset-preview-modal');
    if (!modal) return;

    modal.querySelector('.asset-preview-close')?.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    document.getElementById('asset-preview-copy-btn')?.addEventListener('click', () => {
      if (!this.currentAsset) return;
      const url = this.getFullUrl(this.currentAsset);
      navigator.clipboard.writeText(url).then(() => {
        if (this.options.onCopy) this.options.onCopy();
        else alert('URL copied!');
      });
    });

    document.getElementById('asset-preview-select-btn')?.addEventListener('click', () => {
      if (this.options.onSelect) this.options.onSelect(this.currentAsset);
      this.close({ restoreHost: false });
    });

    document.getElementById('asset-preview-insert-btn')?.addEventListener('click', () => {
      if (this.options.onInsertIntoPage) this.options.onInsertIntoPage(this.currentAsset);
    });

    document.getElementById('asset-preview-tags-btn')?.addEventListener('click', () => {
      if (this.options.onEditTags) this.options.onEditTags(this.currentAsset);
    });

    document.getElementById('asset-preview-prev-btn')?.addEventListener('click', () =>
      this.navigate(-1)
    );
    document.getElementById('asset-preview-next-btn')?.addEventListener('click', () =>
      this.navigate(1)
    );

    modal.querySelectorAll('[data-3d-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMovementMode(btn.getAttribute('data-3d-mode'));
      });
    });
    document.getElementById('asset-preview-3d-reset')?.addEventListener('click', () => {
      this.postTo3dIframe({ type: '3D_CONTROL', control: 'reset-view' });
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.navigate(-1);
      if (e.key === 'ArrowRight') this.navigate(1);
    });
  },

  getFullUrl(asset) {
    if (!asset || !asset.url) return '';
    if (asset.url.startsWith('http')) return asset.url;
    return window.location.origin + asset.url;
  },

  open(opts) {
    this.init();
    const {
      category,
      asset,
      items = [],
      index = 0,
      showCopyUrl = false,
      showSelect = false,
      showInsertIntoPage = false,
      showEditTags = false,
      onSelect,
      onCopy,
      onInsertIntoPage,
      onEditTags,
      replaceHost = null,
    } = opts || {};

    if (!asset) return;

    this.options = {
      showCopyUrl,
      showSelect,
      showInsertIntoPage,
      showEditTags,
      onSelect,
      onCopy,
      onInsertIntoPage,
      onEditTags,
    };
    this.replacedHostEl = null;
    this._hostDisplay = '';
    if (replaceHost) {
      const host =
        typeof replaceHost === 'string' ? document.querySelector(replaceHost) : replaceHost;
      if (host && host.style.display !== 'none') {
        this.replacedHostEl = host;
        this._hostDisplay = host.style.display || 'flex';
        host.style.display = 'none';
      }
    }
    this.currentCategory = category || asset.category || 'images';
    this.currentItems = items.length ? items : [asset];
    this.currentIndex = Math.max(0, Math.min(index, this.currentItems.length - 1));
    this.currentAsset = this.currentItems[this.currentIndex];
    this.movementMode = 'move';

    const modal = document.getElementById('asset-preview-modal');
    if (!modal) return;

    this.render();
    modal.classList.toggle('replaces-chooser', !!this.replacedHostEl);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  },

  render() {
    const asset = this.currentAsset;
    const category = asset.category || this.currentCategory;
    const modal = document.getElementById('asset-preview-modal');
    if (!modal || !asset) return;

    document.getElementById('asset-preview-title').textContent = asset.name || 'Asset';
    const counter = document.getElementById('asset-preview-counter');
    if (counter) {
      counter.textContent =
        this.currentItems.length > 1
          ? `${this.currentIndex + 1} of ${this.currentItems.length}`
          : '';
      counter.style.display = this.currentItems.length > 1 ? '' : 'none';
    }

    const body = document.getElementById('asset-preview-body');
    if (body && window.CommonAssetsPreview) {
      body.innerHTML = CommonAssetsPreview.renderModalBody(category, asset, { large: true });
      this.wire3dControls(body);
    }

    const urlEl = document.getElementById('asset-preview-url');
    if (urlEl) {
      const showUrl = this.options.showCopyUrl;
      urlEl.textContent = showUrl ? this.getFullUrl(asset) : '';
      urlEl.style.display = showUrl ? '' : 'none';
    }

    const copyBtn = document.getElementById('asset-preview-copy-btn');
    if (copyBtn) copyBtn.style.display = this.options.showCopyUrl ? '' : 'none';

    const selectBtn = document.getElementById('asset-preview-select-btn');
    if (selectBtn) selectBtn.style.display = this.options.showSelect ? '' : 'none';

    const insertBtn = document.getElementById('asset-preview-insert-btn');
    if (insertBtn) insertBtn.style.display = this.options.showInsertIntoPage ? '' : 'none';

    const tagsBtn = document.getElementById('asset-preview-tags-btn');
    if (tagsBtn) tagsBtn.style.display = this.options.showEditTags ? '' : 'none';

    const prevBtn = document.getElementById('asset-preview-prev-btn');
    const nextBtn = document.getElementById('asset-preview-next-btn');
    const showNav = this.currentItems.length > 1;
    if (prevBtn) prevBtn.style.display = showNav ? '' : 'none';
    if (nextBtn) nextBtn.style.display = showNav ? '' : 'none';

    this.update3dModeButtons();
  },

  wire3dControls(body) {
    const wrap = body.querySelector('.preview-3d-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('[data-3d-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMovementMode(btn.getAttribute('data-3d-mode'));
      });
    });
    wrap.querySelector('.btn-preview-3d-reset')?.addEventListener('click', () => {
      this.postTo3dIframe({ type: '3D_CONTROL', control: 'reset-view' });
    });
  },

  setMovementMode(mode) {
    this.movementMode = mode === 'look' ? 'look' : 'move';
    this.postTo3dIframe({ type: 'MOVEMENT_MODE_CHANGE', mode: this.movementMode });
    this.update3dModeButtons();
  },

  update3dModeButtons() {
    document.querySelectorAll('#asset-preview-modal [data-3d-mode]').forEach((btn) => {
      const mode = btn.getAttribute('data-3d-mode');
      btn.classList.toggle('active', mode === this.movementMode);
    });
  },

  postTo3dIframe(data) {
    const iframe = document.querySelector('#asset-preview-body iframe.preview-3d-frame');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(data, '*');
      } catch (_) {}
    }
  },

  navigate(delta) {
    if (this.currentItems.length <= 1) return;
    const body = document.getElementById('asset-preview-body');
    if (body && window.CommonAssetsPreview) CommonAssetsPreview.stopMedia(body);

    let next = this.currentIndex + delta;
    if (next < 0) next = this.currentItems.length - 1;
    if (next >= this.currentItems.length) next = 0;
    this.currentIndex = next;
    this.currentAsset = this.currentItems[this.currentIndex];
    this.render();
  },

  close({ restoreHost = true } = {}) {
    const modal = document.getElementById('asset-preview-modal');
    const body = document.getElementById('asset-preview-body');
    if (body && window.CommonAssetsPreview) CommonAssetsPreview.stopMedia(body);
    if (modal) {
      modal.classList.remove('is-open');
      modal.classList.remove('replaces-chooser');
    }
    if (restoreHost && this.replacedHostEl) {
      this.replacedHostEl.style.display = this._hostDisplay || 'flex';
    }
    document.body.style.overflow = '';
    this.currentAsset = null;
    this.currentItems = [];
    this.options = {};
    this.replacedHostEl = null;
    this._hostDisplay = '';
  },
};

if (typeof window !== 'undefined') {
  window.AssetPreview = AssetPreview;
  document.addEventListener('DOMContentLoaded', () => AssetPreview.init());
}

/**
 * Standard modal markup — include once per page:
 * <div id="asset-preview-modal">...</div>
 */
function getAssetPreviewModalHtml() {
  return `<div id="asset-preview-modal" role="dialog" aria-modal="true" aria-labelledby="asset-preview-title">
  <div class="asset-preview-panel">
    <button type="button" class="asset-preview-close" aria-label="Close">&times;</button>
    <h3 id="asset-preview-title" class="asset-preview-title"></h3>
    <div id="asset-preview-counter" class="asset-preview-counter"></div>
    <div id="asset-preview-body" class="asset-preview-body"></div>
    <p id="asset-preview-url" class="asset-preview-url"></p>
    <div class="asset-preview-footer">
      <button type="button" id="asset-preview-prev-btn" class="btn-preview-nav" style="display:none">← Prev</button>
      <button type="button" id="asset-preview-next-btn" class="btn-preview-nav" style="display:none">Next →</button>
      <button type="button" id="asset-preview-copy-btn" class="btn-preview-copy" style="display:none">Copy URL</button>
      <button type="button" id="asset-preview-tags-btn" class="btn-preview-tags" style="display:none">Edit Tags</button>
      <button type="button" id="asset-preview-insert-btn" class="btn-preview-insert" style="display:none">Insert Into Page</button>
      <button type="button" id="asset-preview-select-btn" class="btn-preview-select" style="display:none">Select</button>
    </div>
  </div>
</div>`;
}

if (typeof window !== 'undefined') {
  window.getAssetPreviewModalHtml = getAssetPreviewModalHtml;
}
