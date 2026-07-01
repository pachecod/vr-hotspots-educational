/* Immersive Museum — loads scene data from config.json (edit assets & exhibits there). */

let museumConfig = null;

async function loadMuseumConfig() {
  if (window.__FLAT_PAGE_CONFIG__ && Object.keys(window.__FLAT_PAGE_CONFIG__).length) {
    return window.__FLAT_PAGE_CONFIG__;
  }
  const res = await fetch('config.json');
  if (!res.ok) throw new Error('Could not load config.json');
  const data = await res.json();
  if (!data || typeof data !== 'object' || !Array.isArray(data.exhibits)) {
    throw new Error('config.json must include an exhibits array');
  }
  return data;
}

function showConfigError(message) {
  const overlay = document.getElementById('loading-overlay');
  const text = overlay && overlay.querySelector('.loading-text');
  if (text) text.textContent = message;
  if (overlay) overlay.classList.remove('is-hidden');
}

function assetNeedsCors(src) {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('/') || src.startsWith('.')) return false;
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch (_) {
    return false;
  }
}

function setAssetCors(el, src) {
  if (assetNeedsCors(src)) {
    el.crossOrigin = 'anonymous';
  } else if (el.removeAttribute) {
    el.removeAttribute('crossorigin');
  }
}

function resolveImageSrc(src) {
  if (!src || !src.startsWith('#')) return src;
  const assetId = src.slice(1);
  const fromConfig = museumConfig?.assets?.images?.[assetId];
  if (fromConfig) return fromConfig;
  const assetEl = document.querySelector('#' + assetId);
  return assetEl && assetEl.getAttribute('src') ? assetEl.getAttribute('src') : src;
}

/** Inline SVG chevron for slideshow nav (tinted via config labelColor). */
function chevronSvgDataUri(direction, color) {
  const stroke = /^#[0-9A-Fa-f]{3,8}$/.test(String(color || '').trim())
    ? String(color).trim()
    : '#FFFFFF';
  const path =
    direction === 'left'
      ? 'M 72 18 L 28 50 L 72 82'
      : 'M 28 18 L 72 50 L 28 82';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path d="' +
    path +
    '" fill="none" stroke="' +
    stroke +
    '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function registerImageAsset(id, src) {
  if (!id || !src) return;
  const assets = document.querySelector('a-assets');
  if (!assets || document.getElementById(id)) return;
  const img = document.createElement('img');
  img.id = id;
  img.src = src;
  setAssetCors(img, src);
  assets.appendChild(img);
}

function resolvePanelImageSrc(ref) {
  const resolved = resolveImageSrc(ref);
  if (resolved && resolved.startsWith('#')) {
    const assetId = resolved.slice(1);
    const url = museumConfig?.assets?.images?.[assetId];
    if (url) {
      registerImageAsset(assetId, url);
      return '#' + assetId;
    }
  }
  return resolved || ref;
}

function resolveModelSrc(src) {
  if (!src || !src.startsWith('#')) return src;
  const assetId = src.slice(1);
  const fromConfig = museumConfig?.assets?.models?.[assetId];
  if (fromConfig) return fromConfig;
  const assetEl = document.querySelector('#' + assetId);
  return assetEl && assetEl.getAttribute('src') ? assetEl.getAttribute('src') : src;
}

AFRAME.registerComponent('face-camera', {
  schema: { preserveY: { type: 'boolean', default: false } },
  tick: function () {
    const camera = document.querySelector('[camera]');
    if (!camera) return;
    if (this.data.preserveY) {
      const cam = camera.object3D.position.clone();
      const pos = this.el.object3D.position.clone();
      cam.y = pos.y;
      this.el.object3D.lookAt(cam);
    } else {
      this.el.object3D.lookAt(camera.object3D.position);
    }
  },
});

AFRAME.registerComponent('spot', {
  schema: {
    label: { type: 'string', default: '' },
    audio: { type: 'selector', default: null },
    info: { type: 'string', default: '' },
    exhibitModel: { type: 'string', default: '' },
    revealAnimation: { type: 'boolean', default: false },
  },
  init: function () {
    const el = this.el;
    const data = this.data;
    if (el.getAttribute('geometry')) return;

    el.setAttribute('geometry', { primitive: 'circle', radius: 0.45 });
    el.setAttribute('material', {
      color: '#FFFFFF',
      opacity: 0.75,
      transparent: true,
    });
    el.setAttribute('animation__pulse', {
      property: 'scale',
      dir: 'alternate',
      dur: 1000,
      easing: 'easeInOutSine',
      loop: true,
      to: '1.08 1.08 1.08',
    });

    if (data.label) {
      const bg = document.createElement('a-plane');
      bg.setAttribute('color', '#222');
      bg.setAttribute('opacity', '0.85');
      bg.setAttribute('position', '0 0.65 -0.01');
      bg.setAttribute('width', String(Math.max(1.2, data.label.length * 0.14)));
      bg.setAttribute('height', '0.32');
      const txt = document.createElement('a-text');
      txt.setAttribute('value', data.label);
      txt.setAttribute('align', 'center');
      txt.setAttribute('color', '#FFF');
      txt.setAttribute('width', '4');
      txt.setAttribute('position', '0 0.65 0');
      el.appendChild(bg);
      el.appendChild(txt);
    }

    el.addEventListener('click', () => this.onClick());
  },
  onClick: function () {
    const data = this.data;
    const infoEl = document.getElementById('museum-info');
    if (data.info && infoEl) {
      infoEl.textContent = data.info;
      infoEl.style.display = 'block';
      clearTimeout(this._infoTimer);
      this._infoTimer = setTimeout(() => {
        infoEl.style.display = 'none';
      }, 9000);
    }
    if (data.audio) {
      document.querySelectorAll('audio').forEach((a) => {
        if (a !== data.audio) {
          a.pause();
          a.currentTime = 0;
        }
      });
      data.audio.play().catch(() => {});
    }
    if (data.exhibitModel && data.revealAnimation) {
      const sel = data.exhibitModel.startsWith('#') ? data.exhibitModel : '#' + data.exhibitModel;
      const model = document.querySelector(sel);
      if (model && model.tagName === 'A-ENTITY') {
        const pos = model.getAttribute('position');
        const parts = typeof pos === 'string' ? pos.split(' ').map(Number) : [0, 0, 0];
        model.setAttribute('animation__reveal', {
          property: 'position',
          to: parts[0] + ' ' + (parts[1] + 0.8) + ' ' + parts[2],
          dur: 700,
          easing: 'easeOutQuad',
        });
        model.setAttribute('animation__spin', {
          property: 'rotation',
          to: '0 360 0',
          dur: 1600,
          easing: 'easeOutQuad',
        });
      }
    }
  },
});

AFRAME.registerComponent('enhanced-mobile-controls', {
  schema: { speed: { type: 'number', default: 2 } },
  init: function () {
    const self = this;
    this.numFingers = 0;
    this.updateTouches = (e) => {
      e.preventDefault();
      self.numFingers = e.touches.length;
    };
    this.clearTouches = (e) => {
      e.preventDefault();
      self.numFingers = (e.touches && e.touches.length) || 0;
    };
    this.el.sceneEl.addEventListener('renderstart', () => {
      const canvas = self.el.sceneEl.canvas;
      canvas.addEventListener('touchstart', self.updateTouches, { passive: false });
      canvas.addEventListener('touchmove', self.updateTouches, { passive: false });
      canvas.addEventListener('touchend', self.clearTouches, { passive: false });
      canvas.addEventListener('touchcancel', self.clearTouches, { passive: false });
    });
    if (!document.querySelector('.controls-guide')) {
      const guide = document.createElement('div');
      guide.className = 'controls-guide';
      guide.innerHTML = AFRAME.utils.device.isMobile()
        ? 'Touch: one finger moves forward, two moves back. Drag to look.'
        : 'WASD / arrows to move · mouse to look · click hotspots';
      document.body.appendChild(guide);
      setTimeout(() => {
        guide.style.opacity = '0';
        setTimeout(() => guide.remove(), 1000);
      }, 5000);
    }
  },
  tick: function (t, dt) {
    if (!this.numFingers) return;
    const cameraEl = this.el.querySelector('[camera]');
    if (!cameraEl) return;
    const dist = this.data.speed * (dt / 1000);
    const mult = this.numFingers === 1 ? -1 : 1;
    const dir = new THREE.Vector3();
    cameraEl.object3D.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize().multiplyScalar(dist * mult);
    this.el.object3D.position.add(dir);
    this.el.object3D.position.y = 0;
  },
});

class MuseumRuntime {
  constructor() {
    this.currentImageIndex = 0;
    this._bound = false;
    document.addEventListener('DOMContentLoaded', () => this.boot());
  }

  async boot() {
    try {
      museumConfig = await loadMuseumConfig();
      this.config = museumConfig;
    } catch (err) {
      showConfigError(err.message || 'Invalid config.json');
      return;
    }

    const scene = document.querySelector('a-scene');
    if (!scene) return;
    const start = () => this.build();
    if (scene.hasLoaded) start();
    else scene.addEventListener('loaded', start);
  }

  build() {
    this.createAssets();
    this.createEnvironment();
    this.createInfoDisplay();
    this.createExhibits();
    this.setupSlideshow();
    this.setupVR();
    this.trackLoading();
  }

  createAssets() {
    const assets = document.querySelector('a-assets');
    if (!assets || !this.config.assets) return;

    Object.entries(this.config.assets.images || {}).forEach(([id, src]) => {
      if (!src) return;
      const img = document.createElement('img');
      img.id = id;
      img.src = src;
      setAssetCors(img, src);
      assets.appendChild(img);
    });

    Object.entries(this.config.assets.models || {}).forEach(([id, src]) => {
      if (!src) return;
      const item = document.createElement('a-asset-item');
      item.id = id;
      item.setAttribute('src', src);
      item.setAttribute('type', 'gltf');
      assets.appendChild(item);
    });

    Object.entries(this.config.assets.audio || {}).forEach(([id, src]) => {
      if (!src) return;
      const audio = document.createElement('audio');
      audio.id = id;
      audio.src = src;
      audio.preload = 'auto';
      setAssetCors(audio, src);
      assets.appendChild(audio);
    });
  }

  createEnvironment() {
    const scene = document.querySelector('a-scene');
    const env = this.config.environment || {};
    if (!scene) return;

    const lighting = env.lighting || {};
    const amb = document.createElement('a-entity');
    amb.setAttribute('light', {
      type: 'ambient',
      color: lighting.ambient?.color || '#BBB',
      intensity: lighting.ambient?.intensity ?? 1,
    });
    scene.appendChild(amb);

    const sun = document.createElement('a-entity');
    sun.setAttribute('light', {
      type: 'directional',
      color: lighting.directional?.color || '#FFF',
      intensity: lighting.directional?.intensity ?? 0.9,
      castShadow: lighting.directional?.castShadow ?? true,
    });
    sun.setAttribute('position', lighting.directional?.position || '-1 2 1');
    scene.appendChild(sun);

    const ground = document.createElement('a-plane');
    const gSize = (env.ground?.size || '80 80').split(' ');
    ground.setAttribute('width', gSize[0]);
    ground.setAttribute('height', gSize[1] || gSize[0]);
    ground.setAttribute('rotation', '-90 0 0');
    if (env.ground?.texture) {
      ground.setAttribute(
        'material',
        'src: ' + env.ground.texture + '; repeat: ' + (env.ground.repeat || '8 8')
      );
    } else {
      ground.setAttribute('color', env.ground?.color || '#444');
    }
    ground.classList.add('ground', 'clickable');
    scene.appendChild(ground);

    const sky = document.createElement('a-sky');
    if (env.sky?.day) sky.setAttribute('src', env.sky.day);
    scene.appendChild(sky);
  }

  createInfoDisplay() {
    const scene = document.querySelector('a-scene');
    const info = this.config.infoDisplay;
    if (!scene || !info) return;

    const root = document.createElement('a-entity');
    root.id = 'info-display';
    root.setAttribute('position', info.position);

    const panelWrap = document.createElement('a-entity');
    panelWrap.id = 'image-panel-container';
    panelWrap.setAttribute('face-camera', '');
    panelWrap.setAttribute('position', info.panel.position);

    const panel = document.createElement('a-plane');
    panel.id = 'image-panel';
    const pSize = info.panel.size.split(' ');
    panel.setAttribute('width', pSize[0]);
    panel.setAttribute('height', pSize[1]);
    panel.setAttribute('material', 'src: ' + resolvePanelImageSrc(info.panel.images[0]) + '; side: double; shader: flat');
    panel.classList.add('clickable');
    panelWrap.appendChild(panel);

    this.createNavArrow(panelWrap, 'left', info.navigation.left);
    this.createNavArrow(panelWrap, 'right', info.navigation.right);

    const caption = document.createElement('a-entity');
    caption.id = 'info-text';
    caption.setAttribute('position', info.text.position);
    const tSize = info.text.size.split(' ');
    caption.setAttribute('text', {
      value: info.text.content.slide1 || 'Welcome',
      width: tSize[0],
      align: 'center',
      color: '#FFF',
    });
    caption.setAttribute('geometry', 'primitive: plane; width: ' + tSize[0] + '; height: ' + tSize[1]);
    caption.setAttribute('material', 'color: #222; opacity: 0.85; shader: flat');
    panelWrap.appendChild(caption);

    root.appendChild(panelWrap);
    scene.appendChild(root);
  }

  createNavArrow(container, dir, cfg) {
    if (cfg && cfg.visible === false) return;

    const wrap = document.createElement('a-entity');
    wrap.id = 'nav-' + dir;
    wrap.setAttribute('position', cfg.position);
    wrap.classList.add('clickable');

    const size = (cfg.size || '0.55 0.55').split(' ');
    const w = size[0];
    const h = size[1] || size[0];

    const bg = document.createElement('a-plane');
    bg.setAttribute('width', w);
    bg.setAttribute('height', h);
    bg.setAttribute('opacity', '0.85');
    bg.setAttribute('color', cfg.color || '#333333');
    bg.setAttribute('material', 'shader: flat');
    wrap.appendChild(bg);

    const customImage = (cfg.image || '').trim();
    const icon = document.createElement('a-image');
    icon.setAttribute('position', '0 0 0.02');
    icon.setAttribute('width', String(parseFloat(w) * 0.55));
    icon.setAttribute('height', String(parseFloat(h) * 0.55));
    icon.classList.add('clickable');

    if (customImage) {
      let src = resolveImageSrc(customImage);
      if (src && !src.startsWith('#') && !src.startsWith('data:')) {
        const assetId = 'nav-' + dir + '-img';
        registerImageAsset(assetId, src);
        src = '#' + assetId;
      }
      icon.setAttribute('src', src);
      icon.setAttribute('material', 'shader: flat; transparent: true');
    } else {
      icon.setAttribute('src', chevronSvgDataUri(dir, cfg.labelColor || '#FFFFFF'));
      icon.setAttribute('material', 'shader: flat; transparent: true; alphaTest: 0.01');
    }

    wrap.appendChild(icon);
    container.appendChild(wrap);
  }

  createExhibits() {
    const scene = document.querySelector('a-scene');
    if (!scene || !Array.isArray(this.config.exhibits)) return;

    this.config.exhibits.forEach((exhibit) => {
      const group = document.createElement('a-entity');
      group.id = exhibit.id;
      group.setAttribute('position', exhibit.position);

      const model = document.createElement('a-entity');
      model.id = exhibit.model.id;
      model.setAttribute('gltf-model', resolveModelSrc(exhibit.model.src));
      model.setAttribute('position', exhibit.model.position);
      model.setAttribute('scale', exhibit.model.scale);
      model.setAttribute('rotation', exhibit.model.rotation);
      group.appendChild(model);

      const platform = document.createElement('a-entity');
      platform.setAttribute('geometry', exhibit.environment.geometry);
      platform.setAttribute('position', exhibit.environment.position);
      platform.setAttribute('material', exhibit.environment.material);
      group.appendChild(platform);

      const hotspot = document.createElement('a-entity');
      hotspot.id = exhibit.hotspot.id;
      hotspot.setAttribute('position', exhibit.hotspot.position);
      hotspot.setAttribute('face-camera', 'preserveY: true');
      hotspot.classList.add('clickable');
      const spotData = {
        label: exhibit.hotspot.label,
        info: exhibit.hotspot.info,
        exhibitModel: exhibit.hotspot.exhibitModel || exhibit.model.id,
        revealAnimation: !!exhibit.hotspot.revealAnimation,
      };
      if (exhibit.hotspot.audio) spotData.audio = exhibit.hotspot.audio;
      hotspot.setAttribute('spot', spotData);
      group.appendChild(hotspot);

      scene.appendChild(group);
    });
  }

  setupSlideshow() {
    if (this._bound) return;
    const images = this.config.infoDisplay?.panel?.images || [];
    const panel = document.querySelector('#image-panel');
    const infoText = document.querySelector('#info-text');
    const content = this.config.infoDisplay?.text?.content || {};
    if (!panel || !images.length) return;

    const update = () => {
      const src = resolvePanelImageSrc(images[this.currentImageIndex]);
      panel.setAttribute('material', 'src: ' + src + '; side: double; shader: flat');
      const keys = ['slide1', 'slide2', 'slide3'];
      const text = content[keys[this.currentImageIndex]] || content.slide1 || '';
      if (infoText) infoText.setAttribute('text', 'value', text);
    };

    document.querySelector('#nav-left')?.addEventListener('click', () => {
      this.currentImageIndex = (this.currentImageIndex - 1 + images.length) % images.length;
      update();
    });
    document.querySelector('#nav-right')?.addEventListener('click', () => {
      this.currentImageIndex = (this.currentImageIndex + 1) % images.length;
      update();
    });
    this._bound = true;
    update();
  }

  setupVR() {
    const btn = document.getElementById('vr-toggle');
    const scene = document.querySelector('a-scene');
    if (!btn || !scene || !scene.hasWebXR) return;
    btn.hidden = false;
    scene.addEventListener('enter-vr', () => {
      btn.textContent = 'Exit VR';
    });
    scene.addEventListener('exit-vr', () => {
      btn.textContent = 'Enter VR';
    });
    btn.addEventListener('click', () => {
      if (scene.is('vr-mode')) scene.exitVR();
      else scene.enterVR();
    });
  }

  trackLoading() {
    const overlay = document.getElementById('loading-overlay');
    const bar = document.getElementById('loading-bar');
    const assets = document.querySelector('a-assets');
    if (!overlay) return;

    let hidden = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      overlay.classList.add('is-hidden');
    };

    let total = 0;
    let loaded = 0;
    const bump = () => {
      loaded += 1;
      if (bar && total) bar.style.width = Math.min(100, (loaded / total) * 100) + '%';
      if (loaded >= total) setTimeout(hide, 400);
    };

    const watchImage = (img) => {
      if (img.complete && img.naturalWidth > 0) bump();
      else {
        img.addEventListener('load', bump, { once: true });
        img.addEventListener('error', bump, { once: true });
      }
    };

    if (assets) {
      const items = assets.querySelectorAll('img');
      total = Math.max(items.length, 1);
      if (items.length) items.forEach(watchImage);
      else bump();
    } else {
      total = 1;
      bump();
    }

    setTimeout(hide, 4000);
  }
}

new MuseumRuntime();
