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

  renderGridThumb(category, asset) {
    const url = asset.url;
    const name = asset.name || '';

    if (category === 'images' || category === '360-images') {
      return `<img class="asset-thumb" src="${this.escapeAttr(url)}" alt="" loading="lazy" crossorigin="anonymous" />`;
    }

    if (category === '360-videos') {
      return `<div class="asset-thumb asset-thumb-video">
        <video muted playsinline preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></video>
        <span class="asset-thumb-label">360°</span>
      </div>`;
    }

    if (category === 'audio') {
      return `<div class="asset-thumb asset-thumb-audio">
        <span class="asset-thumb-icon" aria-hidden="true">🔊</span>
        <audio controls preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></audio>
      </div>`;
    }

    if (category === '3d' && this.is3dModelPreviewable(name)) {
      return `<div class="asset-thumb asset-thumb-3d">
        <iframe title="3D preview: ${this.escapeAttr(name)}" loading="lazy" src="${this.escapeAttr(
          this.get3dPreviewPageUrl({ category, name, url })
        )}"></iframe>
      </div>`;
    }

    const icon = category === '3d' ? '🎨' : category === 'other' ? '📄' : '📦';
    return `<div class="asset-thumb asset-thumb-fallback"><span>${icon}</span></div>`;
  },

  renderModalBody(category, asset) {
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
      return `<div class="preview-3d">
        <iframe title="3D model preview" class="preview-3d-frame" src="${this.escapeAttr(
          this.get3dPreviewPageUrl({ category, name, url })
        )}"></iframe>
        <p class="preview-hint">Drag to look around · Scroll to zoom</p>
        <p class="preview-filename">${this.escapeAttr(name)}</p>
      </div>`;
    }

    return `<p class="preview-unavailable">Preview not available for this file type.</p>`;
  },

  /** Compact row thumb for student picker modal */
  renderPickerThumb(category, asset) {
    const url = asset.url;
    const name = asset.name || '';

    if (category === 'images' || category === '360-images') {
      return `<img class="ca-item-thumb" src="${this.escapeAttr(url)}" alt="" loading="lazy" crossorigin="anonymous" />`;
    }

    if (category === '360-videos') {
      return `<div class="ca-item-thumb ca-item-thumb-video">
        <video muted playsinline preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></video>
      </div>`;
    }

    if (category === 'audio') {
      return `<div class="ca-item-thumb ca-item-thumb-audio">
        <audio controls preload="metadata" crossorigin="anonymous" src="${this.escapeAttr(url)}"></audio>
      </div>`;
    }

    if (category === '3d' && this.is3dModelPreviewable(name)) {
      return `<div class="ca-item-thumb ca-item-thumb-3d">
        <iframe title="3D preview" loading="lazy" src="${this.escapeAttr(
          this.get3dPreviewPageUrl({ category, name, url })
        )}"></iframe>
      </div>`;
    }

    const icon =
      category === '360-videos'
        ? '🎥'
        : category === 'audio'
          ? '🔊'
          : category === '3d'
            ? '🎨'
            : '📄';
    return `<div class="ca-item-thumb ca-item-thumb-fallback">${icon}</div>`;
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
