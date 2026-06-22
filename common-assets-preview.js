/**
 * Shared preview helpers for Common Assets (admin + student picker).
 * Inspired by WebXRide FileList previews; no external codebase dependency.
 */
const CommonAssetsPreview = {
  AFRAME_VERSION: '1.7.1',

  escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  is3dModelPreviewable(filename) {
    return /\.(glb|gltf)$/i.test(filename || '');
  },

  isPreviewable(category, name) {
    if (category === 'images' || category === '360-images' || category === '360-videos' || category === 'audio') {
      return true;
    }
    if (category === '3d') return this.is3dModelPreviewable(name);
    return false;
  },

  get3dModelProxyUrl(asset) {
    if (asset && asset.url) {
      return asset.url;
    }
    if (asset && asset.category && asset.name) {
      return `/common-assets/${encodeURIComponent(asset.category)}/${encodeURIComponent(asset.name)}`;
    }
    return '';
  },

  get3dPreviewPageUrl(asset) {
    const modelUrl = this.get3dModelProxyUrl(asset);
    return `common-assets-3d-preview.html?url=${encodeURIComponent(modelUrl)}`;
  },

  getListThumbIcon(category, name) {
    if (category === '360-videos') return '🎥';
    if (category === 'audio') return '🔊';
    if (category === '3d') return '🎨';
    if (category === 'other') return '📄';
    return '📦';
  },

  getThumbClass(context) {
    if (context === 'picker') return 'ca-item-thumb';
    return 'asset-thumb';
  },

  wrapClickable(innerHtml, category, name, context) {
    const previewable = this.isPreviewable(category, name);
    if (!previewable) return innerHtml;
    const wrapClass =
      context === 'picker'
        ? 'ca-item-thumb-wrap asset-thumb-clickable'
        : 'asset-thumb-clickable';
    return `<div class="${wrapClass}" data-preview-thumb="1" title="Click to preview">${innerHtml}<span class="asset-thumb-magnify" aria-hidden="true">🔍</span></div>`;
  },

  renderListThumb(category, asset, options = {}) {
    const context = options.context || 'grid';
    const url = asset.url;
    const name = asset.name || '';
    const thumbClass = this.getThumbClass(context);
    const fallbackClass = context === 'picker' ? `${thumbClass} ${thumbClass}-fallback` : `${thumbClass} ${thumbClass}-fallback`;

    let inner = '';

    if (category === 'images' || category === '360-images') {
      inner = `<img class="${thumbClass}" src="${this.escapeAttr(url)}" alt="" loading="lazy" crossorigin="anonymous" />`;
    } else if (category === '360-videos') {
      const label =
        context === 'grid'
          ? '<span class="asset-thumb-label">360°</span>'
          : '';
      inner = `<div class="${thumbClass} ${thumbClass}-video">
        <video muted playsinline preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></video>
        ${label}
      </div>`;
    } else if (category === 'audio') {
      if (context === 'grid') {
        inner = `<div class="${thumbClass} ${thumbClass}-audio">
          <span class="asset-thumb-icon" aria-hidden="true">🔊</span>
          <audio controls preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></audio>
        </div>`;
      } else {
        inner = `<div class="${thumbClass} ${thumbClass}-audio">
          <span class="asset-thumb-icon" aria-hidden="true">🔊</span>
        </div>`;
      }
    } else {
      inner = `<div class="${fallbackClass}"><span>${this.getListThumbIcon(category, name)}</span></div>`;
    }

    return this.wrapClickable(inner, category, name, context);
  },

  renderGridThumb(category, asset) {
    return this.renderListThumb(category, asset, { context: 'grid' });
  },

  renderPickerThumb(category, asset) {
    return this.renderListThumb(category, asset, { context: 'picker' });
  },

  render3dControlsOverlay() {
    return `<div class="preview-3d-controls">
      <label>Mode</label>
      <div class="preview-3d-mode-row">
        <button type="button" data-3d-mode="move" class="active" title="Move mode">Move</button>
        <button type="button" data-3d-mode="look" title="Look mode">Look</button>
      </div>
      <button type="button" class="btn-preview-3d-reset" title="Reset view (R)">Reset</button>
    </div>`;
  },

  renderModalBody(category, asset, options = {}) {
    const url = asset.url;
    const name = asset.name || '';

    if (category === 'images' || category === '360-images') {
      return `<img class="preview-image" src="${this.escapeAttr(url)}" alt="${this.escapeAttr(
        name
      )}" crossorigin="anonymous" />`;
    }

    if (category === '360-videos') {
      return `<div class="preview-video">
        <video controls autoplay muted playsinline preload="auto" crossorigin="anonymous" src="${this.escapeAttr(url)}"></video>
        <p class="preview-filename">${this.escapeAttr(name)}</p>
      </div>`;
    }

    if (category === 'audio') {
      return `<div class="preview-audio">
        <audio controls autoplay preload="auto" crossorigin="anonymous" src="${this.escapeAttr(url)}"></audio>
        <p class="preview-filename">${this.escapeAttr(name)}</p>
      </div>`;
    }

    if (category === '3d') {
      if (!this.is3dModelPreviewable(name)) {
        return `<p class="preview-unavailable">Preview not available for this 3D format. Use .glb or .gltf files.</p>`;
      }
      return `<div class="preview-3d-wrap preview-3d">
        <iframe title="3D model preview" class="preview-3d-frame" src="${this.escapeAttr(
          this.get3dPreviewPageUrl({ category, name, url })
        )}"></iframe>
        ${this.render3dControlsOverlay()}
        <p class="preview-hint">WASD move · drag look · pinch zoom · R reset</p>
        <p class="preview-filename">${this.escapeAttr(name)}</p>
      </div>`;
    }

    return `<p class="preview-unavailable">Preview not available for this file type.</p>`;
  },

  stopMedia(container) {
    if (!container) return;
    container.querySelectorAll('audio, video').forEach((el) => {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch (_) {}
    });
    container.querySelectorAll('iframe').forEach((el) => {
      el.src = 'about:blank';
    });
  },
};

if (typeof window !== 'undefined') {
  window.CommonAssetsPreview = CommonAssetsPreview;
}
