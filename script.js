// Face camera component with robust camera resolution and world-space alignment
AFRAME.registerComponent('face-camera', {
  init: function () {
    this._tmp = new THREE.Vector3();
    this._cameraEl = null;
  },
  tick: function () {
    // Resolve camera lazily in case it isn't ready at init
    if (!this._cameraEl || !this._cameraEl.object3D) {
      this._cameraEl = document.querySelector('[camera]') || document.getElementById('cam');
      if (!this._cameraEl || !this._cameraEl.object3D) return;
    }
    // Use world position to avoid parent transform discrepancies
    this._cameraEl.object3D.getWorldPosition(this._tmp);
    this.el.object3D.lookAt(this._tmp);
  },
});

let _flatVideoScene360PauseCount = 0;

function prepareFlatVideoHotspotElement(video, muted) {
  if (!video || video.tagName !== 'VIDEO') return;
  try {
    video.muted = muted !== false;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (!video.crossOrigin) {
      video.crossOrigin = 'anonymous';
      video.setAttribute('crossorigin', 'anonymous');
    }
  } catch (_) {}
}

function isVideoSkyboxActive() {
  try {
    const ed = window.hotspotEditor;
    if (ed && typeof ed.isVideoSkyboxScene === 'function' && ed.isVideoSkyboxScene()) {
      return true;
    }
    const hp = window.hotspotProject;
    if (hp && hp._sceneMediaType === 'video') return true;
  } catch (_) {}
  return false;
}

function pauseScene360VideoForFlatHotspot() {
  const sceneVideo = document.getElementById('scene-video-dynamic');
  if (!sceneVideo) return;
  if (_flatVideoScene360PauseCount === 0) {
    sceneVideo._wasPlayingBeforeFlatHotspot = !sceneVideo.paused;
    if (sceneVideo._wasPlayingBeforeFlatHotspot) {
      try {
        sceneVideo.pause();
      } catch (_) {}
    }
    try {
      const ed = window.hotspotEditor;
      const hp = window.hotspotProject;
      if (ed && typeof ed.suspendVideoSkyboxForFlatHotspot === 'function') {
        ed.suspendVideoSkyboxForFlatHotspot();
      } else if (hp && typeof hp.suspendVideoSkyboxForFlatHotspot === 'function') {
        hp.suspendVideoSkyboxForFlatHotspot();
      }
    } catch (_) {}
  }
  _flatVideoScene360PauseCount++;
}

function resumeScene360VideoAfterFlatHotspot() {
  _flatVideoScene360PauseCount = Math.max(0, _flatVideoScene360PauseCount - 1);
  if (_flatVideoScene360PauseCount > 0) return;
  try {
    const ed = window.hotspotEditor;
    const hp = window.hotspotProject;
    if (ed && typeof ed.resumeVideoSkyboxAfterFlatHotspot === 'function') {
      ed.resumeVideoSkyboxAfterFlatHotspot();
      return;
    }
    if (hp && typeof hp.resumeVideoSkyboxAfterFlatHotspot === 'function') {
      hp.resumeVideoSkyboxAfterFlatHotspot();
      return;
    }
  } catch (_) {}
  const sceneVideo = document.getElementById('scene-video-dynamic');
  if (sceneVideo && sceneVideo._wasPlayingBeforeFlatHotspot) {
    try {
      sceneVideo.play().catch(function () {});
    } catch (_) {}
  }
}

function isVideoHotspot(h) {
  if (!h || h.type !== 'image') return false;
  if (h.mediaKind === 'video') return true;
  return !!(
    h.videoStorageKey ||
    h.commonAssetUrl ||
    h.videoFileName ||
    h.video instanceof File ||
    (typeof h.video === 'string' && h.video.trim() !== '')
  );
}

function hasVideoHotspotReference(h) {
  if (!h) return false;
  if (h.video instanceof File) return true;
  if (typeof h.video === 'string' && h.video.trim() !== '') return true;
  if (h.videoStorageKey) return true;
  if (h.commonAssetUrl) return true;
  return false;
}

function hasImageHotspotReference(h) {
  if (!h || h.type !== 'image' || isVideoHotspot(h)) return false;
  if (h.image instanceof File) return true;
  if (typeof h.image === 'string' && h.image.trim() !== '') return true;
  if (h.imageStorageKey) return true;
  if (h.commonAssetUrl) return true;
  if (h.imageFileName) return true;
  return false;
}

function isEditorVideoSkyboxScene() {
  try {
    const ed = window.hotspotEditor;
    if (!ed || !ed.scenes) return false;
    const scene = ed.scenes[ed.currentScene];
    if (!scene || scene.type !== 'video') return false;
    return !!ed.resolveSceneVideoSrc(scene);
  } catch (_) {
    return false;
  }
}

function resolveFlatVideoHotspotVideos(videoSrcRef, aVideoEl, parentEl) {
  const videos = [];
  const seen = new Set();
  const add = (video) => {
    if (video && video.tagName === 'VIDEO' && typeof video.play === 'function' && !seen.has(video)) {
      seen.add(video);
      videos.push(video);
    }
  };
  try {
    if (aVideoEl) {
      const mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
      const map = mesh && mesh.material && mesh.material.map;
      add(map && map.image);
      const srcAttr = aVideoEl.getAttribute && aVideoEl.getAttribute('src');
      if (srcAttr && srcAttr.startsWith('#')) {
        add(document.getElementById(srcAttr.slice(1)));
      }
      const assetFromData = aVideoEl.dataset && aVideoEl.dataset.videoAssetId;
      if (assetFromData) add(document.getElementById(assetFromData));
    }
    if (parentEl && parentEl.dataset && parentEl.dataset.flatVideoAssetId) {
      add(document.getElementById(parentEl.dataset.flatVideoAssetId));
    }
    if (typeof videoSrcRef === 'string' && videoSrcRef.startsWith('#')) {
      add(document.getElementById(videoSrcRef.slice(1)));
    }
  } catch (_) {}
  return videos;
}

function playFlatVideoHotspotVideos(videos, aVideoEl, muted) {
  if (!videos || !videos.length) return Promise.resolve(false);
  pauseScene360VideoForFlatHotspot();

  const runPlayback = () => {
    videos.forEach((video) => prepareFlatVideoHotspotElement(video, muted));
    const playOne = (video) => {
      try {
        if (video.readyState < 1) {
          return new Promise((resolve) => {
            const onReady = () => {
              video.removeEventListener('loadeddata', onReady);
              video.removeEventListener('canplay', onReady);
              resolve(video.play().catch(function () { return false; }));
            };
            video.addEventListener('loadeddata', onReady, { once: true });
            video.addEventListener('canplay', onReady, { once: true });
            try {
              video.load();
            } catch (_) {}
          });
        }
        return video.play().catch(function () { return false; });
      } catch (_) {
        return Promise.resolve(false);
      }
    };
    return Promise.all(videos.map(playOne)).then(function () {
      try {
        if (aVideoEl) {
          const mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
          const map = mesh && mesh.material && mesh.material.map;
          if (map) map.needsUpdate = true;
        }
      } catch (_) {}
      return true;
    });
  };

  if (isVideoSkyboxActive()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(runPlayback()), 100);
    });
  }
  return runPlayback();
}

function pauseFlatVideoHotspotVideos(videos, aVideoEl) {
  if (!videos || !videos.length) return;
  videos.forEach((video) => {
    try {
      video.pause();
    } catch (_) {}
  });
  try {
    if (aVideoEl) {
      const mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
      const map = mesh && mesh.material && mesh.material.map;
      if (map) map.needsUpdate = true;
    }
  } catch (_) {}
  resumeScene360VideoAfterFlatHotspot();
}

function setFlatVideoHotspotPlayback(parentEl, aVideoEl, videos, playing, userAction, muted) {
  if (!videos || !videos.length) return Promise.resolve();
  if (userAction && parentEl) parentEl._flatVideoUserPaused = !playing;
  const useMuted = muted !== false;
  const playbackPromise = playing
    ? playFlatVideoHotspotVideos(videos, aVideoEl, useMuted)
    : (pauseFlatVideoHotspotVideos(videos, aVideoEl), Promise.resolve());
  if (aVideoEl) {
    try {
      aVideoEl.setAttribute('autoplay', playing ? 'true' : 'false');
    } catch (_) {}
  }
  return playbackPromise;
}

function setFlatVideoHotspotMuted(videos, muted) {
  if (!videos || !videos.length) return;
  videos.forEach((video) => {
    try {
      video.muted = muted;
    } catch (_) {}
  });
}

function clearFlatVideoHotspotOverlay(parentEl) {
  if (!parentEl) return;
  parentEl
    .querySelectorAll(
      '.static-video-hotspot, .video-play-control, .video-audio-control, .video-audio-label'
    )
    .forEach((node) => {
      try {
        node.remove();
      } catch (_) {}
    });
  delete parentEl._flatVideoControls;
}

function attachFlatVideoHotspotControls(parentEl, videoSrcRef, options) {
  options = options || {};
  const styles = options.styles || null;
  const aVideoEl = options.aVideoEl || null;
  const startMuted = options.startMuted !== false;
  const playImage = styles?.buttonImages?.play || '#play';
  const pauseImage = styles?.buttonImages?.pause || '#pause';
  const buttonColor = styles?.audio?.buttonColor || '#FFFFFF';
  const buttonOpacity = String(styles?.audio?.buttonOpacity ?? 1.0);
  const btnY = options.controlY != null ? options.controlY : -0.35;
  const btnZ = options.controlZ != null ? options.controlZ : 0.12;

  const getVideos = () => resolveFlatVideoHotspotVideos(videoSrcRef, aVideoEl, parentEl);

  const playBtn = document.createElement('a-image');
  playBtn.setAttribute('class', 'clickable video-control video-play-control');
  playBtn.setAttribute('src', playImage);
  playBtn.setAttribute('width', '0.5');
  playBtn.setAttribute('height', '0.5');
  playBtn.setAttribute('material', 'color: ' + buttonColor);
  playBtn.setAttribute('opacity', buttonOpacity);
  playBtn.setAttribute('position', '0 ' + btnY + ' ' + btnZ);
  parentEl.appendChild(playBtn);

  let isPlaying = false;
  let isMuted = startMuted;
  let boundVideos = new Set();

  const syncFromVideo = () => {
    const videos = getVideos();
    const video = videos[0];
    if (!video) return;
    isPlaying = !video.paused;
    isMuted = !!video.muted;
    playBtn.setAttribute('src', isPlaying ? pauseImage : playImage);
  };

  const bindVideoListeners = () => {
    const videos = getVideos();
    if (!videos.length) return false;
    videos.forEach((video) => {
      if (boundVideos.has(video)) return;
      boundVideos.add(video);
      video.addEventListener('play', syncFromVideo);
      video.addEventListener('pause', syncFromVideo);
      video.addEventListener('volumechange', syncFromVideo);
    });
    syncFromVideo();
    return true;
  };

  const togglePlay = (e) => {
    if (e) {
      e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
    }
    let videos = getVideos();
    if (!videos.length) {
      bindVideoListeners();
      videos = getVideos();
    }
    if (!videos.length) return;
    const nextPlaying = !isPlaying;
    setFlatVideoHotspotPlayback(parentEl, aVideoEl, videos, nextPlaying, true, isMuted).then(() => {
      syncFromVideo();
    });
  };

  const bindControl = (el, handler) => {
    el.addEventListener('click', (e) => {
      handler(e);
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      handler(e);
    });
    el.addEventListener('triggerdown', handler);
  };

  bindControl(playBtn, togglePlay);

  playBtn.setAttribute('animation__hover_in', {
    property: 'scale',
    to: '1.2 1.2 1',
    dur: 200,
    easing: 'easeOutQuad',
    startEvents: 'mouseenter',
  });
  playBtn.setAttribute('animation__hover_out', {
    property: 'scale',
    to: '1 1 1',
    dur: 200,
    easing: 'easeOutQuad',
    startEvents: 'mouseleave',
  });

  if (!bindVideoListeners() && aVideoEl) {
    aVideoEl.addEventListener('materialvideoloadeddata', bindVideoListeners, { once: true });
    aVideoEl.addEventListener('loadeddata', bindVideoListeners, { once: true });
    const poll = setInterval(() => {
      if (bindVideoListeners()) clearInterval(poll);
    }, 200);
    setTimeout(() => clearInterval(poll), 8000);
  }

  parentEl._flatVideoControls = { playBtn, syncFromVideo };
  return parentEl._flatVideoControls;
}

function mountEditorFlatVideoBillboard(component, data, forceRemount) {
  const el = component.el;
  if (!data || data.mediaKind !== 'video' || !data.videoSrc) return;

  let _src = data.videoSrc;
  if (_src && _src.includes('%')) {
    try {
      _src = decodeURIComponent(_src);
    } catch (_) {}
  }

  if (
    !forceRemount &&
    component._mountedFlatVideoSrc === _src &&
    el.querySelector('.static-video-hotspot')
  ) {
    return;
  }

  const assetId = _src.startsWith('#') ? _src.slice(1) : '';
  const assetEl = assetId ? document.getElementById(assetId) : null;
  if (assetId) el.dataset.flatVideoAssetId = assetId;
  if (assetEl && !assetEl.src && !assetEl.currentSrc) {
    return;
  }

  const doMount = () => {
    clearFlatVideoHotspotOverlay(el);

    const vid = document.createElement('a-video');
    vid.setAttribute('src', _src);
    vid.setAttribute('autoplay', false);
    vid.setAttribute('loop', data.videoLoop !== false);
    vid.setAttribute('muted', data.videoMuted !== false);
    vid.setAttribute('playsinline', true);
    vid.setAttribute('crossorigin', 'anonymous');
    if (!vid.getAttribute('material')) vid.setAttribute('material', 'transparent:true; side:double');
    const scl = data.imageScale || 1;
    const knownAR =
      typeof data.imageAspectRatio === 'number' &&
      isFinite(data.imageAspectRatio) &&
      data.imageAspectRatio > 0
        ? data.imageAspectRatio
        : 1;
    if (knownAR !== 1) vid.dataset.aspectRatio = String(knownAR);
    vid.setAttribute('width', 1);
    vid.setAttribute('height', knownAR);
    vid.setAttribute('scale', `${scl} ${scl} 1`);
    vid.setAttribute('position', `0 ${(knownAR / 2) * scl} 0.05`);
    vid.classList.add('static-video-hotspot');
    vid.classList.add('clickable');
    if (assetId) vid.dataset.videoAssetId = assetId;
    vid.setAttribute('visible', 'false');
    disableImageHotspotCulling(vid);

    const revealVideo = () => {
      vid.setAttribute('visible', 'true');
    };
    vid.addEventListener('materialvideoloadeddata', revealVideo, { once: true });
    vid.addEventListener('loadeddata', revealVideo, { once: true });
    if (assetId && assetEl && assetEl.readyState >= 2) {
      setTimeout(revealVideo, 0);
    }

    let fusingTimer = null;
    let isExpanded = false;
    const editorRef = window.hotspotEditor;
    const gazeDuration =
      editorRef &&
      editorRef.customStyles &&
      editorRef.customStyles.gaze &&
      editorRef.customStyles.gaze.duration
        ? Math.round(editorRef.customStyles.gaze.duration * 1000)
        : 2000;
    vid.addEventListener('raycaster-intersected', (evt) => {
      const cursorEl = evt.detail.el;
      if (cursorEl && cursorEl.id === 'gaze-cursor') {
        if (fusingTimer) clearTimeout(fusingTimer);
        fusingTimer = setTimeout(() => {
          isExpanded = true;
          vid.setAttribute('scale', `${scl * 2} ${scl * 2} 1`);
        }, gazeDuration);
      }
    });
    vid.addEventListener('raycaster-intersected-cleared', (evt) => {
      const cursorEl = evt.detail.el;
      if (cursorEl && cursorEl.id === 'gaze-cursor') {
        if (fusingTimer) {
          clearTimeout(fusingTimer);
          fusingTimer = null;
        }
        isExpanded = false;
        vid.setAttribute('scale', `${scl} ${scl} 1`);
      }
    });

    const editor = window.hotspotEditor;
    if (editor && editor.customStyles && editor.customStyles.image) {
      const istyle = editor.customStyles.image;
      const opacity = typeof istyle.opacity === 'number' ? istyle.opacity : 1.0;
      vid.setAttribute(
        'material',
        `opacity: ${opacity}; transparent: ${opacity < 1 ? 'true' : 'false'}; side: double`
      );
    }

    const applyVideoAR = () => {
      try {
        const videoEl = assetId ? document.getElementById(assetId) : null;
        const nW = videoEl?.videoWidth || 0;
        const nH = videoEl?.videoHeight || 0;
        const ratio =
          nW > 0 && nH > 0 ? nH / nW : parseFloat(vid.dataset.aspectRatio || '') || 1;
        if (ratio && isFinite(ratio) && ratio > 0) {
          vid.dataset.aspectRatio = String(ratio);
          vid.setAttribute('width', 1);
          vid.setAttribute('height', ratio);
          vid.setAttribute('scale', `${scl} ${scl} 1`);
          vid.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
          try {
            const idStr = el.id || '';
            const id = idStr.startsWith('hotspot-') ? parseInt(idStr.slice(8), 10) : NaN;
            if (!isNaN(id) && window.hotspotEditor)
              window.hotspotEditor._persistImageAspectRatio(id, ratio);
          } catch (_) {}
          if (el._repositionEditButtons) el._repositionEditButtons();
        }
      } catch (_) {}
    };

    try {
      const videoEl = assetId ? document.getElementById(assetId) : null;
      if (videoEl) {
        prepareFlatVideoHotspotElement(videoEl, data.videoMuted !== false);
        videoEl.loop = data.videoLoop !== false;
        videoEl.addEventListener('loadedmetadata', applyVideoAR, { once: true });
        try {
          videoEl.load();
        } catch (_) {}
      }
    } catch (_) {}

    setTimeout(applyVideoAR, 250);
    setTimeout(applyVideoAR, 800);
    el.appendChild(vid);
    el._flatVideoUserPaused = true;
    attachFlatVideoHotspotControls(el, _src, {
      aVideoEl: vid,
      startMuted: data.videoMuted !== false,
      styles: editor && editor.customStyles ? editor.customStyles : null,
    });
    component._mountedFlatVideoSrc = _src;
    if (el._repositionEditButtons) el._repositionEditButtons();
    try {
      const ed = window.hotspotEditor;
      if (ed) ed._refreshInSceneEditButtonMaterials(el);
    } catch (_) {}
  };

  if (assetEl && assetEl.readyState < 2) {
    const onReady = () => {
      assetEl.removeEventListener('loadeddata', onReady);
      assetEl.removeEventListener('canplay', onReady);
      assetEl.removeEventListener('error', onError);
      doMount();
    };
    const onError = () => {
      assetEl.removeEventListener('loadeddata', onReady);
      assetEl.removeEventListener('canplay', onReady);
      assetEl.removeEventListener('error', onError);
      console.warn('[VideoHotspot] Asset failed to load:', assetEl.src || _src);
    };
    assetEl.addEventListener('loadeddata', onReady, { once: true });
    assetEl.addEventListener('canplay', onReady, { once: true });
    assetEl.addEventListener('error', onError, { once: true });
    return;
  }

  doMount();
}

// Optimized global helper with caching + debouncing for rounded image masking (transparent corners)
const IMAGE_MASK_CACHE = new Map(); // key: src|styleKey -> dataURL
const IMAGE_MASK_MAX_DIMENSION = 1024;
const IMAGE_MASK_MAX_DATA_URL_LENGTH = 6_000_000;

function imageMaskStyleKey(styleCfg) {
  if (!styleCfg) return '0|0|';
  return `${styleCfg.borderRadius || 0}|${styleCfg.borderWidth || 0}|${styleCfg.borderColor || ''}`;
}

function mergeAImageMaterial(aImgEl, patch) {
  if (!aImgEl || !patch) return;
  const current = aImgEl.getAttribute('material');
  if (current && typeof current === 'object') {
    aImgEl.setAttribute('material', Object.assign({}, current, patch));
    return;
  }
  aImgEl.setAttribute(
    'material',
    Object.assign(
      {
        shader: 'flat',
        side: 'double',
        transparent: false,
        opacity: 1,
      },
      patch
    )
  );
}

// A-Frame's <a-image> texture system silently fails to bind `blob:` URLs
// (no `materialtextureloaded` event fires, material.map stays null), while it
// binds `data:` and `http(s):` URLs fine. Flat image hotspots loaded from
// IndexedDB / file uploads use blob URLs, which is why their billboards would
// "flash then disappear". Convert blob URLs to data URLs before assigning them
// to the element's `src` so the texture reliably binds.
function setAImageHotspotSrc(imgEl, src) {
  if (!imgEl || !src || typeof src !== 'string') return;
  if (!src.startsWith('blob:')) {
    imgEl.setAttribute('src', src);
    return;
  }
  fetch(src)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        })
    )
    .then((dataUrl) => {
      if (document.body.contains(imgEl)) imgEl.setAttribute('src', dataUrl);
    })
    .catch(() => {
      imgEl.setAttribute('src', src);
    });
}

// A-Frame <a-image>/<a-video> billboard meshes whose geometry (width/height) and
// position change AFTER creation (e.g. once the texture's real aspect ratio is known)
// can be incorrectly frustum-culled by three.js because the cached bounding sphere /
// world matrix used for culling goes stale. That produces a "flash then disappear":
// the mesh renders once, then a later geometry/position update leaves it culled.
// Disabling frustum culling on these few small billboards is the standard, low-cost fix.
function disableImageHotspotCulling(aImgEl) {
  if (!aImgEl) return;
  const apply = () => {
    try {
      const mesh = aImgEl.getObject3D('mesh');
      if (mesh) {
        mesh.frustumCulled = false;
        if (mesh.geometry && mesh.geometry.computeBoundingSphere) {
          mesh.geometry.computeBoundingSphere();
        }
      }
    } catch (_) {}
  };
  apply();
  aImgEl.addEventListener('object3dset', apply);
}

function applyMaskedImageMaterial(aImgEl) {
  mergeAImageMaterial(aImgEl, {
    transparent: true,
    shader: 'flat',
    alphaTest: 0.01,
    side: 'double',
  });
}

function restoreUnmaskedImageMaterial(aImgEl) {
  mergeAImageMaterial(aImgEl, { transparent: false, alphaTest: 0, opacity: 1 });
}

function applyRoundedMaskToAImage(aImgEl, styleCfg, force = false) {
  try {
    if (!aImgEl || !styleCfg) return Promise.resolve();
    const src = aImgEl.getAttribute('src');
    if (!src || src.startsWith('data:image/gif')) return Promise.resolve();
    const styleKey = imageMaskStyleKey(styleCfg);
    const cacheKey = `${src}|${styleKey}`;
    if (!force && aImgEl.dataset.roundedAppliedRadius === styleKey) return Promise.resolve();
    if (IMAGE_MASK_CACHE.has(cacheKey)) {
      const cached = IMAGE_MASK_CACHE.get(cacheKey);
      if (!aImgEl.dataset.originalSrc && !src.startsWith('data:image')) {
        aImgEl.dataset.originalSrc = src;
      }
      aImgEl.setAttribute('src', cached);
      applyMaskedImageMaterial(aImgEl);
      aImgEl.dataset.roundedAppliedRadius = styleKey;
      return Promise.resolve();
    }
    if (aImgEl._maskTimer) clearTimeout(aImgEl._maskTimer);
    return new Promise((resolve) => {
      aImgEl._maskTimer = setTimeout(() => {
        let originalSrc;
        try {
          originalSrc = aImgEl.dataset.originalSrc || aImgEl.getAttribute('src');
        } catch (_) {
          return resolve();
        }
        if (!originalSrc || originalSrc.startsWith('data:image/gif')) return resolve();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            let w = img.naturalWidth || 0;
            let h = img.naturalHeight || 0;
            if (!w || !h) return resolve();
            const maxDim = Math.max(w, h);
            if (maxDim > IMAGE_MASK_MAX_DIMENSION) {
              const scale = IMAGE_MASK_MAX_DIMENSION / maxDim;
              w = Math.max(1, Math.round(w * scale));
              h = Math.max(1, Math.round(h * scale));
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            const r = Math.max(0, Math.min(w / 2, (styleCfg.borderRadius || 0) * w));
            const bw = Math.max(0, (styleCfg.borderWidth || 0) * w);
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(w - r, 0);
            ctx.quadraticCurveTo(w, 0, w, r);
            ctx.lineTo(w, h - r);
            ctx.quadraticCurveTo(w, h, w - r, h);
            ctx.lineTo(r, h);
            ctx.quadraticCurveTo(0, h, 0, h - r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
            ctx.clip();
            try {
              ctx.drawImage(img, 0, 0, w, h);
            } catch (_) {
              return resolve();
            }
            if (bw > 0) {
              ctx.lineWidth = bw * 2;
              ctx.strokeStyle = styleCfg.borderColor || '#FFFFFF';
              ctx.stroke();
            }
            try {
              ctx.getImageData(0, 0, 1, 1);
            } catch (_) {
              return resolve();
            }
            let masked = '';
            try {
              masked = canvas.toDataURL('image/png');
            } catch (_) {
              return resolve();
            }
            if (!masked || masked.length > IMAGE_MASK_MAX_DATA_URL_LENGTH) {
              console.warn('[ImageRound] Mask output too large, keeping original texture');
              return resolve();
            }
            IMAGE_MASK_CACHE.set(cacheKey, masked);
            if (!aImgEl.dataset.originalSrc && !originalSrc.startsWith('data:image')) {
              aImgEl.dataset.originalSrc = originalSrc;
            }
            aImgEl.setAttribute('src', masked);
            applyMaskedImageMaterial(aImgEl);
            aImgEl.dataset.roundedAppliedRadius = styleKey;
            setTimeout(() => {
              try {
                const mesh = aImgEl.getObject3D('mesh');
                const texImg = mesh?.material?.map?.image;
                if ((!texImg || !texImg.naturalWidth) && aImgEl.dataset.originalSrc) {
                  aImgEl.setAttribute('src', aImgEl.dataset.originalSrc);
                  restoreUnmaskedImageMaterial(aImgEl);
                  delete aImgEl.dataset.roundedAppliedRadius;
                }
              } catch (_) {}
            }, 800);
          } catch (_) {
            /* ignore */
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = originalSrc;
      }, 60); // debounce to batch rapid style edits
    });
  } catch (e) {
    return Promise.resolve();
  }
}

// Z-index layers: editor panel < scene overlays < dialogs/progress/toasts
const EDITOR_LAYER = Object.freeze({
  panel: 1000,
  sceneOverlay: 100000,
  dialog: 100050,
  progress: 100055,
  picker: 100060,
  toast: 100060,
});

function removeEditorOverlayDialogs() {
  document.querySelectorAll('.editor-overlay-dialog').forEach((el) => el.remove());

  const dialogZ = String(EDITOR_LAYER.dialog);
  document.querySelectorAll('body > div').forEach((div) => {
    if (div.id === 'common-assets-modal' || div.id === 'asset-preview-modal') return;
    if (div.classList.contains('editor-overlay-dialog')) return;
    const pos = div.style.position || getComputedStyle(div).position;
    const z = div.style.zIndex || getComputedStyle(div).zIndex;
    if (pos === 'fixed' && z === dialogZ) {
      div.remove();
    }
  });
}

function showAssetLibraryModal() {
  const modal = document.getElementById('common-assets-modal');
  if (!modal) return null;
  removeEditorOverlayDialogs();
  document.body.appendChild(modal);
  modal.style.zIndex = String(EDITOR_LAYER.picker);
  modal.style.display = 'flex';
  return modal;
}

// Hotspot Editor Manager
const APP_VERSION = '2.0.0';

class HotspotEditor {
  constructor() {
    this.hotspots = [];
    this.editMode = false;
    this.selectedHotspotType = 'text';
    this.hotspotIdCounter = 0;
    this.selectedHotspotId = null;
    this.scenes = {
      scene1: {
        name: 'Scene 1',
        type: 'image', // NEW: "image" or "video"
        image: './images/scene1.jpg',
        videoSrc: null, // NEW: video source for video scenes
        videoVolume: 0.5, // NEW: 0-1 volume control
        hotspots: [],
        startingPoint: null, // { rotation: { x: 0, y: 0, z: 0 } }
        globalSound: null, // { audio: string|File, volume: number, enabled: boolean }
        ground: {
          enabled: false,
          diffuseMap: null,
          normalMap: null,
          roughnessMap: null,
          aoMap: null,
          displacementMap: null,
          size: { width: 50, depth: 50 },
          position: { x: 0, y: 0, z: 0 },
          repeat: 20,
        },
      },
    };
    this.currentScene = 'scene1';
    this.navigationMode = false; // false = edit mode, true = navigation mode
    this.editorGlobalSoundEnabled = false; // For editor controls - start disabled
    this.editorGlobalAudio = null; // For editor audio playback
    this.editorProgressInterval = null; // For editor progress tracking
    this._modelActionOverlay = null;
    this._modelActionEscHandler = null;

    // CSS Customization Settings
    this.customStyles = {
      hotspot: {
        infoButton: {
          backgroundColor: '#4A90E2', // Blue background for i icon
          textColor: '#FFFFFF',
          fontSize: 12, // Larger font for i icon
          opacity: 0.9,
          size: 0.4, // Size of the i icon circle
        },
        popup: {
          backgroundColor: '#333333',
          textColor: '#FFFFFF',
          borderColor: '#555555',
          borderWidth: 0,
          borderRadius: 0,
          opacity: 0.95,
          fontSize: 1,
          padding: 0.2,
        },
        closeButton: {
          size: 0.4,
          opacity: 1.0,
        },
      },
      audio: {
        buttonColor: '#FFFFFF',
        buttonOpacity: 1.0,
      },
      buttonImages: {
        play: 'images/play.png',
        pause: 'images/pause.png',
      },
      navigation: {
        ringColor: '#005500',
        ringOuterRadius: 0.6,
        ringThickness: 0.02,
        weblinkRingColor: '#001f5b',
        // Hover label (portal title)
        labelColor: '#FFFFFF',
        labelBackgroundColor: '#000000',
        labelOpacity: 0.8,
      },
      image: {
        borderColor: '#FFFFFF',
        borderWidth: 0.02, // world units
        borderRadius: 0.05, // corner rounding approximation (not yet used if simple plane)
        opacity: 1.0,
      },
      gaze: {
        duration: 2.0, // seconds
      },
    };

    console.log(
      '🔄 INIT: Editor sound initialized as:',
      this.editorGlobalSoundEnabled ? 'ENABLED' : 'DISABLED'
    );

    // Cache for data URLs of image Files to avoid re-encoding identical uploads
    this._imageDataURLCache = new Map();
    this._videoPreviewCache = new Map();
    this._sceneLoadToken = 0;
    this._activeVideoTexture = null;
    this._activeVideoSphere = null;
    this._videoTextureRenderHandler = null;
    this._skyboxSuspendedForFlatHotspot = false;
    this._skyboxWasPlayingBeforeFlat = false;

    this.init();
  }
  // Generate and cache a small preview image from a video's first frame
  async _ensureVideoPreview(sceneId) {
    try {
      if (this._videoPreviewCache.has(sceneId)) return this._videoPreviewCache.get(sceneId);
      const sc = this.scenes[sceneId];
      if (!sc || sc.type !== 'video' || !sc.videoSrc) return null;
      // Create or reuse a hidden worker video element
      let v = document.getElementById('video-thumb-worker');
      if (!v) {
        v = document.createElement('video');
        v.id = 'video-thumb-worker';
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('webkit-playsinline', '');
        v.crossOrigin = 'anonymous';
        v.preload = 'auto';
        v.style.display = 'none';
        const assets = document.querySelector('a-assets') || document.body;
        assets.appendChild(v);
      }
      if (v.src !== sc.videoSrc) {
        v.src = sc.videoSrc;
        // Loading metadata
        await new Promise((res, rej) => {
          const onErr = () => {
            v.removeEventListener('error', onErr);
            res(null);
          };
          v.addEventListener('loadeddata', () => res(true), { once: true });
          v.addEventListener('error', onErr, { once: true });
        });
      }
      // Try to seek a bit into the video for a stable frame
      try {
        v.currentTime = Math.min(1, (v.duration || 1) * 0.1);
        await new Promise((res) => v.addEventListener('seeked', () => res(true), { once: true }));
      } catch (_) {
        /* ignore */
      }
      const vw = v.videoWidth || 1024;
      const vh = v.videoHeight || 512;
      const cw = 512;
      const ch = Math.max(1, Math.round((vh / vw) * cw));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, cw, ch);
      const url = c.toDataURL('image/png');
      this._videoPreviewCache.set(sceneId, url);
      return url;
    } catch (_) {
      return null;
    }
  }

  init() {
    this.updateInstructionsVersion();
    this.bindEvents();
    this.setupEditorPanelToggle();
    this.setupEditModeBarToggle();
    this.setupHotspotTypeSelection();
    this.setupSceneManagement();

    // Load saved CSS styles
    this.loadCSSFromLocalStorage();

    // Load saved scenes and hotspots data
    this.loadScenesData();

    // Update the scene dropdown to show all loaded scenes
    this.updateSceneDropdown();

    // Update navigation targets dropdown to ensure it's populated on load
    this.updateNavigationTargets();

    // Apply loaded styles to ensure they take effect
    this.refreshAllHotspotStyles();

    // Try to persist storage for larger assets
    this.requestPersistentStorage();

    this.loadVideoPipelineConfig().catch(() => {});

    // Rehydrate any image/video/audio blob URLs from IndexedDB, then load the scene
    this.rehydrateImageSourcesFromIDB()
      .catch(() => {})
      .then(() => this.rehydrateImageHotspotsFromIDB())
      .catch(() => {})
      .then(() => this.rehydrateVideoSourcesFromIDB())
      .catch(() => {})
      .then(() => this.rehydrateVideoHotspotsFromIDB())
      .catch(() => {})
      .then(() => this.rehydrateAudioSourcesFromIDB())
      .catch(() => {})
      .then(() => this.rehydrateGroundTexturesFromIDB())
      .catch(() => {})
      .then(() => this.rehydrateModelSourcesFromIDB())
      .catch(() => {})
      .finally(() => {
        this.loadCurrentScene();
      });

    // Prompt to change default scene image (only if still using default)
    this.promptForSceneImageChange();

    // Migrate any legacy image width/height fields to scale
    this.migrateLegacyImageDimensions();

    // Initialize editor sound controls
    this.updateEditorSoundButton();
  }

  // ===== IndexedDB asset storage helpers (videos + images) =====
  isCommonAssetObject(obj) {
    return !!(obj && typeof obj.commonAssetUrl === 'string' && /^https?:\/\//i.test(obj.commonAssetUrl));
  }

  getCommonAssetProvenance(asset) {
    if (!asset || !asset.category || !asset.name) return null;
    const commonAssetUrl = asset.url;
    if (!commonAssetUrl || typeof commonAssetUrl !== 'string' || !/^https?:\/\//i.test(commonAssetUrl)) {
      return null;
    }
    return {
      commonAssetUrl,
      commonAssetCategory: asset.category,
      commonAssetName: asset.name,
    };
  }

  applyCommonAssetProvenance(target, asset) {
    if (!target) return false;
    const prov = this.getCommonAssetProvenance(asset);
    if (!prov) return false;
    target.commonAssetUrl = prov.commonAssetUrl;
    target.commonAssetCategory = prov.commonAssetCategory;
    target.commonAssetName = prov.commonAssetName;
    return true;
  }

  clearCommonAssetProvenance(target) {
    if (!target) return;
    delete target.commonAssetUrl;
    delete target.commonAssetCategory;
    delete target.commonAssetName;
    delete target.previewCommonAssetUrl;
    delete target.previewCommonAssetCategory;
    delete target.previewCommonAssetName;
    this.clearHostedVideoProvenance(target);
  }

  applyHostedVideoProvenance(target, uploadResult) {
    if (!target || !uploadResult) return;
    target.hostedVideoUrl = uploadResult.url || null;
    target.hostedVideoProxyUrl = uploadResult.proxyUrl || null;
  }

  clearHostedVideoProvenance(target) {
    if (!target) return;
    delete target.hostedVideoUrl;
    delete target.hostedVideoProxyUrl;
  }

  async loadVideoPipelineConfig() {
    try {
      const res = await fetch('/api/app-config', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      this._videoPipelineConfig = data.videoPipeline || {};
    } catch (_) {
      this._videoPipelineConfig = {};
    }
  }

  _shouldUseSceneVideoServerUpload() {
    return Boolean(this._videoPipelineConfig?.videoSceneServerUpload);
  }

  get _videoExportUrlModeEnabled() {
    return Boolean(this._videoPipelineConfig?.videoExportUrlMode);
  }

  async _isStudentAuthenticated() {
    if (window.currentStudent) return true;
    try {
      const res = await fetch('/api/student/session', { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.authenticated && data.student) {
        window.currentStudent = data.student;
        return true;
      }
    } catch (_) {}
    return false;
  }

  _uploadSceneVideoToServer(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      xhr.addEventListener('load', () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
          resolve(data);
          return;
        }
        reject(new Error((data && data.message) || 'Video upload failed'));
      });
      xhr.addEventListener('error', () => reject(new Error('Video upload failed')));
      xhr.open('POST', '/api/scene-video/upload');
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  }

  async processLocalVideoFileForScene({ file, storageKey }) {
    const storageKeyFinal = storageKey || `video_scene_${Date.now()}`;

    if (this._shouldUseSceneVideoServerUpload() && (await this._isStudentAuthenticated())) {
      try {
        this.showLoadingIndicator('Uploading and compressing video...');
        const result = await this._uploadSceneVideoToServer(file);
        const fetchUrl = result.proxyUrl || result.url;
        if (fetchUrl) {
          const resp = await fetch(fetchUrl, { credentials: 'include' });
          if (resp.ok) {
            const blob = await resp.blob();
            const storedName = result.filename || file.name;
            const storedFile = new File([blob], storedName, {
              type: blob.type || result.contentType || 'video/mp4',
            });
            await this.saveVideoToIDB(storageKeyFinal, storedFile);
            return {
              videoSrc: URL.createObjectURL(storedFile),
              videoStorageKey: storageKeyFinal,
              videoFileName: storedName,
              hostedVideoUrl: result.url || null,
              hostedVideoProxyUrl: result.proxyUrl || null,
              transcoded: Boolean(result.transcoded),
              originalSize: result.originalSize || file.size,
              compressedSize: result.size,
            };
          }
        }
      } catch (err) {
        console.warn('Server video upload/compression failed; using local storage', err);
      } finally {
        this.hideLoadingIndicator();
      }
    }

    await this.saveVideoToIDB(storageKeyFinal, file);
    return {
      videoSrc: URL.createObjectURL(file),
      videoStorageKey: storageKeyFinal,
      videoFileName: file.name,
      hostedVideoUrl: null,
      hostedVideoProxyUrl: null,
    };
  }

  _getDefaultExportModeForProject() {
    if (!this._videoExportUrlModeEnabled) return 'bundle';
    const scenes = Object.values(this.scenes || {});
    const videoScenes = scenes.filter((s) => s && s.type === 'video');
    if (!videoScenes.length) return 'bundle';
    const allHosted = videoScenes.every(
      (s) =>
        this.isCommonAssetObject(s) ||
        (typeof s.hostedVideoUrl === 'string' && /^https?:\/\//i.test(s.hostedVideoUrl))
    );
    return allHosted ? 'urls' : 'bundle';
  }

  clearCommonAssetDataset(el) {
    if (!el || !el.dataset) return;
    delete el.dataset.commonAssetUrl;
    delete el.dataset.commonAssetCategory;
    delete el.dataset.commonAssetName;
  }

  setCommonAssetDataset(el, asset) {
    if (!el) return;
    const prov = this.getCommonAssetProvenance(asset);
    if (!prov) {
      this.clearCommonAssetDataset(el);
      return;
    }
    el.dataset.commonAssetUrl = prov.commonAssetUrl;
    el.dataset.commonAssetCategory = prov.commonAssetCategory;
    el.dataset.commonAssetName = prov.commonAssetName;
  }

  readCommonAssetFromDataset(el) {
    if (!el?.dataset?.commonAssetUrl) return null;
    return {
      commonAssetUrl: el.dataset.commonAssetUrl,
      commonAssetCategory: el.dataset.commonAssetCategory || '',
      commonAssetName: el.dataset.commonAssetName || '',
    };
  }

  applyCommonAssetFromDataset(target, el, { preview = false } = {}) {
    const prov = this.readCommonAssetFromDataset(el);
    if (!prov || !target) return false;
    if (preview) {
      target.previewCommonAssetUrl = prov.commonAssetUrl;
      target.previewCommonAssetCategory = prov.commonAssetCategory;
      target.previewCommonAssetName = prov.commonAssetName;
    } else {
      target.commonAssetUrl = prov.commonAssetUrl;
      target.commonAssetCategory = prov.commonAssetCategory;
      target.commonAssetName = prov.commonAssetName;
    }
    return true;
  }

  getRuntimeCommonAssetUrl(asset) {
    return (asset && (asset.proxyUrl || asset.url)) || '';
  }

  buildCommonAssetProxyPath(obj) {
    const category = obj?.commonAssetCategory || obj?.category;
    const name = obj?.commonAssetName || obj?.name;
    if (!category || !name) return '';
    return `/common-assets/${category}/${encodeURIComponent(name)}`;
  }

  resolveSceneVideoSrc(scene) {
    if (!scene || scene.type !== 'video') return '';
    let src = '';
    if (typeof scene.hostedVideoProxyUrl === 'string' && scene.hostedVideoProxyUrl.trim()) {
      src = scene.hostedVideoProxyUrl.trim();
    } else if (typeof scene.hostedVideoUrl === 'string' && scene.hostedVideoUrl.trim()) {
      src = scene.hostedVideoUrl.trim();
    } else if (typeof scene.videoSrc === 'string' && scene.videoSrc.trim()) {
      src = scene.videoSrc.trim();
    } else if (this.isCommonAssetObject(scene)) {
      const proxy = this.buildCommonAssetProxyPath(scene);
      if (proxy) {
        scene.videoSrc = proxy;
        src = proxy;
      } else {
        src = scene.commonAssetUrl || '';
      }
    }
    return src ? this.toAbsoluteMediaUrl(src) : '';
  }

  pauseSceneVideo() {
    const videoEl = document.getElementById('scene-video-dynamic');
    if (!videoEl) return;
    try {
      videoEl.pause();
    } catch (_) {
      /* ignore */
    }
  }

  getSceneVideoElement() {
    let videoEl = document.getElementById('scene-video-dynamic');
    if (videoEl) return videoEl;

    videoEl = document.createElement('video');
    videoEl.id = 'scene-video-dynamic';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.preload = 'auto';
    videoEl.style.display = 'none';
    this.configureSceneVideoCrossOrigin(videoEl);
    document.body.appendChild(videoEl);
    return videoEl;
  }

  toAbsoluteMediaUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/') && !url.startsWith('//')) {
      return `${window.location.origin}${url}`;
    }
    return url;
  }

  loadSceneVideoSource(videoEl, videoSrc, loadToken) {
    return new Promise((resolve, reject) => {
      if (!videoEl) {
        reject(new Error('Missing video element'));
        return;
      }

      const absoluteSrc = this.toAbsoluteMediaUrl(videoSrc);
      let settled = false;
      let timeoutId = null;
      const finish = (fn) => {
        if (settled || loadToken !== this._sceneLoadToken) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        fn();
      };

      const onReady = () => finish(() => resolve());
      const onError = () => finish(() => reject(new Error('Video failed to load')));

      videoEl.addEventListener('loadedmetadata', onReady, { once: true });
      videoEl.addEventListener('loadeddata', onReady, { once: true });
      videoEl.addEventListener('canplay', onReady, { once: true });
      videoEl.addEventListener('error', onError, { once: true });

      timeoutId = setTimeout(() => {
        console.warn('Editor video load timed out, proceeding anyway');
        finish(() => resolve());
      }, 12000);

      videoEl.playsInline = true;
      videoEl.muted = true;
      this.configureSceneVideoCrossOrigin(videoEl);
      try {
        videoEl.pause();
      } catch (_) {}
      if (videoEl.src !== absoluteSrc) {
        videoEl.src = absoluteSrc;
      }
      try {
        videoEl.load();
      } catch (_) {
        finish(() => resolve());
      }
    });
  }

  waitForAFrameEntity(entity) {
    return new Promise((resolve) => {
      if (!entity) {
        resolve();
        return;
      }
      if (entity.hasLoaded) {
        resolve();
        return;
      }
      entity.addEventListener('loaded', () => resolve(), { once: true });
      setTimeout(resolve, 500);
    });
  }

  configureSceneVideoCrossOrigin(videoEl) {
    if (!videoEl) return;
    // Required for WebGL video textures — without this, audio plays but the sphere stays black
    videoEl.crossOrigin = 'anonymous';
    videoEl.setAttribute('crossorigin', 'anonymous');
  }

  getImageMediaKind() {
    const videoRadio = document.getElementById('hotspot-media-kind-video');
    if (videoRadio && videoRadio.checked) return 'video';
    return 'photo';
  }

  isVideoImageHotspot(data) {
    return !!(data && data.type === 'image' && data.mediaKind === 'video');
  }

  isVideoSkyboxScene(sceneId) {
    const id = sceneId != null ? sceneId : this.currentScene;
    const scene = this.scenes && this.scenes[id];
    if (!scene || scene.type !== 'video') return false;
    return !!this.resolveSceneVideoSrc(scene);
  }

  syncImageMediaFieldsVisibility() {
    if (this.selectedHotspotType !== 'image') return;
    const isVideo = this.getImageMediaKind() === 'video';
    const imgFile = document.getElementById('image-file-group');
    const imgUrl = document.getElementById('image-url-group');
    const vidFile = document.getElementById('video-file-group');
    const vidUrl = document.getElementById('video-url-group');
    const vidOpts = document.getElementById('video-options-group');
    if (imgFile) imgFile.style.display = isVideo ? 'none' : 'block';
    if (imgUrl) imgUrl.style.display = isVideo ? 'none' : 'block';
    if (vidFile) vidFile.style.display = isVideo ? 'block' : 'none';
    if (vidUrl) vidUrl.style.display = isVideo ? 'block' : 'none';
    if (vidOpts) vidOpts.style.display = isVideo ? 'block' : 'none';
  }

  registerHotspotVideoAsset(assetId, videoSrc, options) {
    options = options || {};
    let assetEl = document.getElementById(assetId);
    if (!assetEl) {
      assetEl = document.createElement('video');
      assetEl.id = assetId;
      assetEl.style.display = 'none';
      this.configureSceneVideoCrossOrigin(assetEl);
      assetEl.playsInline = true;
      assetEl.setAttribute('playsinline', '');
      assetEl.setAttribute('webkit-playsinline', '');
      assetEl.preload = 'auto';
      document.body.appendChild(assetEl);
    }
    const muted = options.muted !== false;
    const loop = options.loop !== false;
    assetEl.muted = muted;
    assetEl.loop = loop;
    if (muted) assetEl.setAttribute('muted', '');
    else assetEl.removeAttribute('muted');
    if (loop) assetEl.setAttribute('loop', '');
    else assetEl.removeAttribute('loop');
    const absoluteSrc = this.toAbsoluteMediaUrl(videoSrc);
    if (assetEl.src !== absoluteSrc) {
      assetEl.src = absoluteSrc;
      try {
        assetEl.load();
      } catch (_) {}
    }
    return assetEl;
  }

  pauseAllHotspotVideos() {
    document.querySelectorAll('.static-video-hotspot').forEach((vidEl) => {
      try {
        const host = vidEl.parentElement;
        const idStr = host && host.id ? host.id : '';
        const assetRef = idStr.startsWith('hotspot-')
          ? `#asset-video-hotspot-${idStr.slice(8)}`
          : '';
        const videos = resolveFlatVideoHotspotVideos(assetRef, vidEl);
        if (videos.length) {
          setFlatVideoHotspotPlayback(host || vidEl, vidEl, videos, false, false);
        }
      } catch (_) {}
    });
  }

  resumeHotspotVideosForScene(sceneId) {
    // Flat video hotspots start paused; user presses play.
  }

  createVideoSphereElement() {
    const el = document.createElement('a-entity');
    el.id = 'videosphere';
    el.classList.add('scene-media-surface');
    el.setAttribute('class', 'scene-media-surface');
    el.setAttribute('geometry', {
      primitive: 'sphere',
      radius: 5000,
      segmentsWidth: 64,
      segmentsHeight: 32,
    });
    el.setAttribute('rotation', '0 -90 0');
    return el;
  }

  ensureVideoHotspotRaycastSurface(sceneEl) {
    if (!sceneEl) return null;
    let surface = document.getElementById('hotspot-raycast-surface');
    if (!surface) {
      surface = document.createElement('a-entity');
      surface.id = 'hotspot-raycast-surface';
      surface.classList.add('scene-media-surface');
      surface.setAttribute('class', 'scene-media-surface');
      surface.setAttribute('rotation', '0 -90 0');
      sceneEl.appendChild(surface);
    }
    // Slightly smaller than videosphere (5000) so placement raycasts hit this shell first on iOS
    surface.setAttribute('geometry', {
      primitive: 'sphere',
      radius: 4990,
      segmentsWidth: 64,
      segmentsHeight: 32,
    });
    surface.setAttribute('material', {
      shader: 'flat',
      color: '#000',
      opacity: 0.001,
      transparent: true,
      depthWrite: true,
      side: 'back',
    });
    surface.setAttribute('visible', 'true');
    if (surface.object3D) {
      surface.object3D.updateMatrixWorld(true);
    }
    return surface;
  }

  hideVideoHotspotRaycastSurface() {
    const surface = document.getElementById('hotspot-raycast-surface');
    if (surface) surface.setAttribute('visible', 'false');
  }

  refreshSceneMediaRaycasters() {
    ['mouse-cursor', 'gaze-cursor'].forEach((id) => {
      const cursor = document.getElementById(id);
      const raycaster = cursor?.components?.raycaster;
      if (raycaster?.refreshObjects) raycaster.refreshObjects();
    });
    this._bindSceneMediaClickHandlers();
  }

  _bindSceneMediaClickHandlers() {
    ['skybox', 'videosphere', 'hotspot-raycast-surface'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.placementBound === 'true') return;
      el.dataset.placementBound = 'true';
      el.addEventListener('click', (evt) => this._handleScenePlacementClick(evt));
    });
  }

  _isTouchDevice() {
    return (
      'ontouchstart' in window ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    );
  }

  _configureTouchCursors() {
    if (!this._isTouchDevice()) return;
    const mouseCursor = document.getElementById('mouse-cursor');
    if (mouseCursor) mouseCursor.setAttribute('visible', 'false');
  }

  _hasValidIntersectionPoint(hit) {
    return (
      hit?.point &&
      Number.isFinite(hit.point.x) &&
      Number.isFinite(hit.point.y) &&
      Number.isFinite(hit.point.z)
    );
  }

  _resolveSceneMediaIntersection(evt) {
    let intersection = evt?.detail?.intersection;
    const hitEl = intersection?.el || evt?.target;

    const needsManualRaycast =
      !this._hasValidIntersectionPoint(intersection) || !this.isSceneMediaSurface(hitEl);

    if (needsManualRaycast) {
      intersection = this._raycastSceneMediaFromPointer(
        evt?.detail?.mouseEvent || evt?.detail?.sourceEvent || evt
      );
    }

    if (!this._hasValidIntersectionPoint(intersection) && this._isTouchDevice()) {
      intersection = this._buildViewCenterIntersection();
    }

    return this._hasValidIntersectionPoint(intersection) ? intersection : null;
  }

  _trackScenePointer() {
    const sceneEl = document.querySelector('a-scene');
    const canvas = sceneEl?.canvas;
    if (!canvas) return;

    const track = (evt) => {
      this._lastScenePointer = {
        clientX: evt.clientX,
        clientY: evt.clientY,
      };
    };
    canvas.addEventListener('pointerdown', track, { passive: true });

    if (this._isTouchDevice()) {
      let touchStart = null;
      const TAP_MOVE_THRESHOLD_PX = 10;

      canvas.addEventListener(
        'touchstart',
        (evt) => {
          const touch = evt.touches?.[0];
          if (!touch) return;
          touchStart = { clientX: touch.clientX, clientY: touch.clientY };
          this._lastScenePointer = { clientX: touch.clientX, clientY: touch.clientY };
        },
        { passive: true }
      );

      canvas.addEventListener(
        'touchend',
        (evt) => {
          if (!this.editMode && !this.repositioningHotspotId) return;
          const touch = evt.changedTouches?.[0];
          if (!touch || !touchStart) return;

          const dx = touch.clientX - touchStart.clientX;
          const dy = touch.clientY - touchStart.clientY;
          touchStart = null;
          if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD_PX) return;

          this._handleScenePlacementClick({
            clientX: touch.clientX,
            clientY: touch.clientY,
          });
        },
        { passive: true }
      );
    }

    ['mouse-cursor', 'gaze-cursor'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', (evt) => {
        this._handleScenePlacementClick(evt);
      });
    });

    this._configureTouchCursors();
  }

  _getSceneMediaMeshes(options = {}) {
    const { placementOnly = false } = options;
    const ids = placementOnly
      ? ['hotspot-raycast-surface', 'skybox']
      : ['hotspot-raycast-surface', 'videosphere', 'skybox'];
    const meshes = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.getAttribute('visible') === 'false') return;
      const mesh = el.getObject3D?.('mesh');
      if (mesh) meshes.push(mesh);
    });
    return meshes;
  }

  _raycastSceneMediaFromPointer(sourceEvent) {
    const sceneEl = document.querySelector('a-scene');
    const camEl = document.getElementById('cam');
    const camera = camEl?.getObject3D?.('camera') || sceneEl?.camera;
    const canvas = sceneEl?.canvas;
    if (!camera || !canvas || typeof THREE === 'undefined') return null;

    const pointer = sourceEvent?.clientX != null
      ? sourceEvent
      : this._lastScenePointer;
    if (!pointer) return null;

    sceneEl?.object3D?.updateMatrixWorld(true);
    camEl?.object3D?.updateMatrixWorld(true);

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
      -((pointer.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(
      this._getSceneMediaMeshes({ placementOnly: true }),
      false
    );
    return hits[0] || null;
  }

  _buildViewCenterIntersection() {
    const camera = document.getElementById('cam');
    if (!camera || typeof THREE === 'undefined') return null;

    const worldPos = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.object3D.getWorldPosition(worldPos);
    camera.object3D.getWorldDirection(direction);

    return {
      point: worldPos.clone().add(direction.multiplyScalar(100)),
    };
  }

  _handleScenePlacementClick(evt) {
    if (this.repositioningHotspotId) {
      if (this._repositionArmTime && Date.now() - this._repositionArmTime < 300) return;
      this.applyReposition(evt);
      return;
    }
    if (!this.editMode) return;
    this.placeHotspot(evt);
  }

  armHotspotPlacement() {
    const validationResult = this.validateHotspotData();
    if (!validationResult.valid) {
      alert(validationResult.message);
      return false;
    }

    this.enterEditMode();
    return true;
  }

  isSceneMediaSurface(el) {
    if (!el) return false;
    if (el.classList?.contains('scene-media-surface')) return true;
    const id = el.id || el.getAttribute?.('id');
    return id === 'skybox' || id === 'videosphere' || id === 'hotspot-raycast-surface';
  }

  detachVideoTextureRenderer() {
    const sceneEl = document.querySelector('a-scene');
    if (this._videoTextureRenderHandler && sceneEl) {
      sceneEl.removeEventListener('render', this._videoTextureRenderHandler);
    }
    this._videoTextureRenderHandler = null;
    if (this._activeVideoTexture?.dispose) {
      try {
        this._activeVideoTexture.dispose();
      } catch (_) {}
    }
    this._activeVideoTexture = null;
    this._activeVideoSphere = null;
  }

  attachVideoTextureToSphere(sphereEl, videoEl, loadToken) {
    this.detachVideoTextureRenderer();

    const applyTexture = () => {
      if (loadToken !== this._sceneLoadToken) return false;
      const mesh = (sphereEl.getObject3D && sphereEl.getObject3D('mesh')) || sphereEl.object3D;
      if (!mesh || typeof THREE === 'undefined') return false;

      const texture = new THREE.VideoTexture(videoEl);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
      });

      if (mesh.material?.dispose) {
        try {
          mesh.material.dispose();
        } catch (_) {}
      }

      mesh.material = material;
      this._activeVideoTexture = texture;
      this._activeVideoSphere = sphereEl;
      return true;
    };

    const sceneEl = document.querySelector('a-scene');
    this._videoTextureRenderHandler = () => {
      if (loadToken !== this._sceneLoadToken) {
        this.detachVideoTextureRenderer();
        return;
      }
      if (this._activeVideoTexture && videoEl.readyState >= 2) {
        this._activeVideoTexture.needsUpdate = true;
      }
    };

    const startRenderer = () => {
      if (!applyTexture()) {
        throw new Error('Failed to bind video texture to sphere');
      }
      sceneEl?.addEventListener('render', this._videoTextureRenderHandler);
    };

    return Promise.race([
      videoEl
        .play()
        .then(startRenderer)
        .catch(() => {
          // Autoplay blocked — still bind texture; playback resumes on user gesture
          startRenderer();
        }),
      new Promise((resolve) => {
        setTimeout(() => {
          try {
            startRenderer();
          } catch (_) {}
          resolve();
        }, 3000);
      }),
    ]);
  }

  suspendVideoSkyboxForFlatHotspot() {
    if (this._skyboxSuspendedForFlatHotspot || !this.isVideoSkyboxScene()) return;
    const sceneVideo = document.getElementById('scene-video-dynamic');
    if (!sceneVideo) return;

    this._skyboxSuspendedForFlatHotspot = true;
    this._skyboxWasPlayingBeforeFlat =
      sceneVideo._wasPlayingBeforeFlatHotspot != null
        ? !!sceneVideo._wasPlayingBeforeFlatHotspot
        : !sceneVideo.paused;
    if (!sceneVideo.paused) {
      try {
        sceneVideo.pause();
      } catch (_) {}
    }
  }

  resumeVideoSkyboxAfterFlatHotspot() {
    if (!this._skyboxSuspendedForFlatHotspot) return;
    this._skyboxSuspendedForFlatHotspot = false;
    const sceneVideo = document.getElementById('scene-video-dynamic');
    const wasPlaying =
      this._skyboxWasPlayingBeforeFlat ||
      !!(sceneVideo && sceneVideo._wasPlayingBeforeFlatHotspot);
    this._skyboxWasPlayingBeforeFlat = false;
    if (!sceneVideo || !wasPlaying) return;

    try {
      sceneVideo.play().catch(() => {});
    } catch (_) {}
  }

  openVideoDB() {
    if (this._videoDBPromise) return this._videoDBPromise;
    this._videoDBPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      // Bump DB version to 4 to add 'models' store alongside 'videos', 'images', and 'audio'
      const req = indexedDB.open('vr-hotspots', 4);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return this._videoDBPromise;
  }

  async saveVideoToIDB(key, file) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('videos', 'readwrite');
        const store = tx.objectStore('videos');
        const rec = {
          key,
          name: file.name,
          type: file.type,
          size: file.size,
          updated: Date.now(),
          blob: file,
        };
        store.put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async getVideoFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction('videos', 'readonly');
        const store = tx.objectStore('videos');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async deleteVideoFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('videos', 'readwrite');
        const store = tx.objectStore('videos');
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async clearAllVideosFromIDB() {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('videos', 'readwrite');
        const store = tx.objectStore('videos');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  // ===== IndexedDB images storage helpers =====
  async saveImageToIDB(key, fileOrBlob) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      const name = fileOrBlob && fileOrBlob.name ? fileOrBlob.name : 'image.png';
      const type = fileOrBlob && fileOrBlob.type ? fileOrBlob.type : 'image/png';
      const size = fileOrBlob && fileOrBlob.size ? fileOrBlob.size : 0;
      const blob = fileOrBlob;
      return await new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        const rec = { key, name, type, size, updated: Date.now(), blob };
        store.put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async getImageFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction('images', 'readonly');
        const store = tx.objectStore('images');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async deleteImageFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async clearAllImagesFromIDB() {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async saveModelToIDB(key, fileOrBlob) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      const name = fileOrBlob && fileOrBlob.name ? fileOrBlob.name : 'model.glb';
      const type = fileOrBlob && fileOrBlob.type ? fileOrBlob.type : 'model/gltf-binary';
      const size = fileOrBlob && fileOrBlob.size ? fileOrBlob.size : 0;
      const blob = fileOrBlob;
      return await new Promise((resolve) => {
        const tx = db.transaction('models', 'readwrite');
        const store = tx.objectStore('models');
        const rec = { key, name, type, size, updated: Date.now(), blob };
        store.put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async getModelFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction('models', 'readonly');
        const store = tx.objectStore('models');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async deleteModelFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('models', 'readwrite');
        const store = tx.objectStore('models');
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async clearAllModelsFromIDB() {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('models', 'readwrite');
        const store = tx.objectStore('models');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async clearAllImagesFromIDB() {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  // ===== IndexedDB audio storage helpers =====
  async saveAudioToIDB(key, fileOrBlob) {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      const name = fileOrBlob && fileOrBlob.name ? fileOrBlob.name : 'audio.mp3';
      const type = fileOrBlob && fileOrBlob.type ? fileOrBlob.type : 'audio/mpeg';
      const size = fileOrBlob && fileOrBlob.size ? fileOrBlob.size : 0;
      const blob = fileOrBlob;
      return await new Promise((resolve) => {
        const tx = db.transaction('audio', 'readwrite');
        const store = tx.objectStore('audio');
        const rec = { key, name, type, size, updated: Date.now(), blob };
        store.put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async getAudioFromIDB(key) {
    try {
      const db = await this.openVideoDB();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction('audio', 'readonly');
        const store = tx.objectStore('audio');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async clearAllAudiosFromIDB() {
    try {
      const db = await this.openVideoDB();
      if (!db) return false;
      return await new Promise((resolve) => {
        const tx = db.transaction('audio', 'readwrite');
        const store = tx.objectStore('audio');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  }

  async downloadRemoteVideoToLocal(sceneId) {
    const scene = this.scenes[sceneId];
    if (!scene || scene.type !== 'video' || !scene.videoSrc) {
      alert('Invalid scene or not a video scene.');
      return;
    }

    const remoteURL = scene.videoSrc;
    if (!remoteURL.startsWith('http://') && !remoteURL.startsWith('https://')) {
      alert('Video is already local or not a remote URL.');
      return;
    }

    this.showLoadingIndicator('Downloading remote video...');

    try {
      // Attempt client-side fetch
      const response = await fetch(remoteURL, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = remoteURL.split('/').pop() || 'remote-video.mp4';
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

      // Save to IndexedDB
      const storageKey = `video_${sceneId}`;
      const saved = await this.saveVideoToIDB(storageKey, file);
      if (!saved) {
        throw new Error('Failed to save video to IndexedDB.');
      }

      // Create blob URL and update scene
      const blobURL = URL.createObjectURL(blob);
      scene.videoSrc = blobURL;
      scene.videoStorageKey = storageKey;

      // Clear old preview if any
      if (this._videoPreviewCache && this._videoPreviewCache.has(sceneId)) {
        this._videoPreviewCache.delete(sceneId);
      }

      this.saveScenesData();
      this.hideLoadingIndicator();

      alert(
        `Video downloaded and saved locally!\n\nYou can now:\n• Generate thumbnails for navigation previews\n• Export this scene offline\n• Remove the original remote URL`
      );

      // Reload scene manager to reflect "Local (IDB)" status
      this.showSceneManager();

      // Reload current scene if this is the active scene
      if (this.currentScene === sceneId) {
        this.loadCurrentScene();
      }
    } catch (error) {
      this.hideLoadingIndicator();
      console.error('Failed to download remote video:', error);

      let errorMessage = 'Failed to download remote video.\n\n';

      if (
        error.message.includes('CORS') ||
        error.message.includes('NetworkError') ||
        error.name === 'TypeError'
      ) {
        errorMessage += "❌ CORS Error: The remote server doesn't allow browser downloads.\n\n";
        errorMessage += '💡 Would you like to try downloading via the server instead?\n';
        errorMessage += '(This bypasses CORS restrictions)';

        const tryServerDownload = confirm(errorMessage);
        if (tryServerDownload) {
          this.downloadRemoteVideoViaServer(sceneId, remoteURL);
        }
      } else {
        errorMessage += `Error: ${error.message}\n\n`;
        errorMessage += 'The video may not be accessible or the URL may be incorrect.';
        alert(errorMessage);
      }
    }
  }

  async autoDownloadRemoteVideo(sceneId, remoteURL) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    this.showLoadingIndicator('Downloading video to local storage...');

    try {
      // Try client-side fetch first
      const response = await fetch(remoteURL, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = remoteURL.split('/').pop() || 'remote-video.mp4';
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

      // Save to IndexedDB
      const storageKey = `video_${sceneId}`;
      const saved = await this.saveVideoToIDB(storageKey, file);
      if (!saved) {
        throw new Error('Failed to save video to IndexedDB.');
      }

      // Create blob URL and update scene
      const blobURL = URL.createObjectURL(blob);
      scene.videoSrc = blobURL;
      scene.videoStorageKey = storageKey;

      this.saveScenesData();
      this.hideLoadingIndicator();

      console.log(`✅ Video downloaded successfully for scene ${sceneId}`);
    } catch (error) {
      console.warn('Client-side fetch failed, trying server-side:', error);

      // Silently try server-side fetch
      try {
        const response = await fetch('/fetch-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: remoteURL }),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const blob = await response.blob();
        const fileName = remoteURL.split('/').pop() || 'remote-video.mp4';
        const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

        // Save to IndexedDB
        const storageKey = `video_${sceneId}`;
        const saved = await this.saveVideoToIDB(storageKey, file);
        if (!saved) {
          throw new Error('Failed to save video to IndexedDB.');
        }

        // Create blob URL and update scene
        const blobURL = URL.createObjectURL(blob);
        scene.videoSrc = blobURL;
        scene.videoStorageKey = storageKey;

        this.saveScenesData();
        this.hideLoadingIndicator();

        console.log(`✅ Video downloaded via server for scene ${sceneId}`);
      } catch (serverError) {
        // If both fail, keep remote URL but hide loader
        this.hideLoadingIndicator();
        console.error('Both client and server download failed:', serverError);

        // Show user-friendly message
        alert(
          `⚠️ Unable to download video automatically.\n\n` +
            `The video will stream from the remote URL, but:\n` +
            `• Thumbnails may not be available\n` +
            `• Export will reference the remote URL (requires internet)\n\n` +
            `You can manually download and re-upload the video file for full offline support.`
        );
      }
    }
  }

  async downloadRemoteVideoViaServer(sceneId, remoteURL) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    this.showLoadingIndicator('Downloading video via server...');

    try {
      // Use server endpoint to fetch video
      const response = await fetch('/fetch-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteURL }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = remoteURL.split('/').pop() || 'remote-video.mp4';
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

      // Save to IndexedDB
      const storageKey = `video_${sceneId}`;
      const saved = await this.saveVideoToIDB(storageKey, file);
      if (!saved) {
        throw new Error('Failed to save video to IndexedDB.');
      }

      // Create blob URL and update scene
      const blobURL = URL.createObjectURL(blob);
      scene.videoSrc = blobURL;
      scene.videoStorageKey = storageKey;

      // Clear old preview if any
      if (this._videoPreviewCache && this._videoPreviewCache.has(sceneId)) {
        this._videoPreviewCache.delete(sceneId);
      }

      this.saveScenesData();
      this.hideLoadingIndicator();

      alert(
        `✅ Video downloaded successfully via server!\n\nYou can now:\n• Generate thumbnails for navigation previews\n• Export this scene offline\n• The video is stored locally`
      );

      // Reload scene manager
      this.showSceneManager();

      // Reload current scene if this is the active scene
      if (this.currentScene === sceneId) {
        this.loadCurrentScene();
      }
    } catch (error) {
      this.hideLoadingIndicator();
      console.error('Server-side download failed:', error);
      alert(
        `❌ Server download failed:\n\n${error.message}\n\nPlease check:\n• The URL is correct and accessible\n• The server is running\n• The video file isn't too large (max 500MB)`
      );
    }
  }

  async rehydrateVideoSourcesFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;
      for (const [sceneId, scene] of entries) {
        if (!scene || scene.type !== 'video') continue;
        const key = scene.videoStorageKey || sceneId;
        // Skip if remote URL
        if (
          scene.videoSrc &&
          (scene.videoSrc.startsWith('http://') || scene.videoSrc.startsWith('https://'))
        )
          continue;
        const rec = await this.getVideoFromIDB(key);
        if (rec && rec.blob) {
          try {
            const url = URL.createObjectURL(rec.blob);
            scene.videoSrc = url;
            if (!scene.videoFileName) scene.videoFileName = rec.name || '';
            changed = true;
          } catch (_) {
            /* ignore */
          }
        } else {
          // If no record found and no remote URL, keep src null; we’ll prompt on first load
        }
      }
      if (changed) this.saveScenesData();
    } catch (_) {
      /* ignore */
    }
  }

  async requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch (_) {
      /* ignore */
    }
  }

  // ===== Crossfade helpers (Editor) =====
  _ensureCrossfadeOverlay() {
    let overlay = document.getElementById('scene-crossfade');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'scene-crossfade';
      overlay.style.cssText = `
        position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none;
        transition: opacity 300ms ease; z-index: 100000;
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  _startCrossfadeOverlay() {
    return new Promise((resolve) => {
      const overlay = this._ensureCrossfadeOverlay();
      // Visual-only crossfade — never block sidebar / editor clicks
      overlay.style.pointerEvents = 'none';
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        setTimeout(resolve, 320);
      });
    });
  }

  _endCrossfadeOverlay() {
    const overlay = this._ensureCrossfadeOverlay();
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
  }

  // ===== Loading Indicator =====
  _ensureLoadingIndicator() {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8); color: white; padding: 20px 30px;
        border-radius: 8px; font-family: Arial, sans-serif; font-size: 16px;
        z-index: ${EDITOR_LAYER.progress}; opacity: 0; pointer-events: none;
        transition: opacity 300ms ease; display: flex; align-items: center; gap: 15px;
      `;

      // Add spinning loader
      const spinner = document.createElement('div');
      spinner.style.cssText = `
        width: 20px; height: 20px; border: 2px solid #ffffff40;
        border-top: 2px solid #ffffff; border-radius: 50%;
        animation: spin 1s linear infinite;
      `;

      const text = document.createElement('span');
      text.id = 'loading-text';
      text.textContent = 'Loading...';

      indicator.appendChild(spinner);
      indicator.appendChild(text);

      // Add CSS animation for spinner
      if (!document.getElementById('loading-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'loading-spinner-style';
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(indicator);
    }
    return indicator;
  }

  showLoadingIndicator(message = 'Loading...') {
    const indicator = this._ensureLoadingIndicator();
    const textEl = document.getElementById('loading-text');
    if (textEl) textEl.textContent = message;

    indicator.style.pointerEvents = 'auto';
    indicator.style.opacity = '1';
  }

  hideLoadingIndicator() {
    const indicator = this._ensureLoadingIndicator();
    indicator.style.opacity = '0';
    setTimeout(() => {
      indicator.style.pointerEvents = 'none';
    }, 300);
  }

  hideSceneLoadingOverlay() {
    const overlay = document.getElementById('scene-loading-overlay');
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      overlay.style.opacity = '0';
      overlay.style.display = 'none';
    }
  }

  updateVideoControls(videoEl, scene) {
    const controls = document.getElementById('video-controls');
    if (!controls) return;

    controls.style.display = 'flex';

    // Play/Pause button
    const playPauseBtn = document.getElementById('video-play-pause');
    playPauseBtn.onclick = () => {
      if (videoEl.paused) {
        videoEl.play();
        playPauseBtn.textContent = '⏸ Pause';
      } else {
        videoEl.pause();
        playPauseBtn.textContent = '▶ Play';
      }
    };

    // Mute/Unmute button
    const muteBtn = document.getElementById('video-mute');
    muteBtn.onclick = () => {
      videoEl.muted = !videoEl.muted;
      muteBtn.textContent = videoEl.muted ? '🔇 Muted' : '🔊 Sound';
      muteBtn.style.background = videoEl.muted ? '#28a745' : '#ffc107';
    };

    // Progress bar
    const progressBar = document.getElementById('video-progress');
    const currentTimeEl = document.getElementById('video-time-current');
    const totalTimeEl = document.getElementById('video-time-total');

    videoEl.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = this.formatTime(videoEl.duration);
    });

    videoEl.addEventListener('timeupdate', () => {
      const progress = (videoEl.currentTime / videoEl.duration) * 100;
      progressBar.value = progress;
      currentTimeEl.textContent = this.formatTime(videoEl.currentTime);
    });

    progressBar.addEventListener('input', (e) => {
      const time = (e.target.value / 100) * videoEl.duration;
      videoEl.currentTime = time;
    });

    // Volume control
    const volumeSlider = document.getElementById('video-volume');
    volumeSlider.value = (scene.videoVolume || 0.5) * 100;
    videoEl.volume = scene.videoVolume || 0.5;

    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      videoEl.volume = volume;
      scene.videoVolume = volume;
      this.saveScenesData();
    });
  }

  hideVideoControls() {
    const controls = document.getElementById('video-controls');
    if (controls) {
      controls.style.display = 'none';
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _dispatchSceneLoaded() {
    try {
      const ev = new CustomEvent('vrhotspots:scene-loaded');
      window.dispatchEvent(ev);
    } catch (e) {
      // ignore
    }
  }

  // ===== Navigation Preview (Editor) =====
  _ensureNavPreview() {
    let box = document.getElementById('nav-preview');
    if (!box) {
      box = document.createElement('div');
      box.id = 'nav-preview';
      box.style.cssText = `
        position: fixed; top: 0; left: 0; transform: translate(12px, 12px);
        display: none; pointer-events: none; z-index: 100001;
        background: rgba(0,0,0,0.9); color: #fff; border: 1px solid #4CAF50;
        border-radius: 8px; overflow: hidden; width: 220px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        font-family: Arial, sans-serif; backdrop-filter: blur(2px);
      `;
      const img = document.createElement('img');
      img.style.cssText =
        'display:block; width: 100%; height: 120px; object-fit: cover; background:#111;';
      img.id = 'nav-preview-img';
      const caption = document.createElement('div');
      caption.id = 'nav-preview-caption';
      caption.style.cssText =
        'padding: 8px 10px; font-size: 12px; color: #ddd; border-top: 1px solid rgba(255,255,255,0.08);';
      box.appendChild(img);
      box.appendChild(caption);
      document.body.appendChild(box);
    }
    return box;
  }

  _positionNavPreview(x, y) {
    const box = this._ensureNavPreview();
    // Keep within viewport edges
    const rectW = box.offsetWidth || 220;
    const rectH = box.offsetHeight || 160;
    const pad = 12;
    const maxX = window.innerWidth - rectW - pad;
    const maxY = window.innerHeight - rectH - pad;
    const nx = Math.min(Math.max(x + 12, pad), maxX);
    const ny = Math.min(Math.max(y + 12, pad), maxY);
    box.style.left = nx + 'px';
    box.style.top = ny + 'px';
  }

  _getEditorPreviewSrc(sceneId) {
    const sc = this.scenes[sceneId];
    if (!sc) return null;
    // If target scene is a video, return special flag so caller can show icon
    if (sc.type === 'video') return 'VIDEO_ICON';
    const img = sc.image || '';
    if (
      img.startsWith('http://') ||
      img.startsWith('https://') ||
      img.startsWith('data:') ||
      img.startsWith('blob:') ||
      img.startsWith('#')
    )
      return img;
    return img.startsWith('./') ? img : `./${img}`;
  }

  // Ensure there's an <img> in <a-assets> for a given preview src and return its selector id
  _ensurePreviewAsset(src, key) {
    try {
      let assets = document.querySelector('a-assets');
      if (!assets) {
        assets = document.createElement('a-assets');
        const scene = document.querySelector('a-scene') || document.body;
        scene.insertBefore(assets, scene.firstChild);
      }
      const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
      const id = `nav-preview-${safeKey}`;
      let img = document.getElementById(id);
      if (!img) {
        img = document.createElement('img');
        img.id = id;
        img.crossOrigin = 'anonymous';
        assets.appendChild(img);
      }
      if (img.getAttribute('src') !== src) {
        img.setAttribute('src', src);
      }
      return `#${id}`;
    } catch (e) {
      console.warn('[Preview][Assets] Failed to ensure asset', e);
      return src; // fallback to raw src
    }
  }

  _showNavPreview(sceneId) {
    const box = this._ensureNavPreview();
    const imgEl = document.getElementById('nav-preview-img');
    const cap = document.getElementById('nav-preview-caption');
    const sc = this.scenes[sceneId];
    if (!sc) return;
    const src = this._getEditorPreviewSrc(sceneId);
    if (src === 'VIDEO_ICON') {
      // Attempt to create a thumbnail for the video
      (async () => {
        const thumb = await this._ensureVideoPreview(sceneId);
        if (thumb) imgEl.src = thumb;
        else {
          const svg = encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128"><rect rx="4" ry="4" x="2" y="6" width="14" height="12" fill="#111" stroke="#2ae" stroke-width="2"/><polygon points="16,10 22,7 22,17 16,14" fill="#2ae"/></svg>'
          );
          imgEl.src = 'data:image/svg+xml;charset=UTF-8,' + svg;
        }
      })();
    } else if (src) {
      imgEl.src = src;
    }
    cap.textContent = `Go to: ${sc.name || sceneId}`;
    box.style.display = 'block';
    // Begin tracking mouse
    if (!this._navPreviewMove) {
      this._navPreviewMove = (e) => this._positionNavPreview(e.clientX || 0, e.clientY || 0);
    }
    window.addEventListener('mousemove', this._navPreviewMove);
  }

  _hideNavPreview() {
    const box = this._ensureNavPreview();
    box.style.display = 'none';
    if (this._navPreviewMove) {
      window.removeEventListener('mousemove', this._navPreviewMove);
    }
  }
  setupEditorPanelToggle() {
    const panel = document.getElementById('hotspot-editor');
    const toggle = document.getElementById('hotspot-editor-toggle');
    const icon = document.getElementById('hotspot-editor-toggle-icon');
    if (!panel || !toggle || !icon) return;

    const storageKey = 'hotspot-editor-expanded';
    const saved = localStorage.getItem(storageKey);
    const startExpanded = saved === null ? true : saved === 'true';

    const setExpanded = (expanded) => {
      panel.classList.toggle('collapsed', !expanded);
      icon.textContent = expanded ? '›' : '‹';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.title = expanded ? 'Hide editor tools' : 'Show editor tools';
      localStorage.setItem(storageKey, expanded ? 'true' : 'false');
    };

    setExpanded(startExpanded);

    toggle.addEventListener('click', () => {
      setExpanded(panel.classList.contains('collapsed'));
    });
  }

  setupEditModeBarToggle() {
    const bar = document.getElementById('edit-mode-bar');
    const toggle = document.getElementById('edit-mode-bar-toggle');
    const icon = document.getElementById('edit-mode-bar-toggle-icon');
    if (!bar || !toggle || !icon) return;

    const storageKey = 'edit-mode-bar-expanded';
    const saved = localStorage.getItem(storageKey);
    const startExpanded = saved === null ? true : saved === 'true';

    const setExpanded = (expanded) => {
      bar.classList.toggle('collapsed', !expanded);
      icon.textContent = expanded ? '‹' : '›';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.title = expanded ? 'Hide edit mode panel' : 'Show edit mode panel';
      localStorage.setItem(storageKey, expanded ? 'true' : 'false');
    };

    setExpanded(startExpanded);

    toggle.addEventListener('click', () => {
      setExpanded(bar.classList.contains('collapsed'));
    });
  }

  bindEvents() {
    // Add hotspot — arms placement; next click on the scene places it
    document.getElementById('add-hotspot').addEventListener('click', () => {
      this.armHotspotPlacement();
    });

    // Clear hotspots button
    document.getElementById('clear-hotspots').addEventListener('click', () => {
      this.clearAllHotspots();
    });

    // Clear data button
    document.getElementById('clear-data').addEventListener('click', () => {
      if (
        confirm(
          'This will clear all saved data (scenes, hotspots, and styles) and reload the page. Are you sure?'
        )
      ) {
        clearLocalStorage();
      }
    });

    // Save template button
    document.getElementById('save-template').addEventListener('click', () => {
      this.saveTemplate();
    });

    const saveCloudBtn = document.getElementById('save-cloud-draft');
    if (saveCloudBtn) {
      saveCloudBtn.addEventListener('click', () => {
        StudentSubmission.saveCloudDraft();
      });
    }

    // Load template button
    document.getElementById('load-template').addEventListener('click', () => {
      this.loadTemplate();
    });

    // Upload to GitHub button
    const uploadGithubBtn = document.getElementById('upload-github');
    if (uploadGithubBtn) {
      uploadGithubBtn.addEventListener('click', () => {
        this.handleGitHubUpload();
      });
    }

    // Student submission button
    document.getElementById('submit-to-professor').addEventListener('click', () => {
      StudentSubmission.showSubmissionDialog();
    });

    // CSS Settings button
    document.getElementById('css-settings').addEventListener('click', () => {
      this.openStyleEditor();
    });

    // Check if returning from style editor
    this.checkForStyleUpdates();

    // Scene media click for placing or repositioning hotspots (skybox or video sphere)
    document.querySelector('a-scene').addEventListener('click', (evt) => {
      this._handleScenePlacementClick(evt);
    });
    this._trackScenePointer();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.editMode) {
        this.exitEditMode();
      }
    });

    // Edit mode toggle
    document.getElementById('edit-mode-toggle').addEventListener('change', (e) => {
      this.navigationMode = !e.target.checked;
      this.updateModeIndicator();
      this._updateAddHotspotButtonState();
      // Auto-collapse hotspot type when leaving edit mode; expand when entering
      this._setHotspotTypeCollapsed(!e.target.checked);
      // Hide hotspot properties when not in edit mode
      this._setHotspotPropertiesVisible(!!e.target.checked);
      // Sync visible toggle button text/help
      this._syncEditModeToggleUI();
    });

    // Scene management
    document.getElementById('add-scene').addEventListener('click', () => {
      this.addNewScene();
    });

    document.getElementById('manage-scenes').addEventListener('click', () => {
      this.showSceneManager();
    });

    document.getElementById('current-scene').addEventListener('change', (e) => {
      this.switchToScene(e.target.value);
    });

    // Ensure initial button state matches toggle on load
    this._updateAddHotspotButtonState();

    // Visible switch -> flip hidden checkbox and dispatch change
    try {
      const sw = document.getElementById('edit-mode-switch');
      if (sw) {
        const activate = () => {
          const toggle = document.getElementById('edit-mode-toggle');
          if (!toggle) return;
          toggle.checked = !toggle.checked;
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
          this._syncEditModeToggleUI();
        };
        sw.addEventListener('click', activate);
        sw.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            activate();
          }
        });
      }
    } catch (_) {
      /* ignore */
    }

    // Setup collapsible Hotspot Type section
    this._initHotspotTypeCollapsible();

    // Initialize Hotspot Properties visibility based on toggle
    try {
      const toggle = document.getElementById('edit-mode-toggle');
      this._setHotspotPropertiesVisible(toggle ? !!toggle.checked : true);
      this._syncEditModeToggleUI();
    } catch (_) {
      /* ignore */
    }

    // Starting point controls
    document.getElementById('set-starting-point').addEventListener('click', () => {
      this.setStartingPoint();
    });

    document.getElementById('clear-starting-point').addEventListener('click', () => {
      this.clearStartingPoint();
    });

    // Audio input coordination - clear URL when file is selected
    document.getElementById('hotspot-audio').addEventListener('change', () => {
      if (document.getElementById('hotspot-audio').files.length > 0) {
        document.getElementById('hotspot-audio-url').value = '';
        this.clearCommonAssetDataset(document.getElementById('hotspot-audio-url'));
      }
    });

    // Audio URL coordination - clear file when URL is entered
    document.getElementById('hotspot-audio-url').addEventListener('input', () => {
      if (this._skipClearCommonAssetDataset) return;
      if (document.getElementById('hotspot-audio-url').value.trim()) {
        document.getElementById('hotspot-audio').value = '';
        this.clearCommonAssetDataset(document.getElementById('hotspot-audio-url'));
      }
    });

    const imageFileInput = document.getElementById('hotspot-image-file');
    const imageUrlInput = document.getElementById('hotspot-image-url');
    if (imageFileInput && imageUrlInput) {
      imageFileInput.addEventListener('change', () => {
        if (imageFileInput.files.length > 0) {
          imageUrlInput.value = '';
          this.clearCommonAssetDataset(imageUrlInput);
        }
      });
      imageUrlInput.addEventListener('input', () => {
        if (this._skipClearCommonAssetDataset) return;
        if (imageUrlInput.value.trim()) {
          imageFileInput.value = '';
          this.clearCommonAssetDataset(imageUrlInput);
        }
      });
    }

    const modelFileInput = document.getElementById('hotspot-model-file');
    const modelUrlInput = document.getElementById('hotspot-model-url');
    if (modelFileInput && modelUrlInput) {
      modelFileInput.addEventListener('change', () => {
        if (modelFileInput.files.length > 0) {
          modelUrlInput.value = '';
          this.clearCommonAssetDataset(modelUrlInput);
        }
      });
      modelUrlInput.addEventListener('input', () => {
        if (this._skipClearCommonAssetDataset) return;
        if (modelUrlInput.value.trim()) {
          modelFileInput.value = '';
          this.clearCommonAssetDataset(modelUrlInput);
        }
      });
    }

    // Global sound controls (hidden native checkbox)
    document.getElementById('global-sound-enabled').addEventListener('change', (e) => {
      this.toggleGlobalSoundControls(e.target.checked);
      this._syncGlobalSoundToggleUI();
    });

    // Global sound file/URL coordination
    document.getElementById('global-sound-file').addEventListener('change', () => {
      if (document.getElementById('global-sound-file').files.length > 0) {
        document.getElementById('global-sound-url').value = '';
        this.clearCommonAssetDataset(document.getElementById('global-sound-url'));
      }
      this.updateGlobalSound();
    });

    document.getElementById('global-sound-url').addEventListener('input', () => {
      if (this._skipClearCommonAssetDataset) return;
      if (document.getElementById('global-sound-url').value.trim()) {
        document.getElementById('global-sound-file').value = '';
        this.clearCommonAssetDataset(document.getElementById('global-sound-url'));
      }
      this.updateGlobalSound();
    });

    document.getElementById('global-sound-volume').addEventListener('input', () => {
      this.updateGlobalSound();
    });

    // Editor global sound control
    document.getElementById('editor-sound-control').addEventListener('click', () => {
      this.toggleEditorGlobalSound();
    });

    // Visible Global Sound switch -> flip hidden checkbox and dispatch change
    try {
      const gs = document.getElementById('global-sound-switch');
      if (gs) {
        const activateGS = () => {
          const chk = document.getElementById('global-sound-enabled');
          if (!chk) return;
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
          this._syncGlobalSoundToggleUI();
        };
        gs.addEventListener('click', activateGS);
        gs.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            activateGS();
          }
        });
      }
    } catch (_) {
      /* ignore */
    }

    // Initial sync for global sound switch
    this._syncGlobalSoundToggleUI();

    // Ground/Texture controls
    document.getElementById('ground-enabled-toggle').addEventListener('change', (e) => {
      this.toggleGroundControls(e.target.checked);
      this._syncGroundToggleUI();
      if (e.target.checked) {
        this.updateGround();
      } else {
        this.removeGround();
      }
    });

    // Visible Ground switch -> flip hidden checkbox and dispatch change
    try {
      const groundSwitch = document.getElementById('ground-enabled-switch');
      if (groundSwitch) {
        const activateGround = () => {
          const chk = document.getElementById('ground-enabled-toggle');
          if (!chk) return;
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
          this._syncGroundToggleUI();
        };
        groundSwitch.addEventListener('click', activateGround);
        groundSwitch.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            activateGround();
          }
        });
      }
    } catch (_) {
      /* ignore */
    }

    // Ground texture file uploads
    document.getElementById('ground-diffuse').addEventListener('change', () => {
      this.updateGround();
    });
    document.getElementById('ground-normal').addEventListener('change', () => {
      this.updateGround();
    });
    document.getElementById('ground-roughness').addEventListener('change', () => {
      this.updateGround();
    });
    document.getElementById('ground-ao').addEventListener('change', () => {
      this.updateGround();
    });
    document.getElementById('ground-displacement').addEventListener('change', () => {
      this.updateGround();
    });

    // Ground properties
    document.getElementById('ground-width').addEventListener('input', () => {
      this.updateGround();
    });
    document.getElementById('ground-depth').addEventListener('input', () => {
      this.updateGround();
    });
    document.getElementById('ground-repeat').addEventListener('input', () => {
      this.updateGround();
    });

    // Clear buttons for ground textures
    document.getElementById('clear-ground-diffuse').addEventListener('click', () => {
      this.clearGroundTexture('diffuse');
    });
    document.getElementById('clear-ground-normal').addEventListener('click', () => {
      this.clearGroundTexture('normal');
    });
    document.getElementById('clear-ground-roughness').addEventListener('click', () => {
      this.clearGroundTexture('roughness');
    });
    document.getElementById('clear-ground-ao').addEventListener('click', () => {
      this.clearGroundTexture('ao');
    });
    document.getElementById('clear-ground-displacement').addEventListener('click', () => {
      this.clearGroundTexture('displacement');
    });

    // Initial sync for ground switch
    this._syncGroundToggleUI();

    this.setupEditorProgressBar();
  }

  async _getGitHubAuthStatus() {
    try {
      const res = await fetch('/github/oauth/status');
      if (!res.ok) return { authed: false };
      return await res.json();
    } catch (_) {
      return { authed: false };
    }
  }

  _redirectToGitHubOAuth(options = {}) {
    const returnTo = window.location.href;
    const selectAccount = !!options.selectAccount;
    const url =
      `/github/oauth/start?returnTo=${encodeURIComponent(returnTo)}` +
      (selectAccount ? '&prompt=select_account' : '');
    window.location.href = url;
  }

  async _startGitHubOAuthPopup(options = {}) {
    const returnTo = window.location.href;
    const selectAccount = !!options.selectAccount;

    const url =
      `/github/oauth/start?returnTo=${encodeURIComponent(returnTo)}` +
      (selectAccount ? '&prompt=select_account' : '') +
      '&popup=1';

    const w = window.open(
      url,
      'github-oauth',
      'width=720,height=820,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes'
    );

    // If popups are blocked, fall back to full-page redirect.
    if (!w) {
      this._redirectToGitHubOAuth({ selectAccount });
      return false;
    }

    return await new Promise((resolve) => {
      let done = false;

      const cleanup = () => {
        try {
          window.removeEventListener('message', onMessage);
        } catch (_) {}
        try {
          clearInterval(closedPoll);
        } catch (_) {}
        try {
          clearTimeout(timeout);
        } catch (_) {}
      };

      const finish = (ok) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(!!ok);
      };

      const onMessage = (ev) => {
        // Only trust messages from our own origin.
        if (ev.origin !== window.location.origin) return;
        if (ev?.data?.type === 'github-oauth-complete') finish(true);
      };

      window.addEventListener('message', onMessage);

      const closedPoll = setInterval(() => {
        try {
          if (w.closed) finish(false);
        } catch (_) {
          // ignore
        }
      }, 500);

      const timeout = setTimeout(() => {
        finish(false);
      }, 2 * 60 * 1000);
    });
  }

  _closeDialogEl(dialogEl) {
    try {
      dialogEl?.remove();
    } catch (_) {}
  }

  _buildDialogEl(title) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.75)';
    overlay.style.zIndex = String(EDITOR_LAYER.dialog);
    overlay.classList.add('editor-modal-overlay');
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.width = '520px';
    panel.style.maxWidth = '92vw';
    panel.style.background = '#1f1f1f';
    panel.style.border = '1px solid #444';
    panel.style.borderRadius = '10px';
    panel.style.padding = '16px';
    panel.style.color = 'white';
    panel.style.fontFamily = 'Arial, sans-serif';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '12px';

    const h = document.createElement('div');
    h.textContent = title;
    h.style.fontSize = '16px';
    h.style.fontWeight = 'bold';

    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.background = 'transparent';
    close.style.color = 'white';
    close.style.border = 'none';
    close.style.cursor = 'pointer';
    close.style.fontSize = '18px';

    header.appendChild(h);
    header.appendChild(close);

    panel.appendChild(header);
    overlay.appendChild(panel);

    // click outside closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeDialogEl(overlay);
    });
    close.addEventListener('click', () => this._closeDialogEl(overlay));

    return { overlay, panel };
  }

  async _copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) return false;

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {
      // fallback below
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  _showGitHubUploadResult({ repoUrl, pagesUrl }) {
    const { overlay, panel } = this._buildDialogEl('GitHub Upload Complete');

    const makeRow = (label, url) => {
      const row = document.createElement('div');
      row.style.marginBottom = '12px';

      const lab = document.createElement('div');
      lab.textContent = label;
      lab.style.fontWeight = 'bold';
      lab.style.marginBottom = '6px';

      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '10px';

      const input = document.createElement('input');
      input.type = 'text';
      input.readOnly = true;
      input.value = url || '';
      input.style.flex = '1';
      input.style.padding = '10px';
      input.style.border = '1px solid #555';
      input.style.borderRadius = '6px';
      input.style.background = '#333';
      input.style.color = 'white';
      input.style.boxSizing = 'border-box';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.style.padding = '10px 14px';
      copyBtn.style.background = '#4caf50';
      copyBtn.style.color = 'white';
      copyBtn.style.border = 'none';
      copyBtn.style.borderRadius = '6px';
      copyBtn.style.cursor = 'pointer';
      copyBtn.style.fontWeight = 'bold';
      copyBtn.disabled = !url;
      copyBtn.style.opacity = url ? '1' : '0.6';

      const status = document.createElement('div');
      status.style.fontSize = '11px';
      status.style.color = '#aaa';
      status.style.marginTop = '6px';

      copyBtn.addEventListener('click', async () => {
        input.focus();
        input.select();
        const ok = await this._copyTextToClipboard(url);
        status.textContent = ok ? 'Copied!' : 'Copy failed (browser blocked clipboard)';
        setTimeout(() => {
          status.textContent = '';
        }, 1500);
      });

      wrap.appendChild(input);
      wrap.appendChild(copyBtn);

      row.appendChild(lab);
      row.appendChild(wrap);
      row.appendChild(status);
      return row;
    };

    panel.appendChild(makeRow('Repo URL', repoUrl));
    panel.appendChild(makeRow('Live Site URL', pagesUrl));

    if (pagesUrl) {
      const note = document.createElement('div');
      note.textContent = 'Note: This link can take a few minutes to go live. If it doesn\'t load yet, wait a bit and refresh.';
      note.style.fontSize = '12px';
      note.style.color = '#aaa';
      note.style.marginTop = '-6px';
      note.style.marginBottom = '10px';
      panel.appendChild(note);
    }

    const closeWrap = document.createElement('div');
    closeWrap.style.display = 'flex';
    closeWrap.style.gap = '10px';
    closeWrap.style.marginTop = '8px';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.flex = '1';
    closeBtn.style.padding = '12px 16px';
    closeBtn.style.background = '#666';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.addEventListener('click', () => this._closeDialogEl(overlay));

    closeWrap.appendChild(closeBtn);
    panel.appendChild(closeWrap);

    document.body.appendChild(overlay);
    return overlay;
  }

  async _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        if (comma === -1) return resolve('');
        resolve(result.slice(comma + 1));
      };
      reader.onerror = () => reject(new Error('Failed to read ZIP blob'));
      reader.readAsDataURL(blob);
    });
  }

  async _buildCompleteProjectZipBlob(templateName) {
    const JSZip = window.JSZip || (await this.loadJSZip());
    const zip = new JSZip();

    const skyboxImg = document.querySelector('#main-panorama');
    const skyboxSrc = skyboxImg ? skyboxImg.src : '';
    await this.addFilesToZip(zip, templateName, skyboxSrc);

    return await zip.generateAsync({ type: 'blob' });
  }

  async handleGitHubUpload() {
    const status = await this._getGitHubAuthStatus();
    if (!status || !status.authed) {
      const ok = confirm(
        'This will connect to GitHub so the editor can create a repo or commit to an existing repo. Continue?'
      );
      if (!ok) return;

      let progressDiv = null;
      try {
        progressDiv = this.showProgress('Opening GitHub login...');
        const popupOk = await this._startGitHubOAuthPopup();
        if (!popupOk) {
          // Either popup was blocked (we redirected) or user closed popup.
          return;
        }

        const status2 = await this._getGitHubAuthStatus();
        if (!status2 || !status2.authed) {
          alert('GitHub connection was not completed. Please try again.');
          return;
        }
      } finally {
        if (progressDiv) this.hideProgress(progressDiv);
      }
      return;
    }

    const connectedAs = status.user?.login ? `Connected as ${status.user.login}` : 'Connected to GitHub';
    const { overlay, panel } = this._buildDialogEl('Upload to GitHub');

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.justifyContent = 'space-between';
    topRow.style.gap = '10px';
    topRow.style.marginBottom = '12px';

    const info = document.createElement('div');
    info.textContent = connectedAs;
    info.style.fontSize = '12px';
    info.style.color = '#bbb';
    info.style.whiteSpace = 'nowrap';
    info.style.overflow = 'hidden';
    info.style.textOverflow = 'ellipsis';

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.textContent = 'Switch GitHub account';
    switchBtn.style.padding = '8px 10px';
    switchBtn.style.background = '#555';
    switchBtn.style.color = 'white';
    switchBtn.style.border = 'none';
    switchBtn.style.borderRadius = '6px';
    switchBtn.style.cursor = 'pointer';
    switchBtn.style.fontWeight = 'bold';
    switchBtn.style.whiteSpace = 'nowrap';
    switchBtn.addEventListener('click', async () => {
      const ok = confirm('Switch GitHub account? You may be asked to pick an account again.');
      if (!ok) return;
      try {
        await fetch('/github/oauth/logout', { method: 'POST' });
      } catch (_) {
        // best-effort
      }
      let progressDiv = null;
      try {
        progressDiv = this.showProgress('Opening GitHub account picker...');
        const popupOk = await this._startGitHubOAuthPopup({ selectAccount: true });
        if (!popupOk) return;

        const status3 = await this._getGitHubAuthStatus();
        const login = status3?.user?.login ? status3.user.login : '';
        info.textContent = login ? `Connected as ${login}` : 'Connected to GitHub';

        // Force repo dropdown reload for the new user
        reposLoaded = false;
        branchesLoadedForRepo = '';
        if (repoSelect) {
          repoSelect.innerHTML = '<option value="">Loading repos...</option>';
        }
      } finally {
        if (progressDiv) this.hideProgress(progressDiv);
      }
    });

    topRow.appendChild(info);
    topRow.appendChild(switchBtn);
    panel.appendChild(topRow);

    const form = document.createElement('form');
    form.innerHTML = `
      <div style="margin-bottom: 10px;">
        <label style="display:block; font-weight:bold; margin-bottom:6px;">Mode</label>
        <label style="display:block; margin:6px 0;">
          <input type="radio" name="ghMode" value="create" checked /> Create new repo
        </label>
        <label style="display:block; margin:6px 0;">
          <input type="radio" name="ghMode" value="update" /> Update existing repo
        </label>
      </div>

      <div id="gh-create-fields" style="margin-bottom: 10px;">
        <label style="display:block; font-weight:bold; margin-bottom:6px;">New repo name</label>
        <input id="gh-repo-name" type="text" placeholder="my-vr-hotspot-project" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;" />
        <div style="display:flex; gap:10px; margin-top:10px;">
          <div style="flex:1;">
            <label style="display:block; font-weight:bold; margin-bottom:6px;">Visibility</label>
            <select id="gh-visibility" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="display:block; font-weight:bold; margin-bottom:6px;">Branch</label>
            <input id="gh-branch-create" type="text" placeholder="main" value="main" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;" />
          </div>
        </div>

        <div id="gh-pages-wrap" style="margin-top:10px;">
          <label style="display:flex; align-items:center; gap:8px; user-select:none;">
            <input id="gh-enable-pages" type="checkbox" />
            Make site live on GitHub (public repos only)
          </label>
          <div style="font-size: 11px; color: #aaa; margin-top: 6px;">
            Publishes the site after upload so you can share a live link.
          </div>
        </div>
      </div>

      <div id="gh-update-fields" style="margin-bottom: 10px; display:none;">
        <label style="display:block; font-weight:bold; margin-bottom:6px;">Repo (owner/name)</label>
        <select id="gh-repo-select" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;">
          <option value="">Loading repos...</option>
        </select>
        <div id="gh-repo-help" style="font-size: 11px; color: #aaa; margin-top: 6px;"></div>
        <label style="display:block; font-weight:bold; margin:10px 0 6px;">Branch</label>
        <select id="gh-branch-select" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;">
          <option value="main">main</option>
        </select>
        <div id="gh-branch-help" style="font-size: 11px; color: #aaa; margin-top: 6px;"></div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="display:block; font-weight:bold; margin-bottom:6px;">Commit message</label>
        <input id="gh-commit" type="text" value="Initial commit" style="width:100%; padding:10px; border:1px solid #555; border-radius:6px; background:#333; color:white; box-sizing:border-box;" />
      </div>

      <div style="display:flex; gap:10px;">
        <button type="submit" style="flex:1; padding:12px 16px; background:#4caf50; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Upload</button>
        <button type="button" id="gh-cancel" style="flex:1; padding:12px 16px; background:#666; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Cancel</button>
      </div>
    `;

    panel.appendChild(form);
    document.body.appendChild(overlay);

    const createFields = form.querySelector('#gh-create-fields');
    const updateFields = form.querySelector('#gh-update-fields');
    const cancelBtn = form.querySelector('#gh-cancel');
    cancelBtn.addEventListener('click', () => this._closeDialogEl(overlay));

    const repoSelect = form.querySelector('#gh-repo-select');
    const repoHelp = form.querySelector('#gh-repo-help');
    const branchSelect = form.querySelector('#gh-branch-select');
    const branchHelp = form.querySelector('#gh-branch-help');
    let reposLoaded = false;
    let branchesLoadedForRepo = '';

    const visibilityEl = form.querySelector('#gh-visibility');
    const pagesWrap = form.querySelector('#gh-pages-wrap');
    const enablePagesEl = form.querySelector('#gh-enable-pages');
    const commitEl = form.querySelector('#gh-commit');

    // Track whether the user manually edited the commit message
    if (commitEl) {
      commitEl.dataset.userEdited = 'false';
      commitEl.addEventListener('input', () => {
        commitEl.dataset.userEdited = 'true';
      });
    }

    const syncPagesAvailability = () => {
      const vis = (visibilityEl?.value || 'public').toLowerCase();
      const isPublic = vis === 'public';
      if (pagesWrap) pagesWrap.style.display = isPublic ? '' : 'none';
      if (enablePagesEl && !isPublic) enablePagesEl.checked = false;
    };
    if (visibilityEl) {
      visibilityEl.addEventListener('change', syncPagesAvailability);
      syncPagesAvailability();
    }

    const loadReposIntoDropdown = async () => {
      if (reposLoaded) return;
      reposLoaded = true;
      try {
        if (repoSelect) {
          repoSelect.innerHTML = '<option value="">Loading repos...</option>';
        }
        if (repoHelp) repoHelp.textContent = '';

        const res = await fetch('/github/repos');
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Failed to load repos');
        }
        const repos = Array.isArray(json.repos) ? json.repos : [];
        if (!repoSelect) return;

        repoSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a repo...';
        repoSelect.appendChild(placeholder);

        for (const r of repos) {
          const opt = document.createElement('option');
          opt.value = r.full_name;
          opt.textContent = r.full_name + (r.private ? ' (private)' : '');
          repoSelect.appendChild(opt);
        }

        if (repoHelp) {
          repoHelp.textContent = repos.length
            ? `Found ${repos.length} repo(s) from GitHub.`
            : 'No repos found for this account.';
        }
      } catch (e) {
        reposLoaded = false;
        if (repoSelect) {
          repoSelect.innerHTML = '<option value="">Failed to load repos</option>';
        }
        if (repoHelp) repoHelp.textContent = e.message || String(e);
      }
    };

    const loadBranchesForRepo = async (repoFullName) => {
      if (!repoFullName) return;
      if (branchesLoadedForRepo === repoFullName) return;
      branchesLoadedForRepo = repoFullName;

      try {
        if (branchSelect) {
          branchSelect.innerHTML = '<option value="">Loading branches...</option>';
        }
        if (branchHelp) branchHelp.textContent = '';

        const res = await fetch(`/github/branches?repo=${encodeURIComponent(repoFullName)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Failed to load branches');
        }

        const branches = Array.isArray(json.branches) ? json.branches : [];
        if (!branchSelect) return;
        branchSelect.innerHTML = '';

        if (!branches.length) {
          // Fallback: offer main as default
          const opt = document.createElement('option');
          opt.value = 'main';
          opt.textContent = 'main';
          branchSelect.appendChild(opt);
          if (branchHelp) branchHelp.textContent = 'No branches returned; defaulting to "main".';
          return;
        }

        for (const b of branches) {
          const name = typeof b === 'string' ? b : b?.name;
          if (!name) continue;
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          branchSelect.appendChild(opt);
        }

        if (branchHelp) {
          branchHelp.textContent = `Found ${branchSelect.options.length} branch(es).`;
        }
      } catch (e) {
        branchesLoadedForRepo = '';
        if (branchSelect) {
          branchSelect.innerHTML = '<option value="main">main</option>';
        }
        if (branchHelp) branchHelp.textContent = e.message || String(e);
      }
    };

    if (repoSelect) {
      repoSelect.addEventListener('change', () => {
        const val = String(repoSelect.value || '').trim();
        loadBranchesForRepo(val);
      });
    }

    const syncMode = () => {
      const mode = form.querySelector('input[name="ghMode"]:checked')?.value || 'create';

      // Keep default commit messages aligned with mode unless user edited.
      if (commitEl && commitEl.dataset.userEdited !== 'true') {
        commitEl.value = mode === 'create' ? 'Initial commit' : 'Update VR Hotspot project';
      }

      if (mode === 'create') {
        createFields.style.display = '';
        updateFields.style.display = 'none';
      } else {
        createFields.style.display = 'none';
        updateFields.style.display = '';
        loadReposIntoDropdown();
      }
    };
    form.querySelectorAll('input[name="ghMode"]').forEach((r) => r.addEventListener('change', syncMode));
    syncMode();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const mode = form.querySelector('input[name="ghMode"]:checked')?.value || 'create';
      const commitMessage = (form.querySelector('#gh-commit')?.value || '').trim() || 'Update VR Hotspot project';

      const templateName =
        document.getElementById('template-name').value || `hotspot-project-${Date.now()}`;

      let payload = { mode, commitMessage, templateName };

      if (mode === 'create') {
        const repoName = (form.querySelector('#gh-repo-name')?.value || '').trim();
        const visibility = (form.querySelector('#gh-visibility')?.value || 'public').trim();
        const branch = (form.querySelector('#gh-branch-create')?.value || 'main').trim() || 'main';
        if (!repoName) {
          alert('Please enter a repo name.');
          return;
        }
        payload.repoName = repoName;
        payload.visibility = visibility;
        payload.branch = branch;
        payload.enablePages =
          String(visibility).toLowerCase() === 'public' && !!form.querySelector('#gh-enable-pages')?.checked;
      } else {
        const repoFullName = (form.querySelector('#gh-repo-select')?.value || '').trim();
        const branch = (form.querySelector('#gh-branch-select')?.value || 'main').trim() || 'main';
        if (!repoFullName || !repoFullName.includes('/')) {
          alert('Please select a repo.');
          return;
        }
        // If branches aren't loaded yet, attempt to load once before submitting.
        if (repoFullName && branchesLoadedForRepo !== repoFullName) {
          await loadBranchesForRepo(repoFullName);
        }
        payload.repoFullName = repoFullName;
        payload.branch = branch;
      }

      let progressDiv = null;
      try {
        progressDiv = this.showProgress('Creating ZIP and uploading to GitHub...');

        const zipBlob = await this._buildCompleteProjectZipBlob(templateName);

        const formData = new FormData();
        // keep field names in sync with server
        formData.append('mode', payload.mode);
        formData.append('commitMessage', payload.commitMessage);
        formData.append('templateName', payload.templateName);
        formData.append('branch', payload.branch);
        if (payload.repoName) formData.append('repoName', payload.repoName);
        if (payload.repoFullName) formData.append('repoFullName', payload.repoFullName);
        if (payload.visibility) formData.append('visibility', payload.visibility);
        if (typeof payload.enablePages !== 'undefined') {
          formData.append('enablePages', payload.enablePages ? 'true' : 'false');
        }
        formData.append('project', zipBlob, `${templateName}.zip`);

        const res = await fetch('/github/push-zip-upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'GitHub upload failed');
        }

        this._closeDialogEl(overlay);
        // Show only shareable links with copy buttons.
        this._showGitHubUploadResult({
          repoUrl: json.repoUrl || '',
          pagesUrl: json.pagesUrl || '',
        });
      } catch (err) {
        alert(`GitHub upload error: ${err.message || err}`);
      } finally {
        if (progressDiv) this.hideProgress(progressDiv);
      }
    });
  }

  _updateAddHotspotButtonState() {
    try {
      const btn = document.getElementById('add-hotspot');
      const toggle = document.getElementById('edit-mode-toggle');
      if (!btn || !toggle) return;
      const inEditMode = !!toggle.checked;
      // Always clickable — enterEditMode turns on Edit Mode when needed
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.style.opacity = inEditMode ? '' : '0.9';
      btn.style.cursor = inEditMode ? '' : 'pointer';
      if (!inEditMode) {
        btn.title = 'Click to enable Edit Mode and start placing a hotspot.';
      } else {
        btn.removeAttribute('title');
      }
    } catch (_) {
      /* ignore */
    }
  }

  _initHotspotTypeCollapsible() {
    try {
      const section = document.getElementById('hotspot-type-section');
      const title = document.getElementById('hotspot-type-title');
      const caret = document.getElementById('hotspot-type-caret');
      if (!section || !title || !caret) return;

      // Click to toggle
      title.addEventListener('click', () => {
        const currentlyCollapsed = section.dataset.collapsed === 'true';
        this._setHotspotTypeCollapsed(!currentlyCollapsed);
      });

      // Initial collapsed state based on Edit Mode toggle
      const toggle = document.getElementById('edit-mode-toggle');
      const collapsed = toggle ? !toggle.checked : false;
      this._setHotspotTypeCollapsed(collapsed);
    } catch (_) {
      /* ignore */
    }
  }

  _setHotspotTypeCollapsed(collapsed) {
    try {
      const section = document.getElementById('hotspot-type-section');
      const caret = document.getElementById('hotspot-type-caret');
      if (!section || !caret) return;
      section.dataset.collapsed = String(!!collapsed);
      // Hide/show all hotspot type rows inside the section (leave title visible)
      const rows = section.querySelectorAll('.hotspot-type');
      rows.forEach((row) => {
        row.style.display = collapsed ? 'none' : '';
      });
      // Also hide/show the merged properties group when collapsing
      const propsGroup = document.getElementById('hotspot-properties-group');
      if (propsGroup) propsGroup.style.display = collapsed ? 'none' : '';
      caret.textContent = collapsed ? '▲' : '▼';
      caret.style.transform = collapsed ? 'rotate(180deg)' : '';
      caret.style.transition = 'transform 120ms ease-out';
    } catch (_) {
      /* ignore */
    }
  }

  _setHotspotPropertiesVisible(visible) {
    try {
      // Prefer merged group inside Hotspot Type section; fallback to legacy separate section
      const props =
        document.getElementById('hotspot-properties-group') ||
        document.getElementById('hotspot-properties-section');
      if (!props) return;
      props.style.display = visible ? '' : 'none';
    } catch (_) {
      /* ignore */
    }
  }

  _syncEditModeToggleUI() {
    try {
      const toggle = document.getElementById('edit-mode-toggle');
      const sw = document.getElementById('edit-mode-switch');
      const thumb = sw ? sw.querySelector('.thumb') : null;
      const label = document.getElementById('edit-mode-label');
      const help = document.getElementById('edit-mode-help');
      if (!toggle || !sw || !thumb || !label) return;
      const isEdit = !!toggle.checked;

      // Update visuals
      sw.setAttribute('aria-checked', String(isEdit));
      sw.style.background = isEdit ? '#4caf50' : '#777';
      thumb.style.left = isEdit ? '26px' : '2px';

      // Update text
      label.textContent = isEdit ? '🛠️ Edit Mode: ON' : '🧭 Navigation Mode: ON';
      if (help)
        help.textContent = isEdit
          ? 'Click to switch to Navigation Mode'
          : 'Click to switch to Edit Mode';
    } catch (_) {
      /* ignore */
    }
  }

  _syncGlobalSoundToggleUI() {
    try {
      const chk = document.getElementById('global-sound-enabled');
      const sw = document.getElementById('global-sound-switch');
      const thumb = sw ? sw.querySelector('.thumb') : null;
      const label = document.getElementById('global-sound-label');
      const help = document.getElementById('global-sound-help');
      if (!chk || !sw || !thumb || !label) return;
      const isOn = !!chk.checked;

      // Update visuals
      sw.setAttribute('aria-checked', String(isOn));
      sw.style.background = isOn ? '#4caf50' : '#777';
      thumb.style.left = isOn ? '26px' : '2px';

      // Update texts
      label.textContent = isOn ? '🎵 Scene Audio: ON' : '🔇 Scene Audio: OFF';
      if (help)
        help.textContent = isOn
          ? 'Click to disable ambient sound for this scene'
          : 'Click to enable ambient sound for this scene';
    } catch (_) {
      /* ignore */
    }
  }

  _syncGroundToggleUI() {
    try {
      const chk = document.getElementById('ground-enabled-toggle');
      const sw = document.getElementById('ground-enabled-switch');
      const thumb = sw ? sw.querySelector('.thumb') : null;
      const label = document.getElementById('ground-enabled-label');
      const help = document.getElementById('ground-enabled-help');
      if (!chk || !sw || !thumb || !label) return;
      const isOn = !!chk.checked;

      // Update visuals
      sw.setAttribute('aria-checked', String(isOn));
      sw.style.background = isOn ? '#4caf50' : '#777';
      thumb.style.left = isOn ? '26px' : '2px';

      // Update texts
      label.textContent = isOn ? '🌍 Ground: ON' : '🌍 Ground: OFF';
      if (help)
        help.textContent = isOn
          ? 'Click to disable ground plane'
          : 'Click to add ground plane with textures';
    } catch (_) {
      /* ignore */
    }
  }

  setupHotspotTypeSelection() {
    const typeElements = document.querySelectorAll('.hotspot-type');
    typeElements.forEach((element) => {
      element.addEventListener('click', () => {
        // Remove selected class from all
        typeElements.forEach((el) => el.classList.remove('selected'));
        // Add selected class to clicked element
        element.classList.add('selected');
        // Update radio button
        const radio = element.querySelector('input[type="radio"]');
        radio.checked = true;
        this.selectedHotspotType = radio.value;

        // Update field requirements visibility
        this.updateFieldRequirements();
      });
    });

    // Initialize field requirements for default selection
    this.updateFieldRequirements();

    document.querySelectorAll('input[name="hotspot-image-media-kind"]').forEach((radio) => {
      radio.addEventListener('change', () => this.syncImageMediaFieldsVisibility());
    });
  }

  updateFieldRequirements() {
    const textGroup = document.querySelector('label[for="hotspot-text"]').parentElement;
    const audioGroup = document.querySelector('label[for="hotspot-audio"]').parentElement;
    const audioUrlGroup = document.querySelector('label[for="hotspot-audio-url"]').parentElement;
    const audioLoopGroup = document.getElementById('audio-loop-group');
    const navigationGroup = document.getElementById('navigation-target-group');
    // Weblink groups
    const weblinkUrlGroup = document.getElementById('weblink-url-group');
    const weblinkTitleGroup = document.getElementById('weblink-title-group');
    const weblinkImgFileGroup = document.getElementById('weblink-image-file-group');
    const weblinkImgUrlGroup = document.getElementById('weblink-image-url-group');
    const textLabel = document.querySelector('label[for="hotspot-text"]');
    const audioLabel = document.querySelector('label[for="hotspot-audio"]');

    // Reset labels
    textLabel.innerHTML = 'Text Content:';
    audioLabel.innerHTML = 'Audio File:';

    // Reset visibility
    textGroup.style.display = 'block';
    audioGroup.style.display = 'block';
    audioUrlGroup.style.display = 'block';
    if (audioLoopGroup) audioLoopGroup.style.display = 'none';
    navigationGroup.style.display = 'none';
    if (weblinkUrlGroup) weblinkUrlGroup.style.display = 'none';
    if (weblinkTitleGroup) weblinkTitleGroup.style.display = 'none';
    if (weblinkImgFileGroup) weblinkImgFileGroup.style.display = 'none';
    if (weblinkImgUrlGroup) weblinkImgUrlGroup.style.display = 'none';
    const imgFileGrpReset = document.getElementById('image-file-group');
    const imgUrlGrpReset = document.getElementById('image-url-group');
    const imgSizeGrpReset = document.getElementById('image-size-group');
    if (imgFileGrpReset) imgFileGrpReset.style.display = 'none';
    if (imgUrlGrpReset) imgUrlGrpReset.style.display = 'none';
    if (imgSizeGrpReset) imgSizeGrpReset.style.display = 'none';
    const imgMediaKindReset = document.getElementById('image-media-kind-group');
    const vidFileGrpReset = document.getElementById('video-file-group');
    const vidUrlGrpReset = document.getElementById('video-url-group');
    const vidOptsGrpReset = document.getElementById('video-options-group');
    if (imgMediaKindReset) imgMediaKindReset.style.display = 'none';
    if (vidFileGrpReset) vidFileGrpReset.style.display = 'none';
    if (vidUrlGrpReset) vidUrlGrpReset.style.display = 'none';
    if (vidOptsGrpReset) vidOptsGrpReset.style.display = 'none';
    const modelFileGrpReset = document.getElementById('model-file-group');
    const modelUrlGrpReset = document.getElementById('model-url-group');
    const modelSizeGrpReset = document.getElementById('model-size-group');
    const modelRotationGrpReset = document.getElementById('model-rotation-group');
    const modelPositionGrpReset = document.getElementById('model-position-group');
    if (modelFileGrpReset) modelFileGrpReset.style.display = 'none';
    if (modelUrlGrpReset) modelUrlGrpReset.style.display = 'none';
    if (modelSizeGrpReset) modelSizeGrpReset.style.display = 'none';
    if (modelRotationGrpReset) modelRotationGrpReset.style.display = 'none';
    if (modelPositionGrpReset) modelPositionGrpReset.style.display = 'none';

    switch (this.selectedHotspotType) {
      case 'text':
        textLabel.innerHTML = 'Text Content: <span style="color: #f44336;">*Required</span>';
        audioGroup.style.display = 'none';
        audioUrlGroup.style.display = 'none';
        if (audioLoopGroup) audioLoopGroup.style.display = 'none';
        break;

      case 'audio':
        audioLabel.innerHTML = 'Audio File: <span style="color: #f44336;">*Required</span>';
        textGroup.style.display = 'none';
        if (audioLoopGroup) audioLoopGroup.style.display = 'block';
        break;

      case 'text-audio':
        textLabel.innerHTML = 'Text Content: <span style="color: #f44336;">*Required</span>';
        audioLabel.innerHTML = 'Audio File: <span style="color: #f44336;">*Required</span>';
        if (audioLoopGroup) audioLoopGroup.style.display = 'block';
        break;

      case 'navigation':
        textGroup.style.display = 'none';
        audioGroup.style.display = 'none';
        audioUrlGroup.style.display = 'none';
        navigationGroup.style.display = 'block';
        // Removed stray labelLabel reference (was undefined)
        this.updateNavigationTargets();
        break;
      case 'weblink':
        textGroup.style.display = 'none';
        audioGroup.style.display = 'none';
        audioUrlGroup.style.display = 'none';
        navigationGroup.style.display = 'none';
        if (weblinkUrlGroup) weblinkUrlGroup.style.display = 'block';
        if (weblinkTitleGroup) weblinkTitleGroup.style.display = 'block';
        if (weblinkImgFileGroup) weblinkImgFileGroup.style.display = 'block';
        if (weblinkImgUrlGroup) weblinkImgUrlGroup.style.display = 'block';
        break;
      case 'image':
        textGroup.style.display = 'none';
        audioGroup.style.display = 'none';
        audioUrlGroup.style.display = 'none';
        navigationGroup.style.display = 'none';
        const imgMediaKindGrp = document.getElementById('image-media-kind-group');
        const imgSizeGrp = document.getElementById('image-size-group');
        if (imgMediaKindGrp) imgMediaKindGrp.style.display = 'block';
        if (imgSizeGrp) imgSizeGrp.style.display = 'block';
        this.syncImageMediaFieldsVisibility();
        break;
      case 'model':
        textGroup.style.display = 'none';
        audioGroup.style.display = 'none';
        audioUrlGroup.style.display = 'none';
        navigationGroup.style.display = 'none';
        const modelFileGrp = document.getElementById('model-file-group');
        const modelUrlGrp = document.getElementById('model-url-group');
        const modelSizeGrp = document.getElementById('model-size-group');
        const modelRotationGrp = document.getElementById('model-rotation-group');
        const modelPositionGrp = document.getElementById('model-position-group');
        if (modelFileGrp) modelFileGrp.style.display = 'block';
        if (modelUrlGrp) modelUrlGrp.style.display = 'block';
        if (modelSizeGrp) modelSizeGrp.style.display = 'block';
        if (modelRotationGrp) modelRotationGrp.style.display = 'block';
        if (modelPositionGrp) modelPositionGrp.style.display = 'block';
        break;
    }
  }

  enterEditMode() {
    const toggle = document.getElementById('edit-mode-toggle');
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      this._syncEditModeToggleUI();
    }

    this.editMode = true;
    this.navigationMode = false;
    const indicator = document.getElementById('edit-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.textContent = 'Click on the 360° scene to place hotspot';
    }
    this.updateModeIndicator();
    this._updateAddHotspotButtonState();
    this._setHotspotTypeCollapsed(false);
    this._setHotspotPropertiesVisible(true);

    try {
      document.getElementById('hotspot-type-section')?.scrollIntoView({ block: 'nearest' });
    } catch (_) {}
  }

  exitEditMode() {
    this.editMode = false;
    document.getElementById('edit-indicator').style.display = 'none';
    this.updateModeIndicator(); // Keep instructions consistent
  }

  placeHotspot(evt) {
    if (!this.editMode) return;

    const validationResult = this.validateHotspotData();
    if (!validationResult.valid) {
      alert(validationResult.message);
      return;
    }

    const intersection = this._resolveSceneMediaIntersection(evt);
    if (!intersection) return;

    this._finalizeHotspotPlacement(intersection);
  }

  _finalizeHotspotPlacement(intersection) {
    const camera = document.querySelector('#cam');
    const optimizedPosition = this.calculateOptimalPosition(intersection, camera);

    // Create hotspot data with optimized positioning
    const hotspotData = {
      id: ++this.hotspotIdCounter,
      type: this.selectedHotspotType,
      position: `${optimizedPosition.x.toFixed(2)} ${optimizedPosition.y.toFixed(
        2
      )} ${optimizedPosition.z.toFixed(2)}`,
      text: document.getElementById('hotspot-text').value || '',
      audio: this.getSelectedAudioFile(),
      audioLoop: document.getElementById('hotspot-audio-loop')?.checked !== false, // Read from checkbox, default to true
      scene: this.currentScene,
      navigationTarget: document.getElementById('navigation-target').value || null,
      image: null,
      imageScale: 5,
      weblinkUrl: null,
      weblinkTitle: null,
      weblinkPreview: null,
      model: null,
      modelScale: 1,
    };

    // Default popup sizing for text-based hotspots (used by editor/runtime components)
    if (this.selectedHotspotType === 'text' || this.selectedHotspotType === 'text-audio') {
      hotspotData.popupWidth = 4;
      hotspotData.popupHeight = 2.5;
    }

    if (this.selectedHotspotType === 'image') {
      const mediaKind = this.getImageMediaKind();
      hotspotData.mediaKind = mediaKind;
      const imgFileEl = document.getElementById('hotspot-image-file');
      const imgUrlEl = document.getElementById('hotspot-image-url');
      const vidFileEl = document.getElementById('hotspot-video-file');
      const vidUrlEl = document.getElementById('hotspot-video-url');
      const scaleEl = document.getElementById('hotspot-image-scale');
      const s = parseFloat(scaleEl?.value || '5') || 5;
      hotspotData.imageScale = Math.max(0.1, Math.min(10, s));
      if (mediaKind === 'video') {
        hotspotData.videoLoop = document.getElementById('hotspot-video-loop')?.checked !== false;
        hotspotData.videoMuted = document.getElementById('hotspot-video-enable-audio')?.checked !== true;
        if (vidUrlEl?.value.trim()) hotspotData.video = vidUrlEl.value.trim();
        else if (vidFileEl?.files?.[0]) hotspotData.video = vidFileEl.files[0];
        if (typeof hotspotData.video === 'string') {
          this.applyCommonAssetFromDataset(hotspotData, vidUrlEl);
        }
        if (hotspotData.video instanceof File) {
          hotspotData.videoStorageKey = `video_hotspot_${hotspotData.id}`;
          hotspotData.videoFileName = hotspotData.video.name || null;
        }
      } else {
        if (imgUrlEl?.value.trim()) hotspotData.image = imgUrlEl.value.trim();
        else if (imgFileEl?.files?.[0]) {
          const fileRef = imgFileEl.files[0];
          hotspotData.imageStorageKey = `image_hotspot_${hotspotData.id}`;
          hotspotData.imageFileName = fileRef.name || null;
          hotspotData.image = URL.createObjectURL(fileRef);
          hotspotData._imageFileForIDB = fileRef;
        }
        if (typeof hotspotData.image === 'string') {
          this.applyCommonAssetFromDataset(hotspotData, imgUrlEl);
        }
      }
    }
    if (this.selectedHotspotType === 'model') {
      const modelFileEl = document.getElementById('hotspot-model-file');
      const modelUrlEl = document.getElementById('hotspot-model-url');
      const scaleEl = document.getElementById('hotspot-model-scale');
      const rotationEl = document.getElementById('hotspot-model-rotation');
      const posYEl = document.getElementById('hotspot-model-position-y');
      const s = parseFloat(scaleEl?.value || '1') || 1;
      const r = parseFloat(rotationEl?.value || '0') || 0;
      const y = parseFloat(posYEl?.value || '0') || 0;
      hotspotData.modelScale = Math.max(0.1, Math.min(200, s));
      hotspotData.modelRotation = r % 360;
      hotspotData.modelPositionY = Math.max(-5, Math.min(5, y));
      const modelUrl = modelUrlEl?.value.trim();
      if (modelUrl) hotspotData.model = modelUrl;
      else if (modelFileEl?.files?.[0]) hotspotData.model = modelFileEl.files[0];
      if (typeof hotspotData.model === 'string') {
        this.applyCommonAssetFromDataset(hotspotData, modelUrlEl);
      }
    }
    if (this.selectedHotspotType === 'weblink') {
      const url = (document.getElementById('weblink-url')?.value || '').trim();
      const title = (document.getElementById('weblink-title')?.value || '').trim();
      const wImgUrl = (document.getElementById('weblink-image-url')?.value || '').trim();
      const wImgFile = document.getElementById('weblink-image-file')?.files?.[0];
      hotspotData.weblinkUrl = url || null;
      hotspotData.weblinkTitle = title || null;
      hotspotData.weblinkPreview = wImgFile ? wImgFile : wImgUrl || null;
      if (typeof hotspotData.weblinkPreview === 'string') {
        this.applyCommonAssetFromDataset(
          hotspotData,
          document.getElementById('weblink-image-url'),
          { preview: true }
        );
      }
    }

    if (typeof hotspotData.audio === 'string') {
      this.applyCommonAssetFromDataset(hotspotData, document.getElementById('hotspot-audio-url'));
    }

    const pendingVideoFile =
      hotspotData.type === 'image' &&
      hotspotData.mediaKind === 'video' &&
      hotspotData.video instanceof File
        ? hotspotData.video
        : null;

    // Capture the image File BEFORE saveScenesData() runs, because saveScenesData
    // strips `_imageFileForIDB` and replaces `image` with a blob URL string, which
    // would otherwise leave the async IDB-save block below with nothing to persist.
    const pendingImageFile =
      hotspotData.type === 'image' && hotspotData.mediaKind !== 'video'
        ? hotspotData._imageFileForIDB instanceof File
          ? hotspotData._imageFileForIDB
          : hotspotData.image instanceof File
          ? hotspotData.image
          : null
        : null;

    this.createHotspotElement(hotspotData);
    this.hotspots.push(hotspotData);
    this.scenes[this.currentScene].hotspots.push(hotspotData);
    this.updateHotspotList();
    this.refreshAllHotspotStyles();
    setTimeout(() => this.refreshAllHotspotStyles(), 400);
    this.saveScenesData(); // Save after adding hotspot

    // If the audio is a File, persist it into IndexedDB similar to images
    if (
      (hotspotData.type === 'audio' || hotspotData.type === 'text-audio') &&
      hotspotData.audio instanceof File
    ) {
      (async () => {
        try {
          const fileRef = hotspotData.audio;
          const storageKey = hotspotData.audioStorageKey || `audio_hotspot_${hotspotData.id}`;
          const saved = await this.saveAudioToIDB(storageKey, fileRef);
          if (saved) {
            hotspotData.audioStorageKey = storageKey;
            hotspotData.audioFileName = fileRef.name || null;
            // Create blob URL for immediate playback
            const blobURL = URL.createObjectURL(fileRef);
            hotspotData.audio = blobURL;
            const scH = this.scenes[this.currentScene].hotspots.find(
              (h) => h.id === hotspotData.id
            );
            if (scH) {
              scH.audioStorageKey = storageKey;
              scH.audioFileName = fileRef.name || null;
              scH.audio = blobURL;
            }
            this.saveScenesData();
          }
        } catch (err) {
          console.warn('[AudioHotspot] Failed to save audio to IndexedDB', err);
        }
      })();
    }

    // If the image is a File, persist it into IndexedDB to avoid localStorage bloat
    if (pendingImageFile) {
      (async () => {
        try {
          const fileRef = pendingImageFile;
          const storageKey = hotspotData.imageStorageKey || `image_hotspot_${hotspotData.id}`;
          const saved = await this.saveImageToIDB(storageKey, fileRef);
          if (saved) {
            hotspotData.imageStorageKey = storageKey;
            hotspotData.imageFileName = fileRef.name || hotspotData.imageFileName || null;
            delete hotspotData._imageFileForIDB;
            // Ensure blob URL for immediate display
            const blobURL =
              typeof hotspotData.image === 'string' && hotspotData.image.startsWith('blob:')
                ? hotspotData.image
                : URL.createObjectURL(fileRef);
            hotspotData.image = blobURL;
            // Update scene hotspot reference too
            const sceneHs = this.scenes[this.currentScene].hotspots.find(
              (h) => h.id === hotspotData.id
            );
            if (sceneHs) {
              sceneHs.imageStorageKey = storageKey;
              sceneHs.imageFileName = fileRef.name || null;
              sceneHs.image = blobURL;
            }
            // Update existing entity's image src
            const el = document.getElementById(`hotspot-${hotspotData.id}`);
            const imgEnt = el?.querySelector('.static-image-hotspot');
            if (imgEnt) setAImageHotspotSrc(imgEnt, blobURL);
            // Persist again with stripped blobs (saveScenesData will strip blob URLs when storageKey exists)
            this.saveScenesData();
          }
        } catch (err) {
          console.warn('[ImageHotspot] Failed to save image to IndexedDB', err);
        }
      })();
    }

    // If the video is a File, persist it into IndexedDB
    if (pendingVideoFile) {
      (async () => {
        try {
          const fileRef = pendingVideoFile;
          const storageKey = hotspotData.videoStorageKey || `video_hotspot_${hotspotData.id}`;
          const saved = await this.saveVideoToIDB(storageKey, fileRef);
          if (saved) {
            hotspotData.videoStorageKey = storageKey;
            hotspotData.videoFileName = fileRef.name || null;
            hotspotData.mediaKind = 'video';
            const sceneHs = this.scenes[this.currentScene].hotspots.find(
              (h) => h.id === hotspotData.id
            );
            if (sceneHs) {
              sceneHs.videoStorageKey = storageKey;
              sceneHs.videoFileName = fileRef.name || null;
              sceneHs.mediaKind = 'video';
              sceneHs.videoLoop = hotspotData.videoLoop;
              sceneHs.videoMuted = hotspotData.videoMuted;
            }
            this.saveScenesData();
          }
        } catch (err) {
          console.warn('[VideoHotspot] Failed to save video to IndexedDB', err);
        }
      })();
    }
    // If weblink preview is a File, convert to data URL to persist
    if (hotspotData.type === 'weblink' && hotspotData.weblinkPreview instanceof File) {
      const f = hotspotData.weblinkPreview;
      this._fileToDataURL(f)
        .then((dataUrl) => {
          hotspotData.weblinkPreview = dataUrl;
          const scH = this.scenes[this.currentScene].hotspots.find((h) => h.id === hotspotData.id);
          if (scH) scH.weblinkPreview = dataUrl;
          this.saveScenesData();
        })
        .catch(() => {});
    }
    // If the model is a File, persist it into IndexedDB
    if (hotspotData.type === 'model' && hotspotData.model instanceof File) {
      (async () => {
        try {
          const fileRef = hotspotData.model;
          const storageKey = hotspotData.modelStorageKey || `model_hotspot_${hotspotData.id}`;
          const saved = await this.saveModelToIDB(storageKey, fileRef);
          if (saved) {
            hotspotData.modelStorageKey = storageKey;
            hotspotData.modelFileName = fileRef.name || null;
            // Create blob URL for immediate display
            const blobURL = URL.createObjectURL(fileRef);
            hotspotData.model = blobURL;
            // Update scene hotspot reference too
            const sceneHs = this.scenes[this.currentScene].hotspots.find(
              (h) => h.id === hotspotData.id
            );
            if (sceneHs) {
              sceneHs.modelStorageKey = storageKey;
              sceneHs.modelFileName = fileRef.name || null;
              sceneHs.model = blobURL;
            }
            // Update existing entity's model src
            const el = document.getElementById(`hotspot-${hotspotData.id}`);
            const modelEnt = el?.querySelector('.static-model-hotspot');
            if (modelEnt) modelEnt.setAttribute('gltf-model', blobURL);
            this.saveScenesData();
          }
        } catch (err) {
          console.warn('[ModelHotspot] Failed to save model to IndexedDB', err);
        }
      })();
    }
    this.showHotspotPlacementFeedback(hotspotData);

    // Clear text/audio fields but keep hotspot type + navigation target for rapid placement
    document.getElementById('hotspot-text').value = '';
    document.getElementById('hotspot-audio').value = '';
    document.getElementById('hotspot-audio-url').value = '';
    const imageFileEl = document.getElementById('hotspot-image-file');
    if (imageFileEl) imageFileEl.value = '';
    const imageUrlEl = document.getElementById('hotspot-image-url');
    if (imageUrlEl) imageUrlEl.value = '';
    const videoFileEl = document.getElementById('hotspot-video-file');
    if (videoFileEl) videoFileEl.value = '';
    const videoUrlEl = document.getElementById('hotspot-video-url');
    if (videoUrlEl) videoUrlEl.value = '';
    const photoRadio = document.getElementById('hotspot-media-kind-photo');
    if (photoRadio) photoRadio.checked = true;
    const videoLoopEl = document.getElementById('hotspot-video-loop');
    if (videoLoopEl) videoLoopEl.checked = true;
    const videoAudioEl = document.getElementById('hotspot-video-enable-audio');
    if (videoAudioEl) videoAudioEl.checked = false;
    const imageScaleEl = document.getElementById('hotspot-image-scale');
    if (imageScaleEl) imageScaleEl.value = '5';
    const modelFileEl = document.getElementById('hotspot-model-file');
    if (modelFileEl) modelFileEl.value = '';
    const modelUrlEl = document.getElementById('hotspot-model-url');
    if (modelUrlEl) modelUrlEl.value = '';
    const modelScaleEl = document.getElementById('hotspot-model-scale');
    if (modelScaleEl) modelScaleEl.value = '1';
    const modelRotationEl = document.getElementById('hotspot-model-rotation');
    if (modelRotationEl) modelRotationEl.value = '0';
    const modelPosYEl = document.getElementById('hotspot-model-position-y');
    if (modelPosYEl) modelPosYEl.value = '0';
  }

  validateHotspotData() {
    const type = this.selectedHotspotType;
    const textContent = document.getElementById('hotspot-text').value.trim();
    const audioFile = document.getElementById('hotspot-audio').files[0];
    const audioUrl = document.getElementById('hotspot-audio-url').value.trim();
    const navigationTarget = document.getElementById('navigation-target').value;
    const weblinkUrl = (document.getElementById('weblink-url')?.value || '').trim();
    const weblinkTitle = (document.getElementById('weblink-title')?.value || '').trim();
    const weblinkImgFile = document.getElementById('weblink-image-file')?.files?.[0];
    const weblinkImgUrl = (document.getElementById('weblink-image-url')?.value || '').trim();
    const imageFileInput = document.getElementById('hotspot-image-file');
    const imageUrlInput = document.getElementById('hotspot-image-url');
    const imageFile = imageFileInput ? imageFileInput.files[0] : null;
    const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
    const videoFileInput = document.getElementById('hotspot-video-file');
    const videoUrlInput = document.getElementById('hotspot-video-url');
    const videoFile = videoFileInput ? videoFileInput.files[0] : null;
    const videoUrl = videoUrlInput ? videoUrlInput.value.trim() : '';

    switch (type) {
      case 'text':
        if (!textContent) {
          return {
            valid: false,
            message: 'Text popup type requires text content to be filled.',
          };
        }
        break;

      case 'audio':
        if (!audioFile && !audioUrl) {
          return {
            valid: false,
            message: 'Audio only type requires an audio file or audio URL to be provided.',
          };
        }
        break;

      case 'text-audio':
        if (!textContent || (!audioFile && !audioUrl)) {
          return {
            valid: false,
            message: 'Text + Audio type requires both text content and audio (file or URL).',
          };
        }
        break;

      case 'navigation':
        if (!navigationTarget) {
          const sceneCount = Object.keys(this.scenes || {}).length;
          return {
            valid: false,
            message:
              sceneCount <= 1
                ? 'Navigation portals need at least two scenes. Use "Add Scene" to create another scene first, then pick it as the target.'
                : 'Navigation hotspots require a target scene.',
          };
        }
        break;
      case 'weblink':
        if (!weblinkUrl || !/^https?:\/\//i.test(weblinkUrl)) {
          return {
            valid: false,
            message: 'Weblink portal requires a valid URL starting with http:// or https://.',
          };
        }
        break;
      case 'image':
        if (this.getImageMediaKind() === 'video') {
          if (!videoFile && !videoUrl) {
            return {
              valid: false,
              message: 'Video hotspot requires a video file or video URL.',
            };
          }
        } else if (!imageFile && !imageUrl) {
          return {
            valid: false,
            message: 'Image hotspot requires an image file or image URL.',
          };
        }
        break;
      case 'model': {
        const modelFile = document.getElementById('hotspot-model-file').files[0];
        const modelUrl = (document.getElementById('hotspot-model-url')?.value || '').trim();
        if (!modelFile && !modelUrl) {
          return {
            valid: false,
            message: '3D Model hotspot requires a GLB/GLTF file or URL.',
          };
        }
        break;
      }
    }

    return { valid: true };
  }

  getSelectedAudioFile() {
    const audioFile = document.getElementById('hotspot-audio').files[0];
    const audioUrl = document.getElementById('hotspot-audio-url').value.trim();

    if (audioUrl) {
      return audioUrl; // Return URL string for online audio
    }
    return audioFile ? audioFile : null; // Return file object for uploaded audio
  }

  createHotspotElement(data) {
    const container = document.getElementById('hotspot-container');
    // Track whether this image hotspot should lazy-load its blob from IndexedDB after element creation
    let _imageHasStorageKey = false;
    // Candidate key to use when loading image blobs from IndexedDB (supports legacy key naming)
    let _imageLoadKey = null;
    let _videoHasStorageKey = false;
    let _videoLoadKey = null;
    let hotspotEl;
    if (data.type === 'navigation' || data.type === 'weblink') {
      // Parent container
      hotspotEl = document.createElement('a-entity');
      hotspotEl.setAttribute('face-camera', '');

      // Transparent circle collider to capture pointer inside the circle
      const collider = document.createElement('a-entity');
      // Use customizable ring size
      const navStyles = (this.customStyles && this.customStyles.navigation) || {};
      const ringOuter =
        typeof navStyles.ringOuterRadius === 'number' ? navStyles.ringOuterRadius : 0.6;
      const ringThickness =
        typeof navStyles.ringThickness === 'number' ? navStyles.ringThickness : 0.02;
      const ringInner = Math.max(0.001, ringOuter - ringThickness);
      const ringColor =
        data.type === 'weblink'
          ? navStyles.weblinkRingColor || '#001f5b'
          : navStyles.ringColor || 'rgb(0, 85, 0)';
      collider.setAttribute('geometry', `primitive: circle; radius: ${ringOuter}`);
      // Prevent invisible collider from occluding preview via depth writes
      collider.setAttribute(
        'material',
        'opacity: 0; transparent: true; depthWrite: false; side: double'
      );
      collider.classList.add('clickable');
      hotspotEl.appendChild(collider);

      // Visible green border ring (approx. 3px) with transparent center
      const ring = document.createElement('a-entity');
      ring.setAttribute(
        'geometry',
        `primitive: ring; radiusInner: ${ringInner}; radiusOuter: ${ringOuter}`
      );
      // Double-sided to ensure visibility regardless of facing, flat shader for crisp edges
      ring.setAttribute(
        'material',
        `color: ${ringColor}; opacity: 1; transparent: true; shader: flat; side: double`
      );
      // Nudge closer to the camera so it renders in front of nearby UI
      ring.setAttribute('position', '0 0 0.2');
      ring.classList.add('nav-ring');
      hotspotEl.appendChild(ring);

      // Inline preview circle (hidden by default), shows destination scene image (or weblink preview image) inside the ring
      const preview = document.createElement('a-entity');
      preview.setAttribute('geometry', `primitive: circle; radius: ${ringInner}`);
      preview.setAttribute(
        'material',
        'transparent: true; opacity: 1; shader: flat; side: double; alphaTest: 0.01; npot: true'
      );
      preview.setAttribute('visible', 'false');
      // Keep preview just behind the ring but still well in front of other UI
      preview.setAttribute('position', '0 0 0.14');
      preview.setAttribute('scale', '0.01 0.01 0.01');
      preview.classList.add('nav-preview-circle');
      hotspotEl.appendChild(preview);

      // If this is a weblink with a configured preview, set the texture immediately so the image object exists from the start
      if (data.type === 'weblink') {
        try {
          let src = null;
          if (data.weblinkPreview instanceof File) {
            try {
              src = URL.createObjectURL(data.weblinkPreview);
            } catch (_) {}
          } else if (typeof data.weblinkPreview === 'string' && data.weblinkPreview) {
            src = data.weblinkPreview;
          }
          if (src) {
            preview.setAttribute('material', 'src', src);
            preview.setAttribute('material', 'transparent', true);
            preview.setAttribute('material', 'opacity', 1);
            preview.setAttribute('material', 'shader', 'flat');
            preview.setAttribute('material', 'side', 'double');
            preview.setAttribute('material', 'alphaTest', 0.01);
          }
        } catch (err) {
          console.warn('[Weblink][Create] failed to set preview', err);
        }
      }

      // Hover title label above the ring
      const labelGroup = document.createElement('a-entity');
      labelGroup.setAttribute('visible', 'false');
      labelGroup.classList.add('nav-label');
      // place above the ring using ringOuter as reference
      const labelY = ringOuter + 0.35;
      // Push the label well forward so it clearly appears in front of audio/text hotspots
      labelGroup.setAttribute('position', `0 ${labelY} 0.3`);
      const labelBg = document.createElement('a-plane');
      labelBg.setAttribute('width', '1.8');
      labelBg.setAttribute('height', '0.35');
      const lblBG = (navStyles && navStyles.labelBackgroundColor) || '#000';
      const lblOP = typeof navStyles.labelOpacity === 'number' ? navStyles.labelOpacity : 0.8;
      labelBg.setAttribute(
        'material',
        `shader:flat; color: ${lblBG}; opacity: ${lblOP}; transparent: true`
      );
      labelBg.setAttribute('position', '0 0 0');
      const labelText = document.createElement('a-text');
      labelText.setAttribute('value', '');
      labelText.setAttribute('align', 'center');
      const lblColor = (navStyles && navStyles.labelColor) || '#fff';
      labelText.setAttribute('color', lblColor);
      labelText.setAttribute('width', '5');
      labelText.setAttribute('position', '0 0 0.01');
      labelGroup.appendChild(labelBg);
      labelGroup.appendChild(labelText);
      hotspotEl.appendChild(labelGroup);
    } else {
      // For non-navigation hotspots use a transparent plane for click targeting, except image hotspots
      hotspotEl = document.createElement('a-entity');
      if (data.type !== 'image') {
        hotspotEl.setAttribute('geometry', 'primitive: plane; width: 0.7; height: 0.7');
        // Prevent the fully transparent plane from occluding portals by disabling depth writes/tests
        hotspotEl.setAttribute(
          'material',
          'opacity: 0; transparent: true; depthWrite: false; depthTest: false; side: double'
        );
        hotspotEl.classList.add('clickable');
      }
      // Always face camera for consistent UI orientation
      hotspotEl.setAttribute('face-camera', '');
    }
    hotspotEl.setAttribute('id', `hotspot-${data.id}`);
    hotspotEl.setAttribute('position', data.position);
    // Only navigation parent is clickable; others use child elements for clicks
    if (data.type === 'navigation' || data.type === 'weblink') {
      hotspotEl.setAttribute('class', 'clickable');
    }
    // Model hotspots also need clickable class for action menu
    if (data.type === 'model') {
      hotspotEl.classList.add('clickable');
    }

    // Create spot component attributes based on type
    let spotConfig = `type:${data.type}`;

    if (data.type === 'text' || data.type === 'text-audio') {
      const pw = typeof data.popupWidth === 'number' ? data.popupWidth : 4;
      const ph = typeof data.popupHeight === 'number' ? data.popupHeight : 2.5;
      spotConfig += `;popup:${data.text};popupWidth:${pw};popupHeight:${ph};popupColor:#333333`;
    }

    if (data.type === 'audio' || data.type === 'text-audio') {
      // Use custom audio URL if available, otherwise use default
      let audioSrc = data.audio || '#default-audio';

      // If it's a File object, create a blob URL for the editor
      if (data.audio && typeof data.audio === 'object' && data.audio instanceof File) {
        audioSrc = URL.createObjectURL(data.audio);
      }

      // If the audio source is a transient blob/data URL, place it into <a-assets>
      // and reference it by ID to avoid occasional blob fetch failures in A-Frame.
      if (
        typeof audioSrc === 'string' &&
        (audioSrc.startsWith('blob:') || audioSrc.startsWith('data:'))
      ) {
        try {
          const assets =
            document.querySelector('a-assets') ||
            (function () {
              const scn =
                document.querySelector('a-scene') || document.querySelector('scene, a-scene');
              const a = document.createElement('a-assets');
              if (scn) scn.insertBefore(a, scn.firstChild);
              return a;
            })();
          const assetId = `audio_hs_${data.id}`;
          let assetEl = assets.querySelector(`#${assetId}`);
          if (!assetEl) {
            assetEl = document.createElement('audio');
            assetEl.setAttribute('id', assetId);
            assetEl.setAttribute('crossorigin', 'anonymous');
            assets.appendChild(assetEl);
          }
          // Always set/update src in case the blob changed
          assetEl.setAttribute('src', audioSrc);
          // Reference via asset ID for stable loading
          audioSrc = `#${assetId}`;
        } catch (_) {
          /* non-fatal; fall back to direct blob URL */
        }
      }

      spotConfig += `;audio:${audioSrc}`;
      // Add audioLoop setting (default to true if not specified)
      const shouldLoop = data.audioLoop !== false;
      spotConfig += `;audioLoop:${shouldLoop}`;
    }

    if (data.type === 'navigation') {
      spotConfig += `;navigation:${data.navigationTarget}`;
    }
    if (data.type === 'weblink') {
      // custom schema fields will be carried via editor-spot as additional attrs for later retrieval
      const url = (data.weblinkUrl || '').replace(/;/g, encodeURIComponent(';'));
      spotConfig += `;weblink:${url}`;
      if (data.weblinkTitle)
        spotConfig += `;weblinkTitle:${(data.weblinkTitle || '').replace(
          /;/g,
          encodeURIComponent(';')
        )}`;
      if (data.weblinkPreview) {
        let psrc = data.weblinkPreview;
        if (psrc instanceof File) {
          try {
            psrc = URL.createObjectURL(psrc);
          } catch (_) {}
        }
        if (typeof psrc === 'string' && psrc.includes(';')) psrc = encodeURIComponent(psrc);
        spotConfig += `;weblinkPreview:${psrc}`;
      }
    }

    if (
      data.type === 'image' &&
      !data.mediaKind &&
      (data.video || data.videoStorageKey || data.commonAssetUrl)
    ) {
      data.mediaKind = 'video';
    }

    if (data.type === 'image' && data.mediaKind === 'video') {
      let videoSrc = '';
      _videoLoadKey =
        data.videoStorageKey || (typeof data.id === 'number' ? `video_hotspot_${data.id}` : null);
      if (data.commonAssetUrl) {
        videoSrc = data.commonAssetUrl;
        if (!data.video) data.video = data.commonAssetUrl;
      } else if (data.video instanceof File) {
        try {
          videoSrc = URL.createObjectURL(data.video);
          data.videoStorageKey =
            data.videoStorageKey || (typeof data.id === 'number' ? `video_hotspot_${data.id}` : null);
          data.videoFileName = data.videoFileName || data.video.name || null;
          data.video = videoSrc;
          const preload = document.createElement('video');
          preload.muted = true;
          preload.playsInline = true;
          preload.onloadedmetadata = () => {
            const nW = preload.videoWidth || 0;
            const nH = preload.videoHeight || 0;
            const ar = nW > 0 && nH > 0 ? nH / nW : 0;
            if (ar && isFinite(ar) && ar > 0) {
              data.imageAspectRatio = ar;
              this._persistImageAspectRatio(data.id, ar);
            }
          };
          preload.src = videoSrc;
        } catch (e) {
          console.warn('[VideoHotspot] Failed to create object URL', e);
        }
      } else if (typeof data.video === 'string' && data.video && !data.video.startsWith('FILE:')) {
        videoSrc = data.video;
      }
      _videoHasStorageKey = !!_videoLoadKey && !videoSrc;
      const scale = typeof data.imageScale === 'number' ? data.imageScale : 1;
      const ar =
        typeof data.imageAspectRatio === 'number' &&
        isFinite(data.imageAspectRatio) &&
        data.imageAspectRatio > 0
          ? data.imageAspectRatio
          : 0;
      const videoLoop = data.videoLoop !== false;
      const videoMuted = data.videoMuted !== false;
      const assetId = `asset-video-hotspot-${data.id}`;
      if (videoSrc) {
        this.registerHotspotVideoAsset(assetId, videoSrc, {
          muted: videoMuted,
          loop: videoLoop,
        });
        spotConfig +=
          `;mediaKind:video;videoSrc:#${assetId};imageScale:${scale};videoLoop:${videoLoop};videoMuted:${videoMuted}` +
          (ar ? `;imageAspectRatio:${ar}` : '');
      } else {
        spotConfig +=
          `;mediaKind:video;imageScale:${scale};videoLoop:${videoLoop};videoMuted:${videoMuted}` +
          (ar ? `;imageAspectRatio:${ar}` : '');
      }
    } else if (data.type === 'image') {
      let imgSrc = '';
      // If we have an image stored in IDB (from a previous session), resolve it lazily
      // Prefer explicit key, but fall back to legacy pattern image_hotspot_<id>
      _imageLoadKey =
        data.imageStorageKey || (typeof data.id === 'number' ? `image_hotspot_${data.id}` : null);
      if (data.commonAssetUrl) {
        const proxy = this.buildCommonAssetProxyPath(data);
        imgSrc = proxy ? this.toAbsoluteMediaUrl(proxy) : data.commonAssetUrl;
        if (!data.image) data.image = imgSrc;
      } else if (data.image instanceof File) {
        try {
          imgSrc = URL.createObjectURL(data.image);
          console.log('[ImageHotspot] Created object URL for file', data.image.name, imgSrc);
          // Preload to compute aspect ratio ASAP, so init can use it
          try {
            const preload = new Image();
            preload.onload = () => {
              const nW = preload.naturalWidth || 0;
              const nH = preload.naturalHeight || 0;
              const ar = nW > 0 && nH > 0 ? nH / nW : 0;
              console.log(
                `[ImageHotspot][Preload] id=${data.id} file=${data.image.name} natural=${nW}x${nH} ar=${ar}`
              );
              if (ar && isFinite(ar) && ar > 0) {
                data.imageAspectRatio = ar; // seed for component init
                this._persistImageAspectRatio(data.id, ar);
                // If entity already exists, enforce immediately
                const el = document.getElementById(`hotspot-${data.id}`);
                const imgEl = el?.querySelector('.static-image-hotspot');
                const scl = typeof data.imageScale === 'number' ? data.imageScale : 1;
                if (imgEl) {
                  imgEl.dataset.aspectRatio = String(ar);
                  imgEl.setAttribute('width', 1);
                  imgEl.setAttribute('height', ar);
                  imgEl.setAttribute('position', `0 ${(ar / 2) * scl} 0.05`);
                  console.log(
                    `[ImageHotspot][Preload-Apply] id=hotspot-${data.id} -> w=1 h=${ar} y=${
                      (ar / 2) * scl
                    }`
                  );
                }
              }
            };
            preload.onerror = () =>
              console.warn(
                '[ImageHotspot][Preload] failed to read image size for',
                data.image.name
              );
            preload.src = imgSrc;
          } catch (e) {
            console.warn('[ImageHotspot][Preload] exception', e);
          }
        } catch (e) {
          console.warn(
            '[ImageHotspot] Failed to create object URL, attempting FileReader fallback',
            e
          );
          try {
            const fr = new FileReader();
            fr.onload = () => {
              const el = document.getElementById(`hotspot-${data.id}`);
              if (el) {
                const imgEnt = el.querySelector('.static-image-hotspot');
                if (imgEnt) imgEnt.setAttribute('src', fr.result);
              }
            };
            fr.readAsDataURL(data.image);
          } catch (frErr) {
            console.error('[ImageHotspot] Fallback FileReader failed', frErr);
          }
        }
      } else if (typeof data.image === 'string' && data.image.trim()) {
        imgSrc = data.image;
      }
      // Defer to IDB only when there is no usable image source yet (reload / stripped blob)
      _imageHasStorageKey =
        !!_imageLoadKey && !(data.image instanceof File) && !data.commonAssetUrl && !imgSrc;
      if (_imageHasStorageKey) {
        imgSrc =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
      }
      const scale = typeof data.imageScale === 'number' ? data.imageScale : 1;
      const encodedImgSrc = imgSrc && imgSrc.includes(';') ? encodeURIComponent(imgSrc) : imgSrc;
      const ar =
        typeof data.imageAspectRatio === 'number' &&
        isFinite(data.imageAspectRatio) &&
        data.imageAspectRatio > 0
          ? data.imageAspectRatio
          : typeof data._aspectRatio === 'number' &&
            isFinite(data._aspectRatio) &&
            data._aspectRatio > 0
          ? data._aspectRatio
          : 0;
      spotConfig +=
        `;imageSrc:${encodedImgSrc};imageScale:${scale}` + (ar ? `;imageAspectRatio:${ar}` : '');
      try {
        console.log(
          `[ImageHotspot][Create] id=${data.id} scale=${scale} ar=${ar} src=${encodedImgSrc?.slice(
            0,
            64
          )}`
        );
      } catch (_) {}
      // Schedule integrity check & fallback to data URL if texture fails to materialize
      const fileForFallback =
        data._imageFileForIDB instanceof File
          ? data._imageFileForIDB
          : data.image instanceof File
          ? data.image
          : null;
      if (fileForFallback) {
        const scheduleFallback = (delay) => {
          setTimeout(() => {
            const el = document.getElementById(`hotspot-${data.id}`);
            if (!el) return;
            const imgEnt = el.querySelector('.static-image-hotspot');
            if (!imgEnt) return;
            let needsFallback = false;
            try {
              const mesh = imgEnt.getObject3D('mesh');
              const texImg = mesh && mesh.material && mesh.material.map && mesh.material.map.image;
              if (!texImg || !texImg.naturalWidth) needsFallback = true;
            } catch (err) {
              needsFallback = true;
            }
            if (needsFallback) {
              console.log(
                '[ImageHotspot] Fallback triggered; converting file to data URL for',
                fileForFallback.name
              );
              const fr2 = new FileReader();
              fr2.onload = () => {
                // only replace if still same id and still not loaded
                const el2 = document.getElementById(`hotspot-${data.id}`);
                const imgEnt2 = el2?.querySelector('.static-image-hotspot');
                if (imgEnt2) imgEnt2.setAttribute('src', fr2.result);
              };
              try {
                fr2.readAsDataURL(fileForFallback);
              } catch (_) {}
            } else {
              // Texture fine
              // Optionally revoke object URL later (not revoking to allow editing reuse)
            }
          }, delay);
        };
        scheduleFallback(800);
        scheduleFallback(2000);
      }
    }

    if (data.type === 'model') {
      let modelSrc = '';
      let _modelLoadKey = null;
      let _modelHasStorageKey = false;
      // If we have a model stored in IDB (from a previous session), resolve it lazily
      _modelLoadKey =
        data.modelStorageKey || (typeof data.id === 'number' ? `model_hotspot_${data.id}` : null);
      _modelHasStorageKey =
        !!_modelLoadKey &&
        (!data.model || typeof data.model !== 'string' || data.model.startsWith('blob:'));
      if (data.model instanceof File) {
        try {
          modelSrc = URL.createObjectURL(data.model);
          console.log('[ModelHotspot] Created object URL for file', data.model.name, modelSrc);
        } catch (e) {
          console.warn('[ModelHotspot] Failed to create object URL', e);
        }
      } else if (typeof data.model === 'string') modelSrc = data.model;
      const scale = typeof data.modelScale === 'number' ? data.modelScale : 1;
      const rotationX = typeof data.modelRotationX === 'number' ? data.modelRotationX : 0;
      const rotationY = typeof data.modelRotationY === 'number' ? data.modelRotationY : 0;
      const rotationZ = typeof data.modelRotationZ === 'number' ? data.modelRotationZ : 0;
      const posY = typeof data.modelPositionY === 'number' ? data.modelPositionY : 0;
      const encodedModelSrc =
        modelSrc && modelSrc.includes(';') ? encodeURIComponent(modelSrc) : modelSrc;
      spotConfig += `;modelSrc:${encodedModelSrc};modelScale:${scale};modelRotationX:${rotationX};modelRotationY:${rotationY};modelRotationZ:${rotationZ};modelPositionY:${posY}`;
      console.log(
        `[ModelHotspot][Create] id=${
          data.id
        } scale=${scale} rotation=${rotationX} ${rotationY} ${rotationZ} posY=${posY} src=${encodedModelSrc?.slice(
          0,
          64
        )}`
      );

      // After append, restore model from IndexedDB if needed
      if (_modelHasStorageKey) {
        setTimeout(() => {
          (async () => {
            try {
              const rec = await this.getModelFromIDB(_modelLoadKey);
              if (rec && rec.blob) {
                const url = URL.createObjectURL(rec.blob);
                const el = document.getElementById(`hotspot-${data.id}`);
                const modelEnt = el?.querySelector('.static-model-hotspot');
                if (modelEnt) {
                  modelEnt.setAttribute('gltf-model', url);
                  data.model = url;
                  console.log('[ModelHotspot] Restored from IndexedDB', _modelLoadKey);
                }
              }
            } catch (err) {
              console.warn('[ModelHotspot] Failed to restore from IndexedDB', err);
            }
          })();
        }, 100);
      }
    }

    hotspotEl.setAttribute('editor-spot', spotConfig);

    // In-scene edit/move buttons are attached after the entity enters the scene (see below).

    // Add navigation click handler if not in edit mode
    if (data.type === 'navigation' || data.type === 'weblink') {
      const targetEl = hotspotEl.querySelector('.clickable') || hotspotEl;
      targetEl.addEventListener('click', (e) => {
        if (!this.navigationMode) return; // Only navigate when not in edit mode
        e.stopPropagation();
        if (data.type === 'navigation') this.navigateToScene(data.navigationTarget);
        else if (data.type === 'weblink') {
          const url = data.weblinkUrl;
          if (url) {
            try {
              window.open(url, '_blank');
            } catch (_) {
              location.href = url;
            }
          }
        }
      });

      // Hover preview of destination scene INSIDE the circle
      const previewEl = hotspotEl.querySelector('.nav-preview-circle');
      targetEl.addEventListener('mouseenter', () => {
        if (previewEl) {
          let src = null;
          if (data.type === 'navigation') {
            src = this._getEditorPreviewSrc(data.navigationTarget);
          } else if (data.type === 'weblink') {
            if (data.weblinkPreview instanceof File) {
              try {
                src = URL.createObjectURL(data.weblinkPreview);
              } catch (_) {}
            } else if (typeof data.weblinkPreview === 'string' && data.weblinkPreview) {
              src = data.weblinkPreview;
            }
          }
          if (src === 'VIDEO_ICON') {
            // Try to generate a thumbnail from the destination video
            (async () => {
              const thumb = await this._ensureVideoPreview(data.navigationTarget);
              const matSrc =
                thumb ||
                'data:image/svg+xml;charset=UTF-8,' +
                  encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128"><rect rx="4" ry="4" x="2" y="6" width="14" height="12" fill="#111" stroke="#2ae" stroke-width="2"/><polygon points="16,10 22,7 22,17 16,14" fill="#2ae"/></svg>'
                  );
              previewEl.setAttribute('material', 'src', matSrc);
              previewEl.setAttribute('material', 'transparent', true);
              previewEl.setAttribute('material', 'opacity', 1);
              previewEl.setAttribute('material', 'shader', 'flat');
              previewEl.setAttribute('material', 'side', 'double');
              previewEl.setAttribute('material', 'alphaTest', 0.01);
              previewEl.setAttribute('material', 'npot', true);
              // Debug: verify texture binding shortly after
              setTimeout(() => {
                try {
                  const mesh = previewEl.getObject3D('mesh');
                  const ok = !!(
                    mesh &&
                    mesh.material &&
                    mesh.material.map &&
                    mesh.material.map.image &&
                    mesh.material.map.image.naturalWidth
                  );
                  console.log('[Preview][Check][VideoThumb]', { ok, matSrc, hasMesh: !!mesh });
                } catch (_) {}
              }, 120);
            })();
            previewEl.setAttribute('material', 'transparent', true);
            previewEl.setAttribute('material', 'opacity', 1);
            previewEl.setAttribute('material', 'shader', 'flat');
            previewEl.setAttribute('material', 'side', 'double');
            previewEl.setAttribute('material', 'alphaTest', 0.01);
            previewEl.setAttribute('material', 'npot', true);
          } else if (src) {
            console.log('[Preview][Hover][Editor]', {
              id: data.id,
              type: data.type,
              srcType: src.startsWith('data:') ? 'dataURL' : 'url',
              len: src.length,
            });
            previewEl.setAttribute('material', 'src', src);
            previewEl.setAttribute('material', 'transparent', true);
            previewEl.setAttribute('material', 'opacity', 1);
            previewEl.setAttribute('material', 'shader', 'flat');
            previewEl.setAttribute('material', 'side', 'double');
            previewEl.setAttribute('material', 'alphaTest', 0.01);
            previewEl.setAttribute('material', 'npot', true);
            // Debug: verify texture binding shortly after
            setTimeout(() => {
              try {
                const mesh = previewEl.getObject3D('mesh');
                const m = mesh && mesh.material;
                const img = m && m.map && m.map.image;
                console.log('[Preview][Check]', {
                  hasMesh: !!mesh,
                  hasMap: !!(m && m.map),
                  imgW: img && img.naturalWidth,
                  imgH: img && img.naturalHeight,
                  color: m && m.color && m.color.getHexString && m.color.getHexString(),
                  npot: m && m.npot,
                });
                // If still no map image dimensions, try to nudge material by reassigning src once
                if (!(img && img.naturalWidth)) {
                  // Create or reuse an <img> asset and point the material to it
                  const assetSel = this._ensurePreviewAsset(src, data.navigationTarget || data.id);
                  previewEl.setAttribute('material', 'src', assetSel);
                  // Re-check once more
                  setTimeout(() => {
                    try {
                      const mesh2 = previewEl.getObject3D('mesh');
                      const m2 = mesh2 && mesh2.material;
                      const img2 = m2 && m2.map && m2.map.image;
                      console.log('[Preview][Check][Asset]', {
                        ok: !!(img2 && img2.naturalWidth),
                        assetSel,
                        imgW: img2 && img2.naturalWidth,
                        imgH: img2 && img2.naturalHeight,
                      });
                    } catch (_) {}
                  }, 120);
                }
              } catch (_) {}
            }, 150);
          } else if (data.type === 'weblink') {
            // Fallback: subtle fill to indicate active portal when no preview image is provided
            previewEl.setAttribute('material', 'color', '#000');
            previewEl.setAttribute('material', 'transparent', true);
            previewEl.setAttribute('material', 'opacity', 0.15);
            previewEl.setAttribute('material', 'shader', 'flat');
            previewEl.setAttribute('material', 'side', 'double');
          }
          previewEl.setAttribute('visible', 'true');
          previewEl.removeAttribute('animation__shrink');
          previewEl.setAttribute('scale', '0.01 0.01 0.01');
          previewEl.setAttribute('animation__grow', {
            property: 'scale',
            to: '1 1 1',
            dur: 180,
            easing: 'easeOutCubic',
          });
          try {
            console.log('[Preview][MaterialAfterSet][Editor]', previewEl.getAttribute('material'));
          } catch (_) {}
        }
        // Show label title
        try {
          const label = hotspotEl.querySelector('.nav-label');
          const txt = label?.querySelector('a-text');
          if (label && txt) {
            if (data.type === 'navigation') {
              const sc = this.scenes[data.navigationTarget];
              txt.setAttribute('value', `Portal to ${sc?.name || data.navigationTarget}`);
            } else {
              const title =
                data.weblinkTitle && data.weblinkTitle.trim()
                  ? data.weblinkTitle.trim()
                  : 'Open Link';
              txt.setAttribute('value', title);
            }
            // Dynamically size the label background using a tighter char-based estimate (spaces discounted), clamped by text width
            try {
              const bg = label.querySelector('a-plane');
              const minW = 1.7; // tighter compact width
              const maxW = 10; // safety cap
              const tW = parseFloat(txt.getAttribute('width') || '0') || minW; // your chosen text width (e.g., 5)
              const val = (txt.getAttribute('value') || '').toString();
              const spaces = (val.match(/\s/g) || []).length;
              const letters = Math.max(0, val.length - spaces);
              const effChars = letters + 0.4 * spaces; // spaces count less toward width
              // Heuristic: ~0.095 world units per effective char + small padding
              const est = 0.095 * effChars + 0.25;
              const nextW = Math.min(maxW, Math.max(minW, Math.min(tW, est)));
              if (bg) bg.setAttribute('width', String(nextW));
            } catch (_) {}
            label.setAttribute('visible', 'true');
          }
        } catch (_) {}
      });
      targetEl.addEventListener('mouseleave', () => {
        if (previewEl) {
          previewEl.removeAttribute('animation__grow');
          previewEl.setAttribute('animation__shrink', {
            property: 'scale',
            to: '0.01 0.01 0.01',
            dur: 120,
            easing: 'easeInCubic',
          });
          setTimeout(() => {
            previewEl.setAttribute('visible', 'false');
          }, 130);
        }
        // Hide label title
        try {
          const label = hotspotEl.querySelector('.nav-label');
          if (label) {
            label.setAttribute('visible', 'false');
            // Reset background width back to default for next hover
            const bg = label.querySelector('a-plane');
            if (bg) bg.setAttribute('width', '1.8');
          }
        } catch (_) {}
      });
    }

    container.appendChild(hotspotEl);

    if (data.type === 'model') {
      setTimeout(() => this.ensureInSceneEditButtons(hotspotEl, data), 150);
    } else if (data.type !== 'navigation' && data.type !== 'weblink') {
      this.ensureInSceneEditButtons(hotspotEl, data);
      if (data.type === 'image' && data.mediaKind === 'video') {
        setTimeout(() => this.ensureInSceneEditButtons(hotspotEl, data), 600);
      }
    }

    if (data.type === 'image' && data.mediaKind === 'video') {
      if (_videoHasStorageKey) {
        (async () => {
          try {
            const rec = await this.getVideoFromIDB(_videoLoadKey);
            if (rec && rec.blob) {
              const url = URL.createObjectURL(rec.blob);
              const assetId = `asset-video-hotspot-${data.id}`;
              this.registerHotspotVideoAsset(assetId, url, {
                muted: data.videoMuted !== false,
                loop: data.videoLoop !== false,
              });
              data.video = url;
              const hotspotEl = document.getElementById(`hotspot-${data.id}`);
              if (hotspotEl) {
                const videoSrcAttr = `#${assetId}`;
                hotspotEl.setAttribute('editor-spot', 'videoSrc', videoSrcAttr);
                const comp = hotspotEl.components && hotspotEl.components['editor-spot'];
                if (comp) {
                  mountEditorFlatVideoBillboard(
                    comp,
                    Object.assign({}, comp.data, {
                      mediaKind: 'video',
                      videoSrc: videoSrcAttr,
                      videoLoop: data.videoLoop !== false,
                      videoMuted: data.videoMuted !== false,
                      imageScale: data.imageScale,
                      imageAspectRatio: data.imageAspectRatio,
                    }),
                    true
                  );
                  this.ensureInSceneEditButtons(hotspotEl, data);
                }
              }
              if (!data.videoStorageKey) {
                data.videoStorageKey = _videoLoadKey;
                const scHs = (
                  (this.scenes[this.currentScene] && this.scenes[this.currentScene].hotspots) ||
                  []
                ).find((h) => h && h.id === data.id);
                if (scHs && !scHs.videoStorageKey) scHs.videoStorageKey = _videoLoadKey;
                this.saveScenesData();
              }
            }
          } catch (_) {}
        })();
      }
    } else if (data.type === 'image') {
      // If we need to resolve an image from IDB, do it after entity creation
      if (_imageHasStorageKey) {
        (async () => {
          try {
            const rec = await this.getImageFromIDB(_imageLoadKey);
            if (rec && rec.blob) {
              const url = URL.createObjectURL(rec.blob);
              const imgEnt = hotspotEl.querySelector('.static-image-hotspot');
              if (imgEnt) {
                setAImageHotspotSrc(imgEnt, url);
                // mark into data so subsequent saves can strip the blob (storageKey persisted separately)
                data.image = url;
                // If rounded corners are enabled, re-apply mask now that real image is in place
                try {
                  const istyleNow = this.customStyles && this.customStyles.image;
                  if (istyleNow && istyleNow.borderRadius && istyleNow.borderRadius > 0) {
                    applyRoundedMaskToAImage(imgEnt, istyleNow, true);
                  }
                } catch (_) {}
                // Re-evaluate aspect ratio based on the real texture once it binds
                const applyRealAR = () => {
                  try {
                    const mesh = imgEnt.getObject3D('mesh');
                    const texImg =
                      mesh && mesh.material && mesh.material.map && mesh.material.map.image;
                    const nW = (texImg && (texImg.naturalWidth || texImg.width)) || 0;
                    const nH = (texImg && (texImg.naturalHeight || texImg.height)) || 0;
                    const ratio = nW > 0 && nH > 0 ? nH / nW : 0;
                    if (ratio && isFinite(ratio) && ratio > 0) {
                      imgEnt.dataset.aspectRatio = String(ratio);
                      const scl = typeof data.imageScale === 'number' ? data.imageScale : 1;
                      imgEnt.setAttribute('width', 1);
                      imgEnt.setAttribute('height', ratio);
                      imgEnt.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
                      // Adjust border frame if present
                      const frame = hotspotEl.querySelector('.static-image-border');
                      if (frame) {
                        const bw =
                          (this.customStyles &&
                            this.customStyles.image &&
                            this.customStyles.image.borderWidth) ||
                          0;
                        frame.setAttribute('width', 1 * scl + bw * 2);
                        frame.setAttribute('height', ratio * scl + bw * 2);
                        frame.setAttribute('position', `0 ${(ratio / 2) * scl} 0.0`);
                      }
                      // Persist to model
                      try {
                        if (window.hotspotEditor) {
                          window.hotspotEditor._persistImageAspectRatio(data.id, ratio);
                          window.hotspotEditor.ensureInSceneEditButtons(hotspotEl, data);
                        }
                      } catch (_) {}
                      return true;
                    }
                  } catch (_) {}
                  return false;
                };
                // Listen for texture ready and also poll shortly after
                const onTexReady = () => {
                  applyRealAR();
                };
                imgEnt.addEventListener('materialtextureloaded', onTexReady, { once: true });
                setTimeout(applyRealAR, 150);
                setTimeout(applyRealAR, 500);
                // If we loaded using a legacy-derived key, persist it onto the data model for future sessions
                if (!_imageLoadKey || !data) {
                  /* no-op */
                } else {
                  if (!data.imageStorageKey) {
                    data.imageStorageKey = _imageLoadKey;
                    try {
                      // Update the saved scene hotspot as well
                      const scHs = (
                        (this.scenes[this.currentScene] &&
                          this.scenes[this.currentScene].hotspots) ||
                        []
                      ).find((h) => h && h.id === data.id);
                      if (scHs && !scHs.imageStorageKey) scHs.imageStorageKey = _imageLoadKey;
                      this.saveScenesData();
                    } catch (_) {}
                  }
                }
              }
            }
          } catch (_) {
            /* ignore */
          }
        })();
      }
      // After entity is created, hook into the a-image to persist AR to model once known
      setTimeout(() => {
        try {
          const imgEnt = hotspotEl.querySelector('.static-image-hotspot');
          if (!imgEnt) return;
          const id = data.id;
          const persist = (ratio) => {
            if (window.hotspotEditor) window.hotspotEditor._persistImageAspectRatio(id, ratio);
          };
          // If dataset already has AR, persist immediately
          const dAR = parseFloat(imgEnt.dataset.aspectRatio || '');
          if (dAR && isFinite(dAR) && dAR > 0) persist(dAR);
          imgEnt.addEventListener(
            'load',
            () => {
              const ar =
                imgEnt.naturalHeight && imgEnt.naturalWidth
                  ? imgEnt.naturalHeight / imgEnt.naturalWidth
                  : parseFloat(imgEnt.getAttribute('height')) || 1;
              if (ar && isFinite(ar) && ar > 0) {
                imgEnt.dataset.aspectRatio = String(ar);
                persist(ar);
              }
            },
            { once: true }
          );
        } catch (_) {}
      }, 100);
    }
  }

  ensureInSceneEditButtons(hotspotEl, data) {
    if (!hotspotEl) return;
    const idStr = hotspotEl.id || '';
    const parsedId = idStr.startsWith('hotspot-') ? parseInt(idStr.slice(8), 10) : NaN;
    let hotspotData = Number.isFinite(parsedId)
      ? this.hotspots.find((h) => h.id === parsedId)
      : null;
    if (!hotspotData && data) {
      hotspotData = { ...data, id: data.id ?? parsedId };
    }
    if (!hotspotData && Number.isFinite(parsedId)) {
      hotspotData = { id: parsedId, type: data?.type || 'image', mediaKind: data?.mediaKind || 'photo' };
    }
    if (!hotspotData) return;
    if (!hotspotEl.inSceneButtonContainer) {
      this.addInSceneEditButton(hotspotEl, hotspotData);
    }
    this._bindInSceneRevealOnMedia(hotspotEl);
    this._refreshInSceneEditButtonMaterials(hotspotEl);
    this._bringInSceneEditButtonsToFront(hotspotEl);
    if (hotspotEl._repositionEditButtons) hotspotEl._repositionEditButtons();
    if (hotspotEl.updateEditButtonVisibility) hotspotEl.updateEditButtonVisibility();
    if (hotspotData.type === 'image') {
      setTimeout(() => {
        // The media element is created asynchronously by the editor-spot component,
        // so re-attempt binding the reveal click here once it exists.
        this._bindInSceneRevealOnMedia(hotspotEl);
        if (hotspotEl._repositionEditButtons) hotspotEl._repositionEditButtons();
        this._bringInSceneEditButtonsToFront(hotspotEl);
        this._refreshInSceneEditButtonMaterials(hotspotEl);
      }, 120);
      setTimeout(() => {
        this._bindInSceneRevealOnMedia(hotspotEl);
        if (hotspotEl._repositionEditButtons) hotspotEl._repositionEditButtons();
        this._bringInSceneEditButtonsToFront(hotspotEl);
      }, 600);
    }
  }

  _refreshInSceneEditButtonMaterials(hotspotEl) {
    const container = hotspotEl?.inSceneButtonContainer;
    if (!container) return;
    // Adjust material properties directly on the mesh so we don't wipe the manually
    // bound icon texture (setAttribute('material', ...) would reset material.map).
    container.querySelectorAll('.in-scene-edit-btn, .in-scene-move-btn').forEach((btn) => {
      const mesh = btn.getObject3D('mesh');
      if (mesh && mesh.material) {
        const mat = mesh.material;
        mat.transparent = true;
        mat.depthTest = false;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        if (!mat.map) {
          const uri = btn.classList.contains('in-scene-edit-btn')
            ? this._getEditButtonDataURI()
            : this._getMoveButtonDataURI();
          this._bindButtonIcon(btn, uri);
        }
      }
    });
  }

  finalizeImageHotspotUI(hotspotEl, data) {
    this.ensureInSceneEditButtons(hotspotEl, data);
  }

  _bringInSceneEditButtonsToFront(hotspotEl) {
    const container = hotspotEl?.inSceneButtonContainer;
    if (container && container.parentNode === hotspotEl) {
      hotspotEl.appendChild(container);
    }
  }

  _computeImageHotspotEditButtonY(hotspotEl, data) {
    const media =
      hotspotEl.querySelector('.static-image-hotspot') ||
      hotspotEl.querySelector('.static-video-hotspot');
    let scl = typeof data?.imageScale === 'number' ? data.imageScale : 1;
    let bottomY = -0.25 * scl;
    if (media) {
      const pos = media.getAttribute('position');
      const posStr =
        typeof pos === 'string' ? pos : pos && typeof pos === 'object' ? `${pos.x} ${pos.y} ${pos.z}` : '0 0 0';
      const mediaH = parseFloat(media.getAttribute('height') || '1');
      const posParts = posStr.trim().split(/\s+/);
      const centerY = parseFloat(posParts[1] || '0');
      const scaleAttr = media.getAttribute('scale');
      if (scaleAttr) {
        const scaleParts =
          typeof scaleAttr === 'object'
            ? [scaleAttr.x, scaleAttr.y, scaleAttr.z]
            : String(scaleAttr).trim().split(/\s+/);
        const sx = parseFloat(scaleParts[0] || '1');
        if (Number.isFinite(sx) && sx > 0) scl = sx;
      }
      if (Number.isFinite(mediaH) && Number.isFinite(centerY)) {
        bottomY = centerY - (mediaH * scl) / 2;
      }
    }
    const hasPlayControl = !!hotspotEl.querySelector('.video-play-control');
    if (hasPlayControl) {
      const playControlY = -0.35;
      return Math.min(bottomY - 0.12, playControlY - 0.28);
    }
    const y = bottomY - 0.15;
    return Number.isFinite(y) ? y : -0.45;
  }

  // Build a self-contained icon button mesh (own PlaneGeometry + MeshBasicMaterial).
  // We intentionally avoid <a-image> here: A-Frame caches/refcounts plane geometries
  // by size, and the shared 0.28x0.28 plane used by every edit/move button was being
  // disposed during load churn, leaving ALL buttons with an empty geometry (nothing to
  // draw). Owning the geometry/material outright makes the buttons render reliably.
  _createIconButtonMesh(size, dataURI) {
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.01,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.needsUpdate = true;
    };
    img.src = dataURI;
    return mesh;
  }

  _attachIconButtonMesh(entity, mesh) {
    if (!entity || !mesh) return;
    const set = () => entity.setObject3D('mesh', mesh);
    if (entity.hasLoaded) set();
    else entity.addEventListener('loaded', set, { once: true });
  }

  // Dark, self-owned backdrop plane that keeps the hint text legible over any image.
  _createHintBackgroundMesh(width, height) {
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    return mesh;
  }

  // The hint is the inverse of the buttons: it shows (in edit mode) while the buttons
  // are hidden, and disappears once the user reveals the Edit/Move buttons.
  _syncInSceneHint(hotspotEl) {
    const hint = hotspotEl && hotspotEl.inSceneHintEl;
    if (!hint) return;
    const show = !this.navigationMode && this._activeInSceneHotspotEl !== hotspotEl;
    hint.setAttribute('visible', show ? 'true' : 'false');
    if (hint.object3D) hint.object3D.visible = show;
  }

  // Legacy helper kept as a fallback for any a-image based buttons.
  _bindButtonIcon(el, dataURI) {
    if (!el || !dataURI) return;
    const img = new Image();
    img.onload = () => {
      const apply = () => {
        const mesh = el.getObject3D('mesh');
        if (!mesh || !mesh.material) return false;
        const tex = new THREE.Texture(img);
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const mat = mesh.material;
        mat.map = tex;
        mat.transparent = true;
        mat.alphaTest = 0.01;
        mat.depthTest = false;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        if (mat.color) mat.color.set('#ffffff');
        mat.needsUpdate = true;
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        return true;
      };
      if (!apply()) {
        el.addEventListener('object3dset', apply, { once: true });
      }
      // Rebind if A-Frame later recreates the mesh (e.g. geometry/material refresh).
      el.addEventListener('object3dset', apply);
    };
    img.src = dataURI;
  }

  _setInSceneButtonsVisible(hotspotEl, show) {
    const container = hotspotEl && hotspotEl.inSceneButtonContainer;
    if (!container) return;
    container.setAttribute('visible', show ? 'true' : 'false');
    if (container.object3D) container.object3D.visible = !!show;
  }

  // Click-to-reveal: only one hotspot shows its edit/move buttons at a time.
  revealInSceneButtons(hotspotEl) {
    if (!hotspotEl || this.navigationMode) return;
    const prev = this._activeInSceneHotspotEl;
    if (prev && prev !== hotspotEl) {
      this._setInSceneButtonsVisible(prev, false);
    }
    this._activeInSceneHotspotEl = hotspotEl;
    this._setInSceneButtonsVisible(hotspotEl, true);
    if (prev && prev !== hotspotEl) this._syncInSceneHint(prev);
    this._syncInSceneHint(hotspotEl);
    if (hotspotEl._repositionEditButtons) hotspotEl._repositionEditButtons();
    this._bringInSceneEditButtonsToFront(hotspotEl);
    this._refreshInSceneEditButtonMaterials(hotspotEl);
  }

  hideInSceneButtons(hotspotEl) {
    if (!hotspotEl) return;
    this._setInSceneButtonsVisible(hotspotEl, false);
    if (this._activeInSceneHotspotEl === hotspotEl) this._activeInSceneHotspotEl = null;
    this._syncInSceneHint(hotspotEl);
  }

  toggleInSceneButtons(hotspotEl) {
    if (!hotspotEl) return;
    if (this._activeInSceneHotspotEl === hotspotEl) {
      this.hideInSceneButtons(hotspotEl);
    } else {
      this.revealInSceneButtons(hotspotEl);
    }
  }

  // Bind a click handler on the hotspot's media so clicking the photo/video toggles
  // its edit/move buttons. Idempotent and safe to call repeatedly (e.g. after the
  // flat-video billboard is remounted, which replaces the media element).
  _bindInSceneRevealOnMedia(hotspotEl) {
    if (!hotspotEl) return;
    const media =
      hotspotEl.querySelector('.static-image-hotspot') ||
      hotspotEl.querySelector('.static-video-hotspot');
    if (!media || media._inSceneRevealBound) return;
    media._inSceneRevealBound = true;
    media.classList.add('clickable');
    media.addEventListener('click', (e) => {
      if (this.navigationMode) return;
      if (e) e.stopPropagation();
      this.toggleInSceneButtons(hotspotEl);
    });
  }

  addInSceneEditButton(hotspotEl, data) {
    if (data && data.type === 'model') {
      this._setupModelHotspotActions(hotspotEl, data);
      return;
    }
    if (hotspotEl.inSceneButtonContainer) {
      this._bringInSceneEditButtonsToFront(hotspotEl);
      if (hotspotEl._repositionEditButtons) hotspotEl._repositionEditButtons();
      this._refreshInSceneEditButtonMaterials(hotspotEl);
      return;
    }

    // Create container for both buttons (parent hotspot already uses face-camera)
    const buttonContainer = document.createElement('a-entity');
    buttonContainer.setAttribute('class', 'in-scene-edit-controls');
    buttonContainer.setAttribute('position', '0 -0.45 0.45');
    const buttonPlaneMaterial =
      'shader: flat; transparent: true; depthTest: false; depthWrite: false; side: double';

    // EDIT BUTTON — a-entity with a self-owned mesh (see _createIconButtonMesh).
    const editButton = document.createElement('a-entity');
    editButton.setAttribute('class', 'in-scene-edit-btn clickable');
    editButton.setAttribute('position', '-0.15 0 0.01');
    editButton.setAttribute('visible', 'true');

    // MOVE BUTTON
    const moveButton = document.createElement('a-entity');
    moveButton.setAttribute('class', 'in-scene-move-btn clickable');
    moveButton.setAttribute('position', '0.15 0 0.01');
    moveButton.setAttribute('visible', 'true');

    // Add buttons to container
    buttonContainer.appendChild(editButton);
    buttonContainer.appendChild(moveButton);
    hotspotEl.appendChild(buttonContainer);

    // Give each button its own geometry+material+texture so it always renders.
    this._attachIconButtonMesh(editButton, this._createIconButtonMesh(0.28, this._getEditButtonDataURI()));
    this._attachIconButtonMesh(moveButton, this._createIconButtonMesh(0.28, this._getMoveButtonDataURI()));

    // EDIT BUTTON EVENTS
    editButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    }, true);
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('🔧 Edit button clicked for hotspot:', data.id);
      this.showEditHotspotDialog(data.id);
    });

    editButton.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      editButton.setAttribute('animation__scale', {
        property: 'scale',
        to: '1.3 1.3 1.3',
        dur: 150,
        easing: 'easeOutQuad',
      });
    });

    editButton.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      editButton.setAttribute('animation__scale', {
        property: 'scale',
        to: '1 1 1',
        dur: 150,
        easing: 'easeOutQuad',
      });
    });

    // MOVE BUTTON EVENTS
    moveButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);
    moveButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      setTimeout(() => this.startReposition(data.id), 0);
    });

    moveButton.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      moveButton.setAttribute('animation__scale', {
        property: 'scale',
        to: '1.3 1.3 1.3',
        dur: 150,
        easing: 'easeOutQuad',
      });
    });

    moveButton.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      moveButton.setAttribute('animation__scale', {
        property: 'scale',
        to: '1 1 1',
        dur: 150,
        easing: 'easeOutQuad',
      });
    });

    // Store reference for easy access
    hotspotEl.inSceneButtonContainer = buttonContainer;

    // Hint label shown under the media prompting the click-to-reveal interaction.
    const hint = document.createElement('a-entity');
    hint.setAttribute('class', 'in-scene-edit-hint');
    hint.setAttribute('position', '0 -0.45 0.44');
    hint.setAttribute(
      'text',
      'value: Click to edit or move; align: center; color: #FFFFFF; width: 0.6; baseline: center; wrapCount: 22'
    );
    hint.setAttribute('visible', 'false');
    hotspotEl.appendChild(hint);
    this._attachIconButtonMesh(hint, this._createHintBackgroundMesh(0.62, 0.1));
    const styleHintText = () => {
      const t = hint.getObject3D('text');
      if (t) {
        t.renderOrder = 11;
        t.frustumCulled = false;
        if (t.material) {
          t.material.depthTest = false;
          t.material.depthWrite = false;
        }
      }
    };
    hint.addEventListener('object3dset', (e) => {
      if (!e.detail || e.detail.type === 'text') styleHintText();
    });
    styleHintText();
    hotspotEl.inSceneHintEl = hint;

    // Click-to-reveal model: buttons stay hidden until the user clicks the photo/video,
    // then they appear so the user can pick Edit or Move. They never auto-show, which
    // also sidesteps the lifecycle/visibility races that made them flash and vanish.
    const syncButtonVisibility = () => {
      const show = !this.navigationMode && this._activeInSceneHotspotEl === hotspotEl;
      buttonContainer.setAttribute('visible', show ? 'true' : 'false');
      if (buttonContainer.object3D) buttonContainer.object3D.visible = show;
      this._syncInSceneHint(hotspotEl);
    };

    // Update visibility when edit mode changes
    hotspotEl.updateEditButtonVisibility = () => {
      // Leaving edit mode should also clear any open button set.
      if (this.navigationMode && this._activeInSceneHotspotEl === hotspotEl) {
        this._activeInSceneHotspotEl = null;
      }
      syncButtonVisibility();
    };

    syncButtonVisibility();

    // Reveal/toggle this hotspot's buttons when its media (photo or video) is clicked.
    this._bindInSceneRevealOnMedia(hotspotEl);

    // Hide these buttons once an action is chosen.
    editButton.addEventListener('click', () => this.hideInSceneButtons(hotspotEl));
    moveButton.addEventListener('click', () => this.hideInSceneButtons(hotspotEl));

    // If this is an image or video hotspot, place buttons below the media (in front of the plane)
    if (data.type === 'image') {
      const adjustButtons = () => {
        try {
          const buttonY = this._computeImageHotspotEditButtonY(hotspotEl, data);
          buttonContainer.setAttribute('position', `0 ${buttonY} 0.45`);
          if (hotspotEl.inSceneHintEl) {
            hotspotEl.inSceneHintEl.setAttribute('position', `0 ${buttonY} 0.44`);
          }
        } catch (e) {
          /* silent */
        }
      };
      adjustButtons();
      const media =
        hotspotEl.querySelector('.static-image-hotspot') ||
        hotspotEl.querySelector('.static-video-hotspot');
      if (media) {
        media.addEventListener('loaded', () => setTimeout(adjustButtons, 20));
        media.addEventListener('loadeddata', () => setTimeout(adjustButtons, 20), { once: true });
      }
      hotspotEl._repositionEditButtons = adjustButtons;
      this._bringInSceneEditButtonsToFront(hotspotEl);
      requestAnimationFrame(() => this._refreshInSceneEditButtonMaterials(hotspotEl));
    }
  }

  _setupModelHotspotActions(hotspotEl, data) {
    if (!hotspotEl) {
      console.warn('[ModelHotspot] Setup called with null hotspotEl');
      return;
    }

    console.log('[ModelHotspot] Setting up click actions', {
      id: data?.id,
      hotspotElId: hotspotEl.id,
      hasClickable: hotspotEl.classList.contains('clickable'),
      hasGeometry: !!hotspotEl.getAttribute('geometry'),
    });

    // Keep API parity with other hotspot types even without inline buttons
    hotspotEl.inSceneButtonContainer = null;
    hotspotEl.updateEditButtonVisibility = () => {
      /* no-op for model hotspots */
    };
    hotspotEl._repositionEditButtons = null;

    const modelEl = hotspotEl.querySelector('.static-model-hotspot');
    if (!modelEl) {
      console.warn('[ModelHotspot] No .static-model-hotspot found in', hotspotEl.id);
      return;
    }

    const handleClick = (evt) => {
      // Check if this is from gaze cursor FIRST before any other logic
      const isGazeCursor =
        evt.detail && evt.detail.cursorEl && evt.detail.cursorEl.id === 'gaze-cursor';

      console.log('[ModelHotspot] Click detected', {
        id: data?.id,
        target: evt.target?.tagName,
        isGazeCursor: isGazeCursor,
        navigationMode: this.navigationMode,
        repositioning: !!this.repositioningHotspotId,
        editMode: this.editMode,
      });

      // Ignore clicks from gaze cursor (VR mode) and show message
      if (isGazeCursor) {
        console.log('[ModelHotspot] Click from gaze cursor ignored');
        evt.stopPropagation();
        evt.preventDefault();
        this.showTemporaryMessage('Click 3D model to edit');
        return;
      }

      // Guard against navigation mode or an active move before showing the overlay
      if (this.navigationMode || this.repositioningHotspotId) {
        console.log('[ModelHotspot] Click ignored due to state gate');
        return;
      }
      evt.stopPropagation();
      evt.preventDefault();
      this.showModelHotspotActionMenu(data.id);
    };

    // Attach to both mesh and parent so clicks land even when the model has gaps
    modelEl.addEventListener('click', handleClick);
    hotspotEl.addEventListener('click', handleClick);
    console.log('[ModelHotspot] Click listeners attached to mesh and parent');
  }

  showModelHotspotActionMenu(id) {
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot) return;

    this.hideModelHotspotActionMenu();

    console.log('[ModelHotspot] Opening action menu', {
      id,
      scale: hotspot.modelScale,
      rotation: hotspot.modelRotation,
      positionY: hotspot.modelPositionY,
    });

    const overlay = document.createElement('div');
    overlay.id = 'model-hotspot-action-overlay';
    // Lightweight modal overlay; keeps styling local to avoid CSS conflicts
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:' +
      EDITOR_LAYER.dialog +
      '; font-family:Arial;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#1f1f1f; color:#fff; width:320px; max-width:calc(100vw - 40px); border-radius:12px; padding:20px; box-shadow:0 16px 48px rgba(0,0,0,0.45); display:flex; flex-direction:column; gap:14px;';
    dialog.innerHTML = `
      <h3 style="margin:0; font-size:18px; color:#4CAF50;">3D Model Hotspot</h3>
      <p style="margin:0; font-size:13px; line-height:1.4; color:#ccc;">Choose what you would like to do with this model hotspot.</p>
      <button id="model-action-edit" style="background:#6a1b9a; color:#fff; border:none; padding:10px 12px; border-radius:8px; font-size:14px; cursor:pointer;">Edit model settings</button>
      <button id="model-action-move" style="background:#1e88e5; color:#fff; border:none; padding:10px 12px; border-radius:8px; font-size:14px; cursor:pointer;">Move model hotspot</button>
      <button id="model-action-cancel" style="background:#424242; color:#eee; border:none; padding:9px 12px; border-radius:8px; font-size:13px; cursor:pointer;">Close</button>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const closeOverlay = () => this.hideModelHotspotActionMenu();

    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) {
        console.log('[ModelHotspot] Overlay background clicked');
        closeOverlay();
      }
    });

    const editBtn = dialog.querySelector('#model-action-edit');
    const moveBtn = dialog.querySelector('#model-action-move');
    const cancelBtn = dialog.querySelector('#model-action-cancel');

    if (editBtn)
      editBtn.addEventListener('click', () => {
        console.log('[ModelHotspot] Edit option selected', { id });
        closeOverlay();
        setTimeout(() => this.showEditHotspotDialog(id), 0);
      });

    if (moveBtn)
      moveBtn.addEventListener('click', () => {
        console.log('[ModelHotspot] Move option selected', { id });
        closeOverlay();
        setTimeout(() => this.startReposition(id), 0);
      });

    if (cancelBtn)
      cancelBtn.addEventListener('click', () => {
        console.log('[ModelHotspot] Cancel option selected');
        closeOverlay();
      });

    this._modelActionOverlay = overlay;
    // Store and register escape listener so modal can close via keyboard
    this._modelActionEscHandler = (evt) => {
      if (evt.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', this._modelActionEscHandler);
  }

  hideModelHotspotActionMenu() {
    if (this._modelActionOverlay && this._modelActionOverlay.parentNode) {
      this._modelActionOverlay.parentNode.removeChild(this._modelActionOverlay);
      console.log('[ModelHotspot] Action menu removed');
    }
    if (this._modelActionEscHandler) {
      window.removeEventListener('keydown', this._modelActionEscHandler);
      this._modelActionEscHandler = null;
      console.log('[ModelHotspot] Escape listener detached');
    }
    // Reset overlay reference whether removed via UI toggle or direct close
    this._modelActionOverlay = null;
  }

  showTemporaryMessage(message, duration = 2000) {
    // Remove any existing message
    const existing = document.getElementById('temporary-message-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'temporary-message-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 20px 40px;
      border-radius: 10px;
      font-size: 18px;
      font-family: Arial, sans-serif;
      z-index: ${EDITOR_LAYER.toast};
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      animation: fadeInOut ${duration}ms ease-in-out;
    `;
    overlay.textContent = message;
    document.body.appendChild(overlay);

    // Add animation keyframes if not already present
    if (!document.getElementById('temp-message-styles')) {
      const style = document.createElement('style');
      style.id = 'temp-message-styles';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => overlay.remove(), duration);
  }

  showHotspotPlacementFeedback(hotspotData) {
    const typeLabel =
      hotspotData.type === 'navigation'
        ? '🚪 Navigation portal'
        : hotspotData.type === 'weblink'
        ? '🔗 Weblink portal'
        : hotspotData.type === 'audio'
        ? '🔊 Audio hotspot'
        : hotspotData.type === 'image'
        ? hotspotData.mediaKind === 'video'
          ? '🎥 Video hotspot'
          : '🖼️ Image hotspot'
        : hotspotData.type === 'model'
        ? '📦 3D model hotspot'
        : '📝 Hotspot';
    this.showTemporaryMessage(`${typeLabel} placed! Click Add Hotspot to place another.`, 2500);
    this.exitEditMode();
  }

  updateHotspotList() {
    const listContainer = document.getElementById('hotspot-list');
    // Prevent horizontal overflow regardless of content length
    if (listContainer) {
      listContainer.style.overflowX = 'hidden';
      listContainer.style.maxWidth = '100%';
    }

    if (this.hotspots.length === 0) {
      listContainer.innerHTML =
        '<div style="color: #888; text-align: center; padding: 20px;">No hotspots created yet</div>';
      return;
    }

    listContainer.innerHTML = '';

    this.hotspots.forEach((hotspot) => {
      const item = document.createElement('div');
      item.className = 'hotspot-item';
      item.setAttribute('data-hotspot-id', hotspot.id);

      const typeIcon =
        hotspot.type === 'text'
          ? '📝'
          : hotspot.type === 'audio'
          ? '🔊'
          : hotspot.type === 'text-audio'
          ? '🎵📝'
          : hotspot.type === 'navigation'
          ? '🚪'
          : hotspot.type === 'weblink'
          ? '🔗'
          : hotspot.type === 'image'
          ? hotspot.mediaKind === 'video'
            ? '🎥'
            : '🖼️'
          : '❓';

      let displayName = '';
      if (hotspot.type === 'text' || hotspot.type === 'text-audio') {
        displayName = hotspot.text
          ? hotspot.text.length > 30
            ? hotspot.text.substring(0, 30) + '...'
            : hotspot.text
          : 'Text Hotspot';
      } else if (hotspot.type === 'audio') {
        displayName = 'Audio Hotspot';
      } else if (hotspot.type === 'navigation') {
        if (hotspot.navigationTarget) {
          const targetScene = this.scenes[hotspot.navigationTarget];
          const targetLabel = targetScene?.name || hotspot.navigationTarget;
          displayName = `Portal to ${targetLabel}`;
        } else {
          displayName = 'Navigation Portal';
        }
      } else if (hotspot.type === 'weblink') {
        displayName = hotspot.weblinkTitle
          ? hotspot.weblinkTitle
          : hotspot.weblinkUrl
          ? hotspot.weblinkUrl
          : 'Weblink Portal';
      } else if (hotspot.type === 'image') {
        displayName = hotspot.mediaKind === 'video' ? 'Video' : 'Image';
      } else {
        displayName = 'Hotspot';
      }

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; max-width:100%;">
          <div style="flex: 1; min-width:0; overflow:hidden;">
            <div style="max-width:100%;">
              <strong style="display:block; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${typeIcon} ${this._escapeHTML(
        displayName
      )}</strong>
            </div>
            <div style="font-size: 12px; color: #ccc; overflow-wrap:anywhere;">Type: ${
              hotspot.type
            }</div>
            <div style="font-size: 11px; color: #999; overflow-wrap:anywhere;">Position: ${
              hotspot.position
            }</div>
          </div>
          <div style="display:flex; gap:6px; flex:0 0 auto;">
            <button class="edit-hotspot-btn" data-hotspot-id="${hotspot.id}" style="
              background: #6a1b9a; color: white; border: none; border-radius: 6px; width: 28px; height: 28px;
              cursor: pointer; font-size: 14px; display:flex; align-items:center; justify-content:center;"
              title="Edit hotspot">📝</button>
            <button class="move-hotspot-btn" data-hotspot-id="${hotspot.id}" style="
              background: #1e88e5; color: white; border: none; border-radius: 6px; width: 28px; height: 28px;
              cursor: pointer; font-size: 14px; display:flex; align-items:center; justify-content:center;"
              title="Move hotspot">📍</button>
            <button class="delete-hotspot-btn" data-hotspot-id="${hotspot.id}" style="
              background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px;"
              title="Delete hotspot">✕</button>
          </div>
        </div>
      `;

      // Click to select/highlight hotspot (but not on delete button)
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-hotspot-btn')) {
          this.selectHotspot(hotspot.id);
        }
      });

      // Individual delete button
      const deleteBtn = item.querySelector('.delete-hotspot-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteHotspot(hotspot.id);
      });
      // Edit button
      const editBtn = item.querySelector('.edit-hotspot-btn');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showEditHotspotDialog(hotspot.id);
      });
      // Move button
      const moveBtn = item.querySelector('.move-hotspot-btn');
      moveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTimeout(() => this.startReposition(hotspot.id), 0);
      });

      // Hover effect for delete button
      deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.background = '#da190b';
      });

      deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.background = '#f44336';
      });

      listContainer.appendChild(item);
    });
  }

  showEditHotspotDialog(id) {
    this.hideModelHotspotActionMenu();
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot) return;

    const isNav = hotspot.type === 'navigation';
    const isWeblink = hotspot.type === 'weblink';
    const isAudioType = hotspot.type === 'audio' || hotspot.type === 'text-audio';
    const isTextType = hotspot.type === 'text' || hotspot.type === 'text-audio';
    const isImageType = hotspot.type === 'image';
    const isModelType = hotspot.type === 'model';

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: ${EDITOR_LAYER.dialog}; pointer-events: none;
      display: flex; align-items: flex-start; justify-content: center; font-family: Arial; padding-top: 20px;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #2a2a2a; color: white; width: 520px; max-width: 90vw; border-radius: 10px; padding: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6); pointer-events: auto; cursor: move; position: relative;
    `;
    dialog.innerHTML = `
      <h3 style="margin: 0 0 10px; color: #4CAF50; cursor: move;">Edit Hotspot - ${
        hotspot.type.charAt(0).toUpperCase() + hotspot.type.slice(1)
      }</h3>
      <div style="display:flex; flex-direction: column; gap: 10px;">
        ${
          isTextType
            ? `
          <label style="font-size: 12px; color:#ccc;">Description
            <textarea id="edit-text" rows="4" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;">${this._escapeHTML(
              hotspot.text || ''
            )}</textarea>
          </label>

          <div style="display:flex; gap:10px;">
            <label style="flex:1; font-size:12px; color:#ccc;">Popup Width
              <input id="edit-popup-width" type="number" min="2" max="10" step="0.25" value="${
                typeof hotspot.popupWidth === 'number' ? hotspot.popupWidth : 4
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <input id="edit-popup-width-range" type="range" min="2" max="10" step="0.1" value="${
                typeof hotspot.popupWidth === 'number' ? hotspot.popupWidth : 4
              }" style="width:100%; margin-top:6px;" />
            </label>
            <label style="flex:1; font-size:12px; color:#ccc;">Popup Height
              <input id="edit-popup-height" type="number" min="1.5" max="10" step="0.25" value="${
                typeof hotspot.popupHeight === 'number' ? hotspot.popupHeight : 2.5
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <input id="edit-popup-height-range" type="range" min="1.5" max="10" step="0.1" value="${
                typeof hotspot.popupHeight === 'number' ? hotspot.popupHeight : 2.5
              }" style="width:100%; margin-top:6px;" />
            </label>
          </div>
        `
            : ''
        }
        ${
          isAudioType
            ? `
          <div>
            <div style="font-size: 12px; color:#ccc; margin-bottom:6px;">Audio</div>
            <input id="edit-audio-file" type="file" accept="audio/*" style="display:block; margin-bottom:6px; color:#ddd;">
            <input id="edit-audio-url" type="url" placeholder="https://example.com/audio.mp3" value="${
              typeof hotspot.audio === 'string' ? this._escapeAttr(hotspot.audio) : ''
            }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;">
            <div style="font-size:11px; color:#999; margin-top:4px;">Choose a file or enter a URL. Leaving both empty removes audio.</div>
            <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:#ccc; cursor:pointer;">
              <input id="edit-audio-loop" type="checkbox" ${
                hotspot.audioLoop !== false ? 'checked' : ''
              } style="width:16px; height:16px; cursor:pointer;">
              <span>Loop audio continuously</span>
            </label>
          </div>
        `
            : ''
        }
        ${
          isNav
            ? `
          <label style="font-size: 12px; color:#ccc;">Navigation Target
            <select id="edit-nav-target" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;"></select>
          </label>
        `
            : ''
        }
        ${
          isWeblink
            ? `
          <div>
            <div style="font-size: 12px; color:#ccc; margin-bottom:6px;">Weblink Portal</div>
            <input id="edit-weblink-url" type="url" placeholder="https://example.com" value="${this._escapeAttr(
              hotspot.weblinkUrl || ''
            )}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff; margin-bottom:8px;" />
            <input id="edit-weblink-title" type="text" placeholder="Optional title (e.g., Open Link)" value="${this._escapeAttr(
              hotspot.weblinkTitle || ''
            )}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff; margin-bottom:8px;" />
            <div style="font-size: 12px; color:#ccc; margin:8px 0 6px;">Preview Image (optional)</div>
            <input id="edit-weblink-image-file" type="file" accept="image/*" style="display:block; margin-bottom:6px; color:#ddd;" />
            <input id="edit-weblink-image-url" type="url" placeholder="Image URL or data:..." value="${
              typeof hotspot.weblinkPreview === 'string'
                ? this._escapeAttr(hotspot.weblinkPreview)
                : ''
            }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
            <div style="font-size:11px; color:#999; margin-top:4px;">Choose a file or enter a URL. Leave both empty to clear the preview.</div>
          </div>
        `
            : ''
        }
        ${
          isImageType
            ? `
          <div style="margin-bottom:10px;">
            <div style="font-size:12px; color:#ccc; margin-bottom:6px;">Media type</div>
            <label style="display:inline-flex; align-items:center; gap:6px; margin-right:16px; cursor:pointer;">
              <input type="radio" name="edit-image-media-kind" id="edit-media-kind-photo" value="photo" ${
                hotspot.mediaKind !== 'video' ? 'checked' : ''
              } style="width:16px;height:16px;cursor:pointer;" />
              <span>Photo</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="edit-image-media-kind" id="edit-media-kind-video" value="video" ${
                hotspot.mediaKind === 'video' ? 'checked' : ''
              } style="width:16px;height:16px;cursor:pointer;" />
              <span>Video</span>
            </label>
          </div>
          <div style="display:flex; gap:10px;">
            <label style="flex:1; font-size:12px; color:#ccc;">Scale
              <input id="edit-image-scale" type="number" min="0.1" max="10" step="0.05" value="${
                typeof hotspot.imageScale === 'number' ? hotspot.imageScale : 1
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <input id="edit-image-scale-range" type="range" min="0.1" max="10" step="0.01" value="${
                typeof hotspot.imageScale === 'number'
                  ? Math.min(10, Math.max(0.1, hotspot.imageScale))
                  : 1
              }" style="width:100%; margin-top:6px;" />
              <div style="display:flex; justify-content:space-between; font-size:10px; color:#777; margin-top:2px;">
                <span>Small (0.1)</span><span id="edit-image-scale-live" style="color:#ccc; font-weight:bold;">${
                  typeof hotspot.imageScale === 'number' ? hotspot.imageScale.toFixed(2) : '1.00'
                }</span><span>Large (10)</span>
              </div>
            </label>
          </div>
          <div id="edit-photo-section" style="display:${hotspot.mediaKind === 'video' ? 'none' : 'block'};">
            <div id="edit-image-current" style="margin:8px 0 14px; padding:8px; background:#1d1d1d; border:1px solid #444; border-radius:6px;">
              <div style="font-size:11px; color:#999; margin-bottom:6px;">Current Image</div>
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:72px; height:48px; background:#222; border:1px solid #333; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:4px;">
                  <img id="edit-image-thumb" src="${
                    typeof hotspot.image === 'string' ? this._escapeAttr(hotspot.image) : ''
                  }" style="max-width:100%; max-height:100%; object-fit:contain;" />
                </div>
                <div style="flex:1; min-width:0;">
                  <div id="edit-image-label" style="font-size:12px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">&nbsp;</div>
                  <div style="font-size:10px; color:#777;">Selecting a new file or URL will replace this image.</div>
                </div>
              </div>
            </div>
            <div>
              <div style="font-size:12px; color:#ccc; margin-bottom:6px;">Replace Image</div>
              <input id="edit-image-file" type="file" accept="image/*" style="display:block; margin-bottom:6px; color:#ddd;" />
              <input id="edit-image-url" type="url" placeholder="https://example.com/image.png" value="${
                typeof hotspot.image === 'string' && !hotspot.image.startsWith('data:')
                  ? this._escapeAttr(hotspot.image)
                  : ''
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <div style="font-size:11px; color:#999; margin-top:4px;">Provide a file or URL to change the image. Leave blank to keep original.</div>
            </div>
          </div>
          <div id="edit-video-section" style="display:${hotspot.mediaKind === 'video' ? 'block' : 'none'};">
            <div id="edit-video-current" style="margin:8px 0 14px; padding:8px; background:#1d1d1d; border:1px solid #444; border-radius:6px;">
              <div style="font-size:11px; color:#999; margin-bottom:6px;">Current Video</div>
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:96px; height:54px; background:#222; border:1px solid #333; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:4px;">
                  <video id="edit-video-thumb" ${
                    typeof hotspot.video === 'string' ? `src="${this._escapeAttr(hotspot.video)}"` : ''
                  } muted playsinline style="max-width:100%; max-height:100%; object-fit:contain;"></video>
                </div>
                <div style="flex:1; min-width:0;">
                  <div id="edit-video-label" style="font-size:12px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">&nbsp;</div>
                  <div style="font-size:10px; color:#777;">Selecting a new file or URL will replace this video.</div>
                </div>
              </div>
            </div>
            <div>
              <div style="font-size:12px; color:#ccc; margin-bottom:6px;">Replace Video</div>
              <input id="edit-video-file" type="file" accept="video/mp4,video/webm" style="display:block; margin-bottom:6px; color:#ddd;" />
              <input id="edit-video-url" type="url" placeholder="https://example.com/video.mp4" value="${
                typeof hotspot.video === 'string' && !hotspot.video.startsWith('blob:')
                  ? this._escapeAttr(hotspot.video)
                  : ''
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <div style="font-size:11px; color:#999; margin-top:4px;">Provide a file or URL to change the video. Leave blank to keep original.</div>
            </div>
            <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:#ccc; cursor:pointer;">
              <input id="edit-video-loop" type="checkbox" ${
                hotspot.videoLoop !== false ? 'checked' : ''
              } style="width:16px; height:16px; cursor:pointer;" />
              <span>Loop video continuously</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:#ccc; cursor:pointer;">
              <input id="edit-video-enable-audio" type="checkbox" ${
                hotspot.videoMuted === false ? 'checked' : ''
              } style="width:16px; height:16px; cursor:pointer;" />
              <span>Enable audio (requires click to unmute in browser)</span>
            </label>
          </div>
        `
            : ''
        }
        ${
          isModelType
            ? `
          <div style="display:flex; gap:10px;">
            <label style="flex:1; font-size:12px; color:#ccc;">Scale
              <input id="edit-model-scale" type="number" min="0.1" max="200" step="0.5" value="${
                typeof hotspot.modelScale === 'number' ? hotspot.modelScale : 1
              }" style="width:100%; padding:8px; border-radius:6px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              <input id="edit-model-scale-range" type="range" min="0.1" max="200" step="0.1" value="${
                typeof hotspot.modelScale === 'number'
                  ? Math.min(200, Math.max(0.1, hotspot.modelScale))
                  : 1
              }" style="width:100%; margin-top:6px;" />
              <div style="display:flex; justify-content:space-between; font-size:10px; color:#777; margin-top:2px;">
                <span>Small (0.1)</span><span id="edit-model-scale-live" style="color:#ccc; font-weight:bold;">${
                  typeof hotspot.modelScale === 'number' ? hotspot.modelScale.toFixed(2) : '1.00'
                }</span><span>Large (200)</span>
              </div>
            </label>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:12px; color:#ccc; margin-bottom:6px;">Rotation</div>
            <div style="display:flex; gap:10px;">
              <label style="flex:1; font-size:12px; color:#ccc;">X
                <input id="edit-model-rotation-x" type="number" min="0" max="360" step="15" value="${
                  typeof hotspot.modelRotationX === 'number' ? hotspot.modelRotationX : 0
                }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              </label>
              <label style="flex:1; font-size:12px; color:#ccc;">Y
                <input id="edit-model-rotation-y" type="number" min="0" max="360" step="15" value="${
                  typeof hotspot.modelRotationY === 'number' ? hotspot.modelRotationY : 0
                }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              </label>
              <label style="flex:1; font-size:12px; color:#ccc;">Z
                <input id="edit-model-rotation-z" type="number" min="0" max="360" step="15" value="${
                  typeof hotspot.modelRotationZ === 'number' ? hotspot.modelRotationZ : 0
                }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
              </label>
            </div>
            <div style="font-size:10px; color:#777; margin-top:2px; text-align:center;">0-360 degrees</div>
          </div>
          <div id="edit-model-current" style="margin:8px 0 14px; padding:8px; background:#1d1d1d; border:1px solid #444; border-radius:6px;">
            <div style="font-size:11px; color:#999; margin-bottom:6px;">Current Model</div>
            <div style="font-size:12px; color:#ccc;" id="edit-model-label">${
              hotspot.modelFileName || 'GLB/GLTF Model'
            }</div>
            <div style="font-size:10px; color:#777;">File replacement not yet supported. Delete and re-add to change model.</div>
          </div>
        `
            : ''
        }
        <div style="margin-top:10px; padding-top:10px; border-top: 1px solid #444;">
          <div style="font-size:12px; color:#ccc; margin-bottom:6px;">Position (X Y Z)</div>
          <div style="display:flex; gap:10px;">
            <label style="flex:1; font-size:12px; color:#ccc;">X
              <input id="edit-position-x" type="number" step="0.1" value="${
                hotspot.position ? parseFloat(hotspot.position.split(' ')[0]) : 0
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
            </label>
            <label style="flex:1; font-size:12px; color:#ccc;">Y
              <input id="edit-position-y" type="number" step="0.1" value="${
                hotspot.position ? parseFloat(hotspot.position.split(' ')[1]) : 0
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
            </label>
            <label style="flex:1; font-size:12px; color:#ccc;">Z
              <input id="edit-position-z" type="number" step="0.1" value="${
                hotspot.position ? parseFloat(hotspot.position.split(' ')[2]) : 0
              }" style="width:100%; padding:8px; border-radius:6px; border:1px solid #555; background:#1f1f1f; color:#fff;" />
            </label>
          </div>
          <div style="font-size:10px; color:#777; margin-top:4px;">Adjust the position using coordinates</div>
        </div>
        <div style="display:flex; gap:8px; justify-content:space-between; align-items:center; margin-top: 10px;">
          <button id="edit-delete" style="background:#f44336; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">Delete Hotspot</button>
          <div style="display:flex; gap:8px;">
            <button id="edit-cancel" style="background:#666; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">Cancel</button>
            <button id="edit-save" style="background:#4CAF50; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">Save</button>
          </div>
        </div>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Make dialog draggable
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const startDrag = (e) => {
      // Only drag from header, not from form inputs
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'BUTTON'
      )
        return;
      isDragging = true;
      offsetX = e.clientX - dialog.offsetLeft;
      offsetY = e.clientY - dialog.offsetTop;
      dialog.style.transition = 'none';
      e.preventDefault();
    };

    const doDrag = (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      dialog.style.left = Math.max(0, Math.min(window.innerWidth - dialog.offsetWidth, x)) + 'px';
      dialog.style.top = Math.max(0, Math.min(window.innerHeight - dialog.offsetHeight, y)) + 'px';
      dialog.style.transform = 'none';
      dialog.style.margin = '0';
      dialog.style.position = 'fixed';
    };

    const stopDrag = () => {
      isDragging = false;
    };

    dialog.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);

    // Wire up audio coordination inside dialog
    const fileInput = dialog.querySelector('#edit-audio-file');
    const urlInput = dialog.querySelector('#edit-audio-url');
    if (fileInput && urlInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) urlInput.value = '';
      });
      urlInput.addEventListener('input', () => {
        if (urlInput.value.trim()) fileInput.value = '';
      });
    }

    // Populate navigation targets if needed
    if (isNav) {
      const sel = dialog.querySelector('#edit-nav-target');
      if (sel) {
        sel.innerHTML = '';
        Object.keys(this.scenes).forEach((sceneId) => {
          if (sceneId !== this.currentScene) {
            const opt = document.createElement('option');
            opt.value = sceneId;
            opt.textContent = this.scenes[sceneId].name;
            if (sceneId === (hotspot.navigationTarget || '')) opt.selected = true;
            sel.appendChild(opt);
          }
        });
      }
    }

    // Wire up weblink preview inputs (mutual exclusion similar to audio inputs)
    if (isWeblink) {
      const f = dialog.querySelector('#edit-weblink-image-file');
      const u = dialog.querySelector('#edit-weblink-image-url');
      if (f && u) {
        f.addEventListener('change', () => {
          if (f.files && f.files.length > 0) u.value = '';
        });
        u.addEventListener('input', () => {
          if (u.value.trim()) {
            try {
              if (f) f.value = '';
            } catch (_) {}
          }
        });
      }
    }

    // Live preview for popup sizing while editing (text/text-audio)
    if (isTextType) {
      const wInput = dialog.querySelector('#edit-popup-width');
      const hInput = dialog.querySelector('#edit-popup-height');
      const wRange = dialog.querySelector('#edit-popup-width-range');
      const hRange = dialog.querySelector('#edit-popup-height-range');
      const applyLive = () => {
        const w = parseFloat(wInput?.value || '');
        const h = parseFloat(hInput?.value || '');
        const width = isNaN(w)
          ? typeof hotspot.popupWidth === 'number'
            ? hotspot.popupWidth
            : 4
          : Math.min(10, Math.max(2, w));
        const height = isNaN(h)
          ? typeof hotspot.popupHeight === 'number'
            ? hotspot.popupHeight
            : 2.5
          : Math.min(10, Math.max(1.5, h));
        const el = document.getElementById(`hotspot-${hotspot.id}`);
        if (!el) return;
        const bg = el.querySelector('.popup-bg');
        const txt = el.querySelector('.popup-text');
        const closeBtn = el.querySelector('.popup-close');
        if (bg) {
          bg.setAttribute('width', width);
          bg.setAttribute('height', height);
        }
        if (txt) {
          txt.setAttribute('wrap-count', Math.floor(width * 8));
          txt.setAttribute('width', (width - 0.4).toString());
        }
        if (closeBtn) {
          const margin = 0.3;
          closeBtn.setAttribute('position', `${width / 2 - margin} ${height / 2 - margin} 0.1`);
        }
        // keep ranges in sync when preview clamps values
        if (wRange) wRange.value = String(width);
        if (hRange) hRange.value = String(height);
      };
      if (wInput)
        wInput.addEventListener('input', () => {
          // clamp into range and sync slider
          const v = Math.min(10, Math.max(2, parseFloat(wInput.value || '')));
          if (!isNaN(v)) {
            wInput.value = String(v);
            if (wRange) wRange.value = String(v);
          }
          applyLive();
        });
      if (hInput)
        hInput.addEventListener('input', () => {
          const v = Math.min(10, Math.max(1.5, parseFloat(hInput.value || '')));
          if (!isNaN(v)) {
            hInput.value = String(v);
            if (hRange) hRange.value = String(v);
          }
          applyLive();
        });
      if (wRange)
        wRange.addEventListener('input', () => {
          wInput.value = String(wRange.value);
          applyLive();
        });
      if (hRange)
        hRange.addEventListener('input', () => {
          hInput.value = String(hRange.value);
          applyLive();
        });
    }

    // Live preview for image scale while editing
    if (isImageType) {
      const photoRadio = dialog.querySelector('#edit-media-kind-photo');
      const videoRadio = dialog.querySelector('#edit-media-kind-video');
      const photoSection = dialog.querySelector('#edit-photo-section');
      const videoSection = dialog.querySelector('#edit-video-section');
      const syncEditMedia = () => {
        const isVid = videoRadio && videoRadio.checked;
        if (photoSection) photoSection.style.display = isVid ? 'none' : 'block';
        if (videoSection) videoSection.style.display = isVid ? 'block' : 'none';
      };
      if (photoRadio) photoRadio.addEventListener('change', syncEditMedia);
      if (videoRadio) videoRadio.addEventListener('change', syncEditMedia);

      const scaleInput = dialog.querySelector('#edit-image-scale');
      const scaleRange = dialog.querySelector('#edit-image-scale-range');
      const scaleLive = dialog.querySelector('#edit-image-scale-live');
      const originalScale = typeof hotspot.imageScale === 'number' ? hotspot.imageScale : 1;

      // Label
      try {
        const lbl = dialog.querySelector('#edit-image-label');
        if (lbl) {
          let labelText = '—';
          if (hotspot.imageFileName) {
            labelText =
              hotspot.imageFileName +
              (typeof hotspot.image === 'string' && hotspot.image.startsWith('data:')
                ? ' (embedded)'
                : '');
          } else if (typeof hotspot.image === 'string') {
            if (hotspot.image.startsWith('data:')) labelText = 'Embedded Image';
            else {
              try {
                const u = new URL(hotspot.image);
                labelText = u.hostname + u.pathname;
              } catch (_) {
                labelText = hotspot.image;
              }
            }
          }
          lbl.textContent = labelText;
        }
        const vlbl = dialog.querySelector('#edit-video-label');
        if (vlbl) {
          let vLabelText = '—';
          if (hotspot.videoFileName) {
            vLabelText = hotspot.videoFileName;
          } else if (typeof hotspot.video === 'string') {
            try {
              const u = new URL(hotspot.video);
              vLabelText = u.hostname + u.pathname;
            } catch (_) {
              vLabelText = hotspot.video;
            }
          }
          vlbl.textContent = vLabelText;
        }
      } catch (e) {}

      // Capture aspect ratio once
      const hotspotEl = document.getElementById(`hotspot-${hotspot.id}`);
      const imgEnt = hotspotEl?.querySelector('.static-image-hotspot');
      const vidEnt = hotspotEl?.querySelector('.static-video-hotspot');
      const mediaEnt = imgEnt || vidEnt;
      if (mediaEnt && typeof hotspot._aspectRatio !== 'number') {
        const w = parseFloat(mediaEnt.getAttribute('width')) || 1;
        const h = parseFloat(mediaEnt.getAttribute('height')) || 1;
        if (w > 0 && h > 0) hotspot._aspectRatio = h / w;
        if (imgEnt) {
          imgEnt.addEventListener(
            'load',
            () => {
              if (imgEnt.naturalWidth && imgEnt.naturalHeight)
                hotspot._aspectRatio = imgEnt.naturalHeight / imgEnt.naturalWidth;
            },
            { once: true }
          );
        }
      }

      const clampScale = (v) => Math.min(10, Math.max(0.1, v));
      const applyScale = (s) => {
        const el = document.getElementById(`hotspot-${hotspot.id}`);
        if (!el) return;
        const media = el.querySelector('.static-image-hotspot') || el.querySelector('.static-video-hotspot');
        if (!media) return;
        const ratio = hotspot._aspectRatio || parseFloat(media.getAttribute('height')) || 1;
        media.setAttribute('scale', `${s} ${s} 1`);
        media.setAttribute('position', `0 ${(ratio / 2) * s} 0.05`);
        const frame = el.querySelector('.static-image-border');
        if (frame) {
          const bw = this.customStyles?.image?.borderWidth || 0;
          frame.setAttribute('width', 1 * s + bw * 2);
          frame.setAttribute('height', ratio * s + bw * 2);
          frame.setAttribute('position', `0 ${(ratio / 2) * s} 0.0`);
        }
      };

      if (scaleInput) {
        scaleInput.addEventListener('input', () => {
          const v = clampScale(parseFloat(scaleInput.value || ''));
          if (!isNaN(v)) {
            scaleInput.value = v.toString();
            if (scaleRange) scaleRange.value = v.toString();
            if (scaleLive) scaleLive.textContent = v.toFixed(2);
            applyScale(v);
          }
        });
      }
      if (scaleRange) {
        scaleRange.addEventListener('input', () => {
          const v = clampScale(parseFloat(scaleRange.value || ''));
          scaleInput.value = v.toString();
          if (scaleLive) scaleLive.textContent = v.toFixed(2);
          applyScale(v);
        });
      }
    }

    // Live preview for model scale while editing
    if (isModelType) {
      const scaleInput = dialog.querySelector('#edit-model-scale');
      const scaleRange = dialog.querySelector('#edit-model-scale-range');
      const scaleLive = dialog.querySelector('#edit-model-scale-live');
      const originalScale = typeof hotspot.modelScale === 'number' ? hotspot.modelScale : 1;

      const clampScale = (v) => Math.min(200, Math.max(0.1, v));
      const applyScale = (s) => {
        const el = document.getElementById(`hotspot-${hotspot.id}`);
        const model = el?.querySelector('.static-model-hotspot');
        if (!model) return;
        model.setAttribute('scale', `${s} ${s} ${s}`);
      };

      const rotationInputX = dialog.querySelector('#edit-model-rotation-x');
      const rotationInputY = dialog.querySelector('#edit-model-rotation-y');
      const rotationInputZ = dialog.querySelector('#edit-model-rotation-z');

      const applyRotation = () => {
        const rx = parseFloat(rotationInputX?.value || '0') % 360;
        const ry = parseFloat(rotationInputY?.value || '0') % 360;
        const rz = parseFloat(rotationInputZ?.value || '0') % 360;
        const el = document.getElementById(`hotspot-${hotspot.id}`);
        const model = el?.querySelector('.static-model-hotspot');
        if (model) model.setAttribute('rotation', `${rx} ${ry} ${rz}`);
      };

      if (rotationInputX) {
        rotationInputX.addEventListener('input', applyRotation);
      }
      if (rotationInputY) {
        rotationInputY.addEventListener('input', applyRotation);
      }
      if (rotationInputZ) {
        rotationInputZ.addEventListener('input', applyRotation);
      }

      if (scaleInput) {
        scaleInput.addEventListener('input', () => {
          const v = clampScale(parseFloat(scaleInput.value || ''));
          if (!isNaN(v)) {
            scaleInput.value = v.toString();
            if (scaleRange) scaleRange.value = v.toString();
            if (scaleLive) scaleLive.textContent = v.toFixed(2);
            applyScale(v);
          }
        });
      }
      if (scaleRange) {
        scaleRange.addEventListener('input', () => {
          const v = clampScale(parseFloat(scaleRange.value || ''));
          scaleInput.value = v.toString();
          if (scaleLive) scaleLive.textContent = v.toFixed(2);
          applyScale(v);
        });
      }
    }

    // Live preview for position (all hotspot types)
    const positionInputX = dialog.querySelector('#edit-position-x');
    const positionInputY = dialog.querySelector('#edit-position-y');
    const positionInputZ = dialog.querySelector('#edit-position-z');

    const applyPosition = () => {
      const px = parseFloat(positionInputX?.value || '0');
      const py = parseFloat(positionInputY?.value || '0');
      const pz = parseFloat(positionInputZ?.value || '0');
      const el = document.getElementById(`hotspot-${hotspot.id}`);
      if (el) {
        el.setAttribute('position', `${px} ${py} ${pz}`);
      }
    };

    if (positionInputX) {
      positionInputX.addEventListener('input', applyPosition);
    }
    if (positionInputY) {
      positionInputY.addEventListener('input', applyPosition);
    }
    if (positionInputZ) {
      positionInputZ.addEventListener('input', applyPosition);
    }

    const close = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    dialog.querySelector('#edit-cancel').onclick = close;

    dialog.querySelector('#edit-delete').onclick = () => {
      if (this.deleteHotspot(id)) close();
    };

    dialog.querySelector('#edit-save').onclick = () => {
      const isImageEdit = hotspot.type === 'image';
      const prevImageRef = isImageEdit ? hotspot.image : null;
      const prevVideoRef = isImageEdit ? hotspot.video : null;
      const prevMediaKind = isImageEdit ? hotspot.mediaKind || 'photo' : 'photo';
      const prevScale = isImageEdit ? hotspot.imageScale : null;
      // Collect values
      const newText = isTextType
        ? (dialog.querySelector('#edit-text')?.value || '').trim()
        : hotspot.text;
      let newAudio = hotspot.audio;
      let newAudioLoop = hotspot.audioLoop !== false; // Default to true if not set
      if (isAudioType) {
        const f = dialog.querySelector('#edit-audio-file');
        const u = dialog.querySelector('#edit-audio-url');
        const loopCheckbox = dialog.querySelector('#edit-audio-loop');
        const file = f && f.files ? f.files[0] : null;
        const url = u ? u.value.trim() : '';
        newAudioLoop = loopCheckbox ? loopCheckbox.checked : true;
        if (url) newAudio = url;
        else if (file) newAudio = file;
        else newAudio = null;
      }
      const newNavTarget = isNav
        ? dialog.querySelector('#edit-nav-target')?.value || ''
        : hotspot.navigationTarget;
      // Weblink fields
      let newWeblinkUrl = hotspot.weblinkUrl;
      let newWeblinkTitle = hotspot.weblinkTitle;
      let newWeblinkPreview = hotspot.weblinkPreview;
      if (isWeblink) {
        const u = dialog.querySelector('#edit-weblink-url');
        const t = dialog.querySelector('#edit-weblink-title');
        const pf = dialog.querySelector('#edit-weblink-image-file');
        const pu = dialog.querySelector('#edit-weblink-image-url');
        const url = u ? u.value.trim() : '';
        const title = t ? t.value.trim() : '';
        const file = pf && pf.files ? pf.files[0] : null;
        const purl = pu ? pu.value.trim() : '';
        newWeblinkUrl = url || '';
        newWeblinkTitle = title || '';
        if (purl) newWeblinkPreview = purl;
        else if (file) newWeblinkPreview = file;
        else newWeblinkPreview = null;
      }
      let newImage = hotspot.image;
      let newVideo = hotspot.video;
      let newImageScale = hotspot.imageScale || 1;
      let newMediaKind = hotspot.mediaKind || 'photo';
      let newVideoLoop = hotspot.videoLoop !== false;
      let newVideoMuted = hotspot.videoMuted !== false;
      if (isImageType) {
        const sVal = parseFloat(dialog.querySelector('#edit-image-scale')?.value || '');
        newImageScale = isNaN(sVal) ? hotspot.imageScale || 1 : Math.min(10, Math.max(0.1, sVal));
        const isEditVideo = dialog.querySelector('#edit-media-kind-video')?.checked;
        newMediaKind = isEditVideo ? 'video' : 'photo';
        if (isEditVideo) {
          newVideoLoop = dialog.querySelector('#edit-video-loop')?.checked !== false;
          newVideoMuted = dialog.querySelector('#edit-video-enable-audio')?.checked !== true;
          const vf = dialog.querySelector('#edit-video-file');
          const vu = dialog.querySelector('#edit-video-url');
          const vfile = vf && vf.files ? vf.files[0] : null;
          const vurl = vu ? vu.value.trim() : '';
          if (vurl) newVideo = vurl;
          else if (vfile) newVideo = vfile;
        } else {
          const f = dialog.querySelector('#edit-image-file');
          const u = dialog.querySelector('#edit-image-url');
          const file = f && f.files ? f.files[0] : null;
          const url = u ? u.value.trim() : '';
          if (url) newImage = url;
          else if (file) newImage = file;
        }
      }

      // Model hotspot changes
      let newModelScale = hotspot.modelScale || 1;
      let newModelRotationX = hotspot.modelRotationX || 0;
      let newModelRotationY = hotspot.modelRotationY || 0;
      let newModelRotationZ = hotspot.modelRotationZ || 0;
      if (isModelType) {
        const sVal = parseFloat(dialog.querySelector('#edit-model-scale')?.value || '');
        const rxVal = parseFloat(dialog.querySelector('#edit-model-rotation-x')?.value || '');
        const ryVal = parseFloat(dialog.querySelector('#edit-model-rotation-y')?.value || '');
        const rzVal = parseFloat(dialog.querySelector('#edit-model-rotation-z')?.value || '');
        newModelScale = isNaN(sVal) ? hotspot.modelScale || 1 : Math.min(200, Math.max(0.1, sVal));
        newModelRotationX = isNaN(rxVal) ? hotspot.modelRotationX || 0 : rxVal % 360;
        newModelRotationY = isNaN(ryVal) ? hotspot.modelRotationY || 0 : ryVal % 360;
        newModelRotationZ = isNaN(rzVal) ? hotspot.modelRotationZ || 0 : rzVal % 360;
      }

      // Popup sizing (for text-based hotspots)
      let newPopupWidth = hotspot.popupWidth;
      let newPopupHeight = hotspot.popupHeight;
      if (isTextType) {
        const w = parseFloat(dialog.querySelector('#edit-popup-width')?.value || '');
        const h = parseFloat(dialog.querySelector('#edit-popup-height')?.value || '');
        // apply defaults if missing
        newPopupWidth = isNaN(w)
          ? typeof hotspot.popupWidth === 'number'
            ? hotspot.popupWidth
            : 4
          : w;
        newPopupHeight = isNaN(h)
          ? typeof hotspot.popupHeight === 'number'
            ? hotspot.popupHeight
            : 2.5
          : h;
        // clamp ranges
        newPopupWidth = Math.min(10, Math.max(2, newPopupWidth));
        newPopupHeight = Math.min(10, Math.max(1.5, newPopupHeight));
      }

      // Position update (for all hotspot types)
      const posX = parseFloat(dialog.querySelector('#edit-position-x')?.value || '0');
      const posY = parseFloat(dialog.querySelector('#edit-position-y')?.value || '0');
      const posZ = parseFloat(dialog.querySelector('#edit-position-z')?.value || '0');
      const newPosition = `${posX} ${posY} ${posZ}`;

      // Validate
      const v = this._validateHotspotValues(hotspot.type, {
        text: newText,
        audio: newAudio,
        navigationTarget: newNavTarget,
        image: newImage,
        video: newVideo,
        mediaKind: newMediaKind,
        weblinkUrl: newWeblinkUrl,
      });
      if (!v.valid) {
        alert(v.message);
        return;
      }

      // Apply to data structures
      if (isTextType) {
        hotspot.text = newText;
        hotspot.popupWidth = newPopupWidth;
        hotspot.popupHeight = newPopupHeight;
      }
      if (isAudioType) {
        hotspot.audio = newAudio;
        hotspot.audioLoop = newAudioLoop;
      }
      if (isNav) hotspot.navigationTarget = newNavTarget;
      if (isWeblink) {
        hotspot.weblinkUrl = newWeblinkUrl;
        hotspot.weblinkTitle = newWeblinkTitle;
        // Preview may be File or string/null; if File, convert to data URL for persistence
        if (newWeblinkPreview instanceof File) {
          const pending = newWeblinkPreview;
          this._fileToDataURL(pending)
            .then((dataUrl) => {
              hotspot.weblinkPreview = dataUrl;
              const sceneHs = this.scenes[this.currentScene].hotspots.find(
                (h) => h.id === hotspot.id
              );
              if (sceneHs) sceneHs.weblinkPreview = dataUrl;
              this._refreshHotspotEntity(hotspot);
              this.saveScenesData();
            })
            .catch(() => {});
        } else {
          hotspot.weblinkPreview = newWeblinkPreview || null;
        }
      }
      if (isImageType) {
        hotspot.mediaKind = newMediaKind;
        hotspot.imageScale = newImageScale;
        hotspot.videoLoop = newVideoLoop;
        hotspot.videoMuted = newVideoMuted;
        delete hotspot.imageWidth;
        delete hotspot.imageHeight;

        if (newMediaKind === 'video') {
          hotspot.image = null;
          hotspot.imageStorageKey = null;
          if (newVideo instanceof File) {
            (async () => {
              try {
                const pendingFile = newVideo;
                const storageKey = hotspot.videoStorageKey || `video_hotspot_${hotspot.id}`;
                const saved = await this.saveVideoToIDB(storageKey, pendingFile);
                if (saved) {
                  const blobUrl = URL.createObjectURL(pendingFile);
                  hotspot.video = blobUrl;
                  hotspot.videoFileName = pendingFile.name || null;
                  hotspot.videoStorageKey = storageKey;
                  const sceneHs = this.scenes[this.currentScene].hotspots.find(
                    (h) => h.id === hotspot.id
                  );
                  if (sceneHs) {
                    sceneHs.mediaKind = 'video';
                    sceneHs.video = blobUrl;
                    sceneHs.videoFileName = pendingFile.name || null;
                    sceneHs.videoStorageKey = storageKey;
                    sceneHs.image = null;
                    sceneHs.imageStorageKey = null;
                    sceneHs.imageScale = newImageScale;
                    sceneHs.videoLoop = newVideoLoop;
                    sceneHs.videoMuted = newVideoMuted;
                  }
                  this._refreshHotspotEntity(hotspot);
                  this.saveScenesData();
                }
              } catch (err) {
                console.warn('[VideoHotspot] Edit save to IDB failed', err);
              }
            })();
          } else {
            hotspot.video = newVideo;
            if (typeof newVideo === 'string' && !newVideo.startsWith('blob:')) {
              try {
                const urlObj = new URL(newVideo);
                hotspot.videoFileName = urlObj.pathname.split('/').pop() || null;
                hotspot.videoStorageKey = null;
              } catch (_) {}
            }
            this._refreshHotspotEntity(hotspot);
          }
        } else {
          hotspot.video = null;
          hotspot.videoStorageKey = null;
          hotspot.videoFileName = null;
          // If replacing with a File, store into IndexedDB and use a blob URL at runtime
          if (newImage instanceof File) {
          (async () => {
            try {
              const pendingFile = newImage;
              const storageKey = hotspot.imageStorageKey || `image_hotspot_${hotspot.id}`;
              const saved = await this.saveImageToIDB(storageKey, pendingFile);
              if (saved) {
                const blobUrl = URL.createObjectURL(pendingFile);
                hotspot.image = blobUrl;
                hotspot.imageScale = newImageScale;
                hotspot.imageFileName = pendingFile.name || null;
                hotspot.imageStorageKey = storageKey;
                delete hotspot.imageWidth;
                delete hotspot.imageHeight;

                const sceneHs = this.scenes[this.currentScene].hotspots.find(
                  (h) => h.id === hotspot.id
                );
                if (sceneHs) {
                  sceneHs.image = blobUrl;
                  sceneHs.imageScale = newImageScale;
                  sceneHs.imageFileName = pendingFile.name || null;
                  sceneHs.imageStorageKey = storageKey;
                  delete sceneHs.imageWidth;
                  delete sceneHs.imageHeight;
                }

                // Update existing entity's texture if present
                const el = document.getElementById(`hotspot-${hotspot.id}`);
                const imgEnt = el?.querySelector('.static-image-hotspot');
                if (imgEnt) setAImageHotspotSrc(imgEnt, blobUrl);

                // Persist (saveScenesData will strip blob: when storageKey exists)
                this._refreshHotspotEntity(hotspot);
                this.saveScenesData();
              } else {
                console.warn('[ImageHotspot] Failed to save edited image to IndexedDB');
              }
            } catch (err) {
              console.warn('[ImageHotspot] Edit save to IDB failed', err);
            }
          })();
        } else {
          // URL or unchanged
          hotspot.image = newImage;
          hotspot.imageScale = newImageScale;
          if (typeof newImage === 'string' && !newImage.startsWith('data:')) {
            try {
              const urlObj = new URL(newImage);
              hotspot.imageFileName = urlObj.pathname.split('/').pop() || null;
              // If user switched to a URL, clear storageKey so we don't expect IDB
              hotspot.imageStorageKey = null;
            } catch (_) {
              hotspot.imageFileName = hotspot.imageFileName || null;
            }
          }
          delete hotspot.imageWidth;
          delete hotspot.imageHeight;
        }
        }
      }

      // Model hotspot changes
      if (isModelType) {
        hotspot.modelScale = newModelScale;
        hotspot.modelRotationX = newModelRotationX;
        hotspot.modelRotationY = newModelRotationY;
        hotspot.modelRotationZ = newModelRotationZ;
      }

      // Update position (for all hotspot types)
      hotspot.position = newPosition;

      // Update scene-specific copy
      const sceneHotspot = (this.scenes[this.currentScene].hotspots || []).find((h) => h.id === id);
      if (sceneHotspot) {
        sceneHotspot.position = newPosition;
        if (isTextType) {
          sceneHotspot.text = hotspot.text;
          sceneHotspot.popupWidth = hotspot.popupWidth;
          sceneHotspot.popupHeight = hotspot.popupHeight;
        }
        if (isAudioType) sceneHotspot.audio = hotspot.audio;
        if (isAudioType) sceneHotspot.audioLoop = hotspot.audioLoop;
        if (isNav) sceneHotspot.navigationTarget = hotspot.navigationTarget;
        if (isWeblink) {
          sceneHotspot.weblinkUrl = hotspot.weblinkUrl;
          sceneHotspot.weblinkTitle = hotspot.weblinkTitle;
          if (!(newWeblinkPreview instanceof File)) {
            sceneHotspot.weblinkPreview = hotspot.weblinkPreview || null;
          }
        }
        if (isImageType) {
          sceneHotspot.mediaKind = hotspot.mediaKind || 'photo';
          sceneHotspot.videoLoop = hotspot.videoLoop;
          sceneHotspot.videoMuted = hotspot.videoMuted;
          sceneHotspot.imageScale = hotspot.imageScale;
          if (hotspot.mediaKind === 'video') {
            if (!(newVideo instanceof File)) {
              sceneHotspot.video = hotspot.video;
              sceneHotspot.image = null;
              sceneHotspot.imageStorageKey = null;
              if (hotspot.videoFileName) sceneHotspot.videoFileName = hotspot.videoFileName;
            }
          } else if (!(newImage instanceof File)) {
            sceneHotspot.image = hotspot.image;
            sceneHotspot.video = null;
            sceneHotspot.videoStorageKey = null;
            if (hotspot.imageFileName) sceneHotspot.imageFileName = hotspot.imageFileName;
            delete sceneHotspot.imageWidth;
            delete sceneHotspot.imageHeight;
          }
        }
        if (isModelType) {
          sceneHotspot.modelScale = hotspot.modelScale;
          sceneHotspot.modelRotationX = hotspot.modelRotationX;
          sceneHotspot.modelRotationY = hotspot.modelRotationY;
          sceneHotspot.modelRotationZ = hotspot.modelRotationZ;
        }
      }

      // Apply position update to the element immediately
      const hotspotEl = document.getElementById(`hotspot-${hotspot.id}`);
      if (hotspotEl) {
        hotspotEl.setAttribute('position', newPosition);
      }

      // Decide whether we need a full rebuild (only needed if image source changed or non-image types)
      let needsRebuild = true;
      if (isImageType) {
        const mediaKindChanged = (hotspot.mediaKind || 'photo') !== prevMediaKind;
        const imageChanged = hotspot.image !== prevImageRef;
        const videoChanged = hotspot.video !== prevVideoRef;
        const scaleChanged = hotspot.imageScale !== prevScale;
        const mediaChanged = mediaKindChanged || imageChanged || videoChanged;
        if (!mediaChanged && scaleChanged) {
          this._applyImageScaleInPlace(hotspot);
          needsRebuild = false;
        } else if (!mediaChanged && !scaleChanged) {
          needsRebuild = false;
        }
      }
      if (isModelType) {
        // For models, apply transform in place without rebuilding
        this._applyModelTransformInPlace(hotspot);
        needsRebuild = false;
      }
      // For weblink, ensure rebuild so preview/label/click handlers update
      if (isWeblink) {
        needsRebuild = true;
      }
      if (needsRebuild) {
        this._refreshHotspotEntity(hotspot);
      }
      this.updateHotspotList();
      this.saveScenesData(); // Save after updating hotspot
      close();
      this.showStartingPointFeedback('Hotspot updated');
    };
  }

  _validateHotspotValues(type, { text, audio, navigationTarget, image, video, mediaKind, weblinkUrl }) {
    switch (type) {
      case 'text':
        if (!text)
          return {
            valid: false,
            message: 'Text popup type requires description text.',
          };
        return { valid: true };
      case 'audio':
        if (!audio)
          return {
            valid: false,
            message: 'Audio-only hotspot requires an audio file or URL.',
          };
        return { valid: true };
      case 'text-audio':
        if (!text || !audio)
          return {
            valid: false,
            message: 'Text + Audio hotspot requires both text and audio.',
          };
        return { valid: true };
      case 'navigation':
        if (!navigationTarget)
          return {
            valid: false,
            message: 'Please choose a navigation target.',
          };
        return { valid: true };
      case 'weblink':
        if (!weblinkUrl || !/^https?:\/\//i.test(weblinkUrl))
          return {
            valid: false,
            message: 'Weblink portal requires a valid URL starting with http:// or https://.',
          };
        return { valid: true };
      case 'image':
        if (mediaKind === 'video') {
          if (!video) {
            return {
              valid: false,
              message: 'Video hotspot requires a video file or URL.',
            };
          }
        } else if (!image) {
          return {
            valid: false,
            message: 'Image hotspot requires an image file or URL.',
          };
        }
        return { valid: true };
      default:
        return { valid: true };
    }
  }

  _refreshHotspotEntity(hotspot) {
    const el = document.getElementById(`hotspot-${hotspot.id}`);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    // Ensure position persists
    const dataCopy = { ...hotspot };
    this.createHotspotElement(dataCopy);
  }

  _applyImageScaleInPlace(hotspot) {
    try {
      const el = document.getElementById(`hotspot-${hotspot.id}`);
      if (!el) return;
      const img = el.querySelector('.static-image-hotspot') || el.querySelector('.static-video-hotspot');
      if (!img) return;
      // Determine aspect ratio from existing geometry
      let ratio =
        typeof hotspot.imageAspectRatio === 'number' &&
        isFinite(hotspot.imageAspectRatio) &&
        hotspot.imageAspectRatio > 0
          ? hotspot.imageAspectRatio
          : null;
      if (!ratio) ratio = parseFloat(img.dataset.aspectRatio || '') || null;
      if (!ratio) {
        const bw = parseFloat(img.getAttribute('width')) || 1;
        const bh = parseFloat(img.getAttribute('height')) || 1;
        ratio = bh / (bw || 1) || 1;
      }
      if (!isFinite(ratio) || ratio <= 0) ratio = 1;
      // Enforce base geometry from ratio (prevents squaring on style changes)
      img.setAttribute('width', 1);
      img.setAttribute('height', ratio);
      img.dataset.aspectRatio = String(ratio);
      const scl = hotspot.imageScale || 1;
      img.setAttribute('scale', `${scl} ${scl} 1`);
      img.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
      try {
        console.log(
          `[ImageHotspot][Scale] id=hotspot-${
            hotspot.id
          } ratio=${ratio} scale=${scl} -> w=1 h=${ratio} y=${(ratio / 2) * scl}`
        );
      } catch (_) {}
      const frame = el.querySelector('.static-image-border');
      if (frame) {
        const bw = this.customStyles?.image?.borderWidth || 0;
        frame.setAttribute('width', 1 * scl + bw * 2);
        frame.setAttribute('height', ratio * scl + bw * 2);
        frame.setAttribute('position', `0 ${(ratio / 2) * scl} 0.0`);
      }
      // Persist to model if missing
      if (
        typeof hotspot.imageAspectRatio !== 'number' ||
        !isFinite(hotspot.imageAspectRatio) ||
        hotspot.imageAspectRatio <= 0
      ) {
        hotspot.imageAspectRatio = ratio;
        this._persistImageAspectRatio(hotspot.id, ratio);
      }
      if (el._repositionEditButtons) setTimeout(() => el._repositionEditButtons(), 20);
    } catch (e) {
      console.warn('[ImageHotspot] apply scale in place failed, falling back to rebuild', e);
      this._refreshHotspotEntity(hotspot);
    }
  }

  _applyModelTransformInPlace(hotspot) {
    try {
      const el = document.getElementById(`hotspot-${hotspot.id}`);
      if (!el) return;
      const model = el.querySelector('.static-model-hotspot');
      if (!model) return;

      const scl = hotspot.modelScale || 1;
      const rotX = hotspot.modelRotationX || 0;
      const rotY = hotspot.modelRotationY || 0;
      const rotZ = hotspot.modelRotationZ || 0;

      model.setAttribute('scale', `${scl} ${scl} ${scl}`);
      model.setAttribute('rotation', `${rotX} ${rotY} ${rotZ}`);
      model.setAttribute('position', `0 0 0`);

      console.log(
        `[ModelHotspot][Transform] id=hotspot-${hotspot.id} scale=${scl} rotation=${rotX} ${rotY} ${rotZ}`
      );

      // Reposition edit buttons based on new scale
      if (el._repositionEditButtons) setTimeout(() => el._repositionEditButtons(), 20);
    } catch (e) {
      console.warn('[ModelHotspot] apply transform in place failed, falling back to rebuild', e);
      this._refreshHotspotEntity(hotspot);
    }
  }

  migrateLegacyImageDimensions() {
    let changed = false;
    this.hotspots.forEach((h) => {
      if (h.type === 'image') {
        if (typeof h.imageScale !== 'number') {
          if (typeof h.imageWidth === 'number') {
            h.imageScale = h.imageWidth; // reuse previous width number as scale
          } else {
            h.imageScale = 1;
          }
          delete h.imageWidth;
          delete h.imageHeight;
          changed = true;
        }
      }
    });
    if (changed) {
      console.log('[Migration] Applied legacy image width/height -> scale conversion');
      this.saveScenesData();
      // Refresh any existing entities to reposition buttons correctly
      this.hotspots.filter((h) => h.type === 'image').forEach((h) => this._refreshHotspotEntity(h));
    }
  }

  // Convert a File to a data URL with caching by name+size+lastModified
  _fileToDataURL(file) {
    if (!(file instanceof File)) return Promise.resolve(file);
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (this._imageDataURLCache.has(key)) {
      return Promise.resolve(this._imageDataURLCache.get(key));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          this._imageDataURLCache.set(key, result);
          resolve(result);
        } else {
          reject(new Error('Unexpected FileReader result type'));
        }
      };
      reader.onerror = (e) => reject(e);
      try {
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  getReadableImageLabel(hotspot) {
    if (!hotspot) return '';
    const img = hotspot.image;
    if (hotspot.imageFileName)
      return (
        hotspot.imageFileName +
        (typeof img === 'string' && img.startsWith('data:') ? ' (embedded)' : '')
      );
    if (typeof img === 'string') {
      if (img.startsWith('data:')) return 'Embedded Image';
      try {
        const u = new URL(img);
        return u.hostname + u.pathname;
      } catch (_) {
        return img;
      }
    }
    if (img instanceof File) return img.name;
    return '';
  }

  _escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  // ===== Inline SVG icon helpers (reliable in A-Frame) =====
  _getEditButtonDataURI() {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="58" fill="#4CAF50"/>
  <g fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 110l18-4 60-60c4-4 4-10 0-14l-0.5-0.5c-4-4-10-4-14 0l-60 60-3.5 19.5z" fill="white" stroke="none"/>
    <path d="M82 22l24 24" stroke="white"/>
  </g>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  _getMoveButtonDataURI() {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="58" fill="#2196F3"/>
  <g fill="white">
    <path d="M64 18c-20 0-36 16-36 36 0 26 36 72 36 72s36-46 36-72c0-20-16-36-36-36zm0 52a16 16 0 1 1 0-32 16 16 0 0 1 0 32z"/>
  </g>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  _getEditIconDataURI() {
    // White pencil icon sized to fit inside 0.12 radius circle
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <g fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 110l18-4 60-60c4-4 4-10 0-14l-0.5-0.5c-4-4-10-4-14 0l-60 60-3.5 19.5z" fill="white" stroke="none"/>
    <path d="M82 22l24 24" stroke="white"/>
  </g>
  <rect x="0" y="0" width="128" height="128" fill="none"/>
  <title>edit</title>
  <desc>pencil</desc>
  <metadata>inline</metadata>
  <style></style>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  _getMoveIconDataURI() {
    // White pin/locator icon
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <g fill="white">
    <path d="M64 10c-20 0-36 16-36 36 0 26 36 72 36 72s36-46 36-72c0-20-16-36-36-36zm0 52a16 16 0 1 1 0-32 16 16 0 0 1 0 32z"/>
  </g>
  <rect x="0" y="0" width="128" height="128" fill="none"/>
  <title>move</title>
  <desc>pin</desc>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  startReposition(id) {
    this.hideModelHotspotActionMenu();
    this.repositioningHotspotId = id;
    this._repositionArmTime = Date.now();
    this.showRepositionNotice();
    this._setHotspotTranslucent(id, true);
  }

  showRepositionNotice() {
    // Simple inline notice under instructions
    const existing = document.getElementById('reposition-notice');
    if (existing) return;
    const n = document.createElement('div');
    n.id = 'reposition-notice';
    n.style.cssText =
      'position:fixed; top:20px; right:380px; background: rgba(33,150,243,0.95); color:white; padding:8px 12px; border-radius:6px; z-index:' +
      EDITOR_LAYER.toast +
      '; font-family:Arial; font-size:12px;';
    n.textContent =
      'Reposition mode: click on the 360° image to set new position • Press ESC to cancel';
    document.body.appendChild(n);
    // esc to cancel
    this._escCancelReposition = (e) => {
      if (e.key === 'Escape') this.cancelReposition();
    };
    window.addEventListener('keydown', this._escCancelReposition);
  }

  hideRepositionNotice() {
    const n = document.getElementById('reposition-notice');
    if (n && n.parentNode) n.parentNode.removeChild(n);
    if (this._escCancelReposition) {
      window.removeEventListener('keydown', this._escCancelReposition);
      this._escCancelReposition = null;
    }
  }

  applyReposition(evt) {
    const id = this.repositioningHotspotId;
    if (!id) return;
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot) {
      this.cancelReposition();
      return;
    }

    const intersection = this._resolveSceneMediaIntersection(evt);
    if (!intersection) return;
    const camera = document.querySelector('#cam');
    const pos = this.calculateOptimalPosition(intersection, camera);
    const newPos = `${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}`;

    // Update data
    hotspot.position = newPos;
    const sceneHotspot = (this.scenes[this.currentScene].hotspots || []).find((h) => h.id === id);
    if (sceneHotspot) sceneHotspot.position = newPos;

    // Update entity
    const el = document.getElementById(`hotspot-${id}`);
    if (el) el.setAttribute('position', newPos);

    this.saveScenesData(); // Save after moving hotspot
    this._setHotspotTranslucent(id, false);
    this.repositioningHotspotId = null;
    this.hideRepositionNotice();
    this.updateHotspotList();
    this.showStartingPointFeedback('Hotspot moved');
  }

  cancelReposition() {
    if (this.repositioningHotspotId) {
      this._setHotspotTranslucent(this.repositioningHotspotId, false);
    }
    this.repositioningHotspotId = null;
    this.hideRepositionNotice();
  }

  _setHotspotTranslucent(id, on) {
    const el = document.getElementById(`hotspot-${id}`);
    if (!el) return;
    try {
      if (on) {
        // Keep the main invisible plane completely invisible during repositioning
        el.setAttribute('material', {
          transparent: true,
          opacity: 0, // Keep invisible plane invisible
        });

        // Find and make only the visible info button semi-transparent
        const infoButton = el.querySelector('a-entity[geometry*="circle"][material*="color"]');
        if (infoButton) {
          const currentMaterial = infoButton.getAttribute('material') || {};
          // Store original material for restoration
          this._repositionPrevMaterial = {
            id,
            infoButtonMaterial: { ...currentMaterial },
          };

          // Make info button semi-transparent for visual feedback
          infoButton.setAttribute('material', {
            ...currentMaterial,
            opacity: 0.55,
            transparent: true,
          });
        }

        // Animation removed for cleaner UX
      } else {
        // Restore invisible plane to completely invisible
        el.setAttribute('material', {
          transparent: true,
          opacity: 0,
        });

        // Restore info button to original appearance
        const infoButton = el.querySelector('a-entity[geometry*="circle"][material*="color"]');
        if (infoButton && this._repositionPrevMaterial && this._repositionPrevMaterial.id === id) {
          const originalMaterial = this._repositionPrevMaterial.infoButtonMaterial || {
            color: '#4A90E2',
            opacity: 0.9,
            transparent: true,
          };
          infoButton.setAttribute('material', originalMaterial);
        } else if (infoButton) {
          // Fallback to default info button appearance
          infoButton.setAttribute('material', {
            color: '#4A90E2',
            opacity: 0.9,
            transparent: true,
          });
        }

        // Remove pulse animation
        el.removeAttribute('animation__pulse');
      }
    } catch (e) {
      if (!on) {
        // Error recovery: ensure invisible plane stays invisible
        el.setAttribute('material', { transparent: true, opacity: 0 });
        el.removeAttribute('animation__pulse');

        // Restore info button if possible
        const infoButton = el.querySelector('a-entity[geometry*="circle"][material*="color"]');
        if (infoButton) {
          infoButton.setAttribute('material', {
            color: '#4A90E2',
            opacity: 0.9,
            transparent: true,
          });
        }
      }
    }
  }

  selectHotspot(id) {
    // Remove previous selection
    document.querySelectorAll('.hotspot-item').forEach((item) => {
      item.classList.remove('selected');
    });

    // Add selection to current item
    const item = document.querySelector(`[data-hotspot-id="${id}"]`);
    if (item) {
      item.classList.add('selected');
      this.selectedHotspotId = id;

      // Highlight the hotspot in the scene
      const hotspotEl = document.getElementById(`hotspot-${id}`);
      if (hotspotEl) {
        // Add a temporary highlight effect
        hotspotEl.emit('highlight');
      }
    }
  }

  deleteHotspot(id) {
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot) return false;

    if (!confirm('Delete this hotspot?')) return false;

    this.hotspots = this.hotspots.filter((h) => h.id !== id);

    if (this.scenes[this.currentScene]?.hotspots) {
      this.scenes[this.currentScene].hotspots = this.scenes[this.currentScene].hotspots.filter(
        (h) => h.id !== id
      );
    }

    const hotspotEl = document.getElementById(`hotspot-${id}`);
    if (hotspotEl) {
      hotspotEl.remove();
    }

    if (this.selectedHotspotId === id) {
      this.selectedHotspotId = null;
    }

    this.updateHotspotList();
    this.saveScenesData();
    return true;
  }

  clearAllHotspots() {
    if (this.hotspots.length === 0) return;

    if (confirm('Clear all hotspots?')) {
      this.hotspots.forEach((hotspot) => {
        const hotspotEl = document.getElementById(`hotspot-${hotspot.id}`);
        if (hotspotEl) {
          hotspotEl.remove();
        }
      });

      this.hotspots = [];
      this.updateHotspotList();
      this.saveScenesData(); // Save after clearing all hotspots
    }
  }

  async saveTemplate() {
    const templateName =
      document.getElementById('template-name').value || `hotspot-project-${Date.now()}`;

    const exportMode = await this.showExportModeDialog({
      title: 'Save Template',
      description: 'Choose how media should be included in your exported ZIP.',
    });
    if (!exportMode) return;

    this.saveAsCompleteProject(templateName, exportMode);
  }

  showExportModeDialog(options = {}) {
    const {
      title = 'Export Project',
      description = 'Choose how media should be included.',
      defaultMode = 'bundle',
    } = options;
    const videoUrlModeEnabled = Boolean(this._videoExportUrlModeEnabled);
    const bundleChecked = defaultMode !== 'urls';
    const urlsChecked = defaultMode === 'urls';

    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: ${EDITOR_LAYER.dialog}; display: flex;
        align-items: center; justify-content: center; font-family: Arial;
      `;

      dialog.innerHTML = `
        <div style="background: #2a2a2a; padding: 28px; border-radius: 12px; color: white; max-width: 520px; width: calc(100% - 40px); box-shadow: 0 12px 40px rgba(0,0,0,0.45);">
          <h3 style="margin: 0 0 8px 0; color: #4CAF50;">${title}</h3>
          <p style="color: #ccc; margin: 0 0 20px 0; line-height: 1.5; font-size: 14px;">${description}</p>

          <label style="display: block; margin-bottom: 12px; padding: 14px; border: 2px solid #4CAF50; border-radius: 8px; cursor: pointer; background: rgba(76,175,80,0.08);">
            <input type="radio" name="export-mode" value="bundle" ${bundleChecked ? 'checked' : ''} style="margin-right: 10px;" />
            <strong>Include media in the package</strong>
            <div style="color: #aaa; font-size: 12px; margin: 6px 0 0 24px; line-height: 1.45;">
              Downloads videos, images, and audio into the ZIP. Best for offline use or sharing a self-contained project. Larger file size.
            </div>
          </label>

          <label style="display: block; margin-bottom: 22px; padding: 14px; border: 2px solid #555; border-radius: 8px; cursor: pointer;">
            <input type="radio" name="export-mode" value="urls" ${urlsChecked ? 'checked' : ''} style="margin-right: 10px;" />
            <strong>Keep online URLs</strong>
            <div style="color: #aaa; font-size: 12px; margin: 6px 0 0 24px; line-height: 1.45;">
              Leaves hosted media (Backblaze, common assets, remote links) as URLs in config.json. Smaller ZIP — requires internet when viewing.
            </div>
          </label>

          ${
            videoUrlModeEnabled
              ? `<p style="color: #ffb74d; font-size: 12px; margin: 0 0 12px 0; line-height: 1.45;">
            <strong>Video note:</strong> Internet connection is required to play videos when using Keep online URLs.
            Compressed videos uploaded to the server can stay online instead of being copied into the ZIP.
          </p>`
              : ''
          }

          <p style="color: #888; font-size: 12px; margin: 0 0 18px 0; line-height: 1.4;">
            ${
              videoUrlModeEnabled
                ? 'Videos stored only in this browser are always included so the export does not break.'
                : 'Files uploaded only to this browser are always included so the export does not break.'
            }
          </p>

          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" id="export-mode-cancel" style="
              background: #666; color: white; border: none; padding: 12px 18px;
              border-radius: 6px; cursor: pointer;
            ">Cancel</button>
            <button type="button" id="export-mode-continue" style="
              background: #4CAF50; color: white; border: none; padding: 12px 18px;
              border-radius: 6px; cursor: pointer; font-weight: bold;
            ">Continue</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      const radios = dialog.querySelectorAll('input[name="export-mode"]');
      const labels = dialog.querySelectorAll('label');
      const syncBorder = () => {
        labels.forEach((label) => {
          const input = label.querySelector('input[name="export-mode"]');
          label.style.borderColor = input?.checked ? '#4CAF50' : '#555';
          label.style.background = input?.checked ? 'rgba(76,175,80,0.08)' : 'transparent';
        });
      };
      radios.forEach((radio) => radio.addEventListener('change', syncBorder));

      const close = (value) => {
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        resolve(value);
      };

      dialog.querySelector('#export-mode-cancel').onclick = () => close(null);
      dialog.querySelector('#export-mode-continue').onclick = () => {
        const selected = dialog.querySelector('input[name="export-mode"]:checked');
        close(selected ? selected.value : 'bundle');
      };
    });
  }

  _isRemoteMediaUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  _baseNameFromRemoteUrl(url, fallback = 'file.bin') {
    if (!this._isRemoteMediaUrl(url)) return fallback;
    try {
      const segment = new URL(url).pathname.split('/').pop();
      return segment ? decodeURIComponent(segment) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  async _bundleRemoteAssetToFolder(url, folder, filename, folderName) {
    if (!folder || !this._isRemoteMediaUrl(url)) return null;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      folder.file(filename, blob);
      return `./${folderName}/${filename}`;
    } catch (_) {
      return null;
    }
  }

  async saveAsCompleteProject(templateName, exportMode = 'bundle') {
    try {
      // Show progress
      const progressDiv = this.showProgress('Creating complete project...');

      // Create JSZip instance
      const JSZip = window.JSZip || (await this.loadJSZip());
      const zip = new JSZip();

      // Get current skybox image - handle both data URLs and file paths
      const skyboxImg = document.querySelector('#main-panorama');
      const skyboxSrc = skyboxImg ? skyboxImg.src : '';

      // Create project structure with all scenes
      await this.addFilesToZip(zip, templateName, skyboxSrc, exportMode);

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      this.downloadBlob(content, `${templateName}.zip`);

      this.hideProgress(progressDiv);
      alert(`Complete project "${templateName}.zip" created! Extract and open index.html to run.`);
    } catch (error) {
      alert(`Error creating project: ${error.message}`);
    }
  }

  async loadJSZip() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  }

  async addFilesToZip(zip, templateName, skyboxSrc, exportMode = 'bundle') {
    // Add main HTML file
    const htmlContent = this.generateCompleteHTML(templateName);
    zip.file('index.html', htmlContent);

    // Add JavaScript file
    const jsContent = this.generateCompleteJS();
    zip.file('script.js', jsContent);

    // Add CSS file
    const cssContent = this.generateCSS();
    zip.file('style.css', cssContent);

    // Create folders
    const imagesFolder = zip.folder('images');
    const audioFolder = zip.folder('audio');
    const videosFolder = zip.folder('videos');
    const modelsFolder = zip.folder('models');

    // Add real assets from current project
    await this.addRealAssets(imagesFolder, audioFolder);

    // Add all scene images
    await this.addSceneImages(imagesFolder);

    // Add ground textures if ground is enabled
    await this.addGroundTextures(imagesFolder);

    // Add configuration with all scenes and hotspots (with corrected image/audio paths)
    const scenes = await this.normalizeScenePathsForExport(
      audioFolder,
      imagesFolder,
      videosFolder,
      modelsFolder,
      exportMode
    );
    const config = {
      name: templateName,
      created: new Date().toISOString(),
      scenes,
      currentScene: this.getFirstSceneId(), // Use first scene as starting scene
      customStyles: this.customStyles, // Include custom styles in template
      version: '1.0',
    };
    zip.file('config.json', JSON.stringify(config, null, 2));

    // Add README
    const readmeContent = `# VR Hotspot Project: ${templateName}

## How to Use
1. Open index.html in a web browser
2. Click on hotspots to interact with content
3. Use mouse to look around the 360° environment
4. Compatible with VR headsets

## Files Structure
- index.html - Main project file
- script.js - Project functionality
- style.css - Styling
- config.json - Project configuration with all scenes
- images/ - Image assets including scene panoramas
- audio/ - Audio assets

## Requirements
- Modern web browser
- Internet connection (for A-Frame library)

Generated by VR Hotspot Editor on ${new Date().toLocaleDateString()}
`;
    zip.file('README.md', readmeContent);
  }

  async addSceneImages(imagesFolder) {
    for (const [sceneId, scene] of Object.entries(this.scenes)) {
      if (scene.image.startsWith('data:')) {
        // Convert data URL to blob
        const response = await fetch(scene.image);
        const blob = await response.blob();
        imagesFolder.file(`${sceneId}.jpg`, blob);
      } else if (scene.image.startsWith('./images/')) {
        // Copy existing image files
        try {
          const response = await fetch(scene.image);
          if (response.ok) {
            const blob = await response.blob();
            const filename = scene.image.split('/').pop();
            imagesFolder.file(filename, blob);
          }
        } catch (e) {
          console.warn(`Could not copy scene image: ${scene.image}`);
        }
      }
    }
  }

  async addGroundTextures(imagesFolder) {
    // Helper function to export ground texture from IndexedDB
    const exportGroundTexture = async (storageKey, filename) => {
      if (!storageKey) return;

      try {
        const record = await this.getImageFromIDB(storageKey);
        if (record && record.blob) {
          imagesFolder.file(filename, record.blob);
          console.log(`Exported ground texture: ${filename}`);
        }
      } catch (error) {
        console.warn(`Could not export ground texture ${filename}:`, error);
      }
    };

    // Export ground textures for ALL scenes
    for (const [sceneId, scene] of Object.entries(this.scenes)) {
      if (!scene || !scene.ground || !scene.ground.enabled) {
        continue;
      }

      const ground = scene.ground;
      // Only export if essential textures are present
      if (!ground.diffuseMap || !ground.normalMap) {
        continue;
      }

      // Export all ground textures with scene-specific filenames
      await exportGroundTexture(ground.diffuseMapStorageKey, `ground-diffuse-${sceneId}.jpg`);
      await exportGroundTexture(ground.normalMapStorageKey, `ground-normal-${sceneId}.jpg`);

      if (ground.roughnessMap) {
        await exportGroundTexture(ground.roughnessMapStorageKey, `ground-roughness-${sceneId}.jpg`);
      }

      if (ground.aoMap) {
        await exportGroundTexture(ground.aoMapStorageKey, `ground-ao-${sceneId}.jpg`);
      }

      if (ground.displacementMap) {
        await exportGroundTexture(
          ground.displacementMapStorageKey,
          `ground-displacement-${sceneId}.jpg`
        );
      }
    }
  }

  async normalizeScenePathsForExport(
    audioFolder,
    imagesFolder,
    videosFolder,
    modelsFolder,
    exportMode = 'bundle'
  ) {
    const normalizedScenes = {};
    const preserveUrls = exportMode === 'urls';

    const extFromMime = (mime, fallback = '.mp4') => {
      if (!mime || typeof mime !== 'string') return fallback;
      const m = mime.toLowerCase();
      if (m.includes('webm')) return '.webm';
      if (m.includes('mp4')) return '.mp4';
      if (m.includes('ogg')) return '.ogv';
      if (m.includes('quicktime') || m.includes('mov')) return '.mov';
      return fallback;
    };

    // Helper to sanitize filenames for export (decode %20 etc. and remove illegal chars)
    const sanitizeExportFileName = (name, fallbackExt = '.mp4') => {
      if (!name || typeof name !== 'string') return `file${fallbackExt}`;
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch (_) {
        /* keep as-is if bad URI */
      }
      // Trim and normalize whitespace
      decoded = decoded
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ');
      // Remove path fragments and illegal filename characters
      decoded = decoded.replace(/^.*[\\\/]/, ''); // drop any directories
      decoded = decoded.replace(/[\\/:*?"<>|]/g, '_'); // Windows-illegal
      // Ensure we keep a reasonable extension
      if (!/\.[a-zA-Z0-9]{2,5}$/.test(decoded) && fallbackExt) {
        decoded += fallbackExt;
      }
      return decoded;
    };

    const bundleRemoteAudio = async (remoteUrl, fallbackName) => {
      if (preserveUrls || !remoteUrl || !this._isRemoteMediaUrl(remoteUrl) || !audioFolder) {
        return remoteUrl;
      }
      const ext = /\.ogg(\?|$)/i.test(remoteUrl)
        ? '.ogg'
        : /\.wav(\?|$)/i.test(remoteUrl)
        ? '.wav'
        : '.mp3';
      const baseName = sanitizeExportFileName(
        this._baseNameFromRemoteUrl(remoteUrl, `${fallbackName}${ext}`),
        ext
      );
      return (
        (await this._bundleRemoteAssetToFolder(remoteUrl, audioFolder, baseName, 'audio')) ||
        remoteUrl
      );
    };

    const bundleRemoteImage = async (remoteUrl, fallbackName) => {
      if (preserveUrls || !remoteUrl || !this._isRemoteMediaUrl(remoteUrl) || !imagesFolder) {
        return remoteUrl;
      }
      const ext = /\.png(\?|$)/i.test(remoteUrl)
        ? '.png'
        : /\.webp(\?|$)/i.test(remoteUrl)
        ? '.webp'
        : /\.gif(\?|$)/i.test(remoteUrl)
        ? '.gif'
        : '.jpg';
      const baseName = sanitizeExportFileName(
        this._baseNameFromRemoteUrl(remoteUrl, `${fallbackName}${ext}`),
        ext
      );
      return (
        (await this._bundleRemoteAssetToFolder(remoteUrl, imagesFolder, baseName, 'images')) ||
        remoteUrl
      );
    };

    const bundleRemoteVideo = async (remoteUrl, fallbackName) => {
      if (preserveUrls || !remoteUrl || !this._isRemoteMediaUrl(remoteUrl) || !videosFolder) {
        return remoteUrl;
      }
      const ext = /\.webm(\?|$)/i.test(remoteUrl) ? '.webm' : '.mp4';
      const baseName = sanitizeExportFileName(
        this._baseNameFromRemoteUrl(remoteUrl, `${fallbackName}${ext}`),
        ext
      );
      return (
        (await this._bundleRemoteAssetToFolder(remoteUrl, videosFolder, baseName, 'videos')) ||
        remoteUrl
      );
    };

    const bundleRemoteModel = async (remoteUrl, fallbackName) => {
      if (preserveUrls || !remoteUrl || !this._isRemoteMediaUrl(remoteUrl) || !modelsFolder) {
        return remoteUrl;
      }
      const ext = /\.gltf(\?|$)/i.test(remoteUrl) ? '.gltf' : '.glb';
      const baseName = sanitizeExportFileName(
        this._baseNameFromRemoteUrl(remoteUrl, `${fallbackName}${ext}`),
        ext
      );
      return (
        (await this._bundleRemoteAssetToFolder(remoteUrl, modelsFolder, baseName, 'models')) ||
        remoteUrl
      );
    };

    for (const [sceneId, scene] of Object.entries(this.scenes)) {
      // Create new scene object without deep copying to preserve File objects
      const newScene = {
        name: scene.name,
        type: scene.type || 'image', // Include scene type
        image:
          this.isCommonAssetObject(scene) && scene.type === 'image'
            ? scene.commonAssetUrl
            : this.getExportImagePath(scene.image, sceneId, scene),
        videoSrc:
          this.isCommonAssetObject(scene) && scene.type === 'video'
            ? scene.commonAssetUrl
            : scene.videoSrc || null,
        videoVolume: scene.videoVolume || 0.5, // Include video volume
        hotspots: [],
        startingPoint: scene.startingPoint,
        globalSound: null,
        ground: null, // Will be populated below with proper paths
      };

      const sceneUsesCommonAsset = this.isCommonAssetObject(scene);

      if (sceneUsesCommonAsset) {
        if (newScene.type === 'video' && scene.commonAssetUrl) {
          newScene.videoSrc = scene.commonAssetUrl;
        }
        if (newScene.type === 'image' && scene.commonAssetUrl) {
          newScene.image = scene.commonAssetUrl;
        }
        if (!preserveUrls) {
          if (newScene.type === 'video' && scene.commonAssetUrl && videosFolder) {
            const ext = /\.webm(\?|$)/i.test(scene.commonAssetUrl) ? '.webm' : '.mp4';
            const bundled = await this._bundleRemoteAssetToFolder(
              scene.commonAssetUrl,
              videosFolder,
              `${sceneId}${ext}`,
              'videos'
            );
            if (bundled) newScene.videoSrc = bundled;
          }
          if (newScene.type === 'image' && scene.commonAssetUrl && imagesFolder) {
            const ext = /\.png(\?|$)/i.test(scene.commonAssetUrl)
              ? '.png'
              : /\.webp(\?|$)/i.test(scene.commonAssetUrl)
              ? '.webp'
              : '.jpg';
            const bundled = await this._bundleRemoteAssetToFolder(
              scene.commonAssetUrl,
              imagesFolder,
              `${sceneId}${ext}`,
              'images'
            );
            if (bundled) newScene.image = bundled;
          }
        }
      }

      // Process ground textures for export
      if (scene.ground && scene.ground.enabled) {
        newScene.ground = {
          enabled: true,
          size: scene.ground.size || { width: 200, depth: 200 },
          position: scene.ground.position || { x: 0, y: 0, z: 0 },
          repeat: scene.ground.repeat || 200,
          // Set paths to where files will be in the ZIP
          diffuseMap: scene.ground.diffuseMapStorageKey
            ? `./images/ground-diffuse-${sceneId}.jpg`
            : null,
          normalMap: scene.ground.normalMapStorageKey
            ? `./images/ground-normal-${sceneId}.jpg`
            : null,
          roughnessMap: scene.ground.roughnessMapStorageKey
            ? `./images/ground-roughness-${sceneId}.jpg`
            : null,
          aoMap: scene.ground.aoMapStorageKey ? `./images/ground-ao-${sceneId}.jpg` : null,
          displacementMap: scene.ground.displacementMapStorageKey
            ? `./images/ground-displacement-${sceneId}.jpg`
            : null,
        };
      }

      // If this is an image scene and the source is local/IDB, export the blob
      if (newScene.type === 'image' && !sceneUsesCommonAsset) {
        if (preserveUrls && this._isRemoteMediaUrl(scene.image)) {
          newScene.image = scene.image;
        } else try {
          const isRemote =
            typeof scene.image === 'string' &&
            (scene.image.startsWith('http://') || scene.image.startsWith('https://'));
          if (!isRemote) {
            const key = scene.imageStorageKey || 'image_scene_' + sceneId;
            const rec = await this.getImageFromIDB(key);
            if (rec && rec.blob && imagesFolder) {
              const baseName = rec.name || sceneId + '.jpg';
              const ext =
                baseName && /\.[a-zA-Z0-9]{2,5}$/.test(baseName)
                  ? baseName.match(/\.[a-zA-Z0-9]{2,5}$/)[0]
                  : '.jpg';
              const cleanName = sanitizeExportFileName(baseName, ext);
              imagesFolder.file(cleanName, rec.blob);
              newScene.image = './images/' + cleanName;
            }
          }
        } catch (_) {
          /* ignore */
        }

        if (
          !preserveUrls &&
          this._isRemoteMediaUrl(newScene.image) &&
          imagesFolder &&
          !newScene.image.startsWith('./images/')
        ) {
          const ext = /\.png(\?|$)/i.test(newScene.image)
            ? '.png'
            : /\.webp(\?|$)/i.test(newScene.image)
            ? '.webp'
            : '.jpg';
          const bundled = await this._bundleRemoteAssetToFolder(
            newScene.image,
            imagesFolder,
            `${sceneId}${ext}`,
            'images'
          );
          if (bundled) newScene.image = bundled;
        }
      }

      // If this is a video scene and the source is a blob URL or local, try to export the actual file from IDB
      if (newScene.type === 'video' && !sceneUsesCommonAsset) {
        if (
          this._videoExportUrlModeEnabled &&
          preserveUrls &&
          typeof scene.hostedVideoUrl === 'string' &&
          /^https?:\/\//i.test(scene.hostedVideoUrl)
        ) {
          newScene.videoSrc = scene.hostedVideoUrl;
        } else if (preserveUrls && this._isRemoteMediaUrl(scene.videoSrc)) {
          newScene.videoSrc = scene.videoSrc;
        } else if (
          this._videoExportUrlModeEnabled &&
          typeof scene.hostedVideoUrl === 'string' &&
          /^https?:\/\//i.test(scene.hostedVideoUrl) &&
          videosFolder
        ) {
          const ext = /\.webm(\?|$)/i.test(scene.hostedVideoUrl) ? '.webm' : '.mp4';
          const bundled = await this._bundleRemoteAssetToFolder(
            scene.hostedVideoUrl,
            videosFolder,
            `${sceneId}${ext}`,
            'videos'
          );
          if (bundled) newScene.videoSrc = bundled;
        } else try {
          const isBlobUrl =
            typeof scene.videoSrc === 'string' && scene.videoSrc.startsWith('blob:');
          const isDataUrl =
            typeof scene.videoSrc === 'string' && scene.videoSrc.startsWith('data:');
          if (isBlobUrl || isDataUrl || scene.videoStorageKey) {
            if (
              this._videoExportUrlModeEnabled &&
              preserveUrls &&
              typeof scene.hostedVideoUrl === 'string' &&
              /^https?:\/\//i.test(scene.hostedVideoUrl)
            ) {
              newScene.videoSrc = scene.hostedVideoUrl;
            } else {
            const db = await this.openVideoDB();
            if (db) {
              const rec = await this.getVideoFromIDB(scene.videoStorageKey || sceneId);
              if (rec && rec.blob) {
                const vFolder = videosFolder;
                if (vFolder) {
                  const baseName = rec.name || scene.videoFileName || sceneId + '.mp4';
                  const ext =
                    baseName && /\.[a-zA-Z0-9]{2,5}$/.test(baseName)
                      ? baseName.match(/\.[a-zA-Z0-9]{2,5}$/)[0]
                      : '.mp4';
                  const cleanName = sanitizeExportFileName(baseName, ext);
                  vFolder.file(cleanName, rec.blob);
                  newScene.videoSrc = './videos/' + cleanName;
                }
              }
            }
            }
          }
        } catch (_) {
          /* ignore export video failure, keep original src */
        }

        // Fallback: if we still have a blob:/data: URL, export by fetching it directly.
        // This prevents exported/hosted projects from referencing non-transferable blob URLs.
        try {
          const isStillBlob =
            typeof newScene.videoSrc === 'string' && newScene.videoSrc.startsWith('blob:');
          const isStillData =
            typeof newScene.videoSrc === 'string' && newScene.videoSrc.startsWith('data:');
          if ((isStillBlob || isStillData) && videosFolder) {
            const resp = await fetch(newScene.videoSrc);
            if (resp && resp.ok) {
              const blob = await resp.blob();
              const fallbackExt = extFromMime(blob?.type, '.mp4');
              const baseName = sanitizeExportFileName(
                scene.videoFileName || sceneId + fallbackExt,
                fallbackExt
              );
              videosFolder.file(baseName, blob);
              newScene.videoSrc = './videos/' + baseName;
            }
          }
        } catch (_) {
          /* ignore; keep original src */
        }

        if (
          !preserveUrls &&
          this._isRemoteMediaUrl(newScene.videoSrc) &&
          videosFolder &&
          !String(newScene.videoSrc).startsWith('./videos/')
        ) {
          const ext = /\.webm(\?|$)/i.test(newScene.videoSrc) ? '.webm' : '.mp4';
          const bundled = await this._bundleRemoteAssetToFolder(
            newScene.videoSrc,
            videosFolder,
            `${sceneId}${ext}`,
            'videos'
          );
          if (bundled) newScene.videoSrc = bundled;
        }
      }

      // Handle global sound (export blobs/IDB to files)
      if (scene.globalSound && scene.globalSound.enabled) {
        const gs = scene.globalSound;
        let outPath = null;
        if (this.isCommonAssetObject(gs)) {
          outPath = gs.commonAssetUrl;
        } else try {
          if (gs.audio instanceof File) {
            const baseName = sanitizeExportFileName(
              `global_${sceneId}_` + (gs.audio.name || 'audio.mp3'),
              '.mp3'
            );
            if (audioFolder) audioFolder.file(baseName, gs.audio);
            outPath = './audio/' + baseName;
          } else if (typeof gs.audio === 'string') {
            if (gs.audio.startsWith('http://') || gs.audio.startsWith('https://')) {
              outPath = gs.audio; // keep remote URLs
            } else if (gs.audio.startsWith('./audio/')) {
              outPath = gs.audio; // already a packaged path
            } else if (
              gs.audio.startsWith('blob:') ||
              gs.audio.startsWith('data:') ||
              gs.audioStorageKey
            ) {
              // Prefer IDB when available
              let rec = null;
              if (gs.audioStorageKey) {
                try {
                  rec = await this.getAudioFromIDB(gs.audioStorageKey);
                } catch (_) {}
              }
              if (rec && rec.blob) {
                const baseName = sanitizeExportFileName(
                  gs.audioFileName || `global_${sceneId}.mp3`,
                  '.mp3'
                );
                if (audioFolder) audioFolder.file(baseName, rec.blob);
                outPath = './audio/' + baseName;
              } else {
                // Fallback: fetch blob/data URL and write it
                try {
                  const resp = await fetch(gs.audio);
                  const blob = await resp.blob();
                  const baseName = sanitizeExportFileName(
                    gs.audioFileName || `global_${sceneId}.mp3`,
                    '.mp3'
                  );
                  if (audioFolder) audioFolder.file(baseName, blob);
                  outPath = './audio/' + baseName;
                } catch (_) {
                  /* keep null */
                }
              }
            }
          }
        } catch (_) {
          /* ignore */
        }
        if (outPath) {
          outPath = await bundleRemoteAudio(outPath, `global_${sceneId}`);
          newScene.globalSound = {
            audio: outPath,
            volume: gs.volume || 0.5,
            enabled: true,
          };
        }
      }

      // Process each hotspot, handling File objects properly
      if (Array.isArray(scene.hotspots)) {
        for (const origHotspot of scene.hotspots) {
          const newHotspot = {
            id: origHotspot.id,
            type: origHotspot.type,
            position: origHotspot.position,
            text: origHotspot.text,
            scene: origHotspot.scene,
            navigationTarget: origHotspot.navigationTarget,
            audio: null,
            audioLoop: origHotspot.audioLoop !== false, // Preserve audioLoop setting, default to true
          };

          // Handle audio properly (export blobs/IDB to files)
          if (origHotspot.commonAssetUrl && (origHotspot.type === 'audio' || origHotspot.type === 'text-audio')) {
            newHotspot.audio = origHotspot.commonAssetUrl;
          } else if (origHotspot.audio) {
            try {
              if (origHotspot.audio instanceof File) {
                const baseName = sanitizeExportFileName(
                  `${sceneId}_${origHotspot.id}_` + (origHotspot.audio.name || 'audio.mp3'),
                  '.mp3'
                );
                if (audioFolder) audioFolder.file(baseName, origHotspot.audio);
                newHotspot.audio = './audio/' + baseName;
              } else if (typeof origHotspot.audio === 'string') {
                if (
                  origHotspot.audio.startsWith('http://') ||
                  origHotspot.audio.startsWith('https://')
                ) {
                  newHotspot.audio = origHotspot.audio; // remote URL
                } else if (origHotspot.audio.startsWith('./audio/')) {
                  newHotspot.audio = origHotspot.audio; // packaged path
                } else if (
                  origHotspot.audio.startsWith('blob:') ||
                  origHotspot.audio.startsWith('data:') ||
                  origHotspot.audioStorageKey
                ) {
                  // Prefer IDB when available
                  let rec = null;
                  if (origHotspot.audioStorageKey) {
                    try {
                      rec = await this.getAudioFromIDB(origHotspot.audioStorageKey);
                    } catch (_) {}
                  }
                  if (rec && rec.blob) {
                    const baseName = sanitizeExportFileName(
                      origHotspot.audioFileName || `${sceneId}_${origHotspot.id}.mp3`,
                      '.mp3'
                    );
                    if (audioFolder) audioFolder.file(baseName, rec.blob);
                    newHotspot.audio = './audio/' + baseName;
                  } else {
                    // Fallback: fetch blob/data URL and write it
                    try {
                      const resp = await fetch(origHotspot.audio);
                      const blob = await resp.blob();
                      const baseName = sanitizeExportFileName(
                        origHotspot.audioFileName || `${sceneId}_${origHotspot.id}.mp3`,
                        '.mp3'
                      );
                      if (audioFolder) audioFolder.file(baseName, blob);
                      newHotspot.audio = './audio/' + baseName;
                    } catch (_) {
                      newHotspot.audio = null;
                    }
                  }
                } else {
                  // Unknown relative; keep as-is
                  newHotspot.audio = origHotspot.audio;
                }
              }
            } catch (_) {
              newHotspot.audio = null;
            }
          } else {
            newHotspot.audio = null;
          }

          if (newHotspot.audio) {
            newHotspot.audio = await bundleRemoteAudio(
              newHotspot.audio,
              `${sceneId}_${origHotspot.id}`
            );
          }

          // Preserve popup sizing for text-based hotspots in export
          if (origHotspot.type === 'text' || origHotspot.type === 'text-audio') {
            if (typeof origHotspot.popupWidth === 'number') {
              newHotspot.popupWidth = Math.min(10, Math.max(2, origHotspot.popupWidth));
            }
            if (typeof origHotspot.popupHeight === 'number') {
              newHotspot.popupHeight = Math.min(10, Math.max(1.5, origHotspot.popupHeight));
            }
          }

          // Image / video hotspot export with actual file copying / embedding
          if (origHotspot.type === 'image') {
            newHotspot.mediaKind = origHotspot.mediaKind || 'photo';
            newHotspot.videoLoop = origHotspot.videoLoop !== false;
            newHotspot.videoMuted = origHotspot.videoMuted !== false;
            if (typeof origHotspot.imageScale === 'number') {
              newHotspot.imageScale = Math.min(10, Math.max(0.1, origHotspot.imageScale));
            } else if (typeof origHotspot.imageWidth === 'number') {
              const derived = Math.min(10, Math.max(0.1, origHotspot.imageWidth));
              newHotspot.imageScale = derived;
            }
            if (
              typeof origHotspot.imageAspectRatio === 'number' &&
              isFinite(origHotspot.imageAspectRatio) &&
              origHotspot.imageAspectRatio > 0
            ) {
              newHotspot.imageAspectRatio = origHotspot.imageAspectRatio;
            } else if (
              typeof origHotspot._aspectRatio === 'number' &&
              isFinite(origHotspot._aspectRatio) &&
              origHotspot._aspectRatio > 0
            ) {
              newHotspot.imageAspectRatio = origHotspot._aspectRatio;
            }

            if (origHotspot.mediaKind === 'video') {
              if (origHotspot.commonAssetUrl) {
                newHotspot.video = origHotspot.commonAssetUrl;
              } else {
                const effVideoKey =
                  origHotspot.videoStorageKey ||
                  (typeof origHotspot.id === 'number' ? `video_hotspot_${origHotspot.id}` : null);
                if (effVideoKey) {
                  try {
                    const rec = await this.getVideoFromIDB(effVideoKey);
                    if (rec && rec.blob && videosFolder) {
                      const baseName = rec.name || `${sceneId}_${origHotspot.id}.mp4`;
                      const ext =
                        baseName && /\.[a-zA-Z0-9]{2,5}$/.test(baseName)
                          ? baseName.match(/\.[a-zA-Z0-9]{2,5}$/)[0]
                          : '.mp4';
                      const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
                      videosFolder.file(cleanName, rec.blob);
                      newHotspot.video = `./videos/${cleanName}`;
                    }
                  } catch (_) {}
                }
                if (!newHotspot.video && origHotspot.video instanceof File) {
                  const cleanName = origHotspot.video.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                  const videoFileName = `${sceneId}_${origHotspot.id}_${cleanName}`;
                  if (videosFolder) {
                    videosFolder.file(videoFileName, origHotspot.video);
                    newHotspot.video = `./videos/${videoFileName}`;
                  }
                } else if (!newHotspot.video && typeof origHotspot.video === 'string') {
                  if (origHotspot.video.startsWith('blob:')) {
                    try {
                      const resp = await fetch(origHotspot.video);
                      if (resp.ok) {
                        const blob = await resp.blob();
                        if (videosFolder) {
                          const baseName =
                            (origHotspot.videoFileName &&
                              origHotspot.videoFileName.replace(/[^a-zA-Z0-9._-]/g, '_')) ||
                            `${sceneId}_${origHotspot.id}.mp4`;
                          videosFolder.file(baseName, blob);
                          newHotspot.video = `./videos/${baseName}`;
                        }
                      }
                    } catch (_) {}
                  } else if (/^https?:\/\//i.test(origHotspot.video)) {
                    newHotspot.video = origHotspot.video;
                  } else if (origHotspot.video.startsWith('./videos/')) {
                    newHotspot.video = origHotspot.video;
                  } else if (origHotspot.video) {
                    newHotspot.video = './videos/' + origHotspot.video;
                  }
                }
              }
              if (newHotspot.video) {
                newHotspot.video = await bundleRemoteVideo(
                  newHotspot.video,
                  `${sceneId}_${origHotspot.id}`
                );
              }
            } else if (origHotspot.commonAssetUrl) {
              newHotspot.image = origHotspot.commonAssetUrl;
            } else {
            // Prefer IndexedDB record when available (supports legacy fallback key)
            const effImageKey =
              origHotspot.imageStorageKey ||
              (typeof origHotspot.id === 'number' ? `image_hotspot_${origHotspot.id}` : null);
            if (effImageKey) {
              try {
                const rec = await this.getImageFromIDB(effImageKey);
                if (rec && rec.blob && imagesFolder) {
                  const baseName = rec.name || `${sceneId}_${origHotspot.id}.png`;
                  const ext =
                    baseName && /\.[a-zA-Z0-9]{2,5}$/.test(baseName)
                      ? baseName.match(/\.[a-zA-Z0-9]{2,5}$/)[0]
                      : '.png';
                  const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
                  imagesFolder.file(cleanName, rec.blob);
                  newHotspot.image = `./images/${cleanName}`;
                }
              } catch (_) {
                /* try other strategies below */
              }
            }
            if (!newHotspot.image && origHotspot.image instanceof File) {
              const cleanName = origHotspot.image.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const imgFileName = `${sceneId}_${origHotspot.id}_${cleanName}`;
              if (imagesFolder) {
                imagesFolder.file(imgFileName, origHotspot.image);
                newHotspot.image = `./images/${imgFileName}`;
              } else {
                newHotspot.image = cleanName; // fallback
              }
            } else if (typeof origHotspot.image === 'string') {
              if (origHotspot.image.startsWith('data:')) {
                // data URL -> keep inline for portability
                newHotspot.image = origHotspot.image;
              } else if (origHotspot.image.startsWith('blob:')) {
                // Blob URL from current session – fetch and package into images folder
                try {
                  const resp = await fetch(origHotspot.image);
                  if (resp.ok) {
                    const blob = await resp.blob();
                    if (imagesFolder) {
                      const baseName =
                        (origHotspot.imageFileName &&
                          origHotspot.imageFileName.replace(/[^a-zA-Z0-9._-]/g, '_')) ||
                        `${sceneId}_${origHotspot.id}.png`;
                      imagesFolder.file(baseName, blob);
                      newHotspot.image = `./images/${baseName}`;
                    }
                  }
                } catch (_) {
                  /* if fetch fails, leave unset to avoid broken refs */
                }
              } else if (/^https?:\/\//i.test(origHotspot.image)) {
                newHotspot.image = origHotspot.image; // remote URL
              } else if (origHotspot.image.startsWith('./images/')) {
                newHotspot.image = origHotspot.image; // relative path
              } else {
                newHotspot.image = './images/' + origHotspot.image; // assume relative filename
              }
            } else {
              newHotspot.image = null;
            }
            }

            if (newHotspot.image) {
              newHotspot.image = await bundleRemoteImage(
                newHotspot.image,
                `${sceneId}_${origHotspot.id}`
              );
            }
          }

          // Weblink portal export: include URL, title, and preview (string only)
          if (origHotspot.type === 'weblink') {
            if (typeof origHotspot.weblinkUrl === 'string')
              newHotspot.weblinkUrl = origHotspot.weblinkUrl;
            if (typeof origHotspot.weblinkTitle === 'string')
              newHotspot.weblinkTitle = origHotspot.weblinkTitle;
            if (origHotspot.previewCommonAssetUrl) {
              newHotspot.weblinkPreview = origHotspot.previewCommonAssetUrl;
            } else if (typeof origHotspot.weblinkPreview === 'string')
              newHotspot.weblinkPreview = origHotspot.weblinkPreview;
            else if (origHotspot.weblinkPreview instanceof File) {
              // For now, we keep preview inline only if it's already a data URL; copying file would require a name/path decision.
              // Convert file to data URL is not performed here to avoid async in normalization; preview will be omitted.
            }

            if (newHotspot.weblinkPreview) {
              newHotspot.weblinkPreview = await bundleRemoteImage(
                newHotspot.weblinkPreview,
                `${sceneId}_${origHotspot.id}_preview`
              );
            }
          }

          // Model hotspot export
          if (origHotspot.type === 'model') {
            if (typeof origHotspot.modelScale === 'number') {
              newHotspot.modelScale = Math.min(200, Math.max(0.1, origHotspot.modelScale));
            }
            if (typeof origHotspot.modelRotationX === 'number') {
              newHotspot.modelRotationX = origHotspot.modelRotationX % 360;
            }
            if (typeof origHotspot.modelRotationY === 'number') {
              newHotspot.modelRotationY = origHotspot.modelRotationY % 360;
            }
            if (typeof origHotspot.modelRotationZ === 'number') {
              newHotspot.modelRotationZ = origHotspot.modelRotationZ % 360;
            }
            if (typeof origHotspot.modelPositionY === 'number') {
              newHotspot.modelPositionY = Math.min(5, Math.max(-5, origHotspot.modelPositionY));
            }
            if (origHotspot.commonAssetUrl) {
              newHotspot.model = origHotspot.commonAssetUrl;
            } else {
            // Prefer IndexedDB record when available
            const effModelKey =
              origHotspot.modelStorageKey ||
              (typeof origHotspot.id === 'number' ? `model_hotspot_${origHotspot.id}` : null);
            if (effModelKey) {
              try {
                const rec = await this.getModelFromIDB(effModelKey);
                if (rec && rec.blob && modelsFolder) {
                  const baseName = rec.name || `${sceneId}_${origHotspot.id}.glb`;
                  const ext =
                    baseName && /\.(glb|gltf)$/i.test(baseName)
                      ? baseName.match(/\.(glb|gltf)$/i)[0]
                      : '.glb';
                  const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
                  modelsFolder.file(cleanName, rec.blob);
                  newHotspot.model = `./models/${cleanName}`;
                }
              } catch (_) {
                /* try other strategies below */
              }
            }
            if (!newHotspot.model && origHotspot.model instanceof File) {
              const cleanName = origHotspot.model.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const modelFileName = `${sceneId}_${origHotspot.id}_${cleanName}`;
              if (modelsFolder) {
                modelsFolder.file(modelFileName, origHotspot.model);
                newHotspot.model = `./models/${modelFileName}`;
              }
            } else if (typeof origHotspot.model === 'string') {
              if (origHotspot.model.startsWith('blob:')) {
                // Blob URL from current session – fetch and package into models folder
                try {
                  const resp = await fetch(origHotspot.model);
                  if (resp.ok) {
                    const blob = await resp.blob();
                    if (modelsFolder) {
                      const baseName =
                        (origHotspot.modelFileName &&
                          origHotspot.modelFileName.replace(/[^a-zA-Z0-9._-]/g, '_')) ||
                        `${sceneId}_${origHotspot.id}.glb`;
                      modelsFolder.file(baseName, blob);
                      newHotspot.model = `./models/${baseName}`;
                    }
                  }
                } catch (_) {
                  /* if fetch fails, leave unset to avoid broken refs */
                }
              } else if (/^https?:\/\//i.test(origHotspot.model)) {
                newHotspot.model = origHotspot.model; // remote URL
              } else if (origHotspot.model.startsWith('./models/')) {
                newHotspot.model = origHotspot.model; // relative path
              } else {
                newHotspot.model = './models/' + origHotspot.model; // assume relative filename
              }
            } else {
              newHotspot.model = null;
            }
            }

            if (newHotspot.model) {
              newHotspot.model = await bundleRemoteModel(
                newHotspot.model,
                `${sceneId}_${origHotspot.id}`
              );
            }
          }

          // Harden export: skip invalid image hotspots lacking media reference
          const missingPhotoMedia =
            newHotspot.type === 'image' &&
            newHotspot.mediaKind !== 'video' &&
            (!newHotspot.image ||
              (typeof newHotspot.image === 'string' && newHotspot.image.trim() === ''));
          const missingVideoMedia =
            newHotspot.type === 'image' &&
            newHotspot.mediaKind === 'video' &&
            (!newHotspot.video ||
              (typeof newHotspot.video === 'string' && newHotspot.video.trim() === ''));
          if (missingPhotoMedia || missingVideoMedia) {
            console.warn(
              `[Export] Skipped image hotspot id=${newHotspot.id} in scene=${sceneId} due to missing media.`
            );
          } else {
            newScene.hotspots.push(newHotspot);
          }
        }
      }

      normalizedScenes[sceneId] = newScene;
    }
    return normalizedScenes;
  }

  getExportImagePath(imagePath, sceneId, scene) {
    if (scene && this.isCommonAssetObject(scene) && scene.type === 'image') {
      return scene.commonAssetUrl;
    }
    if (!imagePath || typeof imagePath !== 'string') {
      return `./images/${sceneId}.jpg`;
    }
    // If it's a URL (http:// or https://), use it directly
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    if (imagePath.startsWith('/common-assets/')) {
      return scene?.commonAssetUrl || imagePath;
    }
    // For uploaded scenes (data URLs), save as sceneId.jpg
    else if (imagePath.startsWith('data:')) {
      return `./images/${sceneId}.jpg`;
    }
    // If it's already a proper path starting with ./images/, keep as-is
    else if (imagePath.startsWith('./images/')) {
      return imagePath;
    }
    // Fallback - assume it's a filename and prepend the images path
    else {
      return `./images/${imagePath}`;
    }
  }

  loadTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.name.endsWith('.zip')) {
        this.loadZIPTemplate(file);
      } else {
        alert('Please select a ZIP template file.');
      }
    });

    input.click();
  }

  loadJSONTemplate(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = JSON.parse(e.target.result);
        this.clearAllHotspots();

        // Handle new format with scenes
        if (template.scenes) {
          this.scenes = template.scenes;
          this.currentScene = template.currentScene || 'scene1';
          this.updateSceneDropdown();
          this.loadCurrentScene();
        }
        // Handle legacy format
        else if (template.hotspots) {
          template.hotspots.forEach((hotspotData) => {
            this.createHotspotElement(hotspotData);
            this.hotspots.push(hotspotData);
          });
          this.hotspotIdCounter = Math.max(...this.hotspots.map((h) => h.id), 0);
        }

        // Load custom styles if included
        if (template.customStyles) {
          this.customStyles = template.customStyles;
          this.saveCSSToLocalStorage(); // Save to localStorage
          this.applyStylesToExistingElements(); // Apply to current elements
        }

        this.updateHotspotList();
        this.updateNavigationTargets();
        this.updateStartingPointInfo();

        alert(`Template "${template.name}" loaded successfully!`);
      } catch (error) {
        alert('Error loading template file');
      }
    };
    reader.readAsText(file);
  }

  async loadZIPTemplate(file) {
    try {
      this.showLoadingIndicator('Loading template from ZIP...');

      // Load JSZip library
      const JSZip = window.JSZip || (await this.loadJSZip());

      // Read the ZIP file (File or Blob)
      const arrayBuffer =
        file && typeof file.arrayBuffer === 'function'
          ? await file.arrayBuffer()
          : await new Response(file).arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Extract config.json
      const configFile = zip.file('config.json');
      if (!configFile) {
        throw new Error('Invalid template: config.json not found');
      }

      const configText = await configFile.async('text');
      const config = JSON.parse(configText);

      // Clear existing editor state (without confirmation for template load)
      const container = document.getElementById('hotspot-container');
      if (container) container.innerHTML = '';
      this.hotspots = [];

      // Clear all old assets from IndexedDB before loading new ones (Replace behavior)
      await this.clearAllVideosFromIDB();
      if (typeof this.clearAllImagesFromIDB === 'function') {
        await this.clearAllImagesFromIDB();
      }
      if (typeof this.clearAllAudiosFromIDB === 'function') {
        await this.clearAllAudiosFromIDB();
      }

      // Load scenes and custom styles
      this.scenes = config.scenes || {};
      this.currentScene = config.currentScene || Object.keys(this.scenes)[0] || 'scene1';

      // Try to load customStyles from config (new format)
      // If not present, try to extract from script.js (old format migration)
      if (config.customStyles) {
        this.customStyles = config.customStyles;
      } else {
        // Migration: Extract CUSTOM_STYLES from old exported script.js
        const scriptFile = zip.file('script.js');
        if (scriptFile) {
          try {
            const scriptText = await scriptFile.async('text');
            const match = scriptText.match(/const CUSTOM_STYLES = (\{[\s\S]*?\});/);
            if (match && match[1]) {
              const extractedStyles = JSON.parse(match[1]);
              this.customStyles = extractedStyles;
              console.log('✅ Migrated custom styles from old export:', extractedStyles);
            } else {
              this.customStyles = this.customStyles; // Keep defaults
            }
          } catch (err) {
            console.warn('Could not extract styles from script.js:', err);
            this.customStyles = this.customStyles; // Keep defaults
          }
        } else {
          this.customStyles = this.customStyles; // Keep defaults
        }
      }

      // Process images, videos, and audio from ZIP and store in IndexedDB
      const imagePromises = [];
      const videoPromises = [];
      const audioPromises = [];

      // Extract and convert all scene images
      for (const [sceneId, scene] of Object.entries(this.scenes)) {
        if (scene.type === 'image' && scene.image) {
          // If image is embedded as data URL in config, convert directly
          if (typeof scene.image === 'string' && scene.image.startsWith('data:')) {
            imagePromises.push(
              (async () => {
                try {
                  const resp = await fetch(scene.image);
                  const blob = await resp.blob();
                  const fileName = `${sceneId}.jpg`;
                  const storageKey = scene.imageStorageKey || `image_scene_${sceneId}`;
                  await this.saveImageToIDB(
                    storageKey,
                    new File([blob], fileName, { type: blob.type || 'image/jpeg' })
                  );
                  const blobUrl = URL.createObjectURL(blob);
                  scene.image = blobUrl;
                  scene.imageStorageKey = storageKey;
                  scene.imageFileName = fileName;
                } catch (_) {}
              })()
            );
          } else {
            const imagePath = scene.image.replace('./images/', '');
            const imageFile = zip.file(`images/${imagePath}`);
            if (imageFile) {
              imagePromises.push(
                imageFile.async('blob').then(async (blob) => {
                  try {
                    const file = new File([blob], imagePath, { type: blob.type || 'image/png' });
                    const storageKey = scene.imageStorageKey || `image_scene_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    scene.image = blobUrl;
                    scene.imageStorageKey = storageKey;
                    scene.imageFileName = imagePath;
                  } catch (_) {
                    /* ignore image store failure */
                  }
                })
              );
            }
          }
        } else if (scene.type === 'video' && scene.videoSrc) {
          const videoPath = scene.videoSrc.replace('./videos/', '');
          const videoFile = zip.file(`videos/${videoPath}`);

          if (videoFile) {
            videoPromises.push(
              videoFile.async('blob').then(async (blob) => {
                // Store video in IndexedDB with proper storage key
                const storageKey = sceneId;
                const file = new File([blob], videoPath, { type: blob.type || 'video/mp4' });
                await this.saveVideoToIDB(storageKey, file);

                // Create blob URL for immediate use
                const blobUrl = URL.createObjectURL(blob);
                scene.videoSrc = blobUrl;
                scene.videoStorageKey = storageKey; // Use the standard key name
                scene.videoFileName = videoPath;
              })
            );
          }
        }
      }

      // Extract hotspot images
      for (const scene of Object.values(this.scenes)) {
        if (scene.hotspots) {
          for (const hotspot of scene.hotspots) {
            if (hotspot.type === 'image' && hotspot.mediaKind === 'video' && hotspot.video) {
              if (
                typeof hotspot.video === 'string' &&
                hotspot.video.startsWith('./videos/')
              ) {
                const videoPath = hotspot.video.replace('./videos/', '');
                const videoFile = zip.file(`videos/${videoPath}`);
                if (videoFile) {
                  videoPromises.push(
                    videoFile.async('blob').then(async (blob) => {
                      try {
                        const file = new File([blob], videoPath, {
                          type: blob.type || 'video/mp4',
                        });
                        const storageKey =
                          hotspot.videoStorageKey || `video_hotspot_${hotspot.id}`;
                        await this.saveVideoToIDB(storageKey, file);
                        const blobUrl = URL.createObjectURL(blob);
                        hotspot.video = blobUrl;
                        hotspot.videoStorageKey = storageKey;
                        hotspot.videoFileName = videoPath;
                      } catch (_) {}
                    })
                  );
                }
              }
            } else if (hotspot.type === 'image' && hotspot.image) {
              if (typeof hotspot.image === 'string' && hotspot.image.startsWith('data:')) {
                imagePromises.push(
                  (async () => {
                    try {
                      const resp = await fetch(hotspot.image);
                      const blob = await resp.blob();
                      const fileName = hotspot.imageFileName || `hotspot_${hotspot.id}.png`;
                      const storageKey =
                        hotspot.imageStorageKey ||
                        `image_hotspot_${scene.name || 'scene'}_${hotspot.id}`;
                      await this.saveImageToIDB(
                        storageKey,
                        new File([blob], fileName, { type: blob.type || 'image/png' })
                      );
                      const blobUrl = URL.createObjectURL(blob);
                      hotspot.image = blobUrl;
                      hotspot.imageStorageKey = storageKey;
                      hotspot.imageFileName = fileName;
                    } catch (_) {}
                  })()
                );
              } else if (
                typeof hotspot.image === 'string' &&
                hotspot.image.startsWith('./images/')
              ) {
                const imagePath = hotspot.image.replace('./images/', '');
                const imageFile = zip.file(`images/${imagePath}`);
                if (imageFile) {
                  imagePromises.push(
                    imageFile.async('blob').then(async (blob) => {
                      try {
                        const file = new File([blob], imagePath, {
                          type: blob.type || 'image/png',
                        });
                        const storageKey =
                          hotspot.imageStorageKey ||
                          `image_hotspot_${scene.name || 'scene'}_${hotspot.id}`;
                        await this.saveImageToIDB(storageKey, file);
                        const blobUrl = URL.createObjectURL(blob);
                        hotspot.image = blobUrl;
                        hotspot.imageStorageKey = storageKey;
                        hotspot.imageFileName = imagePath;
                      } catch (_) {
                        /* ignore */
                      }
                    })
                  );
                }
              }
            }

            // Extract hotspot audio (file path or data URL)
            if ((hotspot.type === 'audio' || hotspot.type === 'text-audio') && hotspot.audio) {
              if (typeof hotspot.audio === 'string' && hotspot.audio.startsWith('data:')) {
                audioPromises.push(
                  (async () => {
                    try {
                      const resp = await fetch(hotspot.audio);
                      const blob = await resp.blob();
                      const base = hotspot.audioFileName || `hotspot_${hotspot.id}.mp3`;
                      const storageKey =
                        hotspot.audioStorageKey ||
                        `audio_hotspot_${scene.name || 'scene'}_${hotspot.id}`;
                      await this.saveAudioToIDB(
                        storageKey,
                        new File([blob], base, { type: blob.type || 'audio/mpeg' })
                      );
                      const blobUrl = URL.createObjectURL(blob);
                      hotspot.audio = blobUrl;
                      hotspot.audioStorageKey = storageKey;
                      hotspot.audioFileName = base;
                    } catch (_) {}
                  })()
                );
              } else if (
                typeof hotspot.audio === 'string' &&
                hotspot.audio.startsWith('./audio/')
              ) {
                const audioPath = hotspot.audio.replace('./audio/', '');
                const audioFile = zip.file(`audio/${audioPath}`);
                if (audioFile) {
                  audioPromises.push(
                    audioFile.async('blob').then(async (blob) => {
                      try {
                        const file = new File([blob], audioPath, {
                          type: blob.type || 'audio/mpeg',
                        });
                        const storageKey =
                          hotspot.audioStorageKey ||
                          `audio_hotspot_${scene.name || 'scene'}_${hotspot.id}`;
                        await this.saveAudioToIDB(storageKey, file);
                        const blobUrl = URL.createObjectURL(blob);
                        hotspot.audio = blobUrl;
                        hotspot.audioStorageKey = storageKey;
                        hotspot.audioFileName = audioPath;
                      } catch (_) {}
                    })
                  );
                }
              }
            }
          }
        }
      }

      // Extract global scene audio
      for (const [sceneId, scene] of Object.entries(this.scenes)) {
        if (scene.globalSound && scene.globalSound.audio) {
          const gs = scene.globalSound;
          if (typeof gs.audio === 'string' && gs.audio.startsWith('data:')) {
            audioPromises.push(
              (async () => {
                try {
                  const resp = await fetch(gs.audio);
                  const blob = await resp.blob();
                  const base = gs.audioFileName || `${sceneId}.mp3`;
                  const storageKey = gs.audioStorageKey || `audio_global_${sceneId}`;
                  await this.saveAudioToIDB(
                    storageKey,
                    new File([blob], base, { type: blob.type || 'audio/mpeg' })
                  );
                  const blobUrl = URL.createObjectURL(blob);
                  gs.audio = blobUrl;
                  gs.audioStorageKey = storageKey;
                  gs.audioFileName = base;
                } catch (_) {}
              })()
            );
          } else if (typeof gs.audio === 'string' && gs.audio.startsWith('./audio/')) {
            const audioPath = gs.audio.replace('./audio/', '');
            const audioFile = zip.file(`audio/${audioPath}`);
            if (audioFile) {
              audioPromises.push(
                audioFile.async('blob').then(async (blob) => {
                  try {
                    const file = new File([blob], audioPath, { type: blob.type || 'audio/mpeg' });
                    const storageKey = gs.audioStorageKey || `audio_global_${sceneId}`;
                    await this.saveAudioToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    gs.audio = blobUrl;
                    gs.audioStorageKey = storageKey;
                    gs.audioFileName = audioPath;
                  } catch (_) {}
                })
              );
            }
          }
        }
      }

      // Extract ground textures for all scenes
      for (const [sceneId, scene] of Object.entries(this.scenes)) {
        if (scene.ground && scene.ground.enabled) {
          const ground = scene.ground;

          // Extract diffuse map
          if (ground.diffuseMap && ground.diffuseMap.startsWith('./images/ground-diffuse-')) {
            const diffusePath = ground.diffuseMap.replace('./images/', '');
            const diffuseFile = zip.file(`images/${diffusePath}`);
            if (diffuseFile) {
              console.log(`🌍 [ZIP] Found ground diffuse file for ${sceneId}:`, diffusePath);
              imagePromises.push(
                diffuseFile.async('blob').then(async (blob) => {
                  try {
                    console.log(
                      `🌍 [ZIP] Saving ground diffuse to IDB for ${sceneId}, size:`,
                      blob.size
                    );
                    const file = new File([blob], diffusePath, { type: blob.type || 'image/jpeg' });
                    const storageKey = `ground_diffuse_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    ground.diffuseMap = blobUrl;
                    ground.diffuseMapStorageKey = storageKey;
                    ground.diffuseMapFileName = diffusePath;
                    console.log(`🌍 [ZIP] Saved ground diffuse to IDB with key:`, storageKey);
                  } catch (e) {
                    console.error(`🌍 [ZIP] Failed to save ground diffuse:`, e);
                  }
                })
              );
            } else {
              console.warn(`🌍 [ZIP] Ground diffuse file not found in ZIP:`, diffusePath);
            }
          }

          // Extract normal map
          if (ground.normalMap && ground.normalMap.startsWith('./images/ground-normal-')) {
            const normalPath = ground.normalMap.replace('./images/', '');
            const normalFile = zip.file(`images/${normalPath}`);
            if (normalFile) {
              console.log(`🌍 [ZIP] Found ground normal file for ${sceneId}:`, normalPath);
              imagePromises.push(
                normalFile.async('blob').then(async (blob) => {
                  try {
                    console.log(
                      `🌍 [ZIP] Saving ground normal to IDB for ${sceneId}, size:`,
                      blob.size
                    );
                    const file = new File([blob], normalPath, { type: blob.type || 'image/jpeg' });
                    const storageKey = `ground_normal_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    ground.normalMap = blobUrl;
                    ground.normalMapStorageKey = storageKey;
                    ground.normalMapFileName = normalPath;
                    console.log(`🌍 [ZIP] Saved ground normal to IDB with key:`, storageKey);
                  } catch (e) {
                    console.error(`🌍 [ZIP] Failed to save ground normal:`, e);
                  }
                })
              );
            } else {
              console.warn(`🌍 [ZIP] Ground normal file not found in ZIP:`, normalPath);
            }
          }

          // Extract roughness map
          if (ground.roughnessMap && ground.roughnessMap.startsWith('./images/ground-roughness-')) {
            const roughnessPath = ground.roughnessMap.replace('./images/', '');
            const roughnessFile = zip.file(`images/${roughnessPath}`);
            if (roughnessFile) {
              imagePromises.push(
                roughnessFile.async('blob').then(async (blob) => {
                  try {
                    const file = new File([blob], roughnessPath, {
                      type: blob.type || 'image/jpeg',
                    });
                    const storageKey = `ground_roughness_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    ground.roughnessMap = blobUrl;
                    ground.roughnessMapStorageKey = storageKey;
                    ground.roughnessMapFileName = roughnessPath;
                  } catch (_) {}
                })
              );
            }
          }

          // Extract AO map
          if (ground.aoMap && ground.aoMap.startsWith('./images/ground-ao-')) {
            const aoPath = ground.aoMap.replace('./images/', '');
            const aoFile = zip.file(`images/${aoPath}`);
            if (aoFile) {
              imagePromises.push(
                aoFile.async('blob').then(async (blob) => {
                  try {
                    const file = new File([blob], aoPath, { type: blob.type || 'image/jpeg' });
                    const storageKey = `ground_ao_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    ground.aoMap = blobUrl;
                    ground.aoMapStorageKey = storageKey;
                    ground.aoMapFileName = aoPath;
                  } catch (_) {}
                })
              );
            }
          }

          // Extract displacement map
          if (
            ground.displacementMap &&
            ground.displacementMap.startsWith('./images/ground-displacement-')
          ) {
            const displacementPath = ground.displacementMap.replace('./images/', '');
            const displacementFile = zip.file(`images/${displacementPath}`);
            if (displacementFile) {
              imagePromises.push(
                displacementFile.async('blob').then(async (blob) => {
                  try {
                    const file = new File([blob], displacementPath, {
                      type: blob.type || 'image/jpeg',
                    });
                    const storageKey = `ground_displacement_${sceneId}`;
                    await this.saveImageToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    ground.displacementMap = blobUrl;
                    ground.displacementMapStorageKey = storageKey;
                    ground.displacementMapFileName = displacementPath;
                  } catch (_) {}
                })
              );
            }
          }
        }
      }

      // Extract model files from hotspots
      for (const scene of Object.values(this.scenes)) {
        if (scene.hotspots) {
          for (const hotspot of scene.hotspots) {
            if (
              hotspot.type === 'model' &&
              hotspot.model &&
              hotspot.model.startsWith('./models/')
            ) {
              const modelPath = hotspot.model.replace('./models/', '');
              const modelFile = zip.file(`models/${modelPath}`);
              if (modelFile) {
                console.log(`🔷 [ZIP] Found model file for hotspot ${hotspot.id}:`, modelPath);
                const modelPromise = modelFile.async('blob').then(async (blob) => {
                  try {
                    console.log(
                      `🔷 [ZIP] Saving model to IDB for hotspot ${hotspot.id}, size:`,
                      blob.size
                    );
                    const file = new File([blob], modelPath, {
                      type: blob.type || 'model/gltf-binary',
                    });
                    const storageKey = `model_hotspot_${hotspot.id}`;
                    await this.saveModelToIDB(storageKey, file);
                    const blobUrl = URL.createObjectURL(blob);
                    hotspot.model = blobUrl;
                    hotspot.modelStorageKey = storageKey;
                    hotspot.modelFileName = modelPath;
                    console.log(`🔷 [ZIP] Saved model to IDB with key:`, storageKey);
                  } catch (e) {
                    console.error(`🔷 [ZIP] Failed to save model:`, e);
                  }
                });
                imagePromises.push(modelPromise); // Add to promises array
              } else {
                console.warn(`🔷 [ZIP] Model file not found in ZIP:`, modelPath);
              }
            }
          }
        }
      }

      // Wait for all assets to be processed
      await Promise.all([...imagePromises, ...videoPromises, ...audioPromises]);

      // Debug: Log loaded scenes structure
      console.log('Loaded scenes from ZIP:', this.scenes);
      console.log('Current scene:', this.currentScene);
      if (this.scenes[this.currentScene]) {
        console.log('Current scene hotspots:', this.scenes[this.currentScene].hotspots);
      }

      // IMPORTANT: Load current scene's hotspots into this.hotspots BEFORE saving
      // Otherwise saveScenesData() will overwrite scene hotspots with empty array
      const currentScene = this.scenes[this.currentScene];
      if (currentScene && Array.isArray(currentScene.hotspots)) {
        this.hotspots = [...currentScene.hotspots];
        console.log('Loaded hotspots into editor:', this.hotspots);
      }

      // Save to localStorage and update UI
      this.saveCSSToLocalStorage();
      this.saveScenesData();

      // Clear blob URLs from in-memory objects so they get restored from IDB
      // This ensures the blob URLs are recreated from IndexedDB rather than using
      // the temporary ones from the ZIP extraction
      for (const scene of Object.values(this.scenes)) {
        if (scene.ground) {
          if (scene.ground.diffuseMapStorageKey && scene.ground.diffuseMap?.startsWith('blob:')) {
            scene.ground.diffuseMap = null;
          }
          if (scene.ground.normalMapStorageKey && scene.ground.normalMap?.startsWith('blob:')) {
            scene.ground.normalMap = null;
          }
          if (
            scene.ground.roughnessMapStorageKey &&
            scene.ground.roughnessMap?.startsWith('blob:')
          ) {
            scene.ground.roughnessMap = null;
          }
          if (scene.ground.aoMapStorageKey && scene.ground.aoMap?.startsWith('blob:')) {
            scene.ground.aoMap = null;
          }
          if (
            scene.ground.displacementMapStorageKey &&
            scene.ground.displacementMap?.startsWith('blob:')
          ) {
            scene.ground.displacementMap = null;
          }
        }
      }

      this.updateSceneDropdown();
      this.loadCurrentScene();
      this.updateHotspotList();
      this.updateNavigationTargets();
      this.updateStartingPointInfo();
      this.applyStylesToExistingElements();

      this.hideLoadingIndicator();
      alert(`Template "${config.name || 'Untitled'}" loaded successfully!`);
    } catch (error) {
      this.hideLoadingIndicator();
      console.error('Error loading ZIP template:', error);
      alert('Error loading template: ' + error.message);
    }
  }

  // CSS Customization Methods
  openStyleEditor() {
    // Persist current work before navigating away
    // 1) Save scenes/hotspots so a just-loaded template or recent edits aren't lost
    try {
      this.saveScenesData();
    } catch (e) {
      console.warn('Failed to save scenes data before opening style editor:', e);
    }

    // 2) Save current styles to localStorage before opening editor
    this.saveCSSToLocalStorage();

    // Open style editor without large URL parameters
    window.location.href = 'style-editor.html';
  }

  checkForStyleUpdates() {
    const urlParams = new URLSearchParams(window.location.search);
    const stylesUpdated = urlParams.get('stylesUpdated');

    if (stylesUpdated === 'true') {
      try {
        // Load styles from localStorage when returning from style editor
        this.loadCSSFromLocalStorage();

        // Apply styles to existing elements WITHOUT clearing anything
        this.refreshAllHotspotStyles();

        // Clean up URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);

        // Show success message
        setTimeout(() => {
          alert('✅ Visual styles updated successfully!');
        }, 500);
      } catch (error) {
        console.warn('Failed to load styles from URL:', error);
      }
    } else {
      // Even if not returning from style editor, update gaze cursor on page load
      this.updateGazeCursor();
    }
  }

  applyStylesToExistingElements() {
    const styles = this.customStyles;

    // Update existing info buttons
    document
      .querySelectorAll('a-entity[geometry*="primitive: plane"][material*="color"]')
      .forEach((infoButton) => {
        const geometry = infoButton.getAttribute('geometry');
        if (geometry && geometry.includes('width: 4') && geometry.includes('height: 0.5')) {
          // This is likely an info button
          infoButton.setAttribute(
            'material',
            `color: ${styles.hotspot.infoButton.backgroundColor}`
          );
          const textAttr = infoButton.getAttribute('text');
          if (textAttr) {
            infoButton.setAttribute('text', {
              value: styles.hotspot.infoButton.text,
              align: 'center',
              color: styles.hotspot.infoButton.textColor,
              width: styles.hotspot.infoButton.fontSize,
              font: 'roboto',
            });
          }
        }
      });

    // Update existing popups
    document.querySelectorAll('a-plane[width][height]').forEach((popup) => {
      const width = popup.getAttribute('width');
      const height = popup.getAttribute('height');
      if (width >= 3 && height >= 2) {
        // Likely a popup background
        popup.setAttribute('color', styles.hotspot.popup.backgroundColor);
        popup.setAttribute('opacity', styles.hotspot.popup.opacity);
      }
    });

    // Update popup text
    document.querySelectorAll('a-text[wrap-count]').forEach((textEl) => {
      if (textEl.getAttribute('wrap-count') === '35') {
        // Likely popup text
        textEl.setAttribute('color', styles.hotspot.popup.textColor);
      }
    });

    // Navigation portal styling removed - portals keep their default appearance

    // Update button images
    if (styles.buttonImages) {
      // Update play button images
      document
        .querySelectorAll('a-image[src="#play"], a-image[src*="play.png"]')
        .forEach((playBtn) => {
          playBtn.setAttribute('src', styles.buttonImages.play);
        });

      // Update pause button images
      document
        .querySelectorAll('a-image[src="#pause"], a-image[src*="pause.png"]')
        .forEach((pauseBtn) => {
          pauseBtn.setAttribute('src', styles.buttonImages.pause);
        });
    }

    // Update audio and video control buttons
    document.querySelectorAll('.audio-control, .video-control').forEach((controlBtn) => {
      if (controlBtn.tagName === 'A-IMAGE' || controlBtn.tagName === 'A-PLANE') {
        controlBtn.setAttribute('material', `color: ${styles.audio.buttonColor}`);
        controlBtn.setAttribute('opacity', styles.audio.buttonOpacity);
      }
    });

    // Update image and video hotspots (static billboards)
    if (styles.image) {
      const istyle = styles.image;
      document.querySelectorAll('.static-image-hotspot, .static-video-hotspot').forEach((imgEl) => {
        try {
          const parent = imgEl.parentElement;
          const opacity = typeof istyle.opacity === 'number' ? istyle.opacity : 1.0;
          mergeAImageMaterial(imgEl, {
            opacity,
            transparent: opacity < 1,
            side: 'double',
            shader: 'flat',
          });
          disableImageHotspotCulling(imgEl);

          // Enforce original aspect ratio geometry so styles don't square the image
          const sclAttr = imgEl.getAttribute('scale') || '1 1 1';
          const scl = parseFloat(sclAttr.split(' ')[0]) || 1;
          let ratio = parseFloat(imgEl.dataset.aspectRatio || '');
          if (!ratio || !isFinite(ratio) || ratio <= 0) {
            // Try model data via element id
            const host = parent;
            const idStr = host && host.id ? host.id : '';
            const id = idStr.startsWith('hotspot-') ? parseInt(idStr.slice(8), 10) : NaN;
            if (!isNaN(id)) {
              const hs = this.hotspots.find((h) => h && h.id === id && h.type === 'image');
              ratio = (hs && (hs.imageAspectRatio || hs._aspectRatio)) || ratio || 1;
            }
          }
          if (!ratio || !isFinite(ratio) || ratio <= 0) ratio = 1;
          // Apply base width/height and center vertically
          imgEl.setAttribute('width', 1);
          imgEl.setAttribute('height', ratio);
          imgEl.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
          imgEl.dataset.aspectRatio = String(ratio);
          try {
            console.log(
              `[ImageHotspot][Style] id=${
                parent?.id
              } ratio=${ratio} scale=${scl} -> w=1 h=${ratio} y=${(ratio / 2) * scl}`
            );
          } catch (_) {}

          // Border frame management: only show square frame when NO rounding and borderWidth>0.
          const numericRadius = parseFloat(istyle.borderRadius) || 0;
          if (numericRadius > 0) {
            parent.querySelectorAll('.static-image-border').forEach((b) => b.remove());
          } else {
            if (istyle.borderWidth > 0) {
              let frame = parent.querySelector('.static-image-border');
              if (!frame) {
                frame = document.createElement('a-plane');
                frame.classList.add('static-image-border');
                parent.appendChild(frame);
              }
              // Determine image world size from enforced geometry and scale
              frame.setAttribute('width', 1 * scl + istyle.borderWidth * 2);
              frame.setAttribute('height', ratio * scl + istyle.borderWidth * 2);
              // Align behind image
              const pos = imgEl.getAttribute('position') || '0 0 0';
              const parts = pos.split(' ');
              const y = parts.length > 1 ? parts[1] : '0';
              frame.setAttribute('position', `0 ${y} 0.0`);
              const borderColor = istyle.borderColor || '#FFFFFF';
              frame.setAttribute(
                'material',
                `shader:flat; color:${borderColor}; opacity:${opacity}; transparent:${
                  opacity < 1 ? 'true' : 'false'
                }; side:double`
              );
              try {
                console.log(
                  `[ImageHotspot][Style-Frame] id=${parent?.id} bw=${
                    istyle.borderWidth
                  } -> frame w=${1 * scl + istyle.borderWidth * 2} h=${
                    ratio * scl + istyle.borderWidth * 2
                  }`
                );
              } catch (_) {}
            } else {
              parent.querySelectorAll('.static-image-border').forEach((b) => b.remove());
            }
          }

          // Re-mask if rounded corners requested and style changed
          if (istyle.borderRadius && istyle.borderRadius > 0) {
            const radiusKey = imageMaskStyleKey(istyle);
            const appliedKey = imgEl.dataset.roundedAppliedRadius || '';
            const currentSrc = imgEl.getAttribute('src') || '';
            if (!imgEl.dataset.originalSrc && currentSrc && !currentSrc.startsWith('data:image')) {
              imgEl.dataset.originalSrc = currentSrc;
            }
            if (appliedKey !== radiusKey) {
              if (imgEl.dataset.originalSrc) {
                imgEl.setAttribute('src', imgEl.dataset.originalSrc);
              }
              applyRoundedMaskToAImage(imgEl, istyle, true)
                .then(() => {
                  imgEl.dataset.roundedAppliedRadius = radiusKey;
                })
                .catch(() => {});
            }
          } else {
            // If rounding disabled, restore original if stored
            if (imgEl.dataset.originalSrc) {
              imgEl.setAttribute('src', imgEl.dataset.originalSrc);
              restoreUnmaskedImageMaterial(imgEl);
            }
            delete imgEl.dataset.roundedAppliedRadius;
          }
        } catch (e) {
          /* ignore individual failures */
        }
      });
    }

    console.log('✅ Applied custom styles to existing elements');
  }

  refreshAllHotspotStyles() {
    console.log('🎨 Refreshing all hotspot styles');

    // Refresh styles for all existing hotspots
    this.applyStylesToExistingElements();

    // Also refresh any in-memory hotspot data
    // Apply navigation ring customizations to existing navigation hotspots
    const navStyles = (this.customStyles && this.customStyles.navigation) || {};
    const ringOuter =
      typeof navStyles.ringOuterRadius === 'number' ? navStyles.ringOuterRadius : 0.6;
    const ringThickness =
      typeof navStyles.ringThickness === 'number' ? navStyles.ringThickness : 0.02;
    const ringInner = Math.max(0.001, ringOuter - ringThickness);
    const ringColor = navStyles.ringColor || 'rgb(0, 85, 0)';

    this.hotspots.forEach((hotspot) => {
      if (hotspot.type !== 'navigation') return;
      const el = document.getElementById(`hotspot-${hotspot.id}`);
      if (!el) return;

      // Update ring element
      const ringEl = el.querySelector('.nav-ring');
      if (ringEl) {
        ringEl.setAttribute(
          'geometry',
          `primitive: ring; radiusInner: ${ringInner}; radiusOuter: ${ringOuter}`
        );
        ringEl.setAttribute(
          'material',
          `color: ${ringColor}; opacity: 1; transparent: true; shader: flat`
        );
      }

      // Update preview circle
      const previewEl = el.querySelector('.nav-preview-circle');
      if (previewEl) {
        previewEl.setAttribute('geometry', `primitive: circle; radius: ${ringInner}`);
      }

      // Update collider (assumes first child is collider)
      const colliderEl = el.querySelector('[geometry*="primitive: circle"]');
      if (colliderEl) {
        colliderEl.setAttribute('geometry', `primitive: circle; radius: ${ringOuter}`);
      }

      // Update label group (color, opacity, position)
      const label = el.querySelector('.nav-label');
      if (label) {
        // Position above the ring using updated dimensions
        label.setAttribute('position', `0 ${ringOuter + 0.35} 0.3`);
        const bg = label.querySelector('a-plane');
        if (bg)
          bg.setAttribute(
            'material',
            `shader:flat; color: ${navStyles.labelBackgroundColor || '#000'}; opacity: ${
              typeof navStyles.labelOpacity === 'number' ? navStyles.labelOpacity : 0.8
            }; transparent: true`
          );
        const txt = label.querySelector('a-text');
        if (txt) txt.setAttribute('color', navStyles.labelColor || '#fff');
      }
    });

    console.log('✅ Refreshed all hotspot styles');
  }

  saveCSSToLocalStorage() {
    localStorage.setItem('vr-hotspot-css-styles', JSON.stringify(this.customStyles));
  }

  saveScenesData() {
    // Save current scene hotspots before saving all data (only if current scene exists)
    if (this.scenes[this.currentScene]) {
      this.scenes[this.currentScene].hotspots = [...this.hotspots];
    }

    // --- Auto-clean invalid image hotspots (missing image reference) ---
    try {
      let removedCount = 0;
      const cleanHotspots = (arr) => {
        if (!Array.isArray(arr)) return arr;
        const filtered = arr.filter((h) => {
          if (!h) return false;
          if (h.type === 'image') {
            if (isVideoHotspot(h)) {
              if (!hasVideoHotspotReference(h)) {
                removedCount++;
                return false;
              }
            } else if (!hasImageHotspotReference(h)) {
              removedCount++;
              return false; // drop invalid image hotspot
            }
          }
          return true;
        });
        return filtered;
      };

      // Clean editor master list
      const cleanedMaster = cleanHotspots(this.hotspots);
      if (cleanedMaster.length !== this.hotspots.length) {
        this.hotspots = cleanedMaster;
      }
      // Clean each scene's hotspots
      Object.keys(this.scenes || {}).forEach((sid) => {
        if (this.scenes[sid] && Array.isArray(this.scenes[sid].hotspots)) {
          const cleaned = cleanHotspots(this.scenes[sid].hotspots);
          if (cleaned.length !== this.scenes[sid].hotspots.length) {
            this.scenes[sid].hotspots = cleaned;
          }
        }
      });
      if (removedCount > 0) {
        console.warn(
          `[AutoClean] Removed ${removedCount} invalid image hotspot(s) lacking an image before persistence.`
        );
      }
    } catch (e) {
      console.warn('[AutoClean] Image hotspot cleanup failed', e);
    }

    // Clone scenes and strip non-persistable blob: URLs for videos and images
    const scenesClone = JSON.parse(JSON.stringify(this.scenes));
    try {
      Object.values(scenesClone || {}).forEach((sc) => {
        if (!sc) return;
        if (
          sc.type === 'video' &&
          typeof sc.videoSrc === 'string' &&
          sc.videoSrc.startsWith('blob:')
        ) {
          sc.videoSrc = null; // don’t persist ephemeral blob URLs
        }
        if (sc.type === 'image') {
          if (sc.imageStorageKey && typeof sc.image === 'string' && sc.image.startsWith('blob:')) {
            // Strip blob URL for images stored in IDB
            sc.image = null;
          }
        }
        // Global sound: strip blob if stored in IDB
        if (
          sc.globalSound &&
          sc.globalSound.audioStorageKey &&
          typeof sc.globalSound.audio === 'string' &&
          sc.globalSound.audio.startsWith('blob:')
        ) {
          sc.globalSound.audio = null;
        }
        // Ground textures: strip blob URLs if stored in IDB
        if (sc.ground) {
          if (
            sc.ground.diffuseMapStorageKey &&
            typeof sc.ground.diffuseMap === 'string' &&
            sc.ground.diffuseMap.startsWith('blob:')
          ) {
            sc.ground.diffuseMap = null;
          }
          if (
            sc.ground.normalMapStorageKey &&
            typeof sc.ground.normalMap === 'string' &&
            sc.ground.normalMap.startsWith('blob:')
          ) {
            sc.ground.normalMap = null;
          }
          if (
            sc.ground.roughnessMapStorageKey &&
            typeof sc.ground.roughnessMap === 'string' &&
            sc.ground.roughnessMap.startsWith('blob:')
          ) {
            sc.ground.roughnessMap = null;
          }
          if (
            sc.ground.aoMapStorageKey &&
            typeof sc.ground.aoMap === 'string' &&
            sc.ground.aoMap.startsWith('blob:')
          ) {
            sc.ground.aoMap = null;
          }
          if (
            sc.ground.displacementMapStorageKey &&
            typeof sc.ground.displacementMap === 'string' &&
            sc.ground.displacementMap.startsWith('blob:')
          ) {
            sc.ground.displacementMap = null;
          }
        }
        // Also sanitize any image hotspot blobs
        if (Array.isArray(sc.hotspots)) {
          sc.hotspots.forEach((h) => {
            if (h && h.type === 'image') {
              if (h._imageFileForIDB) delete h._imageFileForIDB;
              if (h.image && typeof h.image === 'object' && !(h.image instanceof File)) {
                h.image = null;
              }
              if (isVideoHotspot(h)) {
                if (h.video instanceof File) {
                  h.video = null;
                } else if (h.video && typeof h.video !== 'string') {
                  h.video = null;
                }
                if (
                  h.videoStorageKey &&
                  typeof h.video === 'string' &&
                  h.video.startsWith('blob:')
                ) {
                  h.video = null;
                }
                if (!h.mediaKind) h.mediaKind = 'video';
                if (!hasVideoHotspotReference(h)) {
                  h.__drop = true;
                }
              } else {
                if (h.imageStorageKey && typeof h.image === 'string' && h.image.startsWith('blob:')) {
                  h.image = null;
                }
                if (!hasImageHotspotReference(h)) {
                  h.__drop = true;
                }
              }
            } else if (h && (h.type === 'audio' || h.type === 'text-audio')) {
              if (h.audioStorageKey && typeof h.audio === 'string' && h.audio.startsWith('blob:')) {
                h.audio = null;
              }
            } else if (h && h.type === 'model') {
              // Strip model blob URLs if stored in IDB
              if (h.modelStorageKey && typeof h.model === 'string' && h.model.startsWith('blob:')) {
                h.model = null;
              }
            }
          });
          // Remove flagged entries
          sc.hotspots = sc.hotspots.filter((h) => !(h && h.__drop));
        }
      });
    } catch (_) {
      /* ignore */
    }

    // Also persist a sanitized copy of the current scene's hotspots to avoid stale blob: URLs
    const sanitizedCurrentHotspots =
      scenesClone[this.currentScene] && scenesClone[this.currentScene].hotspots
        ? JSON.parse(JSON.stringify(scenesClone[this.currentScene].hotspots))
        : [];

    const scenesData = {
      scenes: scenesClone,
      currentScene: this.currentScene,
      hotspots: sanitizedCurrentHotspots,
    };

    localStorage.setItem('vr-hotspot-scenes-data', JSON.stringify(scenesData));
    console.log('✅ Saved scenes data to localStorage');
  }

  async rehydrateImageSourcesFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;
      for (const [sceneId, scene] of entries) {
        if (!scene || scene.type !== 'image') continue;
        // Only rehydrate if we have a storage key and not an explicit remote/data URL
        const hasRemote =
          typeof scene.image === 'string' &&
          (scene.image.startsWith('http://') ||
            scene.image.startsWith('https://') ||
            scene.image.startsWith('data:'));
        if (!scene.imageStorageKey || hasRemote) continue;
        const key = scene.imageStorageKey || 'image_scene_' + sceneId;
        const rec = await this.getImageFromIDB(key);
        if (rec && rec.blob) {
          try {
            const url = URL.createObjectURL(rec.blob);
            scene.image = url;
            if (!scene.imageFileName) scene.imageFileName = rec.name || '';
            changed = true;
          } catch (_) {
            /* ignore */
          }
        }
      }
      if (changed) this.saveScenesData();
    } catch (_) {
      /* ignore */
    }
  }

  async rehydrateImageHotspotsFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;
      for (const [, scene] of entries) {
        if (!scene || !Array.isArray(scene.hotspots)) continue;
        for (const h of scene.hotspots) {
          if (!h || h.type !== 'image' || isVideoHotspot(h)) continue;
          if (
            h.commonAssetUrl &&
            (!h.image || (typeof h.image === 'string' && h.image.trim() === ''))
          ) {
            h.image = h.commonAssetUrl;
            changed = true;
          }
          const hasRemote =
            typeof h.image === 'string' &&
            (h.image.startsWith('http://') ||
              h.image.startsWith('https://') ||
              h.image.startsWith('data:'));
          if (!h.imageStorageKey || hasRemote) continue;
          const key = h.imageStorageKey || `image_hotspot_${h.id}`;
          const rec = await this.getImageFromIDB(key);
          if (rec && rec.blob) {
            try {
              h.image = URL.createObjectURL(rec.blob);
              if (!h.imageFileName) h.imageFileName = rec.name || '';
              changed = true;
            } catch (_) {}
          }
        }
      }
      if (Array.isArray(this.hotspots)) {
        for (const h of this.hotspots) {
          if (!h || h.type !== 'image' || isVideoHotspot(h)) continue;
          const sceneHs = (
            (this.scenes[this.currentScene] && this.scenes[this.currentScene].hotspots) ||
            []
          ).find((sh) => sh && sh.id === h.id);
          if (sceneHs && sceneHs.image && !h.image) {
            h.image = sceneHs.image;
            changed = true;
          }
        }
      }
      if (changed) this.saveScenesData();
    } catch (_) {}
  }

  async rehydrateVideoHotspotsFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;
      for (const [, scene] of entries) {
        if (!scene || !Array.isArray(scene.hotspots)) continue;
        for (const h of scene.hotspots) {
          if (!h || h.type !== 'image') continue;
          if (!h.mediaKind && isVideoHotspot(h)) {
            h.mediaKind = 'video';
            changed = true;
          }
          if (h.mediaKind !== 'video') continue;
          if (
            h.commonAssetUrl &&
            (!h.video || (typeof h.video === 'string' && h.video.trim() === ''))
          ) {
            h.video = h.commonAssetUrl;
            changed = true;
          }
          const hasRemote =
            typeof h.video === 'string' &&
            (h.video.startsWith('http://') ||
              h.video.startsWith('https://') ||
              h.commonAssetUrl);
          if (!h.videoStorageKey || hasRemote) continue;
          const key = h.videoStorageKey || `video_hotspot_${h.id}`;
          const rec = await this.getVideoFromIDB(key);
          if (rec && rec.blob) {
            try {
              h.video = URL.createObjectURL(rec.blob);
              h.mediaKind = 'video';
              if (!h.videoFileName) h.videoFileName = rec.name || '';
              changed = true;
            } catch (_) {}
          }
        }
      }
      if (changed) this.saveScenesData();
    } catch (_) {}
  }

  async rehydrateAudioSourcesFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;
      for (const [sceneId, scene] of entries) {
        if (!scene) continue;
        // Global sound first
        if (scene.globalSound && scene.globalSound.audioStorageKey) {
          try {
            const rec = await this.getAudioFromIDB(scene.globalSound.audioStorageKey);
            if (rec && rec.blob) {
              scene.globalSound.audio = URL.createObjectURL(rec.blob);
              if (!scene.globalSound.audioFileName)
                scene.globalSound.audioFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }
        // Hotspots
        if (Array.isArray(scene.hotspots)) {
          for (const h of scene.hotspots) {
            if (!h) continue;
            if ((h.type === 'audio' || h.type === 'text-audio') && h.audioStorageKey) {
              try {
                const rec = await this.getAudioFromIDB(h.audioStorageKey);
                if (rec && rec.blob) {
                  h.audio = URL.createObjectURL(rec.blob);
                  if (!h.audioFileName) h.audioFileName = rec.name || '';
                  changed = true;
                }
              } catch (_) {}
            }
          }
        }
      }
      if (changed) this.saveScenesData();
    } catch (_) {
      /* ignore */
    }
  }

  async rehydrateGroundTexturesFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;

      for (const [sceneId, scene] of entries) {
        if (!scene || !scene.ground) continue;
        const groundData = scene.ground;

        // Rehydrate diffuse map
        if (groundData.diffuseMapStorageKey && !groundData.diffuseMap?.startsWith('blob:')) {
          try {
            const rec = await this.getImageFromIDB(groundData.diffuseMapStorageKey);
            if (rec && rec.blob) {
              groundData.diffuseMap = URL.createObjectURL(rec.blob);
              if (!groundData.diffuseMapFileName) groundData.diffuseMapFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }

        // Rehydrate normal map
        if (groundData.normalMapStorageKey && !groundData.normalMap?.startsWith('blob:')) {
          try {
            const rec = await this.getImageFromIDB(groundData.normalMapStorageKey);
            if (rec && rec.blob) {
              groundData.normalMap = URL.createObjectURL(rec.blob);
              if (!groundData.normalMapFileName) groundData.normalMapFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }

        // Rehydrate roughness map
        if (groundData.roughnessMapStorageKey && !groundData.roughnessMap?.startsWith('blob:')) {
          try {
            const rec = await this.getImageFromIDB(groundData.roughnessMapStorageKey);
            if (rec && rec.blob) {
              groundData.roughnessMap = URL.createObjectURL(rec.blob);
              if (!groundData.roughnessMapFileName)
                groundData.roughnessMapFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }

        // Rehydrate AO map
        if (groundData.aoMapStorageKey && !groundData.aoMap?.startsWith('blob:')) {
          try {
            const rec = await this.getImageFromIDB(groundData.aoMapStorageKey);
            if (rec && rec.blob) {
              groundData.aoMap = URL.createObjectURL(rec.blob);
              if (!groundData.aoMapFileName) groundData.aoMapFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }

        // Rehydrate displacement map
        if (
          groundData.displacementMapStorageKey &&
          !groundData.displacementMap?.startsWith('blob:')
        ) {
          try {
            const rec = await this.getImageFromIDB(groundData.displacementMapStorageKey);
            if (rec && rec.blob) {
              groundData.displacementMap = URL.createObjectURL(rec.blob);
              if (!groundData.displacementMapFileName)
                groundData.displacementMapFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }
      }

      if (changed) this.saveScenesData();
    } catch (_) {
      /* ignore */
    }
  }

  async rehydrateModelSourcesFromIDB() {
    try {
      const entries = Object.entries(this.scenes || {});
      if (!entries.length) return;
      let changed = false;

      for (const [sceneId, scene] of entries) {
        if (!scene || !Array.isArray(scene.hotspots)) continue;

        for (const hotspot of scene.hotspots) {
          if (hotspot.type !== 'model') continue;

          // Only rehydrate if we have a storage key and no blob URL
          if (hotspot.modelStorageKey && (!hotspot.model || !hotspot.model.startsWith('blob:'))) {
            try {
              const rec = await this.getModelFromIDB(hotspot.modelStorageKey);
              if (rec && rec.blob) {
                hotspot.model = URL.createObjectURL(rec.blob);
                if (!hotspot.modelFileName) hotspot.modelFileName = rec.name || '';
                changed = true;
                console.log(`🔷 [Rehydrate] Restored model for hotspot ${hotspot.id} from IDB`);
              }
            } catch (e) {
              console.warn(`🔷 [Rehydrate] Failed to restore model for hotspot ${hotspot.id}`, e);
            }
          }
        }
      }

      // Also update this.hotspots array
      for (const hotspot of this.hotspots) {
        if (hotspot.type !== 'model') continue;

        if (hotspot.modelStorageKey && (!hotspot.model || !hotspot.model.startsWith('blob:'))) {
          try {
            const rec = await this.getModelFromIDB(hotspot.modelStorageKey);
            if (rec && rec.blob) {
              hotspot.model = URL.createObjectURL(rec.blob);
              if (!hotspot.modelFileName) hotspot.modelFileName = rec.name || '';
              changed = true;
            }
          } catch (_) {}
        }
      }

      if (changed) this.saveScenesData();
    } catch (e) {
      console.warn('🔷 [Rehydrate] Model rehydration failed', e);
    }
  }

  // Persist aspect ratio for a specific image hotspot and optionally update both editor and scene copies
  _persistImageAspectRatio(hotspotId, ratio) {
    try {
      const r = parseFloat(ratio);
      if (!isFinite(r) || r <= 0) return;
      let changed = false;
      const hs = this.hotspots.find((h) => h && h.id === hotspotId && h.type === 'image');
      if (hs && hs.imageAspectRatio !== r) {
        hs.imageAspectRatio = r;
        changed = true;
      }
      const sceneArr =
        (this.scenes[this.currentScene] && this.scenes[this.currentScene].hotspots) || [];
      const shs = sceneArr.find((h) => h && h.id === hotspotId && h.type === 'image');
      if (shs && shs.imageAspectRatio !== r) {
        shs.imageAspectRatio = r;
        changed = true;
      }
      if (changed) {
        if (this._persistARSaveTimer) clearTimeout(this._persistARSaveTimer);
        this._persistARSaveTimer = setTimeout(() => {
          this._persistARSaveTimer = null;
          this.saveScenesData();
        }, 400);
      }
    } catch (_) {
      /* ignore */
    }
  }

  loadScenesData() {
    const saved = localStorage.getItem('vr-hotspot-scenes-data');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.scenes = data.scenes || this.scenes;
        this.currentScene = data.currentScene || this.currentScene;
        this.hotspots = data.hotspots || [];

        // Sanitize any stale blob: URLs in loaded hotspots (rehydrated later from IDB)
        try {
          if (Array.isArray(this.hotspots)) {
            this.hotspots.forEach((h) => {
              if (!h) return;
              if (
                h.type === 'image' &&
                h.imageStorageKey &&
                typeof h.image === 'string' &&
                h.image.startsWith('blob:')
              ) {
                h.image = null;
              }
              if (
                (h.type === 'audio' || h.type === 'text-audio') &&
                h.audioStorageKey &&
                typeof h.audio === 'string' &&
                h.audio.startsWith('blob:')
              ) {
                h.audio = null;
              }
            });
          }
        } catch (_) {
          /* ignore */
        }

        // Migrate old scenes to include type field (backward compatibility)
        Object.values(this.scenes || {}).forEach((scene) => {
          if (!scene.type) {
            scene.type = 'image'; // Default to image for existing scenes
          }
          if (scene.videoVolume === undefined) {
            scene.videoVolume = 0.5; // Default video volume
          }
          // Clear any stale blob URLs so we won’t try to load invalid sources after refresh
          if (
            scene.type === 'video' &&
            typeof scene.videoSrc === 'string' &&
            scene.videoSrc.startsWith('blob:')
          ) {
            scene.videoSrc = null;
          }
          if (
            scene.type === 'video' &&
            !scene.videoSrc &&
            this.isCommonAssetObject(scene)
          ) {
            scene.videoSrc = this.buildCommonAssetProxyPath(scene);
          }
        });

        // Seed any missing imageAspectRatio from legacy _aspectRatio to maintain continuity
        try {
          const seed = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((h) => {
              if (h && h.type === 'image') {
                if (!h.mediaKind && isVideoHotspot(h)) {
                  h.mediaKind = 'video';
                }
                if (typeof h.imageAspectRatio !== 'number' && typeof h._aspectRatio === 'number')
                  h.imageAspectRatio = h._aspectRatio;
              }
              // Add audioLoop default for backward compatibility with existing audio hotspots
              if (h && (h.type === 'audio' || h.type === 'text-audio')) {
                if (typeof h.audioLoop !== 'boolean') {
                  h.audioLoop = true; // Default to looping for existing hotspots
                }
              }
            });
          };
          Object.values(this.scenes || {}).forEach((sc) => seed(sc.hotspots));
          seed(this.hotspots);
        } catch (_) {}

        // Clean up orphaned navigation hotspots
        this.cleanupOrphanedNavigationHotspots();

        // Ensure hotspot IDs are present and unique across all scenes
        this.ensureUniqueHotspotIds();

        console.log('✅ Loaded scenes data from localStorage');
        return true;
      } catch (error) {
        console.warn('Failed to load scenes data from localStorage:', error);
        return false;
      }
    }
    console.log('ℹ️ No saved scenes data found in localStorage');
    return false;
  }

  // Helper to extract known aspect ratio from a hotspot-like object
  _getModelImageAR(hs) {
    if (!hs) return null;
    if (
      typeof hs.imageAspectRatio === 'number' &&
      isFinite(hs.imageAspectRatio) &&
      hs.imageAspectRatio > 0
    )
      return hs.imageAspectRatio;
    if (typeof hs._aspectRatio === 'number' && isFinite(hs._aspectRatio) && hs._aspectRatio > 0)
      return hs._aspectRatio;
    return null;
  }

  // Ensure each hotspot has a numeric unique id and sync the id counter
  ensureUniqueHotspotIds() {
    const seen = new Set();
    let maxId = 0;

    const fix = (hsArr) => {
      if (!Array.isArray(hsArr)) return;
      for (let i = 0; i < hsArr.length; i++) {
        const h = hsArr[i] || {};
        // Assign id if missing or invalid
        if (typeof h.id !== 'number' || !isFinite(h.id) || h.id <= 0) {
          h.id = ++maxId || 1; // will be re-evaluated below
        }
        maxId = Math.max(maxId, h.id);
      }
    };

    // First pass: determine maxId and fill missing ids
    Object.values(this.scenes).forEach((sc) => fix(sc.hotspots));
    fix(this.hotspots);

    // Second pass: reassign duplicates
    const reassignIfDup = (hsArr) => {
      if (!Array.isArray(hsArr)) return;
      for (let i = 0; i < hsArr.length; i++) {
        const h = hsArr[i];
        if (!h) continue;
        if (seen.has(h.id)) {
          h.id = ++maxId;
        }
        seen.add(h.id);
      }
    };

    Object.values(this.scenes).forEach((sc) => reassignIfDup(sc.hotspots));
    reassignIfDup(this.hotspots);

    // Sync the editor's hotspot array with the current scene to reflect new ids
    if (this.scenes[this.currentScene]) {
      this.hotspots = [...this.scenes[this.currentScene].hotspots];
    }

    // Update the counter so new hotspots always get a fresh id
    this.hotspotIdCounter = Math.max(this.hotspotIdCounter || 0, maxId);

    // Persist any fixes
    this.saveScenesData();
  }

  cleanupOrphanedNavigationHotspots() {
    let cleanupCount = 0;

    // Get list of valid scene IDs
    const validSceneIds = Object.keys(this.scenes);

    // Clean up each scene's hotspots
    Object.keys(this.scenes).forEach((sceneId) => {
      const scene = this.scenes[sceneId];
      const originalCount = scene.hotspots.length;

      scene.hotspots = scene.hotspots.filter((hotspot) => {
        if (hotspot.type === 'navigation' && hotspot.navigationTarget) {
          const isValid = validSceneIds.includes(hotspot.navigationTarget);
          if (!isValid) {
            console.warn(
              `🗑️ Removing orphaned navigation hotspot in scene "${scene.name}" - target scene "${hotspot.navigationTarget}" no longer exists`
            );
            cleanupCount++;
          }
          return isValid;
        }
        return true; // Keep non-navigation hotspots
      });
    });

    // Also clean up current hotspots array if we're in a scene
    if (this.currentScene && this.scenes[this.currentScene]) {
      this.hotspots = this.hotspots.filter((hotspot) => {
        if (hotspot.type === 'navigation' && hotspot.navigationTarget) {
          const isValid = validSceneIds.includes(hotspot.navigationTarget);
          if (!isValid) {
            console.warn(
              `🗑️ Removing orphaned navigation hotspot from current scene - target "${hotspot.navigationTarget}" no longer exists`
            );
            cleanupCount++;
          }
          return isValid;
        }
        return true;
      });
    }

    if (cleanupCount > 0) {
      console.log(`🧹 Cleaned up ${cleanupCount} orphaned navigation hotspots`);
      // Save the cleaned data
      this.saveScenesData();
    }
  }

  loadCSSFromLocalStorage() {
    const saved = localStorage.getItem('vr-hotspot-css-styles');
    if (saved) {
      try {
        const loadedStyles = JSON.parse(saved);

        // Ensure buttonImages exists for backward compatibility
        if (!loadedStyles.buttonImages) {
          loadedStyles.buttonImages = {
            portal: 'images/up-arrow.png',
            play: 'images/play.png',
            pause: 'images/pause.png',
          };
        }

        // Ensure navigation ring defaults exist
        if (!loadedStyles.navigation) loadedStyles.navigation = {};
        if (loadedStyles.navigation.ringColor === undefined)
          loadedStyles.navigation.ringColor = '#005500';
        if (loadedStyles.navigation.ringOuterRadius === undefined)
          loadedStyles.navigation.ringOuterRadius = 0.6;
        if (loadedStyles.navigation.ringThickness === undefined)
          loadedStyles.navigation.ringThickness = 0.02;
        if (loadedStyles.navigation.weblinkRingColor === undefined)
          loadedStyles.navigation.weblinkRingColor = '#001f5b';

        // Ensure gaze timer defaults exist
        if (!loadedStyles.gaze) loadedStyles.gaze = {};
        if (loadedStyles.gaze.duration === undefined) loadedStyles.gaze.duration = 2.0;

        this.customStyles = loadedStyles;
        console.log('✅ Loaded custom styles from localStorage', this.customStyles);
        console.log('🎨 Button images:', this.customStyles.buttonImages);

        // Update gaze cursor with new duration
        this.updateGazeCursor();
      } catch (error) {
        console.warn('Failed to load saved CSS styles, using defaults');
      }
    } else {
      console.log('ℹ️ No saved styles found in localStorage, using defaults');
    }
  }

  updateGazeCursor() {
    const gazeCursor = document.getElementById('gaze-cursor');
    if (gazeCursor && this.customStyles.gaze) {
      const duration = Math.round((this.customStyles.gaze.duration || 2.0) * 1000);
      gazeCursor.setAttribute('cursor', `fuse: true; fuseTimeout: ${duration}`);
      gazeCursor.setAttribute(
        'animation__mouseenter',
        `property: geometry.radiusOuter; to: 0.02; startEvents: mouseenter; dur: ${duration}; easing: easeInQuad`
      );
      gazeCursor.setAttribute(
        'animation__fusing',
        `property: scale; to: 2 2 2; startEvents: fusing; dur: ${duration}; easing: easeInQuad`
      );
      console.log(
        `🎯 Updated gaze cursor duration to ${this.customStyles.gaze.duration}s (${duration}ms)`
      );
    }
  }

  getCustomStyles() {
    return this.customStyles;
  }

  // Project export helper methods
  showProgress(message) {
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9); color: white; padding: 20px;
      border-radius: 8px; z-index: ${EDITOR_LAYER.progress}; font-family: Arial;
    `;
    progressDiv.innerHTML = `<div style="text-align: center;">${message}<br><div style="margin-top: 10px;">⏳ Please wait...</div></div>`;
    document.body.appendChild(progressDiv);
    return progressDiv;
  }

  hideProgress(progressDiv) {
    if (progressDiv && progressDiv.parentNode) {
      progressDiv.parentNode.removeChild(progressDiv);
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  generateGroundAssets() {
    let assets = '';

    // Generate assets for all scenes that have ground enabled
    for (const [sceneId, scene] of Object.entries(this.scenes)) {
      if (!scene || !scene.ground || !scene.ground.enabled) {
        continue;
      }

      const ground = scene.ground;
      // Only export if essential textures are present
      if (!ground.diffuseMap || !ground.normalMap) {
        continue;
      }

      // Add diffuse map with scene-specific ID
      if (ground.diffuseMap) {
        assets += `\n        <img id="ground-diffuse-${sceneId}" src="./images/ground-diffuse-${sceneId}.jpg" />`;
      }

      // Add normal map with scene-specific ID
      if (ground.normalMap) {
        assets += `\n        <img id="ground-normal-${sceneId}" src="./images/ground-normal-${sceneId}.jpg" />`;
      }

      // Add optional textures with scene-specific IDs
      if (ground.roughnessMap) {
        assets += `\n        <img id="ground-roughness-${sceneId}" src="./images/ground-roughness-${sceneId}.jpg" />`;
      }

      if (ground.aoMap) {
        assets += `\n        <img id="ground-ao-${sceneId}" src="./images/ground-ao-${sceneId}.jpg" />`;
      }

      if (ground.displacementMap) {
        assets += `\n        <img id="ground-displacement-${sceneId}" src="./images/ground-displacement-${sceneId}.jpg" />`;
      }
    }

    return assets;
  }

  generateGroundElement() {
    // Ground is now loaded dynamically per scene in the runtime JS
    // No need to include static ground in HTML
    return '';
  }

  generateCompleteHTML(templateName) {
    // Compute gaze duration for use in HTML template
    const gazeDuration =
      this.customStyles.gaze && this.customStyles.gaze.duration
        ? Math.round(this.customStyles.gaze.duration * 1000)
        : 2000;

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${templateName} - VR Hotspot Experience</title>
    <meta name="description" content="Interactive VR Hotspot Experience" />
    <script src="https://aframe.io/releases/1.7.0/aframe.min.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/c-frame/aframe-extras@7.5.4/dist/aframe-extras.min.js"></script>
    <script src="script.js"></script>
    <link rel="stylesheet" href="style.css">
  </head>
  
  <body>
    <div id="project-info">
      <h1>${templateName}</h1>
      <p>Interactive VR Experience • Click on hotspots to explore</p>
    </div>

    <!-- Global Sound Control -->
    <div id="global-sound-control">
      <button id="global-sound-toggle" class="sound-btn">🔊 Sound: ON</button>
      <div id="audio-progress-container" class="audio-progress-container" style="display: none;">
        <div class="audio-info">
          <span id="current-time">0:00</span>
          <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
              <div class="progress-handle" id="progress-handle"></div>
            </div>
          </div>
          <span id="total-time">0:00</span>
        </div>
      </div>
    </div>

    <!-- iOS Motion Permission Banner -->
    <div id="motion-permission-banner" class="hidden">
      <div class="motion-permission-text">
        Enable motion controls to look around by moving your device.
      </div>
      <button id="motion-permission-button" type="button">Enable Motion Controls</button>
    </div>

    <a-scene background="color: #1a1a2e" id="main-scene"
      device-orientation-permission-ui="enabled: true; buttonText: Enable Motion; cancelButtonText: Not Now; deviceMotionMessage: Rotate your device to explore; deviceOrientationMessage: Enable motion to look around"
    >
      <a-entity
        laser-controls="hand: right"
        raycaster="objects: .clickable, .audio-control, .video-control"
      ></a-entity>
      <a-entity
        laser-controls="hand: left"
        raycaster="objects: .clickable, .audio-control, .video-control"
      ></a-entity>

      <a-assets>
        <img id="main-panorama" src="./images/scene1.jpg" />
        <audio id="default-audio" src="./audio/music.mp3"></audio>
        <img id="close" src="./images/close.png" />
        <img id="play" src="./images/play.png" />
        <img id="pause" src="./images/pause.png" />
        ${this.generateGroundAssets()}
      </a-assets>

      <a-entity id="hotspot-container"></a-entity>
      ${this.generateGroundElement()}
      
      <!-- Initial loading environment -->
      <a-entity id="loading-environment" visible="true">
        <!-- Starfield background -->
        <a-entity position="0 0 0">
          <a-entity geometry="primitive: sphere; radius: 100" 
                   material="color: #0f0f23; transparent: true; opacity: 0.8"></a-entity>
        </a-entity>
        
        <!-- Floating orbs for visual interest -->
        <a-entity id="loading-orb-1" 
                 geometry="primitive: sphere; radius: 0.3" 
                 material="color: #4CAF50; emissive: #4CAF50; emissiveIntensity: 0.5"
                 position="3 2 -5"
                 animation="property: rotation; to: 360 360 0; dur: 8000; easing: linear; loop: true">
        </a-entity>
        
        <a-entity id="loading-orb-2" 
                 geometry="primitive: sphere; radius: 0.2" 
                 material="color: #2196F3; emissive: #2196F3; emissiveIntensity: 0.4"
                 position="-4 1 -3"
                 animation="property: rotation; to: -360 180 360; dur: 6000; easing: linear; loop: true">
        </a-entity>
        
        <a-entity id="loading-orb-3" 
                 geometry="primitive: sphere; radius: 0.15" 
                 material="color: #FF9800; emissive: #FF9800; emissiveIntensity: 0.3"
                 position="2 -1 -4"
                 animation="property: rotation; to: 180 -360 180; dur: 10000; easing: linear; loop: true">
        </a-entity>
        
   <!-- Central loading text -->
        <a-text id="loading-text" 
               value="Loading VR Experience..." 
               position="0 0 -3" 
               align="center" 
               color="#000"
     font="dejavu"
     material="transparent: true; opacity: 0"
               animation="property: rotation; to: 0 5 0; dur: 3000; easing: easeInOutSine; loop: true; dir: alternate">
        </a-text>
        
        <!-- Animated loading dots -->
        <a-text id="loading-dots" 
               value="●○○" 
               position="0 -0.5 -3" 
               align="center" 
               color="#4CAF50"
               font="dejavu"
               animation__dots="property: opacity; to: 0.3; dur: 800; easing: easeInOutSine; loop: true; dir: alternate">
        </a-text>
      </a-entity>
      
      <!-- Actual scene skybox - initially hidden -->
      <a-sky id="skybox" src="#main-panorama" visible="false"></a-sky>

      <a-entity id="cam" camera position="0 1.6 0" look-controls="magicWindowTrackingEnabled: false; touchEnabled: true">
        <!-- Mouse-based cursor for non-VR mode -->
        <a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          raycaster="objects: .clickable, .audio-control, .video-control"
          id="mouse-cursor"
          visible="true">
        </a-entity>
        
        <!-- Gaze-based cursor for VR mode -->
        <a-entity
          cursor="fuse: true; fuseTimeout: ${gazeDuration}"
          raycaster="objects: .clickable:not(.no-gaze-grow), .audio-control, .video-control"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.005; radiusOuter: 0.01"
          material="color: white; shader: flat; opacity: 0.8"
          id="gaze-cursor"
          visible="true"
          animation__mouseenter="property: geometry.radiusOuter; to: 0.02; startEvents: mouseenter; dur: ${gazeDuration}; easing: easeInQuad"
          animation__mouseleave="property: geometry.radiusOuter; to: 0.01; startEvents: mouseleave; dur: 300; easing: easeOutQuad"
          animation__click="property: scale; to: 1.5 1.5 1.5; startEvents: click; dur: 150; easing: easeInOutQuad"
          animation__fusing="property: scale; to: 2 2 2; startEvents: fusing; dur: ${gazeDuration}; easing: easeInQuad"
          animation__fusecomplete="property: scale; to: 1 1 1; startEvents: click; dur: 150; easing: easeOutQuad">
        </a-entity>
      </a-entity>
    </a-scene>

    <!-- Video Controls (appears only for video scenes) -->
    <div id="video-controls" style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      padding: 15px 25px;
      border-radius: 30px;
      display: none;
      gap: 15px;
      align-items: center;
      z-index: 1001;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    ">
      <button id="video-play-pause" style="
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
      ">⏸ Pause</button>
      
      <button id="video-mute" style="
        background: #28a745;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 16px;
      ">🔇 Muted</button>
      
      <div style="color: white; font-size: 14px;">
        <span id="video-time-current">0:00</span> / <span id="video-time-total">0:00</span>
      </div>
      
      <input type="range" id="video-progress" min="0" max="100" value="0" style="
        width: 200px;
        height: 6px;
        cursor: pointer;
      ">
      
      <input type="range" id="video-volume" min="0" max="100" value="50" style="
        width: 100px;
        height: 6px;
        cursor: pointer;
      " title="Volume">
    </div>
  </body>
</html>`;
  }

  generateCSS() {
    return `/* VR Hotspot Project Styles */
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #000;
}

#project-info {
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 8px;
  z-index: 999;
  max-width: 300px;
}

#project-info h1 {
  margin: 0 0 5px 0;
  font-size: 18px;
  color: #4CAF50;
}

#project-info p {
  margin: 0;
  font-size: 12px;
  color: #ccc;
}

/* Global Sound Control */
#global-sound-control {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
  margin-top: 120px; /* Below project info */
}

.sound-btn {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  border: 2px solid #4CAF50;
  padding: 10px 15px;
  border-radius: 8px;
  cursor: pointer;
  font-family: Arial, sans-serif;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.3s ease;
  user-select: none;
  display: block;
  margin-bottom: 10px;
}

.sound-btn:hover {
  background: rgba(76, 175, 80, 0.2);
  border-color: #66BB6A;
  transform: translateY(-2px);
}

.sound-btn.muted {
  border-color: #f44336;
  color: #f44336;
}

.sound-btn.muted:hover {
  background: rgba(244, 67, 54, 0.2);
  border-color: #ef5350;
}

/* Audio Progress Bar */
.audio-progress-container {
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid #4CAF50;
  border-radius: 8px;
  padding: 10px;
  min-width: 250px;
  font-family: Arial, sans-serif;
  color: white;
}

.audio-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.progress-bar-container {
  flex: 1;
  position: relative;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
}

.progress-fill {
  height: 100%;
  background: #4CAF50;
  border-radius: 3px;
  width: 0%;
  transition: width 0.1s ease;
}

.progress-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  background: #4CAF50;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  left: 0%;
  transition: left 0.1s ease;
  opacity: 0;
}

.progress-bar:hover .progress-handle {
  opacity: 1;
}

.progress-handle:hover {
  transform: translate(-50%, -50%) scale(1.2);
}

#current-time, #total-time {
  min-width: 35px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Hotspot animations */
.clickable {
  cursor: pointer;
}

/* Animation for gaze feedback */
@keyframes hotspotPulse {
  0% { opacity: 0.8; }
  50% { opacity: 1.0; }
  100% { opacity: 0.8; }
}

.hotspot-animation {
  animation: hotspotPulse 2s infinite;
}

/* Navigation feedback animation */
@keyframes fadeInOut {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
}

/* iOS Motion Permission Banner */
.motion-permission-text {
  font-size: 14px;
  margin-bottom: 10px;
}

#motion-permission-banner {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  border: 2px solid #4CAF50;
  border-radius: 12px;
  padding: 15px 20px;
  color: #fff;
  font-family: Arial, sans-serif;
  z-index: 2000;
  max-width: 320px;
  width: calc(100% - 40px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
  text-align: center;
}

#motion-permission-banner button {
  margin-top: 8px;
  background: #4CAF50;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

#motion-permission-banner button:hover {
  background: #66BB6A;
  transform: translateY(-1px);
}

#motion-permission-banner button:active {
  transform: translateY(0);
}

.hidden {
  display: none;
}

/* Responsive design */
@media (max-width: 768px) {
  #project-info {
    position: static;
    margin: 10px;
  }
  
  #global-sound-control {
    position: static;
    margin: 10px;
    text-align: center;
  }
  
  .audio-progress-container {
    min-width: auto;
    width: 100%;
  }
  
  .audio-info {
    flex-direction: column;
    gap: 8px;
  }
  
  .progress-bar-container {
    width: 100%;
  }
}`;
  }

  generateCompleteJS() {
    // Include custom styles in the generated code
    const customStylesJson = JSON.stringify(this.customStyles, null, 2);

    return `// VR Hotspot Project - Standalone Version
// Generated from VR Hotspot Editor

// Custom Styles Configuration
const CUSTOM_STYLES = ${customStylesJson};

// Helper (export build): reuse caching via local map to prevent reprocessing
const EXPORTED_IMAGE_MASK_CACHE = new Map();
const EXPORTED_VIDEO_THUMB_CACHE = new Map();
const EXPORTED_IMAGE_MASK_MAX_DIMENSION = 1024;
const EXPORTED_IMAGE_MASK_MAX_DATA_URL_LENGTH = 6000000;
function exportedImageMaskStyleKey(styleCfg) {
  if (!styleCfg) return '0|0|';
  return (styleCfg.borderRadius||0) + '|' + (styleCfg.borderWidth||0) + '|' + (styleCfg.borderColor||'');
}
function mergeAImageMaterial(aImgEl, patch) {
  if (!aImgEl || !patch) return;
  const current = aImgEl.getAttribute('material');
  if (current && typeof current === 'object') {
    aImgEl.setAttribute('material', Object.assign({}, current, patch));
    return;
  }
  aImgEl.setAttribute('material', Object.assign({ shader: 'flat', side: 'double', transparent: false, opacity: 1 }, patch));
}
function applyMaskedImageMaterial(aImgEl) {
  mergeAImageMaterial(aImgEl, { transparent: true, shader: 'flat', alphaTest: 0.01, side: 'double' });
}
// Prevent stale-bounding-sphere frustum culling on billboard meshes whose geometry/position change after creation.
function disableImageHotspotCulling(aImgEl) {
  if (!aImgEl) return;
  const apply = function(){ try { const mesh=aImgEl.getObject3D('mesh'); if(mesh){ mesh.frustumCulled=false; if(mesh.geometry&&mesh.geometry.computeBoundingSphere) mesh.geometry.computeBoundingSphere(); } } catch(_){} };
  apply();
  aImgEl.addEventListener('object3dset', apply);
}
// A-Frame's <a-image> texture system cannot bind blob: URLs reliably; convert to a data URL first.
function setAImageHotspotSrc(imgEl, src) {
  if (!imgEl || !src || typeof src !== 'string') return;
  if (src.indexOf('blob:') !== 0) { imgEl.setAttribute('src', src); return; }
  fetch(src).then(function(r){ return r.blob(); }).then(function(blob){
    return new Promise(function(resolve, reject){ var fr=new FileReader(); fr.onload=function(){ resolve(fr.result); }; fr.onerror=reject; fr.readAsDataURL(blob); });
  }).then(function(dataUrl){ if (document.body.contains(imgEl)) imgEl.setAttribute('src', dataUrl); }).catch(function(){ imgEl.setAttribute('src', src); });
}
function applyRoundedMaskToAImage(aImgEl, styleCfg) {
  return new Promise(resolve => {
    try {
      const src = aImgEl.getAttribute('src');
      if (!src || src.indexOf('data:image/gif') === 0) return resolve();
      const styleKey = exportedImageMaskStyleKey(styleCfg);
      const cacheKey = src + '|' + styleKey;
      if (aImgEl.dataset.roundedApplied === styleKey) return resolve();
      if (EXPORTED_IMAGE_MASK_CACHE.has(cacheKey)) {
        if (!aImgEl.dataset.originalSrc && src.indexOf('data:image') !== 0) {
          aImgEl.dataset.originalSrc = src;
        }
        aImgEl.setAttribute('src', EXPORTED_IMAGE_MASK_CACHE.get(cacheKey));
        aImgEl.dataset.roundedApplied = styleKey;
        applyMaskedImageMaterial(aImgEl);
        return resolve();
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return resolve();
          const maxDim = Math.max(w, h);
          if (maxDim > EXPORTED_IMAGE_MASK_MAX_DIMENSION) {
            const scale = EXPORTED_IMAGE_MASK_MAX_DIMENSION / maxDim;
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          const r = Math.max(0, Math.min(w/2, (styleCfg.borderRadius||0) * w));
          const bw = Math.max(0, (styleCfg.borderWidth||0) * w);
          ctx.beginPath();
          ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r);
          ctx.lineTo(w,h-r); ctx.quadraticCurveTo(w,h,w-r,h);
          ctx.lineTo(r,h); ctx.quadraticCurveTo(0,h,0,h-r);
          ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0); ctx.closePath();
          ctx.clip();
          ctx.drawImage(img,0,0,w,h);
          if (bw>0){ ctx.lineWidth = bw*2; ctx.strokeStyle = styleCfg.borderColor||'#FFFFFF'; ctx.stroke(); }
          let newURL = '';
          try { newURL = canvas.toDataURL('image/png'); } catch(_) { return resolve(); }
          if (!newURL || newURL.length > EXPORTED_IMAGE_MASK_MAX_DATA_URL_LENGTH) return resolve();
          EXPORTED_IMAGE_MASK_CACHE.set(cacheKey, newURL);
          if (!aImgEl.dataset.originalSrc && src.indexOf('data:image') !== 0) {
            aImgEl.dataset.originalSrc = src;
          }
          aImgEl.setAttribute('src', newURL);
          aImgEl.dataset.roundedApplied = styleKey;
          applyMaskedImageMaterial(aImgEl);
        } catch(_) { /* ignore */ }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = aImgEl.dataset.originalSrc || src;
    } catch(_) { resolve(); }
  });
}

var _flatVideoScene360PauseCount = 0;

function prepareFlatVideoHotspotElement(video, muted) {
  if (!video || video.tagName !== 'VIDEO') return;
  try {
    video.muted = muted !== false;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (!video.crossOrigin) {
      video.crossOrigin = 'anonymous';
      video.setAttribute('crossorigin', 'anonymous');
    }
  } catch(e) {}
}

function pauseScene360VideoForFlatHotspot() {
  var sceneVideo = document.getElementById('scene-video-dynamic');
  if (!sceneVideo) return;
  if (_flatVideoScene360PauseCount === 0) {
    sceneVideo._wasPlayingBeforeFlatHotspot = !sceneVideo.paused;
    if (sceneVideo._wasPlayingBeforeFlatHotspot) {
      try { sceneVideo.pause(); } catch(e) {}
    }
    try {
      var ed = window.hotspotEditor;
      var hp = window.hotspotProject;
      if (ed && typeof ed.suspendVideoSkyboxForFlatHotspot === 'function') {
        ed.suspendVideoSkyboxForFlatHotspot();
      } else if (hp && typeof hp.suspendVideoSkyboxForFlatHotspot === 'function') {
        hp.suspendVideoSkyboxForFlatHotspot();
      }
    } catch(e) {}
  }
  _flatVideoScene360PauseCount++;
}

function resumeScene360VideoAfterFlatHotspot() {
  _flatVideoScene360PauseCount = Math.max(0, _flatVideoScene360PauseCount - 1);
  if (_flatVideoScene360PauseCount > 0) return;
  try {
    var ed = window.hotspotEditor;
    var hp = window.hotspotProject;
    if (ed && typeof ed.resumeVideoSkyboxAfterFlatHotspot === 'function') {
      ed.resumeVideoSkyboxAfterFlatHotspot();
      return;
    }
    if (hp && typeof hp.resumeVideoSkyboxAfterFlatHotspot === 'function') {
      hp.resumeVideoSkyboxAfterFlatHotspot();
      return;
    }
  } catch(e) {}
  var sceneVideo = document.getElementById('scene-video-dynamic');
  if (sceneVideo && sceneVideo._wasPlayingBeforeFlatHotspot) {
    try { sceneVideo.play().catch(function(){}); } catch(e) {}
  }
}

function isExportVideoSkyboxScene() {
  try {
    var hp = window.hotspotProject;
    return !!(hp && hp._sceneMediaType === 'video');
  } catch(e) { return false; }
}

function resolveFlatVideoHotspotVideos(videoSrcRef, aVideoEl, parentEl) {
  var videos = [];
  var seen = new Set();
  function add(video) {
    if (video && video.tagName === 'VIDEO' && typeof video.play === 'function' && !seen.has(video)) {
      seen.add(video);
      videos.push(video);
    }
  }
  try {
    if (aVideoEl) {
      var mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
      var map = mesh && mesh.material && mesh.material.map;
      add(map && map.image);
      var srcAttr = aVideoEl.getAttribute && aVideoEl.getAttribute('src');
      if (srcAttr && srcAttr.startsWith('#')) {
        add(document.getElementById(srcAttr.slice(1)));
      }
      var assetFromData = aVideoEl.dataset && aVideoEl.dataset.videoAssetId;
      if (assetFromData) add(document.getElementById(assetFromData));
    }
    if (parentEl && parentEl.dataset && parentEl.dataset.flatVideoAssetId) {
      add(document.getElementById(parentEl.dataset.flatVideoAssetId));
    }
    if (typeof videoSrcRef === 'string' && videoSrcRef.startsWith('#')) {
      add(document.getElementById(videoSrcRef.slice(1)));
    }
  } catch(_) {}
  return videos;
}

function playFlatVideoHotspotVideos(videos, aVideoEl, muted) {
  if (!videos || !videos.length) return Promise.resolve(false);
  pauseScene360VideoForFlatHotspot();

  var runPlayback = function() {
    videos.forEach(function(video) { prepareFlatVideoHotspotElement(video, muted); });
    var playOne = function(video) {
      try {
        if (video.readyState < 1) {
          return new Promise(function(resolve) {
            var onReady = function() {
              video.removeEventListener('loadeddata', onReady);
              video.removeEventListener('canplay', onReady);
              resolve(video.play().catch(function(){ return false; }));
            };
            video.addEventListener('loadeddata', onReady, { once: true });
            video.addEventListener('canplay', onReady, { once: true });
            try { video.load(); } catch(e) {}
          });
        }
        return video.play().catch(function(){ return false; });
      } catch(e) { return Promise.resolve(false); }
    };
    return Promise.all(videos.map(playOne)).then(function() {
      try {
        if (aVideoEl) {
          var mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
          var map = mesh && mesh.material && mesh.material.map;
          if (map) map.needsUpdate = true;
        }
      } catch(e) {}
      return true;
    });
  };

  if (isExportVideoSkyboxScene()) {
    return new Promise(function(resolve) {
      setTimeout(function() { resolve(runPlayback()); }, 100);
    });
  }
  return runPlayback();
}

function pauseFlatVideoHotspotVideos(videos, aVideoEl) {
  if (!videos || !videos.length) return;
  videos.forEach(function(video) { try { video.pause(); } catch(e) {} });
  try {
    if (aVideoEl) {
      var mesh = aVideoEl.getObject3D && aVideoEl.getObject3D('mesh');
      var map = mesh && mesh.material && mesh.material.map;
      if (map) map.needsUpdate = true;
    }
  } catch(e) {}
  resumeScene360VideoAfterFlatHotspot();
}

function setFlatVideoHotspotPlayback(parentEl, aVideoEl, videos, playing, userAction, muted) {
  if (!videos || !videos.length) return Promise.resolve();
  if (userAction && parentEl) parentEl._flatVideoUserPaused = !playing;
  var useMuted = muted !== false;
  var playbackPromise = playing
    ? playFlatVideoHotspotVideos(videos, aVideoEl, useMuted)
    : (pauseFlatVideoHotspotVideos(videos, aVideoEl), Promise.resolve());
  if (aVideoEl) {
    try { aVideoEl.setAttribute('autoplay', playing ? 'true' : 'false'); } catch(e) {}
  }
  return playbackPromise;
}

function setFlatVideoHotspotMuted(videos, muted) {
  if (!videos || !videos.length) return;
  videos.forEach(function(video) {
    try { video.muted = muted; } catch(e) {}
  });
}

function attachFlatVideoHotspotControls(parentEl, videoSrcRef, options) {
  options = options || {};
  var styles = options.styles || null;
  var aVideoEl = options.aVideoEl || null;
  var startMuted = options.startMuted !== false;
  var playImage = (styles && styles.buttonImages && styles.buttonImages.play) || '#play';
  var pauseImage = (styles && styles.buttonImages && styles.buttonImages.pause) || '#pause';
  var buttonColor = (styles && styles.audio && styles.audio.buttonColor) || '#FFFFFF';
  var buttonOpacity = String((styles && styles.audio && styles.audio.buttonOpacity) != null ? styles.audio.buttonOpacity : 1.0);
  var btnY = options.controlY != null ? options.controlY : -0.35;
  var btnZ = options.controlZ != null ? options.controlZ : 0.12;
  var getVideos = function() { return resolveFlatVideoHotspotVideos(videoSrcRef, aVideoEl, parentEl); };

  var playBtn = document.createElement('a-image');
  playBtn.setAttribute('class', 'clickable video-control video-play-control');
  playBtn.setAttribute('src', playImage);
  playBtn.setAttribute('width', '0.5');
  playBtn.setAttribute('height', '0.5');
  playBtn.setAttribute('material', 'color: ' + buttonColor);
  playBtn.setAttribute('opacity', buttonOpacity);
  playBtn.setAttribute('position', '0 ' + btnY + ' ' + btnZ);
  parentEl.appendChild(playBtn);

  var isPlaying = false;
  var isMuted = startMuted;
  var boundVideos = new Set();
  var syncFromVideo = function() {
    var videos = getVideos();
    var video = videos[0];
    if (!video) return;
    isPlaying = !video.paused;
    isMuted = !!video.muted;
    playBtn.setAttribute('src', isPlaying ? pauseImage : playImage);
  };
  var bindVideoListeners = function() {
    var videos = getVideos();
    if (!videos.length) return false;
    videos.forEach(function(video) {
      if (boundVideos.has(video)) return;
      boundVideos.add(video);
      video.addEventListener('play', syncFromVideo);
      video.addEventListener('pause', syncFromVideo);
      video.addEventListener('volumechange', syncFromVideo);
    });
    syncFromVideo();
    return true;
  };
  var togglePlay = function(e) {
    if (e) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
    var videos = getVideos();
    if (!videos.length) {
      bindVideoListeners();
      videos = getVideos();
    }
    if (!videos.length) return;
    var nextPlaying = !isPlaying;
    setFlatVideoHotspotPlayback(parentEl, aVideoEl, videos, nextPlaying, true, isMuted).then(function() {
      syncFromVideo();
    });
  };
  var bindControl = function(el, handler) {
    el.addEventListener('click', function(e) { handler(e); });
    el.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      handler(e);
    });
    el.addEventListener('triggerdown', handler);
  };
  bindControl(playBtn, togglePlay);
  playBtn.setAttribute('animation__hover_in', { property: 'scale', to: '1.2 1.2 1', dur: 200, easing: 'easeOutQuad', startEvents: 'mouseenter' });
  playBtn.setAttribute('animation__hover_out', { property: 'scale', to: '1 1 1', dur: 200, easing: 'easeOutQuad', startEvents: 'mouseleave' });
  if (!bindVideoListeners() && aVideoEl) {
    aVideoEl.addEventListener('materialvideoloadeddata', bindVideoListeners, { once: true });
    aVideoEl.addEventListener('loadeddata', bindVideoListeners, { once: true });
    var poll = setInterval(function() { if (bindVideoListeners()) clearInterval(poll); }, 200);
    setTimeout(function() { clearInterval(poll); }, 8000);
  }
  parentEl._flatVideoControls = { playBtn: playBtn, syncFromVideo: syncFromVideo };
  return parentEl._flatVideoControls;
}

// Face camera component
AFRAME.registerComponent("face-camera", {
  init: function () {
    this.cameraObj = document.querySelector("[camera]").object3D;
  },
  tick: function () {
    if (this.cameraObj) {
      this.el.object3D.lookAt(this.cameraObj.position);
    }
  },
});

// Hotspot component for standalone projects
AFRAME.registerComponent("hotspot", {
  schema: {
    label: { type: "string", default: "" },
    audio: { type: "string", default: "" },
    audioLoop: { type: "boolean", default: true },
    popup: { type: "string", default: "" },
    popupWidth: { type: "number", default: 3 },
    popupHeight: { type: "number", default: 2 },
    popupColor: { type: "color", default: "#333333" },
    imageSrc: { type: "string", default: "" },
    imageScale: { type: "number", default: 5 },
    imageAspectRatio: { type: "number", default: 0 },
    mediaKind: { type: "string", default: "photo" },
    videoSrc: { type: "string", default: "" },
    videoLoop: { type: "boolean", default: true },
    videoMuted: { type: "boolean", default: true },
    modelSrc: { type: "string", default: "" },
    modelScale: { type: "number", default: 1 },
    modelRotationX: { type: "number", default: 0 },
    modelRotationY: { type: "number", default: 0 },
    modelRotationZ: { type: "number", default: 0 },
    modelPositionY: { type: "number", default: 0 },
  },

  init: function () {
    const data = this.data;
    const el = this.el;

    // REMOVED: Main element hover animations to prevent conflicts with popup elements

    // Add popup functionality
    if (data.popup) {
      this.createPopup(data);
    }

    // Add audio functionality
    if (data.audio) {
      this.createAudio(data);
    }

    // Static video billboard
    if (data.mediaKind === 'video' && data.videoSrc) {
      const vid = document.createElement('a-video');
      let _vsrc = data.videoSrc;
      if (_vsrc && _vsrc.includes('%')) { try { _vsrc = decodeURIComponent(_vsrc); } catch(e){} }
      vid.setAttribute('src', _vsrc);
      vid.setAttribute('autoplay', false);
      vid.setAttribute('loop', data.videoLoop !== false);
      vid.setAttribute('muted', data.videoMuted !== false);
      vid.setAttribute('playsinline', true);
      vid.setAttribute('crossorigin', 'anonymous');
      const scl = data.imageScale || 1;
      const knownAR = (typeof data.imageAspectRatio === 'number' && isFinite(data.imageAspectRatio) && data.imageAspectRatio>0) ? data.imageAspectRatio : 1;
      vid.setAttribute('width', 1);
      vid.setAttribute('height', knownAR);
      vid.setAttribute('scale', scl + ' ' + scl + ' 1');
      vid.setAttribute('position', '0 ' + ((knownAR/2) * scl) + ' 0.05');
      if (knownAR !== 1) vid.dataset.aspectRatio = String(knownAR);
      vid.classList.add('static-video-hotspot');
      vid.classList.add('clickable');
      disableImageHotspotCulling(vid);
      var assetIdForVid = _vsrc.startsWith('#') ? _vsrc.slice(1) : '';
      if (assetIdForVid) {
        vid.dataset.videoAssetId = assetIdForVid;
        el.dataset.flatVideoAssetId = assetIdForVid;
      }
      let fusingTimer = null;
      let isExpanded = false;
      const gazeDuration = (CUSTOM_STYLES.gaze && CUSTOM_STYLES.gaze.duration) ? Math.round(CUSTOM_STYLES.gaze.duration * 1000) : 2000;
      vid.addEventListener('raycaster-intersected', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          if (fusingTimer) clearTimeout(fusingTimer);
          fusingTimer = setTimeout(() => {
            isExpanded = true;
            vid.setAttribute('scale', (scl * 2) + ' ' + (scl * 2) + ' 1');
          }, gazeDuration);
        }
      });
      vid.addEventListener('raycaster-intersected-cleared', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          if (fusingTimer) { clearTimeout(fusingTimer); fusingTimer = null; }
          isExpanded = false;
          vid.setAttribute('scale', scl + ' ' + scl + ' 1');
        }
      });
      if (CUSTOM_STYLES && CUSTOM_STYLES.image) {
        const istyle = CUSTOM_STYLES.image;
        const opacity = (typeof istyle.opacity === 'number') ? istyle.opacity : 1.0;
        vid.setAttribute('material', 'opacity:' + opacity + '; transparent:' + (opacity<1?'true':'false') + '; side:double');
      }
      const applyVideoAR = () => {
        try {
          const assetId = _vsrc.startsWith('#') ? _vsrc.slice(1) : '';
          const videoEl = assetId ? document.getElementById(assetId) : null;
          const nW = videoEl && videoEl.videoWidth || 0;
          const nH = videoEl && videoEl.videoHeight || 0;
          const ratio = nW > 0 && nH > 0 ? nH / nW : parseFloat(vid.dataset.aspectRatio || '') || 1;
          if (ratio && isFinite(ratio) && ratio > 0) {
            vid.dataset.aspectRatio = String(ratio);
            vid.setAttribute('width', 1);
            vid.setAttribute('height', ratio);
            vid.setAttribute('scale', scl + ' ' + scl + ' 1');
            vid.setAttribute('position', '0 ' + ((ratio/2)*scl) + ' 0.05');
          }
        } catch(e) {}
      };
      try {
        const assetId = _vsrc.startsWith('#') ? _vsrc.slice(1) : '';
        const videoEl = assetId ? document.getElementById(assetId) : null;
        if (videoEl) {
          videoEl.loop = data.videoLoop !== false;
          videoEl.muted = data.videoMuted !== false;
          videoEl.addEventListener('loadedmetadata', applyVideoAR, { once: true });
          try { videoEl.load(); } catch(e) {}
        }
      } catch(e) {}
      setTimeout(applyVideoAR, 250);
      el._flatVideoUserPaused = true;
      this.el.appendChild(vid);
      attachFlatVideoHotspotControls(this.el, _vsrc, {
        aVideoEl: vid,
        startMuted: data.videoMuted !== false,
        styles: CUSTOM_STYLES
      });
    } else if (data.imageSrc) {
      const img = document.createElement('a-image');
      let _src = data.imageSrc;
      if (_src && _src.includes('%')) { try { _src = decodeURIComponent(_src); } catch(e){} }
      setAImageHotspotSrc(img, _src);
      disableImageHotspotCulling(img);
  const scl = data.imageScale || 1;
  // Base unit geometry then scale for consistent aspect handling
  const knownAR = (typeof data.imageAspectRatio === 'number' && isFinite(data.imageAspectRatio) && data.imageAspectRatio>0) ? data.imageAspectRatio : 1;
  img.setAttribute('width', 1);
  img.setAttribute('height', knownAR);
  img.setAttribute('scale', scl + ' ' + scl + ' 1');
  img.setAttribute('position', '0 ' + ((knownAR/2) * scl) + ' 0.05');
  if (knownAR !== 1) img.dataset.aspectRatio = String(knownAR);
      img.classList.add('static-image-hotspot');
      img.classList.add('clickable');
      
      // Expand image after gaze completes - only for VR gaze-cursor
      let fusingTimer = null;
      let isExpanded = false;
      const gazeDuration = (CUSTOM_STYLES.gaze && CUSTOM_STYLES.gaze.duration) ? Math.round(CUSTOM_STYLES.gaze.duration * 1000) : 2000;
      img.addEventListener('raycaster-intersected', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          console.log('Gaze-cursor entered image');
          if (fusingTimer) clearTimeout(fusingTimer);
          fusingTimer = setTimeout(() => {
            console.log('Expanding image after gaze');
            isExpanded = true;
            img.setAttribute('scale', (scl * 2) + ' ' + (scl * 2) + ' 1');
          }, gazeDuration);
        }
      });
      
      img.addEventListener('raycaster-intersected-cleared', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          console.log('Gaze-cursor left image, isExpanded:', isExpanded);
          if (fusingTimer) {
            clearTimeout(fusingTimer);
            fusingTimer = null;
          }
          if (isExpanded) {
            isExpanded = false;
          }
          // Always reset scale on leave
          img.setAttribute('scale', scl + ' ' + scl + ' 1');
        }
      });
      
      if (CUSTOM_STYLES && CUSTOM_STYLES.image) {
        const istyle = CUSTOM_STYLES.image;
        const opacity = (typeof istyle.opacity === 'number') ? istyle.opacity : 1.0;
        img.setAttribute('material', 'opacity:' + opacity + '; transparent:' + (opacity<1?'true':'false') + '; side:double');
        const radius = parseFloat(istyle.borderRadius) || 0;
        if (radius === 0 && istyle.borderWidth > 0) {
          const frame = document.createElement('a-plane');
          frame.classList.add('static-image-border');
          frame.setAttribute('width', (1 * scl) + (istyle.borderWidth*2));
          frame.setAttribute('height', (1 * scl) + (istyle.borderWidth*2));
          frame.setAttribute('position', '0 ' + (0.5*scl) + ' 0.0');
          frame.setAttribute('material', 'shader:flat; color:' + (istyle.borderColor||'#FFFFFF') + '; opacity:' + opacity + '; transparent:' + (opacity<1?'true':'false') + '; side:double');
          this.el.appendChild(frame);
        }
        // If rounding requested, schedule an initial mask attempt even before natural dimension adjustment
        if (radius > 0) {
          // store original src
          if (!img.dataset.originalSrc) img.dataset.originalSrc = img.getAttribute('src');
          setTimeout(()=>{ applyRoundedMaskToAImage(img, istyle).catch(()=>{}); }, 30);
        }
      }
      img.addEventListener('load', () => {
        try {
          const ratio = (img.naturalHeight && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : (parseFloat(img.dataset.aspectRatio||'')||1);
          if (ratio && isFinite(ratio) && ratio>0) img.dataset.aspectRatio = String(ratio);
          img.setAttribute('width', 1);
          img.setAttribute('height', ratio);
          img.setAttribute('scale', scl + ' ' + scl + ' 1');
          img.setAttribute('position', '0 ' + ((ratio/2)*scl) + ' 0.05');
          if (CUSTOM_STYLES && CUSTOM_STYLES.image) {
            const istyle = CUSTOM_STYLES.image;
            const opacity = (typeof istyle.opacity === 'number') ? istyle.opacity : 1.0;
            const radius = parseFloat(istyle.borderRadius) || 0;
            if (radius === 0 && istyle.borderWidth > 0) {
              let frame = this.el.querySelector('.static-image-border');
              if (!frame) {
                frame = document.createElement('a-plane');
                frame.classList.add('static-image-border');
                this.el.appendChild(frame);
              }
              const bw = istyle.borderWidth;
              frame.setAttribute('width', (1 * scl) + (bw*2));
              frame.setAttribute('height', (ratio * scl) + (bw*2));
              frame.setAttribute('position', '0 ' + ((ratio/2)*scl) + ' 0.0');
              frame.setAttribute('material', 'shader:flat; color:' + (istyle.borderColor||'#FFFFFF') + '; opacity:' + opacity + '; transparent:' + (opacity<1?'true':'false') + '; side:double');
            } else {
              // Rounded: ensure any square frame removed & apply in-canvas mask + stroke
              this.el.querySelectorAll('.static-image-border').forEach(b=>b.remove());
              if (radius > 0) {
                // Re-apply original src before masking if previously processed
                if (img.dataset.originalSrc) img.setAttribute('src', img.dataset.originalSrc);
                else img.dataset.originalSrc = img.getAttribute('src');
                applyRoundedMaskToAImage(img, istyle).catch(()=>{});
              }
            }
          }
        } catch(e) { /* ignore */ }
      });
      this.el.appendChild(img);
    }

    // Static 3D model
    if (data.modelSrc) {
      const model = document.createElement('a-entity');
      let _src = data.modelSrc;
      if (_src && _src.includes('%')) { try { _src = decodeURIComponent(_src); } catch(e){} }
      
      const scl = data.modelScale || 1;
      const rotX = data.modelRotationX || 0;
      const rotY = data.modelRotationY || 0;
      const rotZ = data.modelRotationZ || 0;
      
      model.setAttribute('gltf-model', _src);
      model.setAttribute('scale', scl + ' ' + scl + ' ' + scl);
      model.setAttribute('rotation', rotX + ' ' + rotY + ' ' + rotZ);
      model.setAttribute('position', '0 0 0');
      model.classList.add('static-model-hotspot');
      model.classList.add('clickable');
      model.classList.add('no-gaze-grow');
      
      this.el.appendChild(model);
    }
  },

  createPopup: function(data) {
    const el = this.el;

    const infoIcon = document.createElement("a-entity");
    // Create circular info icon instead of banner
    const iconSize = CUSTOM_STYLES.hotspot.infoButton.size || 0.4;
    infoIcon.setAttribute("geometry", "primitive: circle; radius: " + iconSize);
    
    // Use custom styles
    const infoBgColor = CUSTOM_STYLES.hotspot.infoButton.backgroundColor;
    const infoTextColor = CUSTOM_STYLES.hotspot.infoButton.textColor;
    const infoFontSize = CUSTOM_STYLES.hotspot.infoButton.fontSize;
    
    infoIcon.setAttribute("material", "color: " + infoBgColor + "; opacity: " + CUSTOM_STYLES.hotspot.infoButton.opacity);
    infoIcon.setAttribute("text", "value: i; align: center; color: " + infoTextColor + "; width: " + infoFontSize + "; font: roboto");
    infoIcon.setAttribute("position", "0 0.8 0");
    infoIcon.classList.add("clickable");
    
    // Add hover animations to info icon for better UX
    infoIcon.setAttribute("animation__hover_in", {
      property: "scale",
      to: "1.1 1.1 1",
      dur: 200,
      easing: "easeOutQuad",
      startEvents: "mouseenter",
    });

    infoIcon.setAttribute("animation__hover_out", {
      property: "scale",
      to: "1 1 1",
      dur: 200,
      easing: "easeOutQuad",
      startEvents: "mouseleave",
    });
    
    el.appendChild(infoIcon);

    const popup = document.createElement("a-entity");
    popup.setAttribute("visible", "false");
    popup.setAttribute("position", "0 1.5 0.2"); // Move forward to avoid z-fighting with info icon
    popup.setAttribute("look-at", "#cam");

    const background = document.createElement("a-plane");
    background.setAttribute("color", CUSTOM_STYLES.hotspot.popup.backgroundColor);
    background.setAttribute("width", data.popupWidth);
    background.setAttribute("height", data.popupHeight);
    background.setAttribute("opacity", CUSTOM_STYLES.hotspot.popup.opacity);
    popup.appendChild(background);

    const text = document.createElement("a-text");
    text.setAttribute("value", data.popup);
    text.setAttribute("wrap-count", Math.floor(data.popupWidth * 8)); // Dynamic wrap based on popup width
    text.setAttribute("color", CUSTOM_STYLES.hotspot.popup.textColor);
    text.setAttribute("position", "0 0 0.05"); // Keep text centered
    text.setAttribute("align", "center");
    text.setAttribute("width", (data.popupWidth - 0.4).toString()); // Constrain to popup width with padding
    text.setAttribute("font", "roboto");
    popup.appendChild(text);

    el.appendChild(popup);

    // Close button as a separate entity OUTSIDE and BELOW the popup
    const closeButton = document.createElement("a-entity");
    closeButton.setAttribute("position", "0 " + (1.5 - data.popupHeight/2 - 0.25) + " 0.2"); // Below the popup
    closeButton.setAttribute("visible", "false"); // Hidden by default
    closeButton.setAttribute("look-at", "#cam");
    closeButton.classList.add("clickable");
    
    // Background for close button
    const closeBg = document.createElement("a-plane");
    const closeButtonWidth = (CUSTOM_STYLES.hotspot.closeButton.size || 0.4) * 3; // Scale width based on size
    const closeButtonHeight = (CUSTOM_STYLES.hotspot.closeButton.size || 0.4) * 0.875; // Scale height based on size
    closeBg.setAttribute("width", closeButtonWidth.toString());
    closeBg.setAttribute("height", closeButtonHeight.toString());
    const closeBgColor = CUSTOM_STYLES.hotspot.closeButton.backgroundColor || CUSTOM_STYLES.hotspot.infoButton.backgroundColor;
    closeBg.setAttribute("color", closeBgColor);
    closeBg.setAttribute("opacity", CUSTOM_STYLES.hotspot.closeButton.opacity.toString());
    closeButton.appendChild(closeBg);
    
    // Text label "Close"
    const closeText = document.createElement("a-text");
    closeText.setAttribute("value", "Close");
    closeText.setAttribute("align", "center");
    const closeTextColor = CUSTOM_STYLES.hotspot.closeButton.textColor || CUSTOM_STYLES.hotspot.infoButton.textColor;
    closeText.setAttribute("color", closeTextColor);
    closeText.setAttribute("width", (CUSTOM_STYLES.hotspot.closeButton.textSize || 4).toString());
    closeText.setAttribute("position", "0 0 0.02");
    closeText.setAttribute("font", "roboto");
    closeButton.appendChild(closeText);
    
    // Add hover animations to close button for better UX
    closeButton.setAttribute("animation__hover_in", {
      property: "scale",
      to: "1.1 1.1 1",
      dur: 200,
      easing: "easeOutQuad",
      startEvents: "mouseenter",
    });

    closeButton.setAttribute("animation__hover_out", {
      property: "scale",
      to: "1 1 1",
      dur: 200,
      easing: "easeOutQuad",
      startEvents: "mouseleave",
    });
    
    el.appendChild(closeButton);

    infoIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      popup.setAttribute("visible", true);
      closeButton.setAttribute("visible", true); // Show close button with popup
      infoIcon.setAttribute("visible", false); // Hide info icon when popup is open
    });

    // Prevent close button from triggering parent hotspot events
    closeButton.addEventListener("mouseenter", (e) => {
      e.stopPropagation();
    });
    
    closeButton.addEventListener("mouseleave", (e) => {
      e.stopPropagation();
    });

    closeButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Stop it from reaching the hotspot parent
      e.preventDefault();
      console.log("🔵 Close button clicked - closing popup");
      popup.setAttribute("visible", false);
      closeButton.setAttribute("visible", false); // Hide close button with popup
      setTimeout(() => {
        infoIcon.setAttribute("visible", true); // Show info icon when popup is closed
      }, 100);
    });
    
    // DON'T stop propagation on children - let clicks bubble up to closeButton
    // Just make sure they're also clickable
    closeBg.classList.add("clickable");
    closeText.classList.add("clickable");
  },


  createAudio: function(data) {
    const el = this.el;
    const audioEl = document.createElement("a-sound");
    // Stabilize blob/data audio by routing through <a-assets>
    let aSrc = data.audio;
    if (typeof aSrc === 'string' && (aSrc.startsWith('blob:') || aSrc.startsWith('data:'))) {
      try {
        const assets = document.querySelector('a-assets') || (function(){
          const scn = document.querySelector('a-scene') || document.querySelector('scene, a-scene');
          const a = document.createElement('a-assets');
          if (scn) scn.insertBefore(a, scn.firstChild);
          return a;
        })();
  const assetId = "audio_rt_" + (el.id || ("el_" + Math.random().toString(36).slice(2)));
  let assetEl = assets.querySelector("#" + assetId);
        if (!assetEl) {
          assetEl = document.createElement('audio');
          assetEl.setAttribute('id', assetId);
          assetEl.setAttribute('crossorigin', 'anonymous');
          assets.appendChild(assetEl);
        }
        assetEl.setAttribute('src', aSrc);
  aSrc = "#" + assetId;
      } catch(_) { /* ignore, fallback to direct src */ }
    }
    audioEl.setAttribute("src", aSrc);
    audioEl.setAttribute("autoplay", "false");
    audioEl.setAttribute("loop", data.audioLoop ? "true" : "false");
    el.appendChild(audioEl);

    const btn = document.createElement("a-image");
    btn.setAttribute("class", "clickable");
    
    // Use custom play button image if available
    const playImage = CUSTOM_STYLES?.buttonImages?.play || "#play";
    const pauseImage = CUSTOM_STYLES?.buttonImages?.pause || "#pause";
    btn.setAttribute("src", playImage);
    
    // Use custom audio button styles
    btn.setAttribute("width", "0.5");
    btn.setAttribute("height", "0.5");
    btn.setAttribute("material", "color: " + CUSTOM_STYLES.audio.buttonColor);
    btn.setAttribute("opacity", CUSTOM_STYLES.audio.buttonOpacity.toString());
    btn.setAttribute("position", "0 -0.6 0.02");
    el.appendChild(btn);

    let isPlaying = false;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (audioEl.components.sound) {
        if (isPlaying) {
          audioEl.components.sound.stopSound();
          btn.setAttribute("src", playImage);
        } else {
          audioEl.components.sound.playSound();
          btn.setAttribute("src", pauseImage);
        }
        isPlaying = !isPlaying;
      }
    });

    // Listen for audio end to reset button icon when not looping
    audioEl.addEventListener('sound-ended', () => {
      if (!data.audioLoop) {
        isPlaying = false;
        btn.setAttribute("src", playImage);
      }
    });
  }
});

// Project loader
// Project loader
class HotspotProject {
  constructor() {
    this.scenes = {};
    this.currentScene = 'scene1';
    this.globalSoundEnabled = true;
    this.currentGlobalAudio = null;
    this.isDragging = false;
    this.progressUpdateInterval = null;
  this.crossfadeEl = null; // overlay for crossfade
  this.weblinkOverlay = null;
  this.weblinkFrame = null;
  this.wasInVRBeforeWeblink = false;
    this._activeVideoTexture = null;
    this._videoTextureRenderHandler = null;
    this._sceneMediaType = 'image';
    this._skyboxSuspendedForFlatHotspot = false;
    this._skyboxWasPlayingBeforeFlat = false;
    this.loadProject();
  }

  async _ensureVideoPreviewExport(sceneId){
    try {
      if (EXPORTED_VIDEO_THUMB_CACHE.has(sceneId)) return EXPORTED_VIDEO_THUMB_CACHE.get(sceneId);
      const sc = this.scenes[sceneId];
      if (!sc || sc.type !== 'video' || !sc.videoSrc) return null;
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.muted = true;
      vid.playsInline = true;
      vid.crossOrigin = '';
      const run = new Promise((resolve) => {
        let settled = false;
        const cleanup = () => { try { vid.src = ''; vid.load && vid.load(); } catch(_) {} };
        vid.addEventListener('loadedmetadata', () => {
          try {
            const target = Math.min(1, (vid.duration || 1) * 0.1);
            const onSeeked = () => {
              try {
                const w = 512;
                const ratio = (vid.videoHeight || 1) / (vid.videoWidth || 1);
                const h = Math.max(1, Math.round(w * ratio));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(vid, 0, 0, w, h);
                const url = canvas.toDataURL('image/png');
                EXPORTED_VIDEO_THUMB_CACHE.set(sceneId, url);
                settled = true;
                resolve(url);
              } catch(_) { resolve(null); }
              cleanup();
            };
            try { vid.currentTime = isFinite(target) ? target : 0.1; } catch(_) { vid.currentTime = 0.1; }
            vid.addEventListener('seeked', onSeeked, { once: true });
          } catch(_) { resolve(null); cleanup(); }
        }, { once: true });
        vid.addEventListener('error', () => { if (!settled) resolve(null); cleanup(); }, { once: true });
      });
      vid.src = sc.videoSrc;
      return await run;
    } catch(_) { return null; }
  }

  async loadProject() {
    try {
      const response = await fetch('./config.json');
      const config = await response.json();
      
      console.log('Loaded config:', config);
      
      if (config.scenes) {
        // New format with scenes
        this.scenes = config.scenes;
        this.currentScene = config.currentScene || 'scene1';
        console.log('Using new format with scenes:', this.scenes);
        this.setupScenes();
      } else if (config.hotspots) {
        // Legacy format - single scene
        this.scenes = {
          'scene1': {
            name: 'Scene 1',
            image: './images/scene1.jpg',
            hotspots: config.hotspots
          }
        };
        this.currentScene = 'scene1';
        console.log('Using legacy format, created single scene');
        this.setupScenes();
      }
    } catch (error) {
      console.warn('No config.json found, using empty project');
      this.scenes = {
        'scene1': {
          name: 'Scene 1', 
          image: './images/scene1.jpg',
          hotspots: []
        }
      };
      this.setupScenes();
    }
  }

  setupScenes() {
    // Setup global sound control first
    this.setupGlobalSoundControl();

    // Show loading UI and preload all scene images so nav previews/skyboxes are instant
    this.showLoadingIndicator();
    const loaderSafetyMs = 25000;
    const loaderSafetyTimer = setTimeout(() => {
      if (document.getElementById('scene-loading-indicator')) {
        console.warn('Loader safety timeout — dismissing overlay');
        this.hideLoadingIndicator();
        this.showTapToPlayBanner('Tap anywhere to start the experience');
      }
    }, loaderSafetyMs);
    this.preloadAllSceneImages({ updateUI: true, timeoutMs: 20000 })
      .catch(() => {})
      .finally(() => {
        this.loadScene(this.currentScene);
        setTimeout(() => clearTimeout(loaderSafetyTimer), loaderSafetyMs + 1000);
      });
  }

  resumeSceneHotspotVideos(scene) {
    // Flat video hotspots start paused; user presses play.
  }

  loadScene(sceneId) {
    if (!this.scenes[sceneId]) {
      console.warn(\`Scene \${sceneId} not found\`);
      return;
    }
    try {
      _flatVideoScene360PauseCount = 0;
      var sceneVideoReset = document.getElementById('scene-video-dynamic');
      if (sceneVideoReset) delete sceneVideoReset._wasPlayingBeforeFlatHotspot;
      document.querySelectorAll('video[id^="asset-video-hotspot-"]').forEach(function(v) {
        try { v.pause(); } catch(e) {}
      });
    } catch(e) {}
    const scene = this.scenes[sceneId];
    const skybox = document.getElementById('skybox');
    
    console.log(\`Loading scene: \${sceneId}\`, scene);
    
    // Show a loading indicator
    this.showLoadingIndicator();

    // Check if this is a video scene
    if (scene.type === 'video' && scene.videoSrc) {
      // Handle video scene
      this.loadVideoScene(sceneId, scene, skybox);
      return;
    }

    // Ensure any existing videosphere is removed when switching to an image scene
    this._sceneMediaType = 'image';
    this.detachVideoTextureRenderer();
    const existingVideosphere = document.getElementById('current-videosphere');
    if (existingVideosphere && existingVideosphere.parentNode) {
      existingVideosphere.parentNode.removeChild(existingVideosphere);
    }
    // Hide and reset video controls/state for image scenes
    this.hideVideoControls();

    // (runtime) no editor hotspot list or id counter to manage
    
    // Prefer preloaded asset if available for instant swap
    const preloadedId = 'asset-panorama-' + sceneId;
    const preImg = document.getElementById(preloadedId);
    
    // Update scene image (fallback path)
    const imagePath = this.getSceneImagePath(scene.image, sceneId);
  console.log('Setting panorama src to: ' + (preImg ? ('#' + preloadedId) : imagePath));
    
    if (preImg) {
      // Use the preloaded asset without network load
      skybox.setAttribute('visible', 'false');
      setTimeout(() => {
        skybox.setAttribute('src', '#' + preloadedId);
        const loadingEnvironment = document.getElementById('loading-environment');
        if (loadingEnvironment) {
          loadingEnvironment.setAttribute('visible', 'false');
        }
        skybox.setAttribute('visible', 'true');
        
  // (runtime) do not persist scenes to localStorage

        console.log('Skybox texture updated from preloaded asset:', preloadedId);
        
        // Create hotspots after skybox is updated
        const container = document.getElementById('hotspot-container');
        container.innerHTML = '';
        this.createHotspots(scene.hotspots);
        this.resumeSceneHotspotVideos(scene);
        console.log('Hotspots created');
        
        // Load ground for this scene
        this.loadGround(sceneId);
        
        // Apply starting point if available, then signal scene loaded
        setTimeout(() => {
          this.applyStartingPoint(scene);

          setTimeout(() => {
            this.playCurrentGlobalSound();
          }, 500);

          try {
            const ev = new CustomEvent('vrhotspots:scene-loaded');
            window.dispatchEvent(ev);
          } catch (e) {}
        }, 100);

        // Hide the loading indicator
        this.hideLoadingIndicator();
        
        // Hide video controls for image scenes
        this.hideVideoControls();
      }, 100);
      
      this.currentScene = sceneId;
      return;
    }
    
    // Use a timestamp as a cache buster
    const cacheBuster = Date.now();
    const imagePathWithCache = imagePath + '?t=' + cacheBuster;
    
    // Create a new unique ID for this panorama
    const uniqueId = 'panorama-' + cacheBuster;
    
    // Create a completely new method that's more reliable across browsers
    // First, create a new image element that's not attached to the DOM yet
    const preloadImage = new Image();
    
    // Set up loading handlers before setting src
    preloadImage.onload = () => {
      console.log('New panorama loaded successfully');
      
      // Now we know the image is loaded, create the actual element for A-Frame
      const newPanorama = document.createElement('img');
      newPanorama.id = uniqueId;
      newPanorama.src = imagePathWithCache;
      newPanorama.crossOrigin = 'anonymous'; // Important for some browsers
      
      // Get the assets container
      const assets = document.querySelector('a-assets');
      
      // Add new panorama element to assets
      assets.appendChild(newPanorama);
      
      // Temporarily hide the skybox while changing its texture
      skybox.setAttribute('visible', 'false');
      
      // Force A-Frame to recognize the asset change
      setTimeout(() => {
        // Update to new texture
        skybox.setAttribute('src', '#' + uniqueId);
        
        // Hide loading environment and show the actual scene
        const loadingEnvironment = document.getElementById('loading-environment');
        if (loadingEnvironment) {
          loadingEnvironment.setAttribute('visible', 'false');
        }
        skybox.setAttribute('visible', 'true');
        
        console.log('Skybox texture updated with ID:', uniqueId);
        
        // Create hotspots after skybox is updated
        const container = document.getElementById('hotspot-container');
        container.innerHTML = '';
        this.createHotspots(scene.hotspots);
        this.resumeSceneHotspotVideos(scene);
        console.log('Hotspots created');
        
        // Load ground for this scene
        this.loadGround(sceneId);
        
        // Apply starting point if available, then signal scene loaded
        setTimeout(() => {
          this.applyStartingPoint(scene);

          setTimeout(() => {
            this.playCurrentGlobalSound();
          }, 500);

          try {
            const ev = new CustomEvent('vrhotspots:scene-loaded');
            window.dispatchEvent(ev);
          } catch (e) {}
        }, 100);

        // Hide the loading indicator
        this.hideLoadingIndicator();
        
        // Hide video controls for image scenes
        this.hideVideoControls();
      }, 100);
    };
    
    // Handle load errors
    preloadImage.onerror = () => {
      console.error(\`Failed to load panorama: \${imagePath}\`);
      this.showErrorMessage(\`Failed to load scene image for "\${scene.name}". Please check if the image exists at \${imagePath}\`);
      
      // Hide loading environment and show fallback
      const loadingEnvironment = document.getElementById('loading-environment');
      if (loadingEnvironment) {
        loadingEnvironment.setAttribute('visible', 'false');
      }
      
      // Fallback to default image
      skybox.setAttribute('src', '#main-panorama');
      skybox.setAttribute('visible', 'true');
      this.hideLoadingIndicator();
    };
    
    // Start loading the image
    preloadImage.src = imagePathWithCache;
    
    // We've replaced this with the preloadImage.onerror handler above
    
    this.currentScene = sceneId;
  }

  configureSceneVideoCrossOrigin(videoEl) {
    if (!videoEl) return;
    videoEl.crossOrigin = 'anonymous';
    videoEl.setAttribute('crossorigin', 'anonymous');
  }

  createExportVideoSphereElement() {
    const el = document.createElement('a-entity');
    el.id = 'current-videosphere';
    el.setAttribute('geometry', {
      primitive: 'sphere',
      radius: 5000,
      segmentsWidth: 64,
      segmentsHeight: 32,
    });
    el.setAttribute('rotation', '0 -90 0');
    return el;
  }

  detachVideoTextureRenderer() {
    const sceneEl = document.querySelector('a-scene');
    if (this._videoTextureRenderHandler && sceneEl) {
      sceneEl.removeEventListener('render', this._videoTextureRenderHandler);
    }
    this._videoTextureRenderHandler = null;
    if (this._activeVideoTexture?.dispose) {
      try {
        this._activeVideoTexture.dispose();
      } catch (_) {}
    }
    this._activeVideoTexture = null;
  }

  attachExportVideoTexture(sphereEl, videoEl) {
    this.detachVideoTextureRenderer();
    const mesh = (sphereEl.getObject3D && sphereEl.getObject3D('mesh')) || sphereEl.object3D;
    if (!mesh || typeof THREE === 'undefined') return false;

    this.configureSceneVideoCrossOrigin(videoEl);
    const texture = new THREE.VideoTexture(videoEl);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
    });
    if (mesh.material?.dispose) {
      try {
        mesh.material.dispose();
      } catch (_) {}
    }
    mesh.material = material;
    this._activeVideoTexture = texture;

    const sceneEl = document.querySelector('a-scene');
    this._videoTextureRenderHandler = () => {
      if (this._activeVideoTexture && videoEl.readyState >= 2) {
        this._activeVideoTexture.needsUpdate = true;
      }
    };
    sceneEl?.addEventListener('render', this._videoTextureRenderHandler);
    return true;
  }

  suspendVideoSkyboxForFlatHotspot() {
    if (this._skyboxSuspendedForFlatHotspot || this._sceneMediaType !== 'video') return;
    var sceneVideo = document.getElementById('scene-video-dynamic');
    if (!sceneVideo) return;

    this._skyboxSuspendedForFlatHotspot = true;
    this._skyboxWasPlayingBeforeFlat =
      sceneVideo._wasPlayingBeforeFlatHotspot != null
        ? !!sceneVideo._wasPlayingBeforeFlatHotspot
        : !sceneVideo.paused;
    if (!sceneVideo.paused) {
      try { sceneVideo.pause(); } catch(e) {}
    }
  }

  resumeVideoSkyboxAfterFlatHotspot() {
    if (!this._skyboxSuspendedForFlatHotspot) return;
    this._skyboxSuspendedForFlatHotspot = false;
    var sceneVideo = document.getElementById('scene-video-dynamic');
    var wasPlaying =
      this._skyboxWasPlayingBeforeFlat ||
      !!(sceneVideo && sceneVideo._wasPlayingBeforeFlatHotspot);
    this._skyboxWasPlayingBeforeFlat = false;
    if (!sceneVideo || !wasPlaying) return;

    try { sceneVideo.play().catch(function(){}); } catch(e) {}
  }

  waitForExportSceneReady(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const sceneEl = document.querySelector('a-scene');
      if (!sceneEl) {
        resolve();
        return;
      }
      if (sceneEl.hasLoaded) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, timeoutMs);
      sceneEl.addEventListener(
        'loaded',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }

  loadExportVideoSource(videoEl, videoSrc, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10000;
    return new Promise((resolve, reject) => {
      if (!videoEl) {
        reject(new Error('Missing video element'));
        return;
      }
      let settled = false;
      let timeoutId = null;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        fn();
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(() => reject(new Error('Video failed to load')));

      videoEl.addEventListener('loadedmetadata', onReady, { once: true });
      videoEl.addEventListener('loadeddata', onReady, { once: true });
      videoEl.addEventListener('canplay', onReady, { once: true });
      videoEl.addEventListener('error', onError, { once: true });

      timeoutId = setTimeout(() => {
        console.warn('Video source load timed out, proceeding anyway');
        finish(resolve);
      }, timeoutMs);

      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.preload = 'auto';
      this.configureSceneVideoCrossOrigin(videoEl);

      try {
        videoEl.pause();
      } catch (_) {}

      if (videoEl.src !== videoSrc) {
        videoEl.src = videoSrc;
      }
      try {
        videoEl.load();
      } catch (_) {
        finish(resolve);
      }
    });
  }

  async loadVideoScene(sceneId, scene, skybox) {
    console.log('Loading video scene:', sceneId, scene.videoSrc);

    this._sceneMediaType = 'video';
    this.hideTapToPlayBanner();
    skybox.setAttribute('visible', 'false');

    const existingVideosphere = document.getElementById('current-videosphere');
    if (existingVideosphere) {
      existingVideosphere.remove();
    }
    this.detachVideoTextureRenderer();

    const videoEl = document.getElementById('scene-video-dynamic');
    if (!videoEl) {
      console.warn('Video element not found in assets');
      this.hideLoadingIndicator();
      return;
    }

    videoEl.volume = scene.videoVolume !== undefined ? scene.videoVolume : 0.5;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');

    const aScene = document.querySelector('a-scene');

    const finishVideoSceneLoaded = () => {
      const loadingEnvironment = document.getElementById('loading-environment');
      if (loadingEnvironment) {
        loadingEnvironment.setAttribute('visible', 'false');
      }

      const container = document.getElementById('hotspot-container');
      container.innerHTML = '';
      this.createHotspots(scene.hotspots);
      this.resumeSceneHotspotVideos(scene);
      this.loadGround(sceneId);

      setTimeout(() => {
        this.applyStartingPoint(scene);
        setTimeout(() => {
          this.playCurrentGlobalSound();
        }, 500);
        try {
          const ev = new CustomEvent('vrhotspots:scene-loaded');
          window.dispatchEvent(ev);
        } catch (e) {}
      }, 100);

      this.updateVideoControls();
      this.hideLoadingIndicator();
      this.currentScene = sceneId;
    };

    let sceneFinished = false;
    const finishOnce = () => {
      if (sceneFinished) return;
      sceneFinished = true;
      finishVideoSceneLoaded();
    };

    const armTapToPlay = () => {
      this.showTapToPlayBanner('Tap anywhere to start the video');
      const resume = (e) => {
        try {
          e && e.stopPropagation && e.stopPropagation();
        } catch (_) {}
        cleanup();
        this.hideTapToPlayBanner();
        videoEl.play().catch(() => {});
      };
      const cleanup = () => {
        document.removeEventListener('pointerdown', resume, true);
        document.removeEventListener('touchstart', resume, true);
        document.removeEventListener('click', resume, true);
      };
      document.addEventListener('pointerdown', resume, { once: true, capture: true });
      document.addEventListener('touchstart', resume, { once: true, capture: true });
      document.addEventListener('click', resume, { once: true, capture: true });
    };

    const sceneReadyTimeout = setTimeout(() => {
      console.warn('Video scene setup timed out, showing tour anyway');
      finishOnce();
      if (videoEl.paused) armTapToPlay();
    }, 15000);

    try {
      await this.waitForExportSceneReady();
      await this.loadExportVideoSource(videoEl, scene.videoSrc);

      if (!document.getElementById('current-videosphere')) {
        const videosphere = this.createExportVideoSphereElement();
        aScene.appendChild(videosphere);

        await new Promise((resolve) => {
          if (videosphere.hasLoaded) resolve();
          else videosphere.addEventListener('loaded', () => resolve(), { once: true });
          setTimeout(resolve, 500);
        });

        this.attachExportVideoTexture(videosphere, videoEl);
      }

      if (sceneFinished) {
        clearTimeout(sceneReadyTimeout);
        return;
      }

      try {
        await videoEl.play();
        clearTimeout(sceneReadyTimeout);
        finishOnce();
      } catch (playErr) {
        console.log('Autoplay blocked, waiting for user gesture:', playErr);
        clearTimeout(sceneReadyTimeout);
        finishOnce();
        armTapToPlay();
      }
    } catch (err) {
      clearTimeout(sceneReadyTimeout);
      console.error('Video scene failed to load:', err);
      this.hideLoadingIndicator();
      const loadingEnvironment = document.getElementById('loading-environment');
      if (loadingEnvironment) {
        loadingEnvironment.setAttribute('visible', 'false');
      }
      skybox.setAttribute('visible', 'true');
      this.hideVideoControls();
      alert(
        'Failed to load the 360° video for this scene. If you are on iPhone, try tapping the page after it loads, or check your network connection.'
      );
    }
  }

  updateVideoControls() {
    const videoEl = document.getElementById('scene-video-dynamic');
    const videoControls = document.getElementById('video-controls');
    const playPauseBtn = document.getElementById('video-play-pause');
    const muteBtn = document.getElementById('video-mute');
    const progressBar = document.getElementById('video-progress');
    const volumeSlider = document.getElementById('video-volume');
    // HTML uses video-time-current and video-time-total; support both IDs for robustness
    const currentTimeSpan = document.getElementById('video-time-current') || document.getElementById('video-current-time');
    const durationSpan = document.getElementById('video-time-total') || document.getElementById('video-duration');
    
    if (!videoEl || !videoControls) return;
    
    // Show video controls
    videoControls.style.display = 'block';
    
    // Play/Pause button
    if (playPauseBtn) {
      playPauseBtn.onclick = () => {
        if (videoEl.paused) {
          videoEl.play();
          playPauseBtn.textContent = '⏸';
        } else {
          videoEl.pause();
          playPauseBtn.textContent = '▶';
        }
      };
    }
    
    // Mute button
    if (muteBtn) {
      muteBtn.onclick = () => {
        videoEl.muted = !videoEl.muted;
        muteBtn.textContent = videoEl.muted ? '🔇' : '🔊';
      };
      muteBtn.textContent = videoEl.muted ? '🔇' : '🔊';
    }
    
    // Progress bar
    if (progressBar) {
      videoEl.addEventListener('timeupdate', () => {
        if (videoEl.duration) {
          const progress = (videoEl.currentTime / videoEl.duration) * 100;
          progressBar.value = progress;
          
          if (currentTimeSpan) {
            currentTimeSpan.textContent = this.formatTime(videoEl.currentTime);
          }
        }
      });
      
      progressBar.addEventListener('input', (e) => {
        const time = (e.target.value / 100) * videoEl.duration;
        videoEl.currentTime = time;
      });
    }
    
    // Volume slider
    if (volumeSlider) {
      volumeSlider.value = videoEl.volume * 100;
      volumeSlider.addEventListener('input', (e) => {
        videoEl.volume = e.target.value / 100;
        if (videoEl.volume > 0) {
          videoEl.muted = false;
          if (muteBtn) muteBtn.textContent = '🔊';
        }
      });
    }
    
    // Duration display
    if (durationSpan) {
      const updateDuration = () => {
        if (videoEl.duration) {
          durationSpan.textContent = this.formatTime(videoEl.duration);
        }
      };
      if (videoEl.duration) {
        updateDuration();
      } else {
        videoEl.addEventListener('loadedmetadata', updateDuration, { once: true });
      }
    }
  }
  hideVideoControls() {
    const videoControls = document.getElementById('video-controls');
    if (videoControls) {
      videoControls.style.display = 'none';
    }
    
    // Pause and reset video
    const videoEl = document.getElementById('scene-video-dynamic');
    if (videoEl) {
      videoEl.pause();
      videoEl.currentTime = 0;
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
  }

  getSceneImagePath(imagePath, sceneId) {
    // If it's a URL (http:// or https://), use it directly
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    // If it's already a proper path starting with ./images/, use it directly
    else if (imagePath.startsWith('./images/')) {
      return imagePath;
    } 
    // For uploaded scenes (data URLs in config), look for the saved file
    else if (imagePath.startsWith('data:')) {
      return \`./images/\${sceneId}.jpg\`;
    }
    // Fallback - assume it's a filename and prepend the images path
    else {
      return \`./images/\${imagePath}\`;
    }
  }

  loadGround(sceneId) {
    const scene = this.scenes[sceneId];
    
    // Remove existing ground if present
    const existingGround = document.getElementById('scene-ground');
    if (existingGround) {
      existingGround.remove();
    }

    // Check if ground is enabled for this scene
    if (!scene || !scene.ground || !scene.ground.enabled) {
      return;
    }

    const ground = scene.ground;
    
    // Check for required textures
    if (!ground.diffuseMap || !ground.normalMap) {
      console.warn(\`Ground enabled for scene \${sceneId} but missing required textures\`);
      return;
    }

    // Get dimensions and settings
    const width = ground.size?.width || 20;
    const depth = ground.size?.depth || 20;
    const posX = ground.position?.x || 0;
    const posY = ground.position?.y || 0;
    const posZ = ground.position?.z || 0;
    const repeat = ground.repeat || 1;

    // Build material string with scene-specific texture IDs
    let material = \`src: #ground-diffuse-\${sceneId}; normalMap: #ground-normal-\${sceneId}; normalTextureRepeat: \${repeat} \${repeat}; repeat: \${repeat} \${repeat}\`;
    
    if (ground.roughnessMap) {
      material += \`; roughnessMap: #ground-roughness-\${sceneId}\`;
    }
    
    if (ground.aoMap) {
      material += \`; ambientOcclusionMap: #ground-ao-\${sceneId}; ambientOcclusionTextureRepeat: \${repeat} \${repeat}\`;
    }
    
    if (ground.displacementMap) {
      material += \`; displacementMap: #ground-displacement-\${sceneId}; displacementScale: 0.5; displacementBias: 0\`;
    }

    // Create ground plane
    const groundPlane = document.createElement('a-plane');
    groundPlane.id = 'scene-ground';
    groundPlane.setAttribute('rotation', '-90 0 0');
    groundPlane.setAttribute('width', width);
    groundPlane.setAttribute('height', depth);
    groundPlane.setAttribute('position', \`\${posX} \${posY} \${posZ}\`);
    groundPlane.setAttribute('material', material);

    // Add to scene
    const aScene = document.querySelector('a-scene');
    aScene.appendChild(groundPlane);
    
    console.log(\`Ground loaded for scene \${sceneId}\`);
  }

  createHotspots(hotspots) {
    const container = document.getElementById('hotspot-container');
    

    hotspots.forEach(hotspot => {
  let hotspotEl;
  let collider = null;
  let ring = null;
      if (hotspot.type === 'navigation' || hotspot.type === 'weblink') {
        hotspotEl = document.createElement('a-entity');
        hotspotEl.setAttribute('face-camera', '');

        // Transparent circle collider for interactions
  collider = document.createElement('a-entity');
        const navStyles = (typeof CUSTOM_STYLES !== 'undefined' && CUSTOM_STYLES.navigation) ? CUSTOM_STYLES.navigation : {};
        const ringOuter = (typeof navStyles.ringOuterRadius === 'number') ? navStyles.ringOuterRadius : 0.6;
  const ringThickness = (typeof navStyles.ringThickness === 'number') ? navStyles.ringThickness : 0.02;
        const ringInner = Math.max(0.001, ringOuter - ringThickness);
        const ringColor = (hotspot.type === 'weblink') ? (navStyles.weblinkRingColor || '#001f5b') : (navStyles.ringColor || 'rgb(0, 85, 0)');
  collider.setAttribute('geometry', 'primitive: circle; radius: ' + ringOuter);
  // Prevent invisible collider from occluding preview due to depth writes
  collider.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false; side: double');
        collider.classList.add('clickable');
        hotspotEl.appendChild(collider);

  // Thin green border ring (~3px) with transparent center
  ring = document.createElement('a-entity');
  ring.setAttribute('geometry', 'primitive: ring; radiusInner: ' + ringInner + '; radiusOuter: ' + ringOuter);
  ring.setAttribute('material', 'color: ' + ringColor + '; opacity: 1; transparent: true; shader: flat');
  // Bring the ring much closer to the camera so it renders in front of audio/text hotspots
  ring.setAttribute('position', '0 0 0.15');
  ring.classList.add('nav-ring');
  hotspotEl.appendChild(ring);

  // Inline preview circle (hidden by default), shows destination scene image inside the ring
  const preview = document.createElement('a-entity');
  preview.setAttribute('geometry', 'primitive: circle; radius: ' + ringInner);
  preview.setAttribute('material', 'transparent: true; opacity: 1; shader: flat; side: double; alphaTest: 0.01');
  preview.setAttribute('visible', 'false');
  // Keep preview just behind the ring but still well in front of other UI
  preview.setAttribute('position', '0 0 0.14');
  preview.setAttribute('scale', '0.01 0.01 0.01');
  preview.classList.add('nav-preview-circle');
  hotspotEl.appendChild(preview);

  // If this is a weblink with a configured preview, set the texture immediately so the image object exists from the start
  if (hotspot.type === 'weblink') {
    try {
      let src = null;
      if (typeof hotspot.weblinkPreview === 'string' && hotspot.weblinkPreview) src = hotspot.weblinkPreview;
      if (src) {
        console.log('[Weblink][Create][Export]', { id: hotspot.id, srcType: src.startsWith('data:') ? 'dataURL' : 'url', len: src.length });
        preview.setAttribute('material', 'src', src);
        preview.setAttribute('material', 'transparent', true);
        preview.setAttribute('material', 'opacity', 1);
        preview.setAttribute('material', 'shader', 'flat');
        preview.setAttribute('material', 'side', 'double');
        preview.setAttribute('material', 'alphaTest', 0.01);
      }
    } catch(err) { console.warn('[Weblink][Create][Export] failed to set preview', err); }
  }

    // Hover title label above the ring
    const labelGroup = document.createElement('a-entity');
    labelGroup.setAttribute('visible', 'false');
    labelGroup.classList.add('nav-label');
  const labelY = ringOuter + 0.35;
  // Push the label well forward so it clearly appears in front of audio/text hotspots
  labelGroup.setAttribute('position', '0 ' + labelY + ' 0.3');
    const labelBg = document.createElement('a-plane');
    labelBg.setAttribute('width', '1.8');
    labelBg.setAttribute('height', '0.35');
  const lblBG = (navStyles && navStyles.labelBackgroundColor) || '#000';
  const lblOP = (typeof navStyles.labelOpacity === 'number') ? navStyles.labelOpacity : 0.8;
  labelBg.setAttribute('material', 'shader:flat; color: ' + lblBG + '; opacity: ' + lblOP + '; transparent: true');
    labelBg.setAttribute('position', '0 0 0');
    const labelText = document.createElement('a-text');
    labelText.setAttribute('value', '');
    labelText.setAttribute('align', 'center');
  const lblColor = (navStyles && navStyles.labelColor) || '#fff';
  labelText.setAttribute('color', lblColor);
  labelText.setAttribute('width', '5');
    labelText.setAttribute('position', '0 0 0.01');
    labelGroup.appendChild(labelBg);
    labelGroup.appendChild(labelText);
    hotspotEl.appendChild(labelGroup);
      } else {
        // Non-navigation hotspot container without an invisible plane.
        // This prevents an invisible quad from blocking interaction or depth in front of portals.
        hotspotEl = document.createElement('a-entity');
        hotspotEl.setAttribute('face-camera', '');
      }
      hotspotEl.setAttribute('position', hotspot.position);
      // Only navigation/weblink parents may be clickable; non-navigation hotspots rely on child elements
      // (info icon, close button, audio button) which are explicitly marked as .clickable.
      if (hotspot.type === 'navigation' || hotspot.type === 'weblink') {
        hotspotEl.setAttribute('class', 'clickable');
      }
      
      let config = "type:" + hotspot.type;
      
        if (hotspot.type === 'text' || hotspot.type === 'text-audio') {
        const pw = (typeof hotspot.popupWidth === 'number') ? hotspot.popupWidth : 4;
        const ph = (typeof hotspot.popupHeight === 'number') ? hotspot.popupHeight : 2.5;
        config += ";popup:" + hotspot.text + ";popupWidth:" + pw + ";popupHeight:" + ph + ";popupColor:#333333";
      }
      
      if (hotspot.type === 'audio' || hotspot.type === 'text-audio') {
        // Use custom audio URL if available, otherwise use default
        const audioSrc = hotspot.audio || "#default-audio";
        config += ";audio:" + audioSrc;
        // Add audioLoop setting (default to true if not specified)
        const shouldLoop = hotspot.audioLoop !== false;
        config += ";audioLoop:" + shouldLoop;
      }
      
      if (hotspot.type === 'navigation' || hotspot.type === 'weblink') {
        if (hotspot.type === 'navigation') {
          config += ";navigation:" + hotspot.navigationTarget;
        }
        // Add click handler on the collider area
        const previewEl = hotspotEl.querySelector('.nav-preview-circle');
        const labelEl = hotspotEl.querySelector('.nav-label');
  let lastActivation = 0;
  let hoverTimer = null;
  let isHovering = false;
  const activationEvents = ['click', 'triggerdown', 'triggerup', 'mouseup', 'touchend', 'mousedown', 'pointerdown', 'pointerup'];

        const handleActivation = (e) => {
          if (e) {
            const type = e.type || '';
            if (!activationEvents.includes(type)) {
              return;
            }
            e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
          }
          const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          if (now - lastActivation < 250) return;
          lastActivation = now;

          if (hotspot.type === 'navigation') {
            this.navigateToScene(hotspot.navigationTarget);
          } else if (hotspot.type === 'weblink') {
            const url = hotspot.weblinkUrl || '';
            if (url) {
              try {
                this.showWeblinkOverlay(url, hotspot.weblinkTitle || 'External Resource');
              } catch (_) {
                const win = window.open(url, '_blank', 'noopener,noreferrer');
                if (!win) window.location.href = url;
              }
            }
          }
        };

        const handleEnter = () => {
          if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
          }
          if (isHovering) return;
          isHovering = true;
          
          if (previewEl) {
            // Stop any shrink animation in progress
            previewEl.removeAttribute('animation__shrink');
            
            let src = null;
            if (hotspot.type === 'navigation') {
              src = this._getExportPreviewSrc(hotspot.navigationTarget);
            } else if (hotspot.type === 'weblink') {
              if (typeof hotspot.weblinkPreview === 'string' && hotspot.weblinkPreview) src = hotspot.weblinkPreview;
            }
            if (src === 'VIDEO_ICON' && hotspot.type === 'navigation') {
              try {
                this._ensureVideoPreviewExport(hotspot.navigationTarget).then((thumb) => {
                  if (thumb && previewEl && isHovering) {
                    previewEl.setAttribute('material', 'src', thumb);
                    previewEl.setAttribute('material', 'transparent', true);
                    previewEl.setAttribute('material', 'opacity', 1);
                    previewEl.setAttribute('material', 'shader', 'flat');
                    previewEl.setAttribute('material', 'side', 'double');
                    previewEl.setAttribute('material', 'alphaTest', 0.01);
                  } else if (previewEl && isHovering) {
                    previewEl.setAttribute('material', 'color', '#000');
                    previewEl.setAttribute('material', 'transparent', true);
                    previewEl.setAttribute('material', 'opacity', 0.15);
                    previewEl.setAttribute('material', 'shader', 'flat');
                    previewEl.setAttribute('material', 'side', 'double');
                  }
                });
              } catch(_) {}
            } else if (src) {
              console.log('[Preview][Hover][Export]', { id: hotspot.id, type: hotspot.type, srcType: src.startsWith('data:') ? 'dataURL' : 'url', len: src.length });
              previewEl.setAttribute('material', 'src', src);
              previewEl.setAttribute('material', 'transparent', true);
              previewEl.setAttribute('material', 'opacity', 1);
              previewEl.setAttribute('material', 'shader', 'flat');
              previewEl.setAttribute('material', 'side', 'double');
              previewEl.setAttribute('material', 'alphaTest', 0.01);
            } else if (hotspot.type === 'weblink') {
              previewEl.setAttribute('material', 'color', '#000');
              previewEl.setAttribute('material', 'transparent', true);
              previewEl.setAttribute('material', 'opacity', 0.15);
              previewEl.setAttribute('material', 'shader', 'flat');
              previewEl.setAttribute('material', 'side', 'double');
            }
            
            // Reset scale and start grow animation
            previewEl.setAttribute('scale', '0.01 0.01 0.01');
            previewEl.setAttribute('visible', 'true');
            previewEl.setAttribute('animation__grow', { property: 'scale', to: '1 1 1', dur: 180, easing: 'easeOutCubic' });
            try { console.log('[Preview][MaterialAfterSet][Export]', previewEl.getAttribute('material')); } catch (_) {}
          }
          try {
            const label = labelEl;
            const txt = label && label.querySelector('a-text');
            if (label && txt) {
              if (hotspot.type === 'navigation') {
                const sc = this.scenes[hotspot.navigationTarget];
                txt.setAttribute('value', 'Portal to ' + (sc?.name || hotspot.navigationTarget));
              } else if (hotspot.type === 'weblink') {
                const title = (hotspot.weblinkTitle && hotspot.weblinkTitle.trim()) ? hotspot.weblinkTitle.trim() : 'Open Link';
                txt.setAttribute('value', title);
              }
              try {
                const bg = label.querySelector('a-plane');
                const minW = 1.7;
                const maxW = 10;
                const tW = parseFloat(txt.getAttribute('width') || '0') || minW;
                const val = (txt.getAttribute('value') || '').toString();
                const spaces = (val.match(/\s/g) || []).length;
                const letters = Math.max(0, val.length - spaces);
                const effChars = letters + 0.4 * spaces;
                const est = 0.095 * effChars + 0.25;
                const nextW = Math.min(maxW, Math.max(minW, Math.min(tW, est)));
                if (bg) bg.setAttribute('width', String(nextW));
              } catch (_) {}
              label.setAttribute('visible', 'true');
            }
          } catch (_) {}
        };

        const handleLeave = () => {
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            if (!isHovering) return;
            isHovering = false;
            
            if (previewEl) {
              previewEl.removeAttribute('animation__grow');
              previewEl.setAttribute('animation__shrink', { property: 'scale', to: '0.01 0.01 0.01', dur: 120, easing: 'easeInCubic' });
              setTimeout(() => { 
                if (!isHovering && previewEl) {
                  previewEl.setAttribute('visible', 'false'); 
                }
              }, 130);
            }
            try {
              const label = labelEl;
              if (label) {
                label.setAttribute('visible', 'false');
                const bg = label.querySelector('a-plane');
                if (bg) bg.setAttribute('width', '1.8');
              }
            } catch (_) {}
          }, 80);
        };

        const registerTarget = (element) => {
          if (!element) return;
          element.classList.add('clickable');
          activationEvents.forEach((evt) => {
            element.addEventListener(evt, handleActivation);
          });
          element.addEventListener('mouseenter', handleEnter);
          element.addEventListener('mouseleave', handleLeave);
        };

  registerTarget(hotspotEl);
  if (collider) registerTarget(collider);
  if (ring) registerTarget(ring);
      }
      if (hotspot.type === 'image') {
        const scale = (typeof hotspot.imageScale === 'number') ? hotspot.imageScale : (typeof hotspot.imageWidth === 'number' ? hotspot.imageWidth : 1);
        const ar = (typeof hotspot.imageAspectRatio === 'number' && isFinite(hotspot.imageAspectRatio) && hotspot.imageAspectRatio>0) ? hotspot.imageAspectRatio : ((typeof hotspot._aspectRatio === 'number' && isFinite(hotspot._aspectRatio) && hotspot._aspectRatio>0) ? hotspot._aspectRatio : 0);
        if (hotspot.mediaKind === 'video') {
          let vsrc = (typeof hotspot.video === 'string' && !hotspot.video.startsWith('FILE:')) ? hotspot.video : '';
          if (!vsrc && hotspot.commonAssetUrl) vsrc = hotspot.commonAssetUrl;
          const assetId = 'asset-video-hotspot-' + hotspot.id;
          if (vsrc) {
            try {
              let assetEl = document.getElementById(assetId);
              if (!assetEl) {
                assetEl = document.createElement('video');
                assetEl.id = assetId;
                assetEl.setAttribute('crossorigin', 'anonymous');
                assetEl.setAttribute('playsinline', '');
                assetEl.setAttribute('webkit-playsinline', '');
                assetEl.muted = hotspot.videoMuted !== false;
                assetEl.loop = hotspot.videoLoop !== false;
                if (assetEl.muted) assetEl.setAttribute('muted', '');
                if (assetEl.loop) assetEl.setAttribute('loop', '');
                assetEl.style.display = 'none';
                assetEl.preload = 'auto';
                document.body.appendChild(assetEl);
              }
              assetEl.setAttribute('src', vsrc);
            } catch(e) {}
            config += ';mediaKind:video;videoSrc:#' + assetId + ';imageScale:' + scale;
            config += ';videoLoop:' + (hotspot.videoLoop !== false);
            config += ';videoMuted:' + (hotspot.videoMuted !== false);
          }
        } else {
          let src = (typeof hotspot.image === 'string' && !hotspot.image.startsWith('FILE:')) ? hotspot.image : '';
          if (src && src.includes(';')) src = encodeURIComponent(src);
          config += ';imageSrc:' + src + ';imageScale:' + scale;
        }
        if (ar && ar > 0) config += ';imageAspectRatio:' + ar;
      }
      
      if (hotspot.type === 'model') {
        const scale = (typeof hotspot.modelScale === 'number') ? hotspot.modelScale : 1;
        const rotX = (typeof hotspot.modelRotationX === 'number') ? hotspot.modelRotationX : 0;
        const rotY = (typeof hotspot.modelRotationY === 'number') ? hotspot.modelRotationY : 0;
        const rotZ = (typeof hotspot.modelRotationZ === 'number') ? hotspot.modelRotationZ : 0;
        const posY = (typeof hotspot.modelPositionY === 'number') ? hotspot.modelPositionY : 0;
        let src = (typeof hotspot.model === 'string') ? hotspot.model : '';
        if (src && src.includes(';')) src = encodeURIComponent(src);
        config += ';modelSrc:' + src + ';modelScale:' + scale + ';modelRotationX:' + rotX + ';modelRotationY:' + rotY + ';modelRotationZ:' + rotZ + ';modelPositionY:' + posY;
      }
      
      hotspotEl.setAttribute('hotspot', config);
      container.appendChild(hotspotEl);
    });
  }
  
  navigateToScene(sceneId) {
    if (!this.scenes[sceneId]) {
      console.warn(\`Scene \${sceneId} not found\`);
      return;
    }
    
  // Stop current global sound before switching
    this.stopCurrentGlobalSound();
    
    // Show navigation feedback
    this.showNavigationFeedback(this.scenes[sceneId].name);

    const runSceneSwitch = () => {
      if (runSceneSwitch.__executed) {
        return;
      }
      runSceneSwitch.__executed = true;

      // End overlay when scene reports loaded
      const onLoaded = () => {
        window.removeEventListener('vrhotspots:scene-loaded', onLoaded);
        this._endCrossfadeOverlay();
      };
      window.addEventListener('vrhotspots:scene-loaded', onLoaded, { once: true });
      // Safety timeout
      setTimeout(() => {
        window.removeEventListener('vrhotspots:scene-loaded', onLoaded);
        this._endCrossfadeOverlay();
      }, 1500);

      this.loadScene(sceneId);
    };

    // Crossfade transition into next scene
    this._startCrossfadeOverlay(runSceneSwitch);

    // Fallback: ensure we still switch scenes if the overlay callback never fires (Quest safety)
    setTimeout(() => {
      if (!runSceneSwitch.__executed) {
        runSceneSwitch();
      }
    }, 700);
  }
  
  showNavigationFeedback(sceneName) {
    const feedback = document.createElement('div');
    feedback.style.cssText = \`
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(76, 175, 80, 0.9); color: white; padding: 15px 25px;
      border-radius: 8px; font-weight: bold; z-index: 10001;
      font-family: Arial; animation: fadeInOut 2s ease-in-out;
    \`;
    feedback.innerHTML = \`Navigated to: \${sceneName}\`;
    
    document.body.appendChild(feedback);
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 2000);
  }
  showErrorMessage(message) {
    const errorBox = document.createElement("div");
    errorBox.style.cssText = \`
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(244, 67, 54, 0.9); color: white; padding: 20px 30px;
      border-radius: 8px; font-weight: bold; z-index: 10001;
      font-family: Arial; max-width: 80%;
    \`;
    errorBox.innerHTML = \`<div style="text-align:center">⚠️ Error</div><div style="margin-top:10px">\${message}</div>\`;
    
    // Add a close button
    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Close";
    closeBtn.style.cssText = \`
      background: white; color: #f44336; border: none; padding: 8px 15px;
      border-radius: 4px; margin-top: 15px; cursor: pointer; font-weight: bold;
      display: block; margin-left: auto; margin-right: auto;
    \`;
    
    closeBtn.onclick = () => {
      if (errorBox.parentNode) {
        errorBox.parentNode.removeChild(errorBox);
      }
    };
    
    errorBox.appendChild(closeBtn);
    document.body.appendChild(errorBox);
  }
  
  showLoadingIndicator() {
    // Remove any existing loading indicator
    this.hideLoadingIndicator();
    
    // Create a more immersive loading indicator that matches the 3D environment
    const loadingEl = document.createElement('div');
    loadingEl.id = 'scene-loading-indicator';
    loadingEl.style.cssText = \`
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(15, 15, 35, 0.95));
      color: white;
      padding: 30px 50px;
      border-radius: 15px;
      font-family: 'Arial', sans-serif;
      font-size: 16px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(76, 175, 80, 0.3);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    \`;
    
    // Add spinning orb animation (matching the 3D scene)
    const spinner = document.createElement('div');
    spinner.style.cssText = \`
      width: 50px;
      height: 50px;
      margin-bottom: 20px;
      position: relative;
    \`;
    
    // Create multiple spinning rings
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.style.cssText = \`
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: 3px solid transparent;
        border-top: 3px solid \${i === 0 ? '#4CAF50' : i === 1 ? '#2196F3' : '#FF9800'};
        border-radius: 50%;
        animation: spin-\${i} \${1 + i * 0.3}s linear infinite;
        transform: rotate(\${i * 45}deg);
      \`;
      spinner.appendChild(ring);
    }
    
    // Add enhanced keyframes for spinner animation
    const style = document.createElement('style');
    style.textContent = \`
      @keyframes spin-0 {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes spin-1 {
        0% { transform: rotate(45deg); }
        100% { transform: rotate(405deg); }
      }
      @keyframes spin-2 {
        0% { transform: rotate(90deg); }
        100% { transform: rotate(450deg); }
      }
      @keyframes pulse-text {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.05); }
      }
    \`;
    document.head.appendChild(style);
    
    // Main loading text
    const text = document.createElement('div');
    text.textContent = 'Entering Virtual Reality...';
    text.style.cssText = \`
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #4CAF50;
      animation: pulse-text 2s ease-in-out infinite;
    \`;
    
    // Subtitle text
  const subtitle = document.createElement('div');
  subtitle.id = 'scene-loading-subtitle';
    subtitle.textContent = 'Loading immersive experience';
    subtitle.style.cssText = \`
      font-size: 14px;
      color: #cccccc;
      opacity: 0.8;
    \`;
    
    loadingEl.appendChild(spinner);
    loadingEl.appendChild(text);
    loadingEl.appendChild(subtitle);
    document.body.appendChild(loadingEl);
  }
  
  hideLoadingIndicator() {
    const loadingEl = document.getElementById('scene-loading-indicator');
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
  }

  showTapToPlayBanner(message = 'Tap anywhere to start the video') {
    this.hideTapToPlayBanner();
    const banner = document.createElement('div');
    banner.id = 'tap-to-play-banner';
    banner.textContent = message;
    banner.style.cssText = \`
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 26, 46, 0.92);
      color: #fff;
      padding: 14px 22px;
      border-radius: 999px;
      font-family: Arial, sans-serif;
      font-size: 15px;
      z-index: 10001;
      border: 1px solid rgba(76, 175, 80, 0.45);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    \`;
    document.body.appendChild(banner);
  }

  hideTapToPlayBanner() {
    const banner = document.getElementById('tap-to-play-banner');
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }

  // Preload all scenes' images into <a-assets> so skybox changes and portal previews are instant
  preloadAllSceneImages(options = {}) {
    const { updateUI = false, timeoutMs = 15000 } = options;
    const assets = document.querySelector('a-assets');
    if (!assets) return Promise.resolve();

    const ids = Object.keys(this.scenes || {});
    const total = ids.length;
    if (total === 0) return Promise.resolve();

    const updateSubtitle = (done) => {
      if (!updateUI) return;
      const subEl = document.getElementById('scene-loading-subtitle');
      if (subEl) subEl.textContent = 'Preparing scenes (' + done + '/' + total + ')';
    };

    let done = 0;
    updateSubtitle(0);

    const loaders = ids.map((id) => {
      const sc = this.scenes[id];
      // Skip video scenes — they don't need preloaded image assets and would mislead preview logic
      if (sc && sc.type === 'video') {
        done++;
        updateSubtitle(done);
        return Promise.resolve();
      }
      const src = this.getSceneImagePath(sc.image, id);
      const assetId = 'asset-panorama-' + id;
      if (document.getElementById(assetId)) { done++; updateSubtitle(done); return Promise.resolve(); }
      return new Promise((resolve) => {
        const img = document.createElement('img');
        img.id = assetId;
        img.crossOrigin = 'anonymous';
        img.addEventListener('load', () => { done++; updateSubtitle(done); resolve(); });
        img.addEventListener('error', () => { done++; updateSubtitle(done); resolve(); });
        img.src = src; // allow browser cache
        assets.appendChild(img);
      });
    });

    const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([Promise.allSettled(loaders), timeout]);
  }

  // ===== Navigation Preview (Export viewer) =====
  _ensureNavPreview() {
    if (!this._navBox) {
      const box = document.createElement('div');
      box.id = 'nav-preview';
      box.style.cssText = 'position:fixed;top:0;left:0;transform:translate(12px,12px);display:none;pointer-events:none;z-index:100001;background:rgba(0,0,0,0.9);color:#fff;border:1px solid #4CAF50;border-radius:8px;overflow:hidden;width:220px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:Arial,sans-serif;backdrop-filter:blur(2px);';
      const img = document.createElement('img');
      img.id = 'nav-preview-img';
      img.style.cssText = 'display:block;width:100%;height:120px;object-fit:cover;background:#111;';
      const cap = document.createElement('div');
      cap.id = 'nav-preview-caption';
      cap.style.cssText = 'padding:8px 10px;font-size:12px;color:#ddd;border-top:1px solid rgba(255,255,255,0.08);';
      box.appendChild(img); box.appendChild(cap);
      document.body.appendChild(box);
      this._navBox = box;
    }
    return this._navBox;
  }

  _positionNavPreview(x,y){
    const box = this._ensureNavPreview();
    const rectW = box.offsetWidth || 220; const rectH = box.offsetHeight || 160; const pad = 12;
    const maxX = window.innerWidth - rectW - pad; const maxY = window.innerHeight - rectH - pad;
    const nx = Math.min(Math.max(x+12, pad), maxX); const ny = Math.min(Math.max(y+12, pad), maxY);
    box.style.left = nx+'px'; box.style.top = ny+'px';
  }

  _getExportPreviewSrc(sceneId){
    // Check scene type first: video scenes should use VIDEO_ICON path (triggers thumbnail generation)
    const sc = this.scenes[sceneId]; if (!sc) return null;
    if (sc.type === 'video') return 'VIDEO_ICON';
    // For image scenes, prefer preloaded <a-assets> image if available
    const preId = 'asset-panorama-' + sceneId;
    const preEl = document.getElementById(preId);
    if (preEl) return '#' + preId;
    const img = sc.image||'';
    if (img.startsWith('http://')||img.startsWith('https://')) return img;
    if (img.startsWith('./images/')) return img;
    if (img.startsWith('data:')) return './images/' + sceneId + '.jpg';
    return './images/' + img;
  }

  _showNavPreview(sceneId){
    const box = this._ensureNavPreview();
    const img = document.getElementById('nav-preview-img');
    const cap = document.getElementById('nav-preview-caption');
    const sc = this.scenes[sceneId]; if (!sc) return;
  const src = this._getExportPreviewSrc(sceneId);
  if (src === 'VIDEO_ICON') {
    try {
      this._ensureVideoPreviewExport(sceneId).then((thumb) => {
        if (thumb) {
          img.src = thumb;
        } else {
          const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128"><rect rx="4" ry="4" x="2" y="6" width="14" height="12" fill="#111" stroke="#2ae" stroke-width="2"/><polygon points="16,10 22,7 22,17 16,14" fill="#2ae"/></svg>');
          img.src = 'data:image/svg+xml;charset=UTF-8,' + svg;
        }
      });
    } catch(_) {}
  } else if (src) {
    img.src = src;
  }
  cap.textContent = 'Go to: ' + (sc.name || sceneId);
    box.style.display = 'block';
    if (!this._navMove){ this._navMove = (e)=> this._positionNavPreview((e.clientX||0),(e.clientY||0)); }
    window.addEventListener('mousemove', this._navMove);
  }

  _hideNavPreview(){
    const box = this._ensureNavPreview();
    box.style.display = 'none';
    if (this._navMove){ window.removeEventListener('mousemove', this._navMove); }
  }

  _ensureWeblinkOverlay() {
    if (this.weblinkOverlay && this.weblinkOverlay.isConnected) {
      return this.weblinkOverlay;
    }

    const overlay = document.createElement('div');
    overlay.id = 'weblink-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,25,0.92);display:none;z-index:100010;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#101627;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,0.45);max-width:1100px;width:100%;max-height:80vh;height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(64,179,255,0.25);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(9,22,40,0.85);color:#e8f6ff;font-family:Arial, sans-serif;font-size:16px;font-weight:bold;border-bottom:1px solid rgba(64,179,255,0.25);';
    const titleEl = document.createElement('span');
    titleEl.dataset.role = 'weblink-title';
    titleEl.textContent = 'External Resource';
    header.appendChild(titleEl);

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = 'display:flex;gap:10px;';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = 'Open in New Window';
    openBtn.style.cssText = 'background:#2a7fff;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:Arial, sans-serif;';
    headerButtons.appendChild(openBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'background:#233047;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:Arial, sans-serif;';
    headerButtons.appendChild(closeBtn);

    header.appendChild(headerButtons);
    dialog.appendChild(header);

    const frameWrapper = document.createElement('div');
    frameWrapper.style.cssText = 'flex:1;position:relative;background:#000;';
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:0;';
    iframe.allow = 'accelerometer; gyroscope; autoplay; clipboard-write; encrypted-media; picture-in-picture;';
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    frameWrapper.appendChild(iframe);
    dialog.appendChild(frameWrapper);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        this.hideWeblinkOverlay();
      }
    });
    closeBtn.addEventListener('click', () => this.hideWeblinkOverlay());
    openBtn.addEventListener('click', () => {
      if (this.weblinkFrame && this.weblinkFrame.dataset.src) {
        const targetUrl = this.weblinkFrame.dataset.src;
        let popup = null;
        try {
          popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        } catch (_) {}
        if (popup) {
          try {
            popup.opener = null;
          } catch (_) {}
          this.hideWeblinkOverlay();
        }
      }
    });

    this.weblinkOverlay = overlay;
    this.weblinkFrame = iframe;
    overlay._titleEl = titleEl;
    return overlay;
  }

  showWeblinkOverlay(url, title) {
    if (!url) return;

    const overlay = this._ensureWeblinkOverlay();
    if (!overlay || !this.weblinkFrame) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (overlay._titleEl) {
      overlay._titleEl.textContent = title && title.trim() ? title.trim() : url;
    }

    this.wasInVRBeforeWeblink = false;
    const scene = document.querySelector('a-scene');
    if (scene && scene.is && scene.is('vr-mode') && typeof scene.exitVR === 'function') {
      try {
        scene.exitVR();
        this.wasInVRBeforeWeblink = true;
      } catch (_) {}
    }

    this.weblinkFrame.dataset.src = url;
    this.weblinkFrame.src = url;
    overlay.style.display = 'flex';
  }

  hideWeblinkOverlay() {
    if (!this.weblinkOverlay || !this.weblinkFrame) return;
    this.weblinkOverlay.style.display = 'none';
    delete this.weblinkFrame.dataset.src;
    this.weblinkFrame.src = 'about:blank';

    if (this.wasInVRBeforeWeblink) {
      const scene = document.querySelector('a-scene');
      if (scene && typeof scene.enterVR === 'function') {
        try {
          setTimeout(() => {
            try { scene.enterVR(); } catch (_) {}
          }, 300);
        } catch (_) {}
      }
      this.wasInVRBeforeWeblink = false;
    }
  }

  // ===== Crossfade helpers (Export viewer) =====
  _ensureCrossfadeOverlay() {
    if (!this.crossfadeEl) {
      const overlay = document.createElement('div');
      overlay.id = 'scene-crossfade';
      overlay.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 300ms ease;z-index:100000;';
      document.body.appendChild(overlay);
      this.crossfadeEl = overlay;
    }
    return this.crossfadeEl;
  }

  _startCrossfadeOverlay(run) {
    const overlay = this._ensureCrossfadeOverlay();
    requestAnimationFrame(() => {
      overlay.style.pointerEvents = 'auto';
      overlay.style.opacity = '1';
      setTimeout(() => {
        try { run && run(); } catch(e) {}
      }, 320);
    });
  }

  _endCrossfadeOverlay() {
    const overlay = this._ensureCrossfadeOverlay();
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.pointerEvents = 'none'; }, 320);
  }
  
  applyStartingPoint(scene) {
    if (!scene) scene = this.scenes[this.currentScene];
    if (!scene) return;

    const camera = document.getElementById('cam');
    if (!camera) return;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rotation = scene.startingPoint?.rotation;
    const safeX = rotation ? clamp(Number(rotation.x) || 0, -85, 85) : 0;
    const safeY = rotation ? Number(rotation.y) || 0 : 0;
    const safeZ = rotation ? Number(rotation.z) || 0 : 0;

    const lookControls = camera.components ? camera.components['look-controls'] : null;
    try {
      if (lookControls && typeof lookControls.pause === 'function') lookControls.pause();

      if (lookControls?.pitchObject?.rotation) {
        lookControls.pitchObject.rotation.x = THREE.MathUtils.degToRad(safeX);
      }
      if (lookControls?.yawObject?.rotation) {
        lookControls.yawObject.rotation.y = THREE.MathUtils.degToRad(safeY);
      }

      camera.setAttribute('rotation', '0 0 0');

      if (lookControls && typeof lookControls.updateOrientation === 'function') {
        lookControls.updateOrientation();
      }
    } finally {
      if (lookControls && typeof lookControls.play === 'function') {
        requestAnimationFrame(() => {
          try {
            lookControls.play();
          } catch (_) {}
        });
      }
    }

    if (rotation) {
      console.log('Applied starting point rotation: X:' + safeX + '° Y:' + safeY + '° Z:' + safeZ + '°');
    } else {
      console.log('Reset camera to default view (no starting point set for this scene)');
    }
  }
  
  setupGlobalSoundControl() {
    const soundBtn = document.getElementById('global-sound-toggle');
    if (!soundBtn) return;
    
    soundBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleGlobalSound();
    });
    
    this.setupProgressBar();
    this.updateGlobalSoundButton();
  }
  
  setupProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    const progressHandle = document.getElementById('progress-handle');
    
    if (!progressBar || !progressHandle) return;
    
    // Click on progress bar to seek
    progressBar.addEventListener('click', (e) => {
      if (this.isDragging) return;
      this.seekToPosition(e);
    });
    
    // Drag functionality
    progressHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isDragging = true;
      document.addEventListener('mousemove', this.handleProgressDrag.bind(this));
      document.addEventListener('mouseup', this.handleProgressDragEnd.bind(this));
    });
    
    // Touch support for mobile
    progressHandle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isDragging = true;
      document.addEventListener('touchmove', this.handleProgressTouchDrag.bind(this));
      document.addEventListener('touchend', this.handleProgressDragEnd.bind(this));
    });
  }
  
  handleProgressDrag(e) {
    if (!this.isDragging || !this.currentGlobalAudio) return;
    e.preventDefault();
    this.seekToPosition(e);
  }
  
  handleProgressTouchDrag(e) {
    if (!this.isDragging || !this.currentGlobalAudio) return;
    e.preventDefault();
    const touch = e.touches[0];
    this.seekToPosition(touch);
  }
  
  handleProgressDragEnd() {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleProgressDrag);
    document.removeEventListener('mouseup', this.handleProgressDragEnd);
    document.removeEventListener('touchmove', this.handleProgressTouchDrag);
    document.removeEventListener('touchend', this.handleProgressDragEnd);
  }
  
  seekToPosition(e) {
    if (!this.currentGlobalAudio) return;
    
    const progressBar = document.getElementById('progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const clickX = (e.clientX || e.pageX) - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    
    const newTime = percentage * this.currentGlobalAudio.duration;
    this.currentGlobalAudio.currentTime = newTime;
    
    this.updateProgressDisplay();
  }
  
  updateProgressDisplay() {
    if (!this.currentGlobalAudio) return;
    
    const progressFill = document.getElementById('progress-fill');
    const progressHandle = document.getElementById('progress-handle');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    
    if (!progressFill || !progressHandle || !currentTimeEl || !totalTimeEl) return;
    
    const currentTime = this.currentGlobalAudio.currentTime;
    const duration = this.currentGlobalAudio.duration;
    
    if (isNaN(duration)) return;
    
    const percentage = (currentTime / duration) * 100;
    
    progressFill.style.width = percentage + '%';
    progressHandle.style.left = percentage + '%';
    
    currentTimeEl.textContent = this.formatTime(currentTime);
    totalTimeEl.textContent = this.formatTime(duration);
  }
  
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return \`\${minutes}:\${remainingSeconds.toString().padStart(2, '0')}\`;
  }
  
  showProgressBar() {
    const container = document.getElementById('audio-progress-container');
    if (container) {
      container.style.display = 'block';
    }
  }
  
  hideProgressBar() {
    const container = document.getElementById('audio-progress-container');
    if (container) {
      container.style.display = 'none';
    }
  }
  
  toggleGlobalSound() {
    this.globalSoundEnabled = !this.globalSoundEnabled;
    
    if (this.globalSoundEnabled) {
      this.playCurrentGlobalSound();
    } else {
      this.stopCurrentGlobalSound();
    }
    
    this.updateGlobalSoundButton();
  }
  
  updateGlobalSoundButton() {
    const soundBtn = document.getElementById('global-sound-toggle');
    if (!soundBtn) return;
    
    if (this.globalSoundEnabled) {
      soundBtn.textContent = '🔊 Sound: ON';
      soundBtn.classList.remove('muted');
    } else {
      soundBtn.textContent = '🔇 Sound: OFF';
      soundBtn.classList.add('muted');
    }
  }
  
  playCurrentGlobalSound() {
    if (!this.globalSoundEnabled) return;
    
    const scene = this.scenes[this.currentScene];
    if (!scene || !scene.globalSound || !scene.globalSound.enabled) {
      this.hideProgressBar();
      return;
    }
    
    this.stopCurrentGlobalSound();
    
    const globalSound = scene.globalSound;
    this.currentGlobalAudio = new Audio();
    this.currentGlobalAudio.src = globalSound.audio;
    this.currentGlobalAudio.loop = true;
    this.currentGlobalAudio.volume = globalSound.volume || 0.5;
    
    // Set up progress tracking
    this.currentGlobalAudio.addEventListener('loadedmetadata', () => {
      this.showProgressBar();
      this.updateProgressDisplay();
      this.startProgressTracking();
    });
    
    this.currentGlobalAudio.addEventListener('timeupdate', () => {
      if (!this.isDragging) {
        this.updateProgressDisplay();
      }
    });
    
    this.currentGlobalAudio.addEventListener('ended', () => {
      // This shouldn't happen with loop=true, but just in case
      this.updateProgressDisplay();
    });
    
    // Try to play audio, handle autoplay restrictions gracefully
    this.currentGlobalAudio.play().catch(e => {
      console.log('Audio autoplay blocked - will start on first user interaction');
      this.hideProgressBar();
      
      // Set up one-time event listener for first user interaction
      const enableAudioOnInteraction = () => {
        this.currentGlobalAudio.play().then(() => {
          console.log('Audio enabled after user interaction');
          this.showProgressBar();
          this.updateProgressDisplay();
          this.startProgressTracking();
        }).catch(e => {
          console.warn('Audio still cannot play:', e);
        });
        
        // Remove the event listener after first use
        document.removeEventListener('click', enableAudioOnInteraction);
        document.removeEventListener('touchstart', enableAudioOnInteraction);
        document.removeEventListener('keydown', enableAudioOnInteraction);
      };
      
      // Listen for any user interaction
      document.addEventListener('click', enableAudioOnInteraction, { once: true });
      document.addEventListener('touchstart', enableAudioOnInteraction, { once: true });
      document.addEventListener('keydown', enableAudioOnInteraction, { once: true });
    });
  }
  
  startProgressTracking() {
    // Clear any existing interval
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
    }
    
    // Update progress display every 100ms for smooth animation
    this.progressUpdateInterval = setInterval(() => {
      if (this.currentGlobalAudio && !this.isDragging) {
        this.updateProgressDisplay();
      }
    }, 100);
  }
  
  stopProgressTracking() {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }
  
  stopCurrentGlobalSound() {
    this.stopProgressTracking();
    
    if (this.currentGlobalAudio) {
      this.currentGlobalAudio.pause();
      this.currentGlobalAudio.currentTime = 0;
      this.currentGlobalAudio = null;
    }
    
    this.hideProgressBar();
  }

  getCustomStyles() {
    // For exported projects, return the embedded custom styles
    // This method is needed for compatibility with createHotspots method
    return CUSTOM_STYLES || {
      hotspot: {
        infoButton: {
          backgroundColor: "#4A90E2", // Blue background for i icon
          textColor: "#FFFFFF",
          fontSize: 12, // Larger font for i icon
          opacity: 0.9,
          size: 0.4, // Size of the i icon circle
        },
        popup: {
          backgroundColor: "#333333",
          textColor: "#FFFFFF",
          borderColor: "#555555",
          borderWidth: 0,
          borderRadius: 0,
          opacity: 0.95,
          fontSize: 1,
          padding: 0.2,
        },
        closeButton: {
          size: 0.4,
          opacity: 1.0,
        },
      },
      audio: {
        buttonColor: "#FFFFFF",
        buttonOpacity: 1.0,
      },
      buttonImages: {
        play: "images/play.png",
        pause: "images/pause.png",
      },
    };
  }
}

// Initialize project
const MOTION_PERMISSION_STATE = {
  requested: false,
  granted: false
};

function setMotionBannerVisibility(visible) {
  const banner = document.getElementById('motion-permission-banner');
  if (!banner) return;
  if (visible) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function enableMagicWindowTracking() {
  const cameraEl = document.getElementById('cam');
  if (!cameraEl) return;
  const currentAttr = cameraEl.getAttribute('look-controls') || '';
  if (!/magicWindowTrackingEnabled:\s*true/i.test(currentAttr)) {
    cameraEl.setAttribute('look-controls', 'magicWindowTrackingEnabled: true; touchEnabled: true');
  }
  const lookControls = cameraEl.components && cameraEl.components['look-controls'];
  if (lookControls) {
    try {
      if (lookControls.data) {
        lookControls.data.magicWindowTrackingEnabled = true;
      }
      lookControls.magicWindowEnabled = true;
      lookControls.enabled = true;
      if (typeof lookControls.play === 'function') {
        lookControls.play();
      }
    } catch (err) {
      console.warn('[motion-permission] Failed to fully enable look-controls', err);
    }
  }
}

function setupDeviceOrientationPermissionWorkflow() {
  const requiresExplicitPermission =
    typeof window.DeviceOrientationEvent !== 'undefined' &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function';
  const motionButton = document.getElementById('motion-permission-button');
  const sceneEl = document.getElementById('main-scene');

  const markGranted = () => {
    MOTION_PERMISSION_STATE.granted = true;
    setMotionBannerVisibility(false);
    enableMagicWindowTracking();
  };

  const gestureEvents = ['touchend', 'click'];
  const gestureHandler = () => requestPermission();
  const cleanupGestureListeners = () => {
    gestureEvents.forEach(evt => {
      window.removeEventListener(evt, gestureHandler);
    });
  };

  const requestPermission = () => {
    if (MOTION_PERMISSION_STATE.granted) {
      cleanupGestureListeners();
      return;
    }
    if (MOTION_PERMISSION_STATE.requested) return;
    MOTION_PERMISSION_STATE.requested = true;

    if (!requiresExplicitPermission) {
      markGranted();
      cleanupGestureListeners();
      return;
    }

    window.DeviceOrientationEvent.requestPermission()
      .then(state => {
        if (state === 'granted') {
          markGranted();
        } else {
          MOTION_PERMISSION_STATE.requested = false;
          setMotionBannerVisibility(true);
        }
      })
      .catch(err => {
        console.warn('[motion-permission] Permission request failed', err);
        MOTION_PERMISSION_STATE.requested = false;
        setMotionBannerVisibility(true);
      })
      .finally(() => {
        cleanupGestureListeners();
      });
  };

  if (sceneEl) {
    sceneEl.addEventListener('loaded', () => {
      if (!requiresExplicitPermission) {
        markGranted();
      }
    });
    sceneEl.addEventListener('deviceorientationpermissiongranted', markGranted);
    sceneEl.addEventListener('deviceorientationpermissionrejected', () => {
      MOTION_PERMISSION_STATE.requested = false;
      setMotionBannerVisibility(true);
    });
  }

  if (motionButton) {
    motionButton.addEventListener('click', event => {
      event.preventDefault();
      requestPermission();
    });
  }

  if (requiresExplicitPermission) {
    setMotionBannerVisibility(true);
    gestureEvents.forEach(evt => {
      window.addEventListener(evt, gestureHandler, { once: true });
    });
  } else {
    setMotionBannerVisibility(false);
    enableMagicWindowTracking();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupDeviceOrientationPermissionWorkflow();
  setTimeout(() => {
    window.hotspotProject = new HotspotProject();
  }, 1000);
});`;
  }

  async addRealAssets(imagesFolder, audioFolder) {
    try {
      // Warn when running from file:// where fetches will likely fail
      try {
        if (typeof location !== 'undefined' && location.protocol === 'file:') {
          if (!this._fileProtocolWarned) {
            this._fileProtocolWarned = true;
            console.warn(
              'Export is running from file://. Real icons may not be readable. Export from a server (e.g., http://localhost:3000) to include real icons.'
            );
            try {
              alert(
                'Export from a server to include real icons. Running from file:// may embed fallback icons.'
              );
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Fetch real assets from the current project
      const assetsToFetch = [
        { path: './images/close.png', filename: 'close.png' },
        { path: './images/play.png', filename: 'play.png' },
        { path: './images/pause.png', filename: 'pause.png' },
        { path: './images/scene1.jpg', filename: 'scene1.jpg' }, // Default panorama
      ];

      for (const asset of assetsToFetch) {
        try {
          const response = await fetch(asset.path);
          if (response.ok) {
            const blob = await response.blob();
            imagesFolder.file(asset.filename, blob);
          } else {
            // If can't fetch, embed our default PNG for consistency
            await this.addEmbeddedDefaultIcon(imagesFolder, asset.filename);
          }
        } catch (error) {
          console.warn(`Could not fetch ${asset.path}, embedding default icon`);
          await this.addEmbeddedDefaultIcon(imagesFolder, asset.filename);
        }
      }

      // Try to fetch audio
      try {
        const audioResponse = await fetch('./audio/music.mp3');
        if (audioResponse.ok) {
          const audioBlob = await audioResponse.blob();
          audioFolder.file('music.mp3', audioBlob);
        }
      } catch (error) {
        console.warn('Could not fetch audio file');
      }
    } catch (error) {
      console.warn('Error adding assets:', error);
      // Fallback to embedding all defaults
      await this.embedAllDefaultIcons(imagesFolder);
    }
  }

  // Embed deterministic default PNGs (via canvas → blob) so exports are consistent
  async addEmbeddedDefaultIcon(imagesFolder, filename) {
    const blob = await this._makeDefaultIconBlob(filename);
    imagesFolder.file(filename, blob);
  }

  async embedAllDefaultIcons(imagesFolder) {
    const placeholders = ['close.png', 'play.png', 'pause.png', 'scene1.jpg'];
    for (const filename of placeholders) {
      await this.addEmbeddedDefaultIcon(imagesFolder, filename);
    }
  }

  _makeDefaultIconBlob(filename) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      // Draw defaults to match our shipped icons
      if (filename.includes('close')) {
        ctx.fillStyle = '#f44336'; // red
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✕', 32, 40);
      } else if (filename.includes('play')) {
        ctx.fillStyle = '#2196F3'; // blue
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('▶', 32, 40);
      } else if (filename.includes('pause')) {
        ctx.fillStyle = '#FF9800'; // orange
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⏸', 32, 40);
      } else {
        // Generic placeholder for any unexpected image
        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('IMG', 32, 40);
      }

      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  // Enhanced coordinate calculation methods
  calculateSphericalPosition(intersection, camera) {
    // Convert cartesian coordinates to spherical coordinates for better 360° positioning
    const cameraPos = camera.getAttribute('position');

    // Calculate relative position from camera
    const relativePos = {
      x: intersection.point.x - cameraPos.x,
      y: intersection.point.y - cameraPos.y,
      z: intersection.point.z - cameraPos.z,
    };

    // Calculate spherical coordinates
    const radius = 8; // Fixed radius for consistency
    const theta = Math.atan2(relativePos.x, relativePos.z); // Horizontal angle
    const phi = Math.acos(
      relativePos.y /
        Math.sqrt(
          relativePos.x * relativePos.x +
            relativePos.y * relativePos.y +
            relativePos.z * relativePos.z
        )
    ); // Vertical angle

    // Convert back to cartesian with fixed radius
    return {
      x: cameraPos.x + radius * Math.sin(phi) * Math.sin(theta),
      y: cameraPos.y + radius * Math.cos(phi),
      z: cameraPos.z + radius * Math.sin(phi) * Math.cos(theta),
    };
  }

  calculateOptimalPosition(intersection, camera) {
    // This method provides the most optimal positioning for 360° panoramas
    const cameraPos = camera.getAttribute('position');

    // Get the direction vector from camera to intersection
    const direction = new THREE.Vector3(
      intersection.point.x - cameraPos.x,
      intersection.point.y - cameraPos.y,
      intersection.point.z - cameraPos.z
    );

    // Normalize to unit vector
    direction.normalize();

    // Apply optimal distance based on 360° panorama best practices
    const optimalDistance = 7.5; // Sweet spot for visibility and interaction

    return {
      x: cameraPos.x + direction.x * optimalDistance,
      y: cameraPos.y + direction.y * optimalDistance,
      z: cameraPos.z + direction.z * optimalDistance,
    };
  }

  // Scene Management Methods
  setupSceneManagement() {
    this.updateSceneDropdown();
    this.updateNavigationTargets();
    this.updateModeIndicator();
    this.updateStartingPointInfo();
  }

  // Starting Point Management
  setStartingPoint() {
    const camera = document.getElementById('cam');
    if (!camera) return;

    // A-Frame look-controls typically updates internal yaw/pitch objects rather than the element's
    // rotation attribute, so read from look-controls when available.
    const lookControls = camera && camera.components ? camera.components['look-controls'] : null;
    const attrRotation = camera.getAttribute('rotation') || { x: 0, y: 0, z: 0 };

    let rx = Number(attrRotation.x) || 0;
    let ry = Number(attrRotation.y) || 0;
    let rz = Number(attrRotation.z) || 0;

    try {
      if (lookControls) {
        if (lookControls.pitchObject && lookControls.pitchObject.rotation) {
          rx = THREE.MathUtils.radToDeg(lookControls.pitchObject.rotation.x);
        } else if (camera.object3D && camera.object3D.rotation) {
          rx = THREE.MathUtils.radToDeg(camera.object3D.rotation.x);
        }
        if (lookControls.yawObject && lookControls.yawObject.rotation) {
          ry = THREE.MathUtils.radToDeg(lookControls.yawObject.rotation.y);
        } else if (camera.object3D && camera.object3D.rotation) {
          ry = THREE.MathUtils.radToDeg(camera.object3D.rotation.y);
        }
        // Z is rarely meaningful for look-controls; keep attribute Z (usually 0).
      }
    } catch (_) {
      // Fallback to attribute rotation
    }

    // Store the current camera rotation as the starting point
    // Clamp X (pitch) to prevent exact -90/90 values which cause device-orientation locking
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    rx = clamp(rx, -85, 85);

    this.scenes[this.currentScene].startingPoint = {
      rotation: {
        x: rx,
        y: ry,
        z: rz,
      },
    };

    this.updateStartingPointInfo();
    this.saveScenesData();

    // Show feedback
    this.showStartingPointFeedback('Starting point set to current view');
  }

  clearStartingPoint() {
    this.scenes[this.currentScene].startingPoint = null;
    this.updateStartingPointInfo();
    this.saveScenesData();
    this.showStartingPointFeedback('Starting point cleared - will use default view');
  }

  updateStartingPointInfo() {
    const infoDiv = document.getElementById('starting-point-info');
    const currentScene = this.scenes[this.currentScene];

    if (currentScene.startingPoint) {
      const rotation = currentScene.startingPoint.rotation;
      infoDiv.innerHTML = `📍 Set: X:${rotation.x.toFixed(0)}° Y:${rotation.y.toFixed(
        0
      )}° Z:${rotation.z.toFixed(0)}°`;
      infoDiv.style.background = '#1B5E20';
      infoDiv.style.color = '#4CAF50';
    } else {
      infoDiv.innerHTML = 'No starting point set';
      infoDiv.style.background = '#333';
      infoDiv.style.color = '#ccc';
    }
  }

  showStartingPointFeedback(message) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed; top: 20px; right: 380px; 
      background: rgba(76, 175, 80, 0.9); color: white; padding: 10px 15px;
      border-radius: 6px; font-weight: bold; z-index: ${EDITOR_LAYER.toast};
      font-family: Arial; font-size: 12px;
    `;
    feedback.innerHTML = `📍 ${message}`;

    document.body.appendChild(feedback);
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 3000);
  }

  applyStartingPoint() {
    const currentScene = this.scenes[this.currentScene];
    const camera = document.getElementById('cam');
    if (!camera) return;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rotation = currentScene?.startingPoint?.rotation;
    const safeX = rotation ? clamp(Number(rotation.x) || 0, -85, 85) : 0;
    const safeY = rotation ? Number(rotation.y) || 0 : 0;
    const safeZ = rotation ? Number(rotation.z) || 0 : 0;

    const lookControls = camera.components ? camera.components['look-controls'] : null;
    try {
      if (lookControls && typeof lookControls.pause === 'function') lookControls.pause();

      if (lookControls?.pitchObject?.rotation) {
        lookControls.pitchObject.rotation.x = THREE.MathUtils.degToRad(safeX);
      }
      if (lookControls?.yawObject?.rotation) {
        lookControls.yawObject.rotation.y = THREE.MathUtils.degToRad(safeY);
      }

      // look-controls drives the child yaw/pitch objects, not the entity rotation
      camera.setAttribute('rotation', '0 0 0');

      if (lookControls && typeof lookControls.updateOrientation === 'function') {
        lookControls.updateOrientation();
      }
    } finally {
      if (lookControls && typeof lookControls.play === 'function') {
        requestAnimationFrame(() => {
          try {
            lookControls.play();
          } catch (_) {}
        });
      }
    }

    if (rotation) {
      console.log(
        'Applied starting point rotation: X:' + safeX + '° Y:' + safeY + '° Z:' + safeZ + '°'
      );
    } else {
      console.log('Reset camera to default view (no starting point set for this scene)');
    }
  }

  applyStartingPointAfterSceneLoad(loadToken) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (loadToken === this._sceneLoadToken) {
          this.applyStartingPoint();
        }
        resolve();
      }, 150);
    });
  }

  updateSceneDropdown() {
    const dropdown = document.getElementById('current-scene');
    dropdown.innerHTML = '';

    Object.keys(this.scenes).forEach((sceneId) => {
      const option = document.createElement('option');
      option.value = sceneId;
      option.textContent = this.scenes[sceneId].name;
      if (sceneId === this.currentScene) {
        option.selected = true;
      }
      dropdown.appendChild(option);
    });
  }

  updateNavigationTargets() {
    const dropdown = document.getElementById('navigation-target');
    if (!dropdown) return;

    const previous = dropdown.value;
    dropdown.innerHTML = '<option value="">Select target scene...</option>';

    const sceneIds = Object.keys(this.scenes || {});
    sceneIds.forEach((sceneId) => {
      if (sceneId !== this.currentScene) {
        const option = document.createElement('option');
        option.value = sceneId;
        option.textContent = this.scenes[sceneId].name;
        dropdown.appendChild(option);
      }
    });

    if (sceneIds.length <= 1) {
      const hint = document.createElement('option');
      hint.value = '';
      hint.textContent = 'Add another scene first (Add Scene button)';
      hint.disabled = true;
      dropdown.appendChild(hint);
    }

    if (previous && previous !== this.currentScene && this.scenes[previous]) {
      dropdown.value = previous;
    }
  }

  // Helper function to get the first scene ID for consistent starting point
  getFirstSceneId() {
    const sceneIds = Object.keys(this.scenes);
    return sceneIds.length > 0 ? sceneIds[0] : 'scene1';
  }

  // Global Sound Management
  toggleGlobalSoundControls(enabled) {
    const controls = document.getElementById('global-sound-controls');
    controls.style.display = enabled ? 'block' : 'none';

    if (!enabled) {
      // Clear global sound when disabled
      this.scenes[this.currentScene].globalSound = null;
      this.stopGlobalSound();
    }
  }

  updateGlobalSound() {
    const enabled = document.getElementById('global-sound-enabled').checked;
    if (!enabled) return;

    const file = document.getElementById('global-sound-file').files[0];
    const url = document.getElementById('global-sound-url').value.trim();
    const volume = parseFloat(document.getElementById('global-sound-volume').value);

    let audio = null;
    if (url) {
      audio = url;
    } else if (file) {
      audio = file;
    }

    if (audio) {
      // Set the basic structure first
      this.scenes[this.currentScene].globalSound = {
        audio: audio,
        volume: volume,
        enabled: true,
      };

      // If using a File, persist into IndexedDB and switch to blob URL
      if (audio instanceof File) {
        (async () => {
          try {
            const storageKey =
              this.scenes[this.currentScene].globalSound.audioStorageKey ||
              `audio_global_${this.currentScene}`;
            const saved = await this.saveAudioToIDB(storageKey, audio);
            if (saved) {
              const blobURL = URL.createObjectURL(audio);
              this.scenes[this.currentScene].globalSound.audioStorageKey = storageKey;
              this.scenes[this.currentScene].globalSound.audioFileName = audio.name || null;
              this.scenes[this.currentScene].globalSound.audio = blobURL;
              this.saveScenesData();
            }
          } catch (e) {
            console.warn('[GlobalSound] Failed to save audio to IndexedDB', e);
          }
        })();
      } else if (typeof audio === 'string') {
        // If switching to URL-based audio, ensure we clear any stale storage keys
        if (this.scenes[this.currentScene].globalSound) {
          delete this.scenes[this.currentScene].globalSound.audioStorageKey;
          delete this.scenes[this.currentScene].globalSound.audioFileName;
        }
        this.applyCommonAssetFromDataset(
          this.scenes[this.currentScene].globalSound,
          document.getElementById('global-sound-url')
        );
        if (!this.isCommonAssetObject(this.scenes[this.currentScene].globalSound)) {
          this.clearCommonAssetProvenance(this.scenes[this.currentScene].globalSound);
        }
      }
    } else {
      this.scenes[this.currentScene].globalSound = null;
    }
  }

  loadGlobalSoundControls() {
    const scene = this.scenes[this.currentScene];
    const globalSound = scene.globalSound;

    if (globalSound && globalSound.enabled) {
      document.getElementById('global-sound-enabled').checked = true;
      document.getElementById('global-sound-volume').value = globalSound.volume || 0.5;
      this.toggleGlobalSoundControls(true);

      // If it's a URL, populate the URL field
      if (typeof globalSound.audio === 'string') {
        document.getElementById('global-sound-url').value = globalSound.audio;
        document.getElementById('global-sound-file').value = '';
      } else {
        // It's a File object, we can't restore file input, but show it's set
        document.getElementById('global-sound-url').value = '';
        // Note: Can't restore file input for security reasons
      }
    } else {
      document.getElementById('global-sound-enabled').checked = false;
      document.getElementById('global-sound-url').value = '';
      document.getElementById('global-sound-file').value = '';
      document.getElementById('global-sound-volume').value = 0.5;
      this.toggleGlobalSoundControls(false);
    }

    // Update editor sound button state
    this.updateEditorSoundButton();

    // Sync the visible Global Sound switch visuals to the current checkbox state
    this._syncGlobalSoundToggleUI();
  }

  playGlobalSound() {
    const scene = this.scenes[this.currentScene];
    if (!scene.globalSound || !scene.globalSound.enabled) return;

    this.stopGlobalSound(); // Stop any existing global sound

    const audio = scene.globalSound.audio;
    const volume = scene.globalSound.volume || 0.5;

    // Create global audio element
    this.globalAudioElement = document.createElement('audio');
    this.globalAudioElement.loop = true;
    this.globalAudioElement.volume = volume;

    if (typeof audio === 'string') {
      this.globalAudioElement.src = audio;
    } else if (audio instanceof File) {
      this.globalAudioElement.src = URL.createObjectURL(audio);
    }

    this.globalAudioElement.play().catch((e) => {
      console.warn('Could not play global sound:', e);
    });
  }

  stopGlobalSound() {
    if (this.globalAudioElement) {
      this.globalAudioElement.pause();
      this.globalAudioElement.currentTime = 0;
      if (this.globalAudioElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.globalAudioElement.src);
      }
      this.globalAudioElement = null;
    }
  }

  // Editor Global Sound Management
  toggleEditorGlobalSound() {
    console.log('🔘 TOGGLE BUTTON CLICKED - Current state:', this.editorGlobalSoundEnabled);
    this.editorGlobalSoundEnabled = !this.editorGlobalSoundEnabled;
    console.log('🔘 TOGGLE - New state:', this.editorGlobalSoundEnabled);

    if (this.editorGlobalSoundEnabled) {
      console.log('🔘 TOGGLE - Starting audio');
      this.playEditorGlobalSound();
    } else {
      console.log('🔘 TOGGLE - Stopping audio');
      this.stopEditorGlobalSound();
    }

    this.updateEditorSoundButton();
    console.log('🔘 TOGGLE - Button updated');
  }

  updateEditorSoundButton() {
    console.log(
      '🔘 UPDATE BUTTON - State:',
      this.editorGlobalSoundEnabled ? 'ENABLED' : 'DISABLED'
    );
    const btn = document.getElementById('editor-sound-control');
    if (!btn) {
      console.log('🔘 UPDATE BUTTON - ERROR: Button not found!');
      return;
    }

    if (this.editorGlobalSoundEnabled) {
      btn.textContent = '🎵 Scene Audio: ON';
      btn.classList.remove('muted');
      console.log('🔘 UPDATE BUTTON - Set to ON');
    } else {
      btn.textContent = '🔇 Scene Audio: OFF';
      btn.classList.add('muted');
      console.log('🔘 UPDATE BUTTON - Set to OFF');
    }
  }

  playEditorGlobalSound() {
    console.log('🎵 PLAY - Called, enabled state:', this.editorGlobalSoundEnabled);
    if (!this.editorGlobalSoundEnabled) {
      console.log('🎵 PLAY - BLOCKED: Editor sound is disabled');
      return;
    }

    const scene = this.scenes[this.currentScene];
    if (!scene || !scene.globalSound || !scene.globalSound.enabled) {
      console.log('🎵 PLAY - BLOCKED: No global sound configured for scene:', this.currentScene);
      this.hideEditorProgressBar();
      return;
    }

    console.log('🎵 PLAY - Starting audio for scene:', this.currentScene);
    this.stopEditorGlobalSound();

    const globalSound = scene.globalSound;
    this.editorGlobalAudio = document.createElement('audio');
    this.editorGlobalAudio.loop = true;
    this.editorGlobalAudio.volume = globalSound.volume || 0.5;

    if (typeof globalSound.audio === 'string') {
      this.editorGlobalAudio.src = globalSound.audio;
    } else if (globalSound.audio instanceof File) {
      this.editorGlobalAudio.src = URL.createObjectURL(globalSound.audio);
    }

    // Set up progress tracking for editor
    this.editorGlobalAudio.addEventListener('loadedmetadata', () => {
      this.showEditorProgressBar();
      this.updateEditorProgressDisplay();
      this.startEditorProgressTracking();
    });

    this.editorGlobalAudio.addEventListener('timeupdate', () => {
      this.updateEditorProgressDisplay();
    });

    this.editorGlobalAudio.play().catch((e) => {
      console.warn('Could not play editor global sound:', e);
      this.hideEditorProgressBar();
    });
  }

  stopEditorGlobalSound() {
    console.log('🎵 STOP: Stopping editor audio');
    this.stopEditorProgressTracking();

    if (this.editorGlobalAudio) {
      console.log('🎵 STOP: Audio element exists, pausing and cleaning up');
      this.editorGlobalAudio.pause();
      this.editorGlobalAudio.currentTime = 0;
      if (this.editorGlobalAudio.src && this.editorGlobalAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.editorGlobalAudio.src);
      }
      this.editorGlobalAudio = null;
    } else {
      console.log('🎵 STOP: No audio element to stop');
    }

    this.hideEditorProgressBar();
  }

  setupEditorProgressBar() {
    const progressBar = document.getElementById('editor-progress-bar');
    const progressHandle = document.getElementById('editor-progress-handle');

    if (!progressBar || !progressHandle) return;

    // Click on progress bar to seek
    progressBar.addEventListener('click', (e) => {
      this.seekEditorToPosition(e);
    });

    // Drag functionality for editor
    progressHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.editorIsDragging = true;
      document.addEventListener('mousemove', this.handleEditorProgressDrag.bind(this));
      document.addEventListener('mouseup', this.handleEditorProgressDragEnd.bind(this));
    });
  }

  handleEditorProgressDrag(e) {
    if (!this.editorIsDragging || !this.editorGlobalAudio) return;
    e.preventDefault();
    this.seekEditorToPosition(e);
  }

  handleEditorProgressDragEnd() {
    this.editorIsDragging = false;
    document.removeEventListener('mousemove', this.handleEditorProgressDrag);
    document.removeEventListener('mouseup', this.handleEditorProgressDragEnd);
  }

  seekEditorToPosition(e) {
    if (!this.editorGlobalAudio) return;

    const progressBar = document.getElementById('editor-progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));

    const newTime = percentage * this.editorGlobalAudio.duration;
    this.editorGlobalAudio.currentTime = newTime;

    this.updateEditorProgressDisplay();
  }

  updateEditorProgressDisplay() {
    if (!this.editorGlobalAudio) return;

    const progressFill = document.getElementById('editor-progress-fill');
    const progressHandle = document.getElementById('editor-progress-handle');
    const currentTimeEl = document.getElementById('editor-current-time');
    const totalTimeEl = document.getElementById('editor-total-time');

    if (!progressFill || !progressHandle || !currentTimeEl || !totalTimeEl) return;

    const currentTime = this.editorGlobalAudio.currentTime;
    const duration = this.editorGlobalAudio.duration;

    if (isNaN(duration)) return;

    const percentage = (currentTime / duration) * 100;

    progressFill.style.width = percentage + '%';
    progressHandle.style.left = percentage + '%';

    currentTimeEl.textContent = this.formatTime(currentTime);
    totalTimeEl.textContent = this.formatTime(duration);
  }

  // Format time helper for editor functions
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  startEditorProgressTracking() {
    if (this.editorProgressInterval) {
      clearInterval(this.editorProgressInterval);
    }

    this.editorProgressInterval = setInterval(() => {
      if (this.editorGlobalAudio && !this.editorIsDragging) {
        this.updateEditorProgressDisplay();
      }
    }, 100);
  }

  stopEditorProgressTracking() {
    if (this.editorProgressInterval) {
      clearInterval(this.editorProgressInterval);
      this.editorProgressInterval = null;
    }
  }

  showEditorProgressBar() {
    const container = document.getElementById('editor-progress-container');
    if (container) {
      container.style.display = 'block';
    }
  }

  hideEditorProgressBar() {
    const container = document.getElementById('editor-progress-container');
    if (container) {
      container.style.display = 'none';
    }
  }

  // Ground/Texture Management
  toggleGroundControls(enabled) {
    const controls = document.getElementById('ground-controls');
    if (controls) {
      controls.style.display = enabled ? 'block' : 'none';
    }

    // Update scene data
    this.scenes[this.currentScene].ground.enabled = enabled;
    this.saveScenesData();
  }

  async updateGround() {
    const scene = this.scenes[this.currentScene];
    if (!scene.ground.enabled) {
      console.log('🌍 [Ground] Update called but ground is disabled');
      return;
    }

    console.log('🌍 [Ground] Updating ground configuration');

    // Get form values
    const width = parseFloat(document.getElementById('ground-width').value) || 50;
    const depth = parseFloat(document.getElementById('ground-depth').value) || 50;
    const repeat = parseFloat(document.getElementById('ground-repeat').value) || 20;

    console.log('🌍 [Ground] Form values - width:', width, 'depth:', depth, 'repeat:', repeat);

    // Update scene data
    scene.ground.size = { width, depth };
    scene.ground.repeat = repeat;

    // Handle texture uploads
    const diffuseFile = document.getElementById('ground-diffuse').files[0];
    const normalFile = document.getElementById('ground-normal').files[0];
    const roughnessFile = document.getElementById('ground-roughness').files[0];
    const aoFile = document.getElementById('ground-ao').files[0];
    const displacementFile = document.getElementById('ground-displacement').files[0];

    // Process diffuse map (required)
    if (diffuseFile) {
      console.log('🌍 [Ground] Processing diffuse map:', diffuseFile.name);
      try {
        const storageKey = `ground_diffuse_${this.currentScene}`;
        await this.saveImageToIDB(storageKey, diffuseFile);
        const blobURL = URL.createObjectURL(diffuseFile);
        scene.ground.diffuseMap = blobURL;
        scene.ground.diffuseMapStorageKey = storageKey;
        scene.ground.diffuseMapFileName = diffuseFile.name;
        console.log('🌍 [Ground] Diffuse map saved, blob URL:', blobURL);
      } catch (e) {
        console.warn('[Ground] Failed to save diffuse map', e);
      }
    }

    // Process normal map (required)
    if (normalFile) {
      console.log('🌍 [Ground] Processing normal map:', normalFile.name);
      try {
        const storageKey = `ground_normal_${this.currentScene}`;
        await this.saveImageToIDB(storageKey, normalFile);
        const blobURL = URL.createObjectURL(normalFile);
        scene.ground.normalMap = blobURL;
        scene.ground.normalMapStorageKey = storageKey;
        scene.ground.normalMapFileName = normalFile.name;
        console.log('🌍 [Ground] Normal map saved, blob URL:', blobURL);
      } catch (e) {
        console.warn('[Ground] Failed to save normal map', e);
      }
    }

    // Process optional maps
    if (roughnessFile) {
      console.log('🌍 [Ground] Processing roughness map:', roughnessFile.name);
      try {
        const storageKey = `ground_roughness_${this.currentScene}`;
        await this.saveImageToIDB(storageKey, roughnessFile);
        const blobURL = URL.createObjectURL(roughnessFile);
        scene.ground.roughnessMap = blobURL;
        scene.ground.roughnessMapStorageKey = storageKey;
        scene.ground.roughnessMapFileName = roughnessFile.name;
      } catch (e) {
        console.warn('[Ground] Failed to save roughness map', e);
      }
    }

    if (aoFile) {
      console.log('🌍 [Ground] Processing AO map:', aoFile.name);
      try {
        const storageKey = `ground_ao_${this.currentScene}`;
        await this.saveImageToIDB(storageKey, aoFile);
        const blobURL = URL.createObjectURL(aoFile);
        scene.ground.aoMap = blobURL;
        scene.ground.aoMapStorageKey = storageKey;
        scene.ground.aoMapFileName = aoFile.name;
      } catch (e) {
        console.warn('[Ground] Failed to save AO map', e);
      }
    }

    if (displacementFile) {
      console.log('🌍 [Ground] Processing displacement map:', displacementFile.name);
      try {
        const storageKey = `ground_displacement_${this.currentScene}`;
        await this.saveImageToIDB(storageKey, displacementFile);
        const blobURL = URL.createObjectURL(displacementFile);
        scene.ground.displacementMap = blobURL;
        scene.ground.displacementMapStorageKey = storageKey;
        scene.ground.displacementMapFileName = displacementFile.name;
      } catch (e) {
        console.warn('[Ground] Failed to save displacement map', e);
      }
    }

    this.saveScenesData();
    this.renderGround();
  }

  renderGround() {
    const scene = this.scenes[this.currentScene];
    const groundData = scene.ground;

    console.log('🌍 [Ground] Rendering ground, enabled:', groundData.enabled, 'data:', groundData);

    // Remove existing ground if present
    const existingGround = document.getElementById('scene-ground');
    if (existingGround) {
      existingGround.remove();
      console.log('🌍 [Ground] Removed existing ground plane');
    }

    // Remove existing ground texture assets
    const existingAssets = document.querySelectorAll('[id^="ground-texture-"]');
    existingAssets.forEach((asset) => asset.remove());

    if (!groundData.enabled) {
      console.log('🌍 [Ground] Ground disabled, skipping render');
      return;
    }

    // Check for required textures
    if (!groundData.diffuseMap || !groundData.normalMap) {
      console.warn(
        '🌍 [Ground] Missing required textures (diffuse or normal). Cannot render ground.'
      );
      return;
    }

    // Get or create a-assets element
    let assets = document.querySelector('a-assets');
    if (!assets) {
      assets = document.createElement('a-assets');
      const aScene = document.querySelector('a-scene');
      if (aScene) {
        aScene.insertBefore(assets, aScene.firstChild);
      }
    }

    // Build material properties
    const materialProps = {
      roughness: 1,
      repeat: `${groundData.repeat} ${groundData.repeat}`,
    };

    // Create scene-specific asset IDs to prevent conflicts between scenes
    const sceneId = this.currentScene;

    // Create and add diffuse texture asset
    const diffuseId = `ground-texture-diffuse-${sceneId}`;
    const diffuseAsset = document.createElement('img');
    diffuseAsset.id = diffuseId;
    diffuseAsset.src = groundData.diffuseMap;
    diffuseAsset.crossOrigin = 'anonymous';
    assets.appendChild(diffuseAsset);
    materialProps.src = `#${diffuseId}`;
    console.log('🌍 [Ground] Added diffuse texture:', diffuseId);

    // Create and add normal map asset
    const normalId = `ground-texture-normal-${sceneId}`;
    const normalAsset = document.createElement('img');
    normalAsset.id = normalId;
    normalAsset.src = groundData.normalMap;
    normalAsset.crossOrigin = 'anonymous';
    assets.appendChild(normalAsset);
    materialProps.normalMap = `#${normalId}`;
    console.log('🌍 [Ground] Added normal map:', normalId);

    // Add optional textures
    if (groundData.roughnessMap) {
      const roughnessId = `ground-texture-roughness-${sceneId}`;
      const roughnessAsset = document.createElement('img');
      roughnessAsset.id = roughnessId;
      roughnessAsset.src = groundData.roughnessMap;
      roughnessAsset.crossOrigin = 'anonymous';
      assets.appendChild(roughnessAsset);
      materialProps.roughnessMap = `#${roughnessId}`;
      console.log('🌍 [Ground] Added roughness map:', roughnessId);
    }

    if (groundData.aoMap) {
      const aoId = `ground-texture-ao-${sceneId}`;
      const aoAsset = document.createElement('img');
      aoAsset.id = aoId;
      aoAsset.src = groundData.aoMap;
      aoAsset.crossOrigin = 'anonymous';
      assets.appendChild(aoAsset);
      materialProps.ambientOcclusionMap = `#${aoId}`;
      materialProps.ambientOcclusionMapIntensity = 1;
      console.log('🌍 [Ground] Added AO map:', aoId);
    }

    if (groundData.displacementMap) {
      const dispId = `ground-texture-displacement-${sceneId}`;
      const dispAsset = document.createElement('img');
      dispAsset.id = dispId;
      dispAsset.src = groundData.displacementMap;
      dispAsset.crossOrigin = 'anonymous';
      assets.appendChild(dispAsset);
      materialProps.displacementMap = `#${dispId}`;
      materialProps.displacementScale = 1;
      materialProps.displacementBias = 0;
      console.log('🌍 [Ground] Added displacement map:', dispId);
    }

    // Create ground plane
    const ground = document.createElement('a-plane');
    ground.id = 'scene-ground';
    ground.setAttribute('rotation', '-90 0 0');
    ground.setAttribute('width', groundData.size.width);
    ground.setAttribute('height', groundData.size.depth);
    ground.setAttribute(
      'position',
      `${groundData.position.x} ${groundData.position.y} ${groundData.position.z}`
    );

    console.log(
      '🌍 [Ground] Created plane with size:',
      groundData.size,
      'position:',
      groundData.position
    );

    // Convert material props to attribute string
    const materialStr = Object.entries(materialProps)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');

    console.log('🌍 [Ground] Setting material string:', materialStr);
    ground.setAttribute('material', materialStr);

    // Add to scene
    const aScene = document.querySelector('a-scene');
    if (aScene) {
      aScene.appendChild(ground);
      console.log('🌍 [Ground] Ground plane added to scene successfully');
    } else {
      console.error('🌍 [Ground] Failed to find a-scene element');
    }
  }

  removeGround() {
    const existingGround = document.getElementById('scene-ground');
    if (existingGround) {
      existingGround.remove();
    }
    this.scenes[this.currentScene].ground.enabled = false;
    this.saveScenesData();
  }

  clearGroundTexture(type) {
    const scene = this.scenes[this.currentScene];
    if (!scene || !scene.ground) return;

    const ground = scene.ground;
    const typeMap = {
      diffuse: {
        map: 'diffuseMap',
        storageKey: 'diffuseMapStorageKey',
        fileName: 'diffuseMapFileName',
        input: 'ground-diffuse',
      },
      normal: {
        map: 'normalMap',
        storageKey: 'normalMapStorageKey',
        fileName: 'normalMapFileName',
        input: 'ground-normal',
      },
      roughness: {
        map: 'roughnessMap',
        storageKey: 'roughnessMapStorageKey',
        fileName: 'roughnessMapFileName',
        input: 'ground-roughness',
      },
      ao: {
        map: 'aoMap',
        storageKey: 'aoMapStorageKey',
        fileName: 'aoMapFileName',
        input: 'ground-ao',
      },
      displacement: {
        map: 'displacementMap',
        storageKey: 'displacementMapStorageKey',
        fileName: 'displacementMapFileName',
        input: 'ground-displacement',
      },
    };

    const config = typeMap[type];
    if (!config) return;

    // Clear the data
    ground[config.map] = null;
    ground[config.storageKey] = null;
    ground[config.fileName] = null;

    // Clear the file input
    const fileInput = document.getElementById(config.input);
    if (fileInput) {
      fileInput.value = '';
    }

    // Delete from IndexedDB
    const storageKey = `ground_${type}_${this.currentScene}`;
    this.deleteImageFromIDB(storageKey).catch((err) => {
      console.warn(`Failed to delete ${type} texture from IndexedDB:`, err);
    });

    console.log(`🌍 [Ground] Cleared ${type} texture`);

    // Save and re-render
    this.saveScenesData();
    this.renderGround();
  }

  async loadGroundControls() {
    const scene = this.scenes[this.currentScene];
    const groundData = scene.ground;

    if (!groundData) {
      // Initialize ground data if missing
      scene.ground = {
        enabled: false,
        diffuseMap: null,
        normalMap: null,
        roughnessMap: null,
        aoMap: null,
        displacementMap: null,
        size: { width: 50, depth: 50 },
        position: { x: 0, y: 0, z: 0 },
        repeat: 20,
      };
      return;
    }

    // Restore texture blob URLs from IndexedDB
    await this.restoreGroundTexturesFromIDB(groundData);

    // Load enabled state
    const groundToggle = document.getElementById('ground-enabled-toggle');
    if (groundToggle) {
      groundToggle.checked = groundData.enabled || false;
    }
    this.toggleGroundControls(groundData.enabled || false);

    // Load ground properties
    const widthInput = document.getElementById('ground-width');
    if (widthInput) {
      widthInput.value = groundData.size?.width || 50;
    }

    const depthInput = document.getElementById('ground-depth');
    if (depthInput) {
      depthInput.value = groundData.size?.depth || 50;
    }

    const repeatInput = document.getElementById('ground-repeat');
    if (repeatInput) {
      repeatInput.value = groundData.repeat || 20;
    }

    // Clear file inputs to prevent showing old file names from previous scene
    const fileInputs = [
      'ground-diffuse',
      'ground-normal',
      'ground-roughness',
      'ground-ao',
      'ground-displacement',
    ];
    fileInputs.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = ''; // Clear the file input
      }
    });

    // Sync UI state
    this._syncGroundToggleUI();

    // Always re-render ground (will remove if disabled or add if enabled)
    this.renderGround();
  }

  async restoreGroundTexturesFromIDB(groundData) {
    console.log('🌍 [Ground] Restoring textures from IndexedDB', {
      diffuseKey: groundData.diffuseMapStorageKey,
      diffuseMap: groundData.diffuseMap,
      normalKey: groundData.normalMapStorageKey,
      normalMap: groundData.normalMap,
    });

    // Restore diffuse map
    if (groundData.diffuseMapStorageKey && !groundData.diffuseMap?.startsWith('blob:')) {
      try {
        console.log(
          '🌍 [Ground] Attempting to restore diffuse from key:',
          groundData.diffuseMapStorageKey
        );
        const record = await this.getImageFromIDB(groundData.diffuseMapStorageKey);
        if (record && record.blob) {
          groundData.diffuseMap = URL.createObjectURL(record.blob);
          console.log('🌍 [Ground] Restored diffuse map from IDB:', groundData.diffuseMap);
        } else {
          console.warn(
            '🌍 [Ground] No blob found for diffuse key:',
            groundData.diffuseMapStorageKey
          );
        }
      } catch (e) {
        console.warn('[Ground] Failed to restore diffuse map from IDB', e);
      }
    } else {
      console.log('🌍 [Ground] Skipping diffuse restore - already has blob URL or no storage key');
    }

    // Restore normal map
    if (groundData.normalMapStorageKey && !groundData.normalMap?.startsWith('blob:')) {
      try {
        console.log(
          '🌍 [Ground] Attempting to restore normal from key:',
          groundData.normalMapStorageKey
        );
        const record = await this.getImageFromIDB(groundData.normalMapStorageKey);
        if (record && record.blob) {
          groundData.normalMap = URL.createObjectURL(record.blob);
          console.log('🌍 [Ground] Restored normal map from IDB:', groundData.normalMap);
        } else {
          console.warn('🌍 [Ground] No blob found for normal key:', groundData.normalMapStorageKey);
        }
      } catch (e) {
        console.warn('[Ground] Failed to restore normal map from IDB', e);
      }
    } else {
      console.log('🌍 [Ground] Skipping normal restore - already has blob URL or no storage key');
    }

    // Restore roughness map
    if (groundData.roughnessMapStorageKey && !groundData.roughnessMap?.startsWith('blob:')) {
      try {
        const record = await this.getImageFromIDB(groundData.roughnessMapStorageKey);
        if (record && record.blob) {
          groundData.roughnessMap = URL.createObjectURL(record.blob);
          console.log('🌍 [Ground] Restored roughness map from IDB');
        }
      } catch (e) {
        console.warn('[Ground] Failed to restore roughness map from IDB', e);
      }
    }

    // Restore AO map
    if (groundData.aoMapStorageKey && !groundData.aoMap?.startsWith('blob:')) {
      try {
        const record = await this.getImageFromIDB(groundData.aoMapStorageKey);
        if (record && record.blob) {
          groundData.aoMap = URL.createObjectURL(record.blob);
          console.log('🌍 [Ground] Restored AO map from IDB');
        }
      } catch (e) {
        console.warn('[Ground] Failed to restore AO map from IDB', e);
      }
    }

    // Restore displacement map
    if (groundData.displacementMapStorageKey && !groundData.displacementMap?.startsWith('blob:')) {
      try {
        const record = await this.getImageFromIDB(groundData.displacementMapStorageKey);
        if (record && record.blob) {
          groundData.displacementMap = URL.createObjectURL(record.blob);
          console.log('🌍 [Ground] Restored displacement map from IDB');
        }
      } catch (e) {
        console.warn('[Ground] Failed to restore displacement map from IDB', e);
      }
    }
  }

  updateInstructionsVersion() {
    const versionEl = document.getElementById('instructions-version');
    if (versionEl) {
      versionEl.textContent = `Version ${APP_VERSION}`;
    }
  }

  updateModeIndicator() {
    const editModeIndicator = document.getElementById('edit-indicator');
    const instructionsContent = document.getElementById('instructions-content');

    if (this.navigationMode) {
      this.hideModelHotspotActionMenu();
      editModeIndicator.style.display = 'none';
      if (instructionsContent) {
        instructionsContent.innerHTML =
          '<strong>Navigation Mode:</strong><br>• Click navigation portals (🚪) to move between scenes<br>• Use mouse/touch to look around 360°<br>• Toggle "Edit Mode" to modify hotspots<br><br><strong style="color: #4caf50;">💡 Pro Tip:</strong><br><span style="font-size: 12px;">First scene will be the starting point when you save/export!</span>';
      }

      // Do NOT auto-play global sound - let editor audio button control it
      // The editor audio controls should be the only way to play sound
    } else {
      // In edit mode, stop the navigation sound but keep editor sound if enabled
      this.stopGlobalSound();

      // Edit mode (whether actively placing or not)
      if (this.editMode) {
        editModeIndicator.style.display = 'block';
        editModeIndicator.textContent = 'Click on the 360° scene to place hotspot';
        if (instructionsContent) {
          instructionsContent.innerHTML =
            '<strong>🎯 PLACING HOTSPOT:</strong><br>• Click anywhere on the 360° scene to place<br>• Use mouse/touch to look around first if needed<br>• Press Esc or click Add Hotspot again to cancel<br><br><strong style="color: #2196F3;">ℹ️ Tip:</strong><br><span style="font-size: 12px;">Use Move (📍) later to reposition</span>';
        }
      } else {
        editModeIndicator.style.display = 'none';
        if (instructionsContent) {
          instructionsContent.innerHTML =
            '<strong>🛠️ Edit Mode:</strong><br>1. 📝 Select hotspot type (Text/Audio/Portal)<br>2. 🎯 Click <strong>Add Hotspot</strong><br>3. 📍 Click on the 360° scene to position<br>4. Use Edit (📝) to modify content<br>5. Use Move (📍) to reposition<br>6. 🧭 Switch to Navigation Mode to preview<br><br><strong style="color: #4caf50;">💡 Pro Tip:</strong><br><span style="font-size: 12px;">First scene will be the starting point on export!</span>';
        }
      }
    }

    // Update visibility of all in-scene edit buttons
    this.updateInSceneEditButtons();
  }

  updateInSceneEditButtons() {
    // Update all hotspot edit button visibility based on current mode
    document.querySelectorAll("#hotspot-container [id^='hotspot-']").forEach((hotspotEl) => {
      if (hotspotEl.updateEditButtonVisibility) {
        hotspotEl.updateEditButtonVisibility();
      }
    });
  }

  async loadCurrentScene() {
    const scene = this.scenes[this.currentScene];
    const skybox = document.getElementById('skybox');
    const sceneEl = document.querySelector('a-scene');
    const loadToken = ++this._sceneLoadToken;
    const overlaySafety = setTimeout(() => this.hideSceneLoadingOverlay(), 12000);

    console.log(`Loading scene: ${this.currentScene}`, scene); // Debug log

    try {
    _flatVideoScene360PauseCount = 0;
    const sceneVideoReset = document.getElementById('scene-video-dynamic');
    if (sceneVideoReset) delete sceneVideoReset._wasPlayingBeforeFlatHotspot;
    this.pauseAllHotspotVideos();
    // Clear any existing videosphere and stop any playing scene video
    const existingVideosphere = document.getElementById('videosphere');
    if (existingVideosphere) {
      existingVideosphere.remove();
    }
    this.detachVideoTextureRenderer();
    this.pauseSceneVideo();

    // Handle video scenes
    const resolvedVideoSrc = this.resolveSceneVideoSrc(scene);
    if (scene.type === 'video' && resolvedVideoSrc) {
      console.log('Loading video scene:', resolvedVideoSrc);
      skybox.setAttribute('visible', 'false');
      skybox.classList.remove('scene-media-surface');

      const videoEl = this.getSceneVideoElement();

      try {
        await this.loadSceneVideoSource(videoEl, resolvedVideoSrc, loadToken);
        if (loadToken !== this._sceneLoadToken) return;

        const videosphere = this.createVideoSphereElement();
        sceneEl.appendChild(videosphere);

        await this.waitForAFrameEntity(videosphere);
        if (loadToken !== this._sceneLoadToken) return;

        try {
          await this.attachVideoTextureToSphere(videosphere, videoEl, loadToken);
        } catch (texErr) {
          console.warn('Video texture bind failed, continuing with placement surface:', texErr);
        }
        if (loadToken !== this._sceneLoadToken) return;

        const raycastSurface = this.ensureVideoHotspotRaycastSurface(sceneEl);
        await this.waitForAFrameEntity(raycastSurface);
        this.refreshSceneMediaRaycasters();

        this.updateVideoControls(videoEl, scene);
        try {
          await videoEl.play();
        } catch (_) {
          /* autoplay blocked — editor controls still work */
        }
      } catch (err) {
        if (loadToken !== this._sceneLoadToken) return;
        console.warn('Video failed to load:', resolvedVideoSrc, err);
        alert(
          'Failed to load the video for this scene. If it was added from a local file, try re-selecting the file or ensure browser storage permissions allow keeping large files.'
        );
        this.hideVideoHotspotRaycastSurface();
        skybox.classList.add('scene-media-surface');
        skybox.setAttribute('visible', 'true');
        this.hideVideoControls();
      }
    } else if (scene.type === 'video' && !resolvedVideoSrc) {
      // No valid src (likely after refresh without IDB record) – prompt user to reselect file
      const choose = confirm(
        'This video scene needs the original file again. Do you want to select the video file now?'
      );
      if (choose) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/mp4,video/webm';
        input.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('video/')) {
            alert('Please select a valid MP4/WebM video.');
            return;
          }
          const key = scene.videoStorageKey || this.currentScene;
          await this.saveVideoToIDB(key, file);
          try {
            const url = URL.createObjectURL(file);
            scene.type = 'video';
            scene.videoSrc = url;
            scene.videoStorageKey = key;
            scene.videoFileName = file.name;
            scene.videoVolume = scene.videoVolume || 0.5;
            this.saveScenesData();
            // reload scene now that source is available
            this.switchToScene(this.currentScene);
          } catch (_) {}
        };
        input.click();
      } else {
        // User skipped; fallback to image so editor remains usable
        scene.type = 'image';
        this.saveScenesData();
        this.switchToScene(this.currentScene);
      }
      return;
    } else {
      // Handle image scenes (existing logic)
      this.hideVideoHotspotRaycastSurface();
      this.hideVideoControls();
      skybox.classList.add('scene-media-surface');
      skybox.setAttribute('visible', 'true');
      this.refreshSceneMediaRaycasters();

      const uniqueId = `panorama-${this.currentScene}-${Date.now()}`;
      const newPanorama = document.createElement('img');
      newPanorama.id = uniqueId;
      const isSameOriginImage =
        typeof scene.image === 'string' &&
        (scene.image.startsWith('/') ||
          scene.image.startsWith('./') ||
          scene.image.startsWith(window.location.origin));
      if (!isSameOriginImage) {
        newPanorama.crossOrigin = 'anonymous';
      }

      let chosenSrc = null;
      try {
        if (
          scene.imageStorageKey &&
          (!scene.image || typeof scene.image !== 'string' || scene.image.startsWith('blob:'))
        ) {
          const rec = await this.getImageFromIDB(scene.imageStorageKey);
          if (rec && rec.blob) {
            chosenSrc = URL.createObjectURL(rec.blob);
            scene.image = chosenSrc;
          }
        }
      } catch (_) {
        /* ignore */
      }

      if (!chosenSrc) {
        if (
          typeof scene.image === 'string' &&
          (scene.image.startsWith('data:') ||
            scene.image.startsWith('http://') ||
            scene.image.startsWith('https://') ||
            scene.image.startsWith('/'))
        ) {
          chosenSrc = scene.image;
        } else if (typeof scene.image === 'string' && scene.image.length > 0) {
          chosenSrc =
            scene.image.startsWith('./') || scene.image.startsWith('/')
              ? scene.image
              : `./${scene.image}`;
        } else {
          chosenSrc = '#main-panorama';
        }
      }

      if (this.isCommonAssetObject(scene) && scene.type === 'image') {
        const proxy = this.buildCommonAssetProxyPath(scene);
        if (proxy) chosenSrc = proxy;
      }

      if (chosenSrc.startsWith && chosenSrc.startsWith('#')) {
        newPanorama.src = document.querySelector(chosenSrc)?.src || '';
      } else {
        newPanorama.src = chosenSrc;
      }

      const assets = document.querySelector('a-assets');
      const oldPanoramas = assets.querySelectorAll("img[id^='panorama-']");
      oldPanoramas.forEach((img) => {
        if (img.id !== uniqueId) img.remove();
      });
      assets.appendChild(newPanorama);

      await new Promise((resolve) => {
        const finish = () => {
          if (loadToken !== this._sceneLoadToken) return;
          skybox.setAttribute('src', `#${uniqueId}`);
          skybox.setAttribute('visible', 'true');
          this.hideSceneLoadingOverlay();
          resolve();
        };
        newPanorama.onload = () => {
          console.log('New panorama loaded successfully:', chosenSrc);
          finish();
        };
        newPanorama.onerror = () => {
          console.error('Failed to load panorama:', chosenSrc);
          alert(
            `Failed to load scene image: ${chosenSrc}\nPlease check if the URL is accessible and is a valid image.`
          );
          skybox.setAttribute('src', '#main-panorama');
          skybox.setAttribute('visible', 'true');
          resolve();
        };
        if (newPanorama.complete) newPanorama.onload();
      });

      if (loadToken !== this._sceneLoadToken) return;
    }

    // Clear existing hotspots
    const container = document.getElementById('hotspot-container');
    container.innerHTML = '';

    // Load hotspots for current scene
    // Ensure hotspots array exists (safety check for loaded templates)
    if (!Array.isArray(scene.hotspots)) {
      scene.hotspots = [];
    }
    this.hotspots = [...scene.hotspots];
    scene.hotspots.forEach((hotspot) => {
      this.createHotspotElement(hotspot);
    });
    scene.hotspots.forEach((hotspot) => {
      const el = document.getElementById(`hotspot-${hotspot.id}`);
      if (el) this.ensureInSceneEditButtons(el, hotspot);
    });
    this.resumeHotspotVideosForScene(this.currentScene);

    // Apply custom styles to ensure portal colors and other customizations are maintained
    this.refreshAllHotspotStyles();
    setTimeout(() => this.refreshAllHotspotStyles(), 400);

    this.updateHotspotList();
    this.updateStartingPointInfo();
    this.updateInSceneEditButtons(); // Update edit button visibility for new scene
    this.loadGlobalSoundControls();
    this.loadGroundControls();

    // Audio is now controlled ONLY by the editor audio button
    // No auto-play in navigation mode

    // Handle editor sound based on current state (independent of navigation mode)
    setTimeout(() => {
      console.log(
        '🎵 SCENE_LOAD: Timeout triggered, checking editor sound state:',
        this.editorGlobalSoundEnabled
      );
      // Double-check the state in case it changed during the delay
      if (this.editorGlobalSoundEnabled) {
        console.log('🎵 SCENE_LOAD: Enabled - playing editor sound');
        this.playEditorGlobalSound();
      } else {
        console.log('🎵 SCENE_LOAD: Disabled - stopping editor sound');
        // If editor sound is disabled, make sure to stop any playing audio
        this.stopEditorGlobalSound();
      }
    }, 500);

    await this.applyStartingPointAfterSceneLoad(loadToken);
    if (loadToken !== this._sceneLoadToken) return;
    } finally {
      clearTimeout(overlaySafety);
      if (loadToken === this._sceneLoadToken) {
        this.hideSceneLoadingOverlay();
        this.hideLoadingIndicator();
        this._endCrossfadeOverlay();
        this._dispatchSceneLoaded();
      }
    }
  }

  switchToScene(sceneId) {
    console.log(
      '🏠 SWITCH: Switching from',
      this.currentScene,
      'to',
      sceneId,
      '| Editor sound enabled:',
      this.editorGlobalSoundEnabled
    );
    if (!this.scenes[sceneId]) return;
    this._startCrossfadeOverlay()
      .then(() => {
        // Save current scene hotspots and global sound
        this.scenes[this.currentScene].hotspots = [...this.hotspots];
        this.updateGlobalSound(); // Save current global sound settings
        this.saveScenesData(); // Save when switching scenes

        // Stop current global sound and editor sound
        this.stopGlobalSound();
        this.stopEditorGlobalSound();

        // Switch to new scene
        this.currentScene = sceneId;

        // End overlay when scene reports loaded
        const onLoaded = () => {
          window.removeEventListener('vrhotspots:scene-loaded', onLoaded);
          this._endCrossfadeOverlay();
        };
        window.addEventListener('vrhotspots:scene-loaded', onLoaded, {
          once: true,
        });

        // Safety timeout
        setTimeout(() => {
          window.removeEventListener('vrhotspots:scene-loaded', onLoaded);
          this._endCrossfadeOverlay();
        }, 1500);

        this.loadCurrentScene().then(() => {
          this.updateNavigationTargets();
        });
      })
      .catch(() => {
        // Fallback to direct switch
        this.scenes[this.currentScene].hotspots = [...this.hotspots];
        this.updateGlobalSound();
        this.saveScenesData();
        this.stopGlobalSound();
        this.stopEditorGlobalSound();
        this.currentScene = sceneId;
        this.loadCurrentScene().then(() => {
          this.updateNavigationTargets();
        });
      });
  }

  navigateToScene(sceneId) {
    if (!this.scenes[sceneId]) return;

    // Update the dropdown to reflect the change
    document.getElementById('current-scene').value = sceneId;
    this.switchToScene(sceneId);

    // Show a brief navigation indicator
    this.showNavigationFeedback(this.scenes[sceneId].name);
  }

  showNavigationFeedback(sceneName) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(76, 175, 80, 0.9); color: white; padding: 15px 25px;
      border-radius: 8px; font-weight: bold; z-index: ${EDITOR_LAYER.toast};
      font-family: Arial; animation: fadeInOut 2s ease-in-out;
    `;
    feedback.innerHTML = `Navigated to: ${sceneName}`;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(feedback);
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 2000);
  }

  promptForSceneImageChange() {
    // Check if scene1 (first scene) is using the default image
    const scene1 = this.scenes.scene1;
    const defaultImages = ['./images/scene1.jpg', 'images/scene1.jpg', '/images/scene1.jpg'];

    // Skip prompt if scene1 doesn't exist
    if (!scene1) return;

    // Skip prompt if scene1 is already a video with a URL or local source
    if (scene1.type === 'video' && scene1.videoSrc) {
      console.log('ℹ️ Scene 1 already uses a video source, skipping prompt');
      return;
    }

    // Only prompt if scene1 uses the default image
    if (!defaultImages.includes(scene1.image)) {
      console.log('ℹ️ Scene 1 has custom image, skipping prompt');
      return;
    }

    // Show prompt dialog (with a re-check right before rendering to avoid race conditions)
    setTimeout(() => {
      // Re-check current state in case scene1 changed to video or custom image meanwhile
      const recheck = this.scenes.scene1;
      if (!recheck) return;
      if (recheck.type === 'video' && recheck.videoSrc) {
        console.log('ℹ️ Skipping welcome prompt: scene1 is video now');
        return;
      }
      if (!defaultImages.includes(recheck.image)) {
        console.log('ℹ️ Skipping welcome prompt: scene1 image customized');
        return;
      }
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: ${EDITOR_LAYER.dialog}; display: flex;
        align-items: center; justify-content: center; font-family: Arial;
        animation: fadeIn 0.3s ease-in;
      `;

      dialog.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 16px; color: white; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); text-align: center; position: relative;">
          <button id="welcome-close-btn" type="button" aria-label="Close" title="Keep default scene" style="
            position: absolute; top: 12px; left: 12px;
            background: none; border: none; color: rgba(255,255,255,0.85);
            font-size: 28px; line-height: 1; cursor: pointer; padding: 4px 8px;
          ">&times;</button>
          <div style="font-size: 48px; margin-bottom: 20px;">🎬</div>
          <h2 style="margin: 0 0 15px 0; font-size: 28px; font-weight: bold;">Welcome to VR Hotspot Editor!</h2>
          <p style="color: #f0f0f0; margin-bottom: 25px; font-size: 16px; line-height: 1.6;">
            You're currently using the default scene media. Would you like to change it to your own 360° image or 360° video?
          </p>
          
          <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            <button id="change-scene-image-btn" style="
              background: white; color: #667eea; border: none; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              📁 Change Media
            </button>
            <button id="change-scene-video-btn" style="
              background: #9C27B0; color: white; border: none; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              🎥 Use Video File
            </button>
            <button id="change-scene-video-url-btn" style="
              background: #673AB7; color: white; border: none; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              🔗 Use Video URL
            </button>
            
            <button id="keep-default-btn" style="
              background: rgba(255,255,255,0.2); color: white; border: 2px solid white; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              backdrop-filter: blur(10px); transition: all 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              ✨ Keep Default
            </button>
          </div>
          
          <p style="color: rgba(255,255,255,0.7); margin-top: 20px; font-size: 13px;">
            💡 You can always change it later from the Scene Manager
          </p>

          <p style="color: rgba(255,255,255,0.75); margin-top: 18px; margin-bottom: 0; font-size: 12px; line-height: 1.5;">
            Available for free for education use under the MIT License.
            <a href="https://github.com/pachecod/vr-hotspots-educational" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: underline;">See our Github</a>.
          </p>
        </div>
      `;

      // Add animation keyframes
      if (!document.getElementById('prompt-animation-style')) {
        const style = document.createElement('style');
        style.id = 'prompt-animation-style';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(dialog);

      // Change Image button — full media dialog (image or video)
      document.getElementById('change-scene-image-btn').onclick = () => {
        document.body.removeChild(dialog);
        this.editSceneMedia('scene1', { reopenSceneManager: false, initialMediaType: 'image' });
      };

      const videoBtn = document.getElementById('change-scene-video-btn');
      if (videoBtn) {
        videoBtn.onclick = () => {
          document.body.removeChild(dialog);
          this.editSceneMedia('scene1', { reopenSceneManager: false, initialMediaType: 'video' });
        };
      }

      const videoUrlBtn = document.getElementById('change-scene-video-url-btn');
      if (videoUrlBtn) {
        videoUrlBtn.onclick = async () => {
          document.body.removeChild(dialog);
          const url = prompt(
            `Enter the URL of the 360° video for "${
              (this.scenes.scene1 && this.scenes.scene1.name) || 'Scene 1'
            }":\n(Direct link to MP4/WebM file)`,
            this.scenes.scene1 &&
              this.scenes.scene1.videoSrc &&
              this.scenes.scene1.videoSrc.startsWith('http')
              ? this.scenes.scene1.videoSrc
              : 'https://'
          );
          if (!url || url === 'https://') return;
          try {
            new URL(url);
          } catch (_) {
            alert('Please enter a valid URL');
            return;
          }

          const sc = this.scenes.scene1 || {};
          sc.type = 'video';
          sc.videoSrc = url;
          sc.videoFileName = url.split('/').pop();
          sc.videoVolume = sc.videoVolume || 0.5;
          this.scenes.scene1 = sc;
          this.saveScenesData();

          // Auto-download to local with loader and then switch scene
          await this.autoDownloadRemoteVideo('scene1', url);
          this.switchToScene('scene1');
        };
      }

      // Keep Default button (same as close X)
      const closeWelcomeDialog = () => {
        if (dialog.parentNode) document.body.removeChild(dialog);
      };

      document.getElementById('welcome-close-btn').onclick = closeWelcomeDialog;
      document.getElementById('keep-default-btn').onclick = closeWelcomeDialog;
    }, 1000); // Delay by 1 second to let the scene load first
  }

  addNewScene() {
    const name = prompt('Enter scene name:');
    if (!name) return;

    // Show dialog for choosing between file upload or URL
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: ${EDITOR_LAYER.dialog}; display: flex; 
      align-items: center; justify-content: center; font-family: Arial;
    `;

    dialog.innerHTML = `
      <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; color: white; max-width: 550px;">
        <h3 style="margin-top: 0; color: #4CAF50;">Add New Scene</h3>
        <p>Choose media type for "${name}":</p>
        
        <!-- Media Type Selection -->
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #4CAF50;">
            Media Type:
          </label>
          <select id="new-scene-media-type" style="
            width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #555;
            background: #333; color: white; font-size: 14px; cursor: pointer;
          ">
            <option value="image">🖼️ 360° Image</option>
            <option value="video">🎥 360° Video</option>
          </select>
        </div>

        <!-- Image Options -->
        <div id="new-scene-image-options" style="display: block;">
          <div style="margin: 15px 0;">
            <button id="upload-image-file-new" style="
              background: #4CAF50; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📁 Upload Image File</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Upload a 360° image from your computer
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="browse-image-common-new" style="
              background: #6f42c1; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📚 Browse Online Assets</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Choose a 360° image from the online library
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="use-image-url-new" style="
              background: #2196F3; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🌐 Use Image URL</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Use an image from the internet
            </div>
          </div>
        </div>

        <!-- Video Options -->
        <div id="new-scene-video-options" style="display: none;">
          <div style="margin: 15px 0;">
            <button id="upload-video-file-new" style="
              background: #9C27B0; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🎥 Upload Video File</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              MP4/WebM • 360° equirectangular format
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="browse-video-common-new" style="
              background: #6f42c1; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📚 Browse Online Assets</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Choose a 360° video from the online library
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="use-video-url-new" style="
              background: #673AB7; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🔗 Use Video URL</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Direct link to MP4/WebM file
            </div>
          </div>
        </div>
        
        <button id="cancel-scene" style="
          background: #666; color: white; border: none; padding: 10px 20px;
          border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%; font-weight: bold;
        ">Cancel</button>
      </div>
    `;

    document.body.appendChild(dialog);

    // Media type toggle
    dialog.querySelector('#new-scene-media-type').addEventListener('change', (e) => {
      const isVideo = e.target.value === 'video';
      dialog.querySelector('#new-scene-image-options').style.display = isVideo ? 'none' : 'block';
      dialog.querySelector('#new-scene-video-options').style.display = isVideo ? 'block' : 'none';
    });

    // Image upload from file
    document.getElementById('upload-image-file-new').onclick = () => {
      document.body.removeChild(dialog);
      this.addSceneFromFile(name);
    };

    // Image from URL
    document.getElementById('use-image-url-new').onclick = () => {
      document.body.removeChild(dialog);
      this.addSceneFromURL(name);
    };

    document.getElementById('browse-image-common-new').onclick = () => {
      document.body.removeChild(dialog);
      if (!window.CommonAssetsPicker) {
        alert('Online assets picker is not available.');
        return;
      }
      window.CommonAssetsPicker.openFor({
        category: '360-images',
        onSelect: (asset) => {
          if (!asset || asset.category !== '360-images') return;
          this.addSceneFromURL(name, asset);
        },
      });
    };

    // Video upload from file
    document.getElementById('upload-video-file-new').onclick = () => {
      document.body.removeChild(dialog);
      this.addSceneVideoFromFile(name);
    };

    // Video from URL
    document.getElementById('use-video-url-new').onclick = () => {
      document.body.removeChild(dialog);
      this.addSceneVideoFromURL(name);
    };

    document.getElementById('browse-video-common-new').onclick = () => {
      document.body.removeChild(dialog);
      if (!window.CommonAssetsPicker) {
        alert('Online assets picker is not available.');
        return;
      }
      window.CommonAssetsPicker.openFor({
        category: '360-videos',
        onSelect: (asset) => {
          if (!asset || asset.category !== '360-videos') return;
          this.addSceneVideoFromURL(name, asset);
        },
      });
    };

    document.getElementById('cancel-scene').onclick = () => {
      document.body.removeChild(dialog);
    };
  }

  addSceneFromFile(name) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      (async () => {
        try {
          const sceneId = `scene_${Date.now()}`;
          const storageKey = `image_scene_${sceneId}`;
          const saved = await this.saveImageToIDB(storageKey, file);
          if (!saved) {
            alert('Failed to save image locally.');
            return;
          }
          const blobURL = URL.createObjectURL(file);
          const newScene = {
            name: name,
            type: 'image',
            image: blobURL, // runtime blob URL; not persisted in localStorage
            imageStorageKey: storageKey,
            imageFileName: file.name,
            videoSrc: null,
            videoVolume: 0.5,
            hotspots: [],
            startingPoint: null,
            globalSound: null,
            ground: {
              enabled: false,
              diffuseMap: null,
              normalMap: null,
              roughnessMap: null,
              aoMap: null,
              displacementMap: null,
              size: { width: 50, depth: 50 },
              position: { x: 0, y: 0, z: 0 },
              repeat: 20,
            },
          };
          this.scenes[sceneId] = newScene;

          this.finalizeNewScene(sceneId, name);
        } catch (err) {
          console.error('Failed to create scene from file', err);
          alert('Failed to add scene image.');
        }
      })();
    });

    input.click();
  }

  addSceneFromURL(name, presetUrlOrAsset) {
    const asset =
      presetUrlOrAsset && typeof presetUrlOrAsset === 'object' ? presetUrlOrAsset : null;
    const url =
      typeof presetUrlOrAsset === 'string' && presetUrlOrAsset.trim()
        ? presetUrlOrAsset.trim()
        : asset
          ? this.getRuntimeCommonAssetUrl(asset)
          : prompt(
              "Enter the URL of the 360° image:\n(Make sure it's a direct link to an image file)",
              'https://'
            );
    if (!url || url === 'https://') return;

    // Validate URL format
    try {
      new URL(url, window.location.origin);
    } catch (e) {
      alert('Please enter a valid URL');
      return;
    }

    // Show loading indicator
    this.showLoadingIndicator('Loading image from URL...');

    // Test if the image loads
    const testImg = new Image();
    const isSameOrigin =
      url.startsWith('/') ||
      url.startsWith(window.location.origin + '/') ||
      url.startsWith(window.location.origin);
    if (!isSameOrigin) {
      testImg.crossOrigin = 'anonymous';
    }

    testImg.onload = () => {
      const sceneId = `scene_${Date.now()}`;
      const scene = {
        name: name,
        type: 'image',
        image: url,
        videoSrc: null,
        videoVolume: 0.5,
        hotspots: [],
        startingPoint: null,
        globalSound: null,
        ground: {
          enabled: false,
          diffuseMap: null,
          normalMap: null,
          roughnessMap: null,
          aoMap: null,
          displacementMap: null,
          size: { width: 50, depth: 50 },
          position: { x: 0, y: 0, z: 0 },
          repeat: 20,
        },
      };
      if (asset) {
        this.applyCommonAssetProvenance(scene, asset);
      }
      this.scenes[sceneId] = scene;

      // Hide loading indicator
      this.hideLoadingIndicator();

      this.finalizeNewScene(sceneId, name);
    };

    testImg.onerror = () => {
      // Hide loading indicator
      this.hideLoadingIndicator();

      alert(
        'Failed to load image from URL. Please check:\n1. The URL is correct\n2. The image exists\n3. The server allows cross-origin requests'
      );
    };

    testImg.src = url;
  }

  addSceneVideoFromFile(name) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file (MP4 or WebM).');
        return;
      }

      // Warn if file is large
      if (file.size > 200 * 1024 * 1024) {
        if (
          !confirm(
            'Warning: This video is very large (>200MB). This may cause slow loading. Continue?'
          )
        ) {
          return;
        }
      }

      const sceneId = `scene_${Date.now()}`;
      const storageKey = `video_${sceneId}`;

      try {
        const processed = await this.processLocalVideoFileForScene({ file, storageKey });
        const scene = {
          name: name,
          type: 'video',
          image: './images/scene1.jpg',
          videoSrc: processed.videoSrc,
          videoStorageKey: processed.videoStorageKey,
          videoFileName: processed.videoFileName,
          videoVolume: 0.5,
          hotspots: [],
          startingPoint: null,
          globalSound: null,
          ground: {
            enabled: false,
            diffuseMap: null,
            normalMap: null,
            roughnessMap: null,
            aoMap: null,
            displacementMap: null,
            size: { width: 50, depth: 50 },
            position: { x: 0, y: 0, z: 0 },
            repeat: 20,
          },
        };
        this.clearCommonAssetProvenance(scene);
        this.applyHostedVideoProvenance(scene, processed);
        this.scenes[sceneId] = scene;

        if (processed.transcoded && processed.originalSize && processed.compressedSize) {
          this.showStartingPointFeedback(
            `Video compressed (${Math.round(processed.originalSize / 1024 / 1024)}MB → ${Math.round(processed.compressedSize / 1024 / 1024)}MB).`
          );
        }

        this.finalizeNewScene(sceneId, name);
      } catch (err) {
        console.error('Failed to add scene video', err);
        alert('Failed to add video scene.');
      }
    });

    input.click();
  }

  async addSceneVideoFromURL(name, presetUrlOrAsset) {
    const asset =
      presetUrlOrAsset && typeof presetUrlOrAsset === 'object' ? presetUrlOrAsset : null;
    const url =
      typeof presetUrlOrAsset === 'string' && presetUrlOrAsset.trim()
        ? presetUrlOrAsset.trim()
        : asset
          ? this.getRuntimeCommonAssetUrl(asset)
          : prompt(
              'Enter the URL of the 360° video:\n(Direct link to MP4/WebM file)',
              'https://'
            );
    if (!url || url === 'https://') return;

    // Validate URL format
    try {
      new URL(url, window.location.origin);
    } catch (e) {
      alert('Please enter a valid URL');
      return;
    }

    const sceneId = `scene_${Date.now()}`;
    const scene = {
      name: name,
      type: 'video',
      image: './images/scene1.jpg',
      videoSrc: url,
      videoFileName: (asset && asset.name) || url.split('/').pop(),
      videoVolume: 0.5,
      hotspots: [],
      startingPoint: null,
      globalSound: null,
      ground: {
        enabled: false,
        diffuseMap: null,
        normalMap: null,
        roughnessMap: null,
        aoMap: null,
        displacementMap: null,
        size: { width: 50, depth: 50 },
        position: { x: 0, y: 0, z: 0 },
        repeat: 20,
      },
    };
    if (asset) {
      this.applyCommonAssetProvenance(scene, asset);
    }
    this.scenes[sceneId] = scene;

    if (!this.isCommonAssetObject(scene)) {
      await this.autoDownloadRemoteVideo(sceneId, url);
    }

    this.finalizeNewScene(sceneId, name);
  }

  finalizeNewScene(sceneId, name) {
    this.updateSceneDropdown();
    this.updateNavigationTargets();

    // Save the new scene data
    this.saveScenesData();

    // Switch to new scene with a small delay to ensure UI is updated
    setTimeout(() => {
      document.getElementById('current-scene').value = sceneId;
      this.switchToScene(sceneId);
      alert(`Scene "${name}" added successfully!`);
    }, 100);
  }

  showSceneManager() {
    removeEditorOverlayDialogs();

    const dialog = document.createElement('div');
    dialog.className = 'editor-overlay-dialog';
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: ${EDITOR_LAYER.dialog}; display: flex; 
      align-items: center; justify-content: center; font-family: Arial;
    `;

    let sceneListHTML = '';
    Object.keys(this.scenes).forEach((sceneId) => {
      const scene = this.scenes[sceneId];
      const hotspotCount = scene.hotspots.length;
      const sceneType = scene.type === 'video' ? '🎥 Video' : '🖼️ Image';
      const isRemoteVideo =
        scene.type === 'video' &&
        scene.videoSrc &&
        (scene.videoSrc.startsWith('http://') || scene.videoSrc.startsWith('https://'));
      const isLocalVideo =
        scene.type === 'video' && scene.videoSrc && scene.videoSrc.startsWith('blob:');
      const isHttp =
        typeof scene.image === 'string' &&
        (scene.image.startsWith('http://') || scene.image.startsWith('https://'));
      const isData = typeof scene.image === 'string' && scene.image.startsWith('data:');
      const isBlob = typeof scene.image === 'string' && scene.image.startsWith('blob:');
      const hasIDB = !!scene.imageStorageKey;
      const imageSource =
        scene.type === 'video'
          ? scene.videoSrc
            ? isRemoteVideo
              ? 'Remote URL'
              : isLocalVideo
              ? 'Local (IDB)'
              : 'File'
            : 'None'
          : hasIDB || isBlob
          ? 'Local (IDB)'
          : isHttp
          ? 'Online'
          : isData
          ? 'Uploaded'
          : 'File';

      sceneListHTML += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; margin: 5px 0; background: #333; border-radius: 6px;">
          <div style="flex: 1;">
            <strong>${scene.name}</strong><br>
            <small style="color: #ccc;">${hotspotCount} hotspot(s) • ${sceneType} (${imageSource})</small>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button onclick="window.hotspotEditor.editSceneMedia('${sceneId}')" style="
              background: #2196F3; color: white; border: none; padding: 6px 12px;
              border-radius: 4px; cursor: pointer; font-size: 12px;" title="Change scene media">
              ${scene.type === 'video' ? '🎥' : '🖼️'} Edit Media
            </button>
            <button onclick="window.hotspotEditor.deleteScene('${sceneId}')" style="
              background: #f44336; color: white; border: none; padding: 6px 12px;
              border-radius: 4px; cursor: pointer; font-size: 12px;" title="${
                sceneId === 'scene1'
                  ? 'Cannot delete default scene - click to edit instead'
                  : 'Delete this scene'
              }">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    });

    dialog.innerHTML = `
      <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; color: white; max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <h3 style="margin-top: 0; color: #4CAF50;">🎬 Scene Manager</h3>
        <p style="margin: 0 0 20px; color: #ccc; font-size: 14px;">Manage your 360° scenes (images and videos)</p>
        <div style="margin: 20px 0;">
          ${sceneListHTML}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #666; color: white; border: none; padding: 12px 20px;
          border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold;
        ">Close Manager</button>
      </div>
    `;

    document.body.appendChild(dialog);
  }

  applySceneImageFromUrl(sceneId, urlOrAsset, { onDone } = {}) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    const asset = urlOrAsset && typeof urlOrAsset === 'object' ? urlOrAsset : null;
    const url =
      typeof urlOrAsset === 'string'
        ? urlOrAsset.trim()
        : asset
          ? this.getRuntimeCommonAssetUrl(asset)
          : '';
    if (!url) return;

    this.showLoadingIndicator('Loading image...');

    const testImg = new Image();
    const isSameOrigin =
      url.startsWith('/') ||
      url.startsWith(window.location.origin + '/') ||
      url.startsWith(window.location.origin);
    if (!isSameOrigin) {
      testImg.crossOrigin = 'anonymous';
    }

    testImg.onload = () => {
      scene.type = 'image';
      scene.image = url;
      scene.videoSrc = null;
      delete scene.imageStorageKey;
      delete scene.imageFileName;
      delete scene.videoStorageKey;
      delete scene.videoFileName;
      if (asset) {
        this.applyCommonAssetProvenance(scene, asset);
      } else {
        this.clearCommonAssetProvenance(scene);
      }
      this.saveScenesData();
      if (sceneId === this.currentScene) {
        this.loadCurrentScene();
      }
      this.hideLoadingIndicator();
      if (typeof onDone === 'function') {
        onDone();
      } else {
        this.showStartingPointFeedback(`Updated image for "${scene.name}"`);
      }
    };

    testImg.onerror = () => {
      this.hideLoadingIndicator();
      alert(
        'Failed to load image. Please check the URL is correct and accessible.'
      );
    };

    testImg.src = url;
  }

  async applySceneVideoFromUrl(sceneId, urlOrAsset, { onDone } = {}) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    const asset = urlOrAsset && typeof urlOrAsset === 'object' ? urlOrAsset : null;
    const url =
      typeof urlOrAsset === 'string'
        ? urlOrAsset.trim()
        : asset
          ? this.getRuntimeCommonAssetUrl(asset)
          : '';
    if (!url) return;

    scene.type = 'video';
    scene.videoSrc = url;
    scene.videoFileName = (asset && asset.name) || url.split('/').pop();
    scene.videoVolume = scene.videoVolume || 0.5;
    delete scene.videoStorageKey;
    delete scene.imageStorageKey;
    delete scene.imageFileName;

    if (asset) {
      this.applyCommonAssetProvenance(scene, asset);
    } else {
      this.clearCommonAssetProvenance(scene);
    }

    this.scenes[sceneId] = scene;
    this.saveScenesData();

    if (!this.isCommonAssetObject(scene)) {
      await this.autoDownloadRemoteVideo(sceneId, url);
    }

    if (sceneId === this.currentScene) {
      await this.loadCurrentScene();
    } else {
      this.switchToScene(sceneId);
    }

    if (typeof onDone === 'function') {
      onDone();
    }
  }

  pickSceneVideoFromFile(sceneId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm';
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        alert('Please select a valid MP4/WebM video.');
        return;
      }
      const storageKey = sceneId === 'scene1' ? 'video_scene1' : `video_${sceneId}`;
      await this.saveVideoToIDB(storageKey, file);
      const url = URL.createObjectURL(file);
      const sc = this.scenes[sceneId] || {};
      sc.type = 'video';
      sc.videoSrc = url;
      sc.videoStorageKey = storageKey;
      sc.videoFileName = file.name;
      sc.videoVolume = sc.videoVolume || 0.5;
      this.clearCommonAssetProvenance(sc);
      this.scenes[sceneId] = sc;
      this.saveScenesData();
      this.switchToScene(sceneId);
    };
    input.click();
  }

  showSceneVideoSourcePicker(sceneId) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); z-index: ${EDITOR_LAYER.dialog}; display: flex;
      align-items: center; justify-content: center; font-family: Arial;
    `;

    dialog.innerHTML = `
      <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; color: white; max-width: 500px;">
        <h3 style="margin-top: 0; color: #9C27B0;">🎥 Choose 360° Video</h3>
        <p style="color: #ccc;">Select a video for "${scene.name}":</p>

        <div style="margin: 15px 0;">
          <button id="scene-video-upload-file" style="
            background: #9C27B0; color: white; border: none; padding: 12px 20px;
            border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
          ">📁 Upload Video File</button>
          <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
            MP4/WebM from your computer
          </div>
        </div>

        <div style="margin: 15px 0;">
          <button id="scene-video-browse-common" style="
            background: #6f42c1; color: white; border: none; padding: 12px 20px;
            border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
          ">📚 Browse Online Assets</button>
          <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
            Choose a 360° video from the online library
          </div>
        </div>

        <button id="scene-video-source-cancel" style="
          background: #666; color: white; border: none; padding: 10px 20px;
          border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%; font-weight: bold;
        ">Cancel</button>
      </div>
    `;

    document.body.appendChild(dialog);

    const close = () => {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    };

    dialog.querySelector('#scene-video-source-cancel').onclick = close;

    dialog.querySelector('#scene-video-upload-file').onclick = () => {
      close();
      this.pickSceneVideoFromFile(sceneId);
    };

    dialog.querySelector('#scene-video-browse-common').onclick = () => {
      close();
      if (!window.CommonAssetsPicker) {
        alert('Online assets picker is not available.');
        return;
      }
      window.CommonAssetsPicker.openFor({
        category: '360-videos',
        onSelect: (asset) => {
          if (!asset || asset.category !== '360-videos') return;
          this.applySceneVideoFromUrl(sceneId, asset);
        },
      });
    };
  }

  editSceneImage(sceneId, options = {}) {
    this.editSceneMedia(sceneId, { ...options, initialMediaType: 'image' });
  }

  editSceneMedia(sceneId, { reopenSceneManager = true, initialMediaType } = {}) {
    const scene = this.scenes[sceneId];
    if (!scene) return;

    const selectedMediaType =
      initialMediaType === 'video' || initialMediaType === 'image'
        ? initialMediaType
        : scene.type === 'video'
          ? 'video'
          : 'image';

    // Close scene manager and any other open editor overlay dialogs
    removeEditorOverlayDialogs();

    const dialog = document.createElement('div');
    dialog.className = 'editor-overlay-dialog';
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: ${EDITOR_LAYER.dialog}; display: flex; 
      align-items: center; justify-content: center; font-family: Arial;
    `;

    dialog.innerHTML = `
      <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; color: white; max-width: 550px;">
        <h3 style="margin-top: 0; color: #4CAF50;">🎬 Change Scene Media</h3>
        <p style="color: #ccc;">Update "${scene.name}" with a 360° image or 360° video:</p>
        
        <!-- Media Type Selection -->
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #4CAF50;">
            Media Type:
          </label>
          <select id="media-type-select" style="
            width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #555;
            background: #333; color: white; font-size: 14px; cursor: pointer;
          ">
            <option value="image" ${selectedMediaType !== 'video' ? 'selected' : ''}>🖼️ 360° Image</option>
            <option value="video" ${selectedMediaType === 'video' ? 'selected' : ''}>🎥 360° Video</option>
          </select>
          <p style="color: #999; font-size: 12px; margin: 8px 0 0;">
            Pick upload, online assets, or URL below for the selected media type.
          </p>
        </div>

        <!-- Image Upload Options -->
        <div id="image-options" style="display: ${selectedMediaType === 'video' ? 'none' : 'block'};">
          <div style="margin: 15px 0;">
            <button id="upload-image-file" style="
              background: #4CAF50; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📁 Upload Image File</button>
          </div>
          <div style="margin: 15px 0;">
            <button id="browse-image-common" style="
              background: #6f42c1; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📚 Browse Online Assets</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Choose a 360° photo from the online library
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="use-image-url" style="
              background: #2196F3; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🌐 Use Image URL</button>
          </div>
        </div>

        <!-- Video Upload Options -->
        <div id="video-options" style="display: ${selectedMediaType === 'video' ? 'block' : 'none'};">
          <div style="margin: 15px 0;">
            <button id="upload-video-file" style="
              background: #9C27B0; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🎥 Upload Video File</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              MP4/WebM • 360° equirectangular format
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="browse-video-common" style="
              background: #6f42c1; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">📚 Browse Online Assets</button>
            <div style="font-size: 11px; color: #999; margin-top: 5px; text-align: center;">
              Choose a 360° video from the online library
            </div>
          </div>
          <div style="margin: 15px 0;">
            <button id="use-video-url" style="
              background: #673AB7; color: white; border: none; padding: 12px 20px;
              border-radius: 6px; cursor: pointer; width: 100%; font-size: 14px; font-weight: bold;
            ">🔗 Use Video URL</button>
          </div>
        </div>
        
        <div style="display: flex; gap: 8px; margin-top: 25px;">
          <button id="cancel-edit-media" style="
            background: #666; color: white; border: none; padding: 10px 20px;
            border-radius: 4px; cursor: pointer; flex: 1; font-weight: bold;
          ">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const close = (reopenSceneManager = true) => {
      if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (reopenSceneManager) {
        setTimeout(() => this.showSceneManager(), 100);
      }
    };

    // Media type toggle
    dialog.querySelector('#media-type-select').addEventListener('change', (e) => {
      const isVideo = e.target.value === 'video';
      dialog.querySelector('#image-options').style.display = isVideo ? 'none' : 'block';
      dialog.querySelector('#video-options').style.display = isVideo ? 'block' : 'none';
    });

    dialog.querySelector('#cancel-edit-media').onclick = () => close(true);

    dialog.querySelector('#browse-image-common').onclick = () => {
      close(false);
      if (!window.CommonAssetsPicker) {
        alert('Online assets picker is not available.');
        return;
      }
      window.CommonAssetsPicker.openFor({
        category: '360-images',
        onSelect: (asset) => {
          if (!asset || asset.category !== '360-images') return;
          this.applySceneImageFromUrl(sceneId, asset, {
            onDone: () => {
              this.showStartingPointFeedback(`Updated image for "${scene.name}"`);
              this.showSceneManager();
            },
          });
        },
      });
    };

    dialog.querySelector('#browse-video-common').onclick = () => {
      close(false);
      if (!window.CommonAssetsPicker) {
        alert('Online assets picker is not available.');
        return;
      }
      window.CommonAssetsPicker.openFor({
        category: '360-videos',
        onSelect: (asset) => {
          if (!asset || asset.category !== '360-videos') return;
          this.applySceneVideoFromUrl(sceneId, asset, {
            onDone: () => {
              this.showStartingPointFeedback(`Updated video for "${scene.name}"`);
              this.showSceneManager();
            },
          });
        },
      });
    };

    // Image upload from file
    dialog.querySelector('#upload-image-file').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        (async () => {
          try {
            const storageKey = scene.imageStorageKey || `image_scene_${sceneId}`;
            const saved = await this.saveImageToIDB(storageKey, file);
            if (saved) {
              const blobURL = URL.createObjectURL(file);
              scene.type = 'image';
              scene.imageStorageKey = storageKey;
              scene.imageFileName = file.name;
              scene.image = blobURL;
              scene.videoSrc = null;
              this.clearCommonAssetProvenance(scene);
              this.saveScenesData();
              if (sceneId === this.currentScene) {
                this.loadCurrentScene();
              }
              close(true);
              this.showStartingPointFeedback(`Updated to image for "${scene.name}"`);
            } else {
              alert('Failed to save image locally.');
            }
          } catch (err) {
            console.error('Failed to store image', err);
            alert('Failed to store image.');
          }
        })();
      };
      input.click();
    };

    // Image from URL
    dialog.querySelector('#use-image-url').onclick = () => {
      const url = prompt(
        `Enter the URL of the 360° image for "${scene.name}":\n(Make sure it's a direct link to an image file)`,
        scene.image && scene.image.startsWith('http') ? scene.image : 'https://'
      );
      if (!url || url === 'https://') return;

      try {
        new URL(url);
      } catch (e) {
        alert('Please enter a valid URL');
        return;
      }

      close(false);
      this.applySceneImageFromUrl(sceneId, url, {
        onDone: () => {
          this.showStartingPointFeedback(`Updated to image for "${scene.name}"`);
          this.showSceneManager();
        },
      });
    };

    // Video upload from file
    dialog.querySelector('#upload-video-file').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/mp4,video/webm';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type - check both MIME type and extension
        const validVideoTypes = ['video/mp4', 'video/webm'];
        const validExtensions = ['.mp4', '.webm'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!file.type.startsWith('video/') || !validVideoTypes.includes(file.type.toLowerCase())) {
          alert(
            "❌ Can't be selected as it is not a video file.\n\nPlease select a valid video file (MP4 or WebM only)."
          );
          return;
        }

        if (!validExtensions.includes(fileExtension)) {
          alert(
            "❌ Can't be selected as it is not a video file.\n\nOnly MP4 and WebM formats are supported."
          );
          return;
        }

        // Warn if file is large
        if (file.size > 200 * 1024 * 1024) {
          if (
            !confirm(
              'Warning: This video is very large (>200MB). This may cause slow loading. Continue?'
            )
          ) {
            return;
          }
        }

        (async () => {
          try {
            const storageKey = scene.videoStorageKey || `video_${sceneId}`;
            const processed = await this.processLocalVideoFileForScene({ file, storageKey });
            if (!processed.videoStorageKey) {
              alert(
                'Failed to save video locally.\n\nTip: Try a smaller file or enable persistent storage permissions in your browser.'
              );
              return;
            }

            scene.type = 'video';
            scene.videoSrc = processed.videoSrc;
            scene.videoStorageKey = processed.videoStorageKey;
            scene.videoFileName = processed.videoFileName;
            scene.videoVolume = scene.videoVolume || 0.5;
            this.clearCommonAssetProvenance(scene);
            this.applyHostedVideoProvenance(scene, processed);

            this.saveScenesData();

            if (sceneId === this.currentScene) {
              await this.rehydrateVideoSourcesFromIDB();
              this.loadCurrentScene();
            }

            close(true);
            const msg =
              processed.transcoded && processed.originalSize && processed.compressedSize
                ? `Video compressed (${Math.round(processed.originalSize / 1024 / 1024)}MB → ${Math.round(processed.compressedSize / 1024 / 1024)}MB) and loaded!`
                : `Video "${file.name}" saved and loaded!`;
            this.showStartingPointFeedback(msg);
          } catch (err) {
            console.error('Failed to store video', err);
            alert('Failed to store video locally.');
          }
        })();
      };
      input.click();
    };

    // Video from URL
    dialog.querySelector('#use-video-url').onclick = async () => {
      const url = prompt(
        `Enter the URL of the 360° video for "${scene.name}":\n(Direct link to MP4/WebM file)`,
        scene.videoSrc && scene.videoSrc.startsWith('http') ? scene.videoSrc : 'https://'
      );
      if (!url || url === 'https://') return;

      try {
        new URL(url);
      } catch (e) {
        alert('Please enter a valid URL');
        return;
      }

      // Validate URL extension
      const urlLower = url.toLowerCase();
      const validVideoExtensions = ['.mp4', '.webm'];
      const hasValidExtension = validVideoExtensions.some((ext) => urlLower.includes(ext));

      if (!hasValidExtension) {
        alert(
          "❌ Can't be loaded as it is not a video file.\n\nURL must point to an MP4 or WebM file.\n\nExample: https://example.com/video.mp4"
        );
        return;
      }

      // Additional check: warn if URL looks like audio
      const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
      const looksLikeAudio = audioExtensions.some((ext) => urlLower.includes(ext));

      if (looksLikeAudio) {
        alert(
          "❌ Can't be loaded as it is not a video file.\n\nThis URL appears to be an audio file (MP3, WAV, etc.).\n\nPlease provide a video URL (MP4 or WebM)."
        );
        return;
      }

      // Try to verify content type via HEAD request (optional, may fail due to CORS)
      try {
        this.showLoadingIndicator('Verifying video URL...');
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');

        if (contentType && !contentType.startsWith('video/')) {
          this.hideLoadingIndicator();
          alert(
            `❌ Can't be loaded as it is not a video file.\n\nServer reports content type: ${contentType}\n\nOnly video/mp4 and video/webm are supported.`
          );
          return;
        }
        this.hideLoadingIndicator();
      } catch (e) {
        // CORS or network error - continue anyway (user might have valid URL)
        this.hideLoadingIndicator();
        console.warn('Could not verify content type (CORS?), proceeding anyway:', e);
      }

      close(false);
      await this.applySceneVideoFromUrl(sceneId, url, {
        onDone: () => {
          this.showStartingPointFeedback(`Video URL set for "${scene.name}"`);
          this.showSceneManager();
        },
      });
    };
  }

  deleteScene(sceneId) {
    if (sceneId === 'scene1') {
      // Show a styled popup explaining they can't delete but can edit
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: ${EDITOR_LAYER.dialog}; display: flex;
        align-items: center; justify-content: center; font-family: Arial;
        animation: fadeIn 0.3s ease-in;
      `;

      dialog.innerHTML = `
        <div style="background: linear-gradient(135deg, #f44336 0%, #e91e63 100%); padding: 40px; border-radius: 16px; color: white; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); text-align: center;">
          <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
          <h2 style="margin: 0 0 15px 0; font-size: 28px; font-weight: bold;">Cannot Delete Scene 1</h2>
          <p style="color: #f0f0f0; margin-bottom: 25px; font-size: 16px; line-height: 1.6;">
            Scene 1 is the default scene and cannot be deleted.<br>
            However, you can <strong>edit its media</strong> to customize it!
          </p>
          
          <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            <button id="edit-scene1-image-btn" style="
              background: white; color: #f44336; border: none; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              🎬 Edit Scene 1 Media
            </button>
            
            <button id="close-delete-warning-btn" style="
              background: rgba(255,255,255,0.2); color: white; border: 2px solid white; padding: 15px 30px;
              border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;
              backdrop-filter: blur(10px); transition: all 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              ✓ Got It
            </button>
          </div>
        </div>
      `;

      // Add animation keyframes if not already present
      if (!document.getElementById('prompt-animation-style')) {
        const style = document.createElement('style');
        style.id = 'prompt-animation-style';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(dialog);

      // Edit Image button - close this dialog and open edit scene image
      document.getElementById('edit-scene1-image-btn').onclick = () => {
        document.body.removeChild(dialog);
        this.editSceneMedia('scene1');
      };

      // Close button
      document.getElementById('close-delete-warning-btn').onclick = () => {
        document.body.removeChild(dialog);
      };

      return;
    }

    if (!confirm(`Delete scene "${this.scenes[sceneId].name}"?`)) return;

    delete this.scenes[sceneId];

    // Track if we switched scenes
    let switchedScenes = false;

    // If we're currently on the deleted scene, switch to scene1 first
    if (this.currentScene === sceneId) {
      this.currentScene = 'scene1';
      document.getElementById('current-scene').value = 'scene1';
      this.loadCurrentScene();
      switchedScenes = true;
    }

    // Clean up navigation hotspots that pointed to the deleted scene (after scene switch)
    this.cleanupOrphanedNavigationHotspots();

    // If we didn't switch scenes, refresh the current scene to remove stale portals
    if (!switchedScenes) {
      console.log('🔄 Refreshing current scene to remove stale navigation portals');
      this.loadCurrentScene();
    }

    this.updateSceneDropdown();
    this.updateNavigationTargets();

    // Close and reopen scene manager to refresh the list
    removeEditorOverlayDialogs();
    this.showSceneManager();
  }
}

// Modified spot component for editor
AFRAME.registerComponent('editor-spot', {
  schema: {
    type: { type: 'string', default: '' },
    label: { type: 'string', default: '' },
    audio: { type: 'string', default: '' },
    audioLoop: { type: 'boolean', default: true },
    labelBackground: { type: 'color', default: '#333333' },
    labelPadding: { type: 'number', default: 0.2 },
    popup: { type: 'string', default: '' },
    popupWidth: { type: 'number', default: 3 },
    popupHeight: { type: 'number', default: 2 },
    popupColor: { type: 'color', default: '#333333' },
    navigation: { type: 'string', default: '' },
    weblink: { type: 'string', default: '' },
    weblinkTitle: { type: 'string', default: '' },
    weblinkPreview: { type: 'string', default: '' },
    imageSrc: { type: 'string', default: '' },
    imageScale: { type: 'number', default: 5 },
    imageAspectRatio: { type: 'number', default: 0 },
    mediaKind: { type: 'string', default: 'photo' },
    videoSrc: { type: 'string', default: '' },
    videoLoop: { type: 'boolean', default: true },
    videoMuted: { type: 'boolean', default: true },
    modelSrc: { type: 'string', default: '' },
    modelScale: { type: 'number', default: 1 },
    modelRotationX: { type: 'number', default: 0 },
    modelRotationY: { type: 'number', default: 0 },
    modelRotationZ: { type: 'number', default: 0 },
    modelPositionY: { type: 'number', default: 0 },
  },

  init: function () {
    const data = this.data;
    const el = this.el;

    // Don't override the src - let createHotspotElement set the appropriate icon
    el.setAttribute('class', 'clickable');

    // Add highlight animation
    el.setAttribute('animation__highlight', {
      property: 'scale',
      from: '1 1 1',
      to: '1.5 1.5 1.5',
      dur: 500,
      easing: 'easeInOutQuad',
      startEvents: 'highlight',
      autoplay: false,
      loop: 2,
      dir: 'alternate',
    });

    // REMOVED: Main element hover animations to prevent inheritance by popup children

    /******************  STATIC VIDEO (flat billboard)  ******************/
    if (data.mediaKind === 'video') {
      mountEditorFlatVideoBillboard(this, data);
    } else if (data.imageSrc) {
      const img = document.createElement('a-image');
      let _src = data.imageSrc;
      if (_src && _src.includes('%')) {
        try {
          _src = decodeURIComponent(_src);
        } catch (e) {}
      }
      setAImageHotspotSrc(img, _src);
      disableImageHotspotCulling(img);
      img.setAttribute('crossorigin', 'anonymous');
      if (!img.getAttribute('material'))
        img.setAttribute('material', 'transparent:true; side:double');
      const scl = data.imageScale || 1;
      // Unit base geometry; scale for size to reduce texture rebuild flicker
      // Use any persisted aspect ratio immediately to avoid square flash
      const knownAR =
        typeof data.imageAspectRatio === 'number' &&
        isFinite(data.imageAspectRatio) &&
        data.imageAspectRatio > 0
          ? data.imageAspectRatio
          : typeof data._aspectRatio === 'number' &&
            isFinite(data._aspectRatio) &&
            data._aspectRatio > 0
          ? data._aspectRatio
          : null;
      const initAR = typeof knownAR === 'number' && isFinite(knownAR) && knownAR > 0 ? knownAR : 1;
      if (initAR !== 1) img.dataset.aspectRatio = String(initAR);
      img.setAttribute('width', 1);
      img.setAttribute('height', initAR);
      img.setAttribute('scale', `${scl} ${scl} 1`);
      img.setAttribute('position', `0 ${(initAR / 2) * scl} 0.05`);
      try {
        console.log(
          `[ImageHotspot][Init] id=${
            el.id
          } knownAR=${knownAR} initAR=${initAR} scale=${scl} -> w=1 h=${initAR} y=${
            (initAR / 2) * scl
          }`
        );
      } catch (_) {}
      img.classList.add('static-image-hotspot');
      img.classList.add('clickable');

      // Expand image after gaze completes - only for VR gaze-cursor
      let fusingTimer = null;
      let isExpanded = false;
      const editorRef = window.hotspotEditor;
      const gazeDuration =
        editorRef &&
        editorRef.customStyles &&
        editorRef.customStyles.gaze &&
        editorRef.customStyles.gaze.duration
          ? Math.round(editorRef.customStyles.gaze.duration * 1000)
          : 2000;
      img.addEventListener('raycaster-intersected', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          console.log('Gaze-cursor entered image');
          if (fusingTimer) clearTimeout(fusingTimer);
          fusingTimer = setTimeout(() => {
            console.log('Expanding image after gaze');
            isExpanded = true;
            img.setAttribute('scale', `${scl * 2} ${scl * 2} 1`);
          }, gazeDuration);
        }
      });

      img.addEventListener('raycaster-intersected-cleared', (evt) => {
        const cursorEl = evt.detail.el;
        if (cursorEl && cursorEl.id === 'gaze-cursor') {
          console.log('Gaze-cursor left image, isExpanded:', isExpanded);
          if (fusingTimer) {
            clearTimeout(fusingTimer);
            fusingTimer = null;
          }
          if (isExpanded) {
            isExpanded = false;
          }
          // Always reset scale on leave
          img.setAttribute('scale', `${scl} ${scl} 1`);
        }
      });

      // Apply global image styles if available
      const editor = window.hotspotEditor;
      if (editor && editor.customStyles && editor.customStyles.image) {
        const istyle = editor.customStyles.image;
        const opacity = typeof istyle.opacity === 'number' ? istyle.opacity : 1.0;
        img.setAttribute(
          'material',
          `opacity: ${opacity}; transparent: ${opacity < 1 ? 'true' : 'false'}; side: double`
        );
        // Border: only add frame if no rounding (runtime also relies on masking for rounded). Rounding decided later when mask runs.
        const numericRadius = parseFloat(istyle.borderRadius) || 0;
        if (numericRadius === 0 && istyle.borderWidth > 0) {
          const frame = document.createElement('a-plane');
          frame.setAttribute('width', 1 * scl + istyle.borderWidth * 2);
          frame.setAttribute('height', 1 * scl + istyle.borderWidth * 2); // temporary until ratio known
          frame.setAttribute('position', `0 ${0.5 * scl} 0.0`);
          frame.setAttribute(
            'material',
            `shader:flat; color:${
              istyle.borderColor || '#FFFFFF'
            }; opacity:${opacity}; transparent:${opacity < 1 ? 'true' : 'false'}; side: double`
          );
          frame.classList.add('static-image-border');
          el.appendChild(frame);
          img.setAttribute('position', `0 ${0.5 * scl} 0.05`); // bring image forward
          try {
            console.log(
              `[ImageHotspot][FrameInit] id=${el.id} temporary frame size -> w=${
                1 * scl + istyle.borderWidth * 2
              } h=${1 * scl + istyle.borderWidth * 2}`
            );
          } catch (_) {}
        }
      }
      img.addEventListener('load', () => {
        try {
          const nW = img.naturalWidth || 0;
          const nH = img.naturalHeight || 0;
          const ratio = nH && nW ? nH / nW : parseFloat(img.dataset.aspectRatio || '') || 1;
          try {
            console.log(
              `[ImageHotspot][Load] id=${el.id} natural=${nW}x${nH} ratio=${ratio} scale=${scl}`
            );
          } catch (_) {}
          if (ratio && isFinite(ratio) && ratio > 0) {
            // persist on model and dataset
            try {
              const editor = window.hotspotEditor;
              const compData = this.data || data;
              const idStr = this.el && this.el.id ? this.el.id : '';
              const id = idStr.startsWith('hotspot-') ? parseInt(idStr.slice(8), 10) : NaN;
              if (editor && !isNaN(id)) editor._persistImageAspectRatio(id, ratio);
            } catch (_) {}
            img.dataset.aspectRatio = String(ratio);
          }
          img.setAttribute('width', 1);
          img.setAttribute('height', ratio);
          img.setAttribute('scale', `${scl} ${scl} 1`);
          img.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
          try {
            console.log(
              `[ImageHotspot][Load-Apply] id=${el.id} -> w=1 h=${ratio} y=${(ratio / 2) * scl}`
            );
          } catch (_) {}
          const frame = el.querySelector('.static-image-border');
          if (frame) {
            const editor2 = window.hotspotEditor;
            const istyle2 = editor2?.customStyles?.image;
            const bw = istyle2?.borderWidth || 0.02;
            frame.setAttribute('width', 1 * scl + bw * 2);
            frame.setAttribute('height', ratio * scl + bw * 2);
            frame.setAttribute('position', `0 ${(ratio / 2) * scl} 0.0`);
          }
          if (el._repositionEditButtons) el._repositionEditButtons();
          if (window.hotspotEditor) {
            window.hotspotEditor._bindInSceneRevealOnMedia(el);
            window.hotspotEditor._bringInSceneEditButtonsToFront(el);
            window.hotspotEditor._refreshInSceneEditButtonMaterials(el);
          }
        } catch (e) {}
      });
      // Also wait for A-Frame texture to be ready (some drivers fill later)
      const onTex = () => {
        try {
          const mesh = img.getObject3D('mesh');
          const texImg = mesh && mesh.material && mesh.material.map && mesh.material.map.image;
          const nW = texImg?.naturalWidth || texImg?.width || 0;
          const nH = texImg?.naturalHeight || texImg?.height || 0;
          const ratio = nW > 0 && nH > 0 ? nH / nW : 0;
          if (ratio && isFinite(ratio) && ratio > 0) {
            img.dataset.aspectRatio = String(ratio);
            img.setAttribute('width', 1);
            img.setAttribute('height', ratio);
            img.setAttribute('position', `0 ${(ratio / 2) * scl} 0.05`);
            console.log(
              `[ImageHotspot][TexReady] id=${el.id} tex=${nW}x${nH} ratio=${ratio} -> w=1 h=${ratio}`
            );
            // persist
            try {
              const idStr = el.id || '';
              const id = idStr.startsWith('hotspot-') ? parseInt(idStr.slice(8), 10) : NaN;
              if (!isNaN(id) && window.hotspotEditor)
                window.hotspotEditor._persistImageAspectRatio(id, ratio);
            } catch (_) {}
            if (el._repositionEditButtons) el._repositionEditButtons();
            if (window.hotspotEditor) {
              window.hotspotEditor._bindInSceneRevealOnMedia(el);
              window.hotspotEditor._bringInSceneEditButtonsToFront(el);
            }
          }
        } catch (_) {}
      };
      img.addEventListener('materialtextureloaded', onTex, { once: true });
      // Polling fallback in case event is missed
      setTimeout(() => {
        try {
          onTex();
        } catch (_) {}
      }, 250);
      setTimeout(() => {
        try {
          onTex();
        } catch (_) {}
      }, 800);
      el.appendChild(img);
      try {
        const ed = window.hotspotEditor;
        if (ed && el._repositionEditButtons) el._repositionEditButtons();
      } catch (_) {}
    }

    /******************  STATIC 3D MODEL  ******************/
    if (data.modelSrc) {
      const model = document.createElement('a-entity');
      let _src = data.modelSrc;
      if (_src && _src.includes('%')) {
        try {
          _src = decodeURIComponent(_src);
        } catch (e) {}
      }
      model.setAttribute('gltf-model', _src);
      const scl = data.modelScale || 1;
      const rotX = data.modelRotationX || 0;
      const rotY = data.modelRotationY || 0;
      const rotZ = data.modelRotationZ || 0;
      model.setAttribute('scale', `${scl} ${scl} ${scl}`);
      model.setAttribute('rotation', `${rotX} ${rotY} ${rotZ}`);
      model.setAttribute('position', `0 0 0`);
      model.classList.add('static-model-hotspot');
      model.classList.add('clickable');
      model.classList.add('no-gaze-grow');

      console.log(
        `[ModelHotspot][Init] id=${
          el.id
        } scale=${scl} rotation=${rotX} ${rotY} ${rotZ} src=${_src.slice(0, 64)}`
      );

      el.appendChild(model);
    }

    /******************  POPUP  ******************/
    if (data.popup) {
      // Get custom styles from the editor instance
      const editor = window.hotspotEditor;
      const styles = editor ? editor.customStyles : null;

      /* info icon */
      const infoIcon = document.createElement('a-entity');
      // Create circular info icon instead of banner
      const iconSize = styles ? styles.hotspot.infoButton.size : 0.4;
      infoIcon.setAttribute('geometry', 'primitive: circle; radius: ' + iconSize);

      // Use custom styles if available
      const infoBgColor = styles ? styles.hotspot.infoButton.backgroundColor : '#4A90E2';
      const infoTextColor = styles ? styles.hotspot.infoButton.textColor : '#FFFFFF';
      const infoOpacity = styles ? styles.hotspot.infoButton.opacity : 0.9;
      const infoFontSize = styles ? styles.hotspot.infoButton.fontSize : 12;

      infoIcon.setAttribute('material', 'color: ' + infoBgColor + '; opacity: ' + infoOpacity);
      infoIcon.setAttribute(
        'text',
        'value: i; align: center; color: ' +
          infoTextColor +
          '; width: ' +
          infoFontSize +
          '; font: roboto'
      );
      infoIcon.setAttribute('position', '0 0.8 0');
      infoIcon.classList.add('clickable');
      // Add hover animations specifically to info icon only (not inherited by popup)
      infoIcon.setAttribute('animation__hover_in', {
        property: 'scale',
        to: '1.1 1.1 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseenter',
      });

      infoIcon.setAttribute('animation__hover_out', {
        property: 'scale',
        to: '1 1 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseleave',
      });
      el.appendChild(infoIcon);

      /* popup container */
      const popup = document.createElement('a-entity');
      popup.setAttribute('visible', 'false');
      popup.classList.add('popup-container');
      // Move popup significantly forward on z-axis to avoid z-fighting with info icon
      popup.setAttribute('position', '0 1.5 0.2');
      popup.setAttribute('look-at', '#cam');
      // REMOVED: Popup scale animations to prevent conflicts with close button interactions

      /* background */
      const background = document.createElement('a-plane');

      // Use custom styles if available
      const popupBgColor = styles ? styles.hotspot.popup.backgroundColor : data.popupColor;
      const popupOpacity = styles ? styles.hotspot.popup.opacity : 1;

      background.setAttribute('color', popupBgColor);
      background.setAttribute('opacity', popupOpacity);
      background.setAttribute('width', data.popupWidth);
      background.setAttribute('height', data.popupHeight);
      background.classList.add('popup-bg');
      popup.appendChild(background);

      /* text */
      const text = document.createElement('a-text');

      // Use custom text color if available
      const popupTextColor = styles ? styles.hotspot.popup.textColor : 'white';

      text.setAttribute('value', data.popup);
      text.setAttribute('wrap-count', Math.floor(data.popupWidth * 8)); // Dynamic wrap based on popup width
      text.setAttribute('color', popupTextColor);
      text.setAttribute('position', '0 0 0.05'); // Keep text centered
      text.setAttribute('align', 'center');
      text.setAttribute('width', (data.popupWidth - 0.4).toString()); // Constrain to popup width with padding
      text.setAttribute('font', 'roboto');
      text.classList.add('popup-text');
      popup.appendChild(text);

      el.appendChild(popup);

      /* close button - positioned OUTSIDE and BELOW the popup */
      const closeButton = document.createElement('a-entity');
      closeButton.setAttribute('position', '0 ' + (1.5 - data.popupHeight / 2 - 0.25) + ' 0.2'); // Below the popup
      closeButton.classList.add('clickable');
      closeButton.classList.add('popup-close');
      closeButton.setAttribute('visible', 'false'); // Hidden by default
      closeButton.setAttribute('look-at', '#cam');

      // Background for close button
      const closeBg = document.createElement('a-plane');
      const closeButtonSize = styles ? styles.hotspot.closeButton.size || 0.4 : 0.4;
      const closeButtonWidth = closeButtonSize * 3; // Scale width based on size
      const closeButtonHeight = closeButtonSize * 0.875; // Scale height based on size
      closeBg.setAttribute('width', closeButtonWidth.toString());
      closeBg.setAttribute('height', closeButtonHeight.toString());
      const closeBgColor = styles
        ? styles.hotspot.closeButton.backgroundColor || styles.hotspot.infoButton.backgroundColor
        : '#4A90E2';
      const closeOpacity = styles ? styles.hotspot.closeButton.opacity : 1;
      closeBg.setAttribute('color', closeBgColor);
      closeBg.setAttribute('opacity', closeOpacity.toString());
      closeButton.appendChild(closeBg);

      // Text label "Close"
      const closeText = document.createElement('a-text');
      closeText.setAttribute('value', 'Close');
      closeText.setAttribute('align', 'center');
      const closeTextColor = styles
        ? styles.hotspot.closeButton.textColor || styles.hotspot.infoButton.textColor
        : '#FFFFFF';
      closeText.setAttribute('color', closeTextColor);
      const closeTextSize = styles ? styles.hotspot.closeButton.textSize || 4 : 4;
      closeText.setAttribute('width', closeTextSize.toString());
      closeText.setAttribute('position', '0 0 0.02');
      closeText.setAttribute('font', 'roboto');
      closeButton.appendChild(closeText);

      // Add hover animations to close button for better UX
      closeButton.setAttribute('animation__hover_in', {
        property: 'scale',
        to: '1.1 1.1 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseenter',
      });

      closeButton.setAttribute('animation__hover_out', {
        property: 'scale',
        to: '1 1 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseleave',
      });

      el.appendChild(closeButton);

      /* event wiring */
      infoIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        popup.setAttribute('visible', true);
        closeButton.setAttribute('visible', true); // Show close button with popup
        infoIcon.setAttribute('visible', false); // Hide info icon when popup is open
      });

      // Prevent close button from triggering parent hotspot events
      closeButton.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
      });

      closeButton.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
      });

      // REMOVED: Close button hover animations to prevent conflicts with popup scaling
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('🔵 Close button clicked - closing popup');
        popup.setAttribute('visible', false);
        closeButton.setAttribute('visible', false); // Hide close button with popup
        setTimeout(() => {
          infoIcon.setAttribute('visible', true); // Show info icon when popup is closed
        }, 100);
      });

      // Make children clickable so raycaster can hit them
      closeBg.classList.add('clickable');
      closeText.classList.add('clickable');

      el.appendChild(popup);
    }

    /******************  AUDIO  ******************/
    if (data.audio) {
      const audioEl = document.createElement('a-sound');
      // Stabilize blob/data audio by routing through <a-assets>
      let initSrc = data.audio;
      if (
        typeof initSrc === 'string' &&
        (initSrc.startsWith('blob:') || initSrc.startsWith('data:'))
      ) {
        try {
          const assets =
            document.querySelector('a-assets') ||
            (function () {
              const scn =
                document.querySelector('a-scene') || document.querySelector('scene, a-scene');
              const a = document.createElement('a-assets');
              if (scn) scn.insertBefore(a, scn.firstChild);
              return a;
            })();
          const assetId = 'audio_ed_' + (el.id || 'el_' + Math.random().toString(36).slice(2));
          let assetEl = assets.querySelector('#' + assetId);
          if (!assetEl) {
            assetEl = document.createElement('audio');
            assetEl.setAttribute('id', assetId);
            assetEl.setAttribute('crossorigin', 'anonymous');
            assets.appendChild(assetEl);
          }
          assetEl.setAttribute('src', initSrc);
          initSrc = '#' + assetId;
        } catch (_) {
          /* ignore, fallback to direct */
        }
      }
      audioEl.setAttribute('src', initSrc);
      audioEl.setAttribute('autoplay', 'false');
      audioEl.setAttribute('loop', data.audioLoop ? 'true' : 'false');
      el.appendChild(audioEl);

      const btn = document.createElement('a-image');
      btn.setAttribute('class', 'clickable audio-control');

      // Use custom styles if available
      const editor = window.hotspotEditor;
      const styles = editor ? editor.customStyles : null;
      const playImage = styles?.buttonImages?.play || '#play';
      const pauseImage = styles?.buttonImages?.pause || '#pause';
      btn.setAttribute('src', playImage);

      const buttonColor = styles ? styles.audio.buttonColor : '#FFFFFF';
      const buttonOpacity = styles ? styles.audio.buttonOpacity : 1.0;

      btn.setAttribute('width', '0.5');
      btn.setAttribute('height', '0.5');
      btn.setAttribute('material', `color: ${buttonColor}`);
      btn.setAttribute('opacity', buttonOpacity.toString());
      // Position the audio control below the hotspot to avoid overlapping with close button
      btn.setAttribute('position', '0 -0.6 0.02');
      el.appendChild(btn);

      let audioReady = false;
      let isPlaying = false;

      const toggleAudio = () => {
        if (!audioReady) return;

        if (isPlaying) {
          audioEl.components.sound.stopSound();
          btn.emit('fadeout');
          setTimeout(() => {
            btn.setAttribute('src', playImage);
            btn.emit('fadein');
          }, 200);
        } else {
          audioEl.components.sound.playSound();
          btn.emit('fadeout');
          setTimeout(() => {
            btn.setAttribute('src', pauseImage);
            btn.emit('fadein');
          }, 200);
        }

        isPlaying = !isPlaying;
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!audioEl.components.sound) return;
        toggleAudio();
      });

      btn.addEventListener('triggerdown', (e) => {
        e.stopPropagation();
        if (!audioEl.components.sound) return;
        toggleAudio();
      });

      btn.setAttribute('animation__hover_in', {
        property: 'scale',
        to: '1.2 1.2 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseenter',
      });

      btn.setAttribute('animation__hover_out', {
        property: 'scale',
        to: '1 1 1',
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'mouseleave',
      });

      btn.setAttribute('animation__fadeout', {
        property: 'material.opacity',
        to: 0,
        dur: 200,
        easing: 'easeInQuad',
        startEvents: 'fadeout',
      });

      btn.setAttribute('animation__fadein', {
        property: 'material.opacity',
        to: 1,
        dur: 200,
        easing: 'easeOutQuad',
        startEvents: 'fadein',
      });

      audioEl.addEventListener('sound-loaded', () => {
        audioReady = true;
        audioEl.components.sound.stopSound();
      });

      // Listen for audio end to reset button icon when not looping
      audioEl.addEventListener('sound-ended', () => {
        if (!data.audioLoop) {
          isPlaying = false;
          btn.emit('fadeout');
          setTimeout(() => {
            btn.setAttribute('src', playImage);
            btn.emit('fadein');
          }, 200);
        }
      });
    }

    /******************  NAVIGATION  ******************/
    if (data.navigation) {
      // Ensure no rotation/pulse is applied to the entire hotspot entity
      // so in‑scene Edit/Move controls don't inherit rotations.
      try {
        el.removeAttribute('animation__portal_rotate');
        el.removeAttribute('animation__portal_pulse');
      } catch (_) {}
    }
  },

  update: function (oldData) {
    if (
      this.data.mediaKind === 'video' &&
      this.data.videoSrc &&
      (this.data.videoSrc !== oldData.videoSrc || this.data.mediaKind !== oldData.mediaKind)
    ) {
      mountEditorFlatVideoBillboard(this, this.data, true);
    }
  },
});

// Student submission functionality
class StudentProjectsPanel {
  static bind() {
    const btn = document.getElementById('student-my-submissions-btn');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.style.display = '';
    btn.addEventListener('click', () => StudentProjectsPanel.show());
    StudentProjectsPanel.refreshUnreadBadge();
  }

  static async refreshUnreadBadge() {
    const btn = document.getElementById('student-my-submissions-btn');
    if (!btn) return;
    try {
      const res = await fetch('/api/student/projects', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const count = data.unreadCount || 0;
      let badge = btn.querySelector('.unread-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'unread-badge';
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    } catch (_) {}
  }

  static escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  static kindLabel(kind) {
    if (kind === 'admin_return') return 'Teacher feedback';
    if (kind === 'draft') return 'Draft';
    return 'Submitted';
  }

  static async show() {
    const res = await fetch('/api/student/projects', { credentials: 'include' });
    if (!res.ok) {
      alert('Please sign in to view your submissions.');
      return;
    }
    const data = await res.json();
    const projects = data.projects || [];

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:${EDITOR_LAYER.dialog};
      display:flex;align-items:center;justify-content:center;font-family:Arial;
    `;
    dialog.innerHTML = `
      <div style="background:#2a2a2a;color:#fff;border-radius:10px;padding:24px;max-width:640px;width:92%;max-height:85vh;overflow:auto;">
        <h3 style="margin:0 0 16px;color:#4CAF50;">My Submissions</h3>
        <div id="my-submissions-list"></div>
        <button id="close-my-submissions" style="margin-top:16px;padding:10px 20px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#close-my-submissions').addEventListener('click', () => dialog.remove());

    const list = dialog.querySelector('#my-submissions-list');
    if (!projects.length) {
      list.innerHTML = '<p style="color:#aaa;">No submissions yet.</p>';
      return;
    }

    list.innerHTML = projects
      .map((p) => {
        const hasFeedback = p.latestKind === 'admin_return' && !p.studentSeenAt;
        const badge = hasFeedback
          ? '<span style="background:#2196F3;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:6px;">New feedback</span>'
          : '';
        const note = p.studentNote
          ? `<div style="font-size:12px;color:#ccc;margin-top:4px;">Your note: ${StudentProjectsPanel.escapeHtml(p.studentNote)}</div>`
          : '';
        const adminNote = p.adminNote
          ? `<div style="font-size:12px;color:#90caf9;margin-top:4px;">Teacher: ${StudentProjectsPanel.escapeHtml(p.adminNote)}</div>`
          : '';
        return `
          <div style="border:1px solid #555;border-radius:6px;padding:12px;margin-bottom:10px;">
            <strong>${StudentProjectsPanel.escapeHtml(p.projectName)}</strong>
            <span style="color:#888;font-size:12px;margin-left:6px;">${StudentProjectsPanel.kindLabel(p.latestKind)} v${p.latestVersionNumber || '—'}</span>${badge}
            ${note}${adminNote}
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button data-open="${p.latestVersionId}" data-thread="${p.threadId}" style="padding:6px 12px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Open in editor</button>
              <button data-dl="${p.latestVersionId}" style="padding:6px 12px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Download</button>
              <button data-history="${p.threadId}" style="padding:6px 12px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">History</button>
            </div>
            <div id="thread-history-${p.threadId}" style="display:none;margin-top:8px;font-size:12px;color:#bbb;"></div>
          </div>`;
      })
      .join('');

    list.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const versionId = btn.getAttribute('data-open');
        await StudentProjectsPanel.openVersionInEditor(versionId, dialog);
      });
    });
    list.querySelectorAll('[data-dl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.location.href = `/api/student/versions/${btn.getAttribute('data-dl')}/download`;
      });
    });
    list.querySelectorAll('[data-history]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const threadId = btn.getAttribute('data-history');
        const panel = document.getElementById('thread-history-' + threadId);
        if (panel.style.display === 'block') {
          panel.style.display = 'none';
          return;
        }
        const hres = await fetch(`/api/student/projects/${threadId}/versions`, { credentials: 'include' });
        const hdata = await hres.json();
        panel.innerHTML = (hdata.versions || [])
          .map(
            (v) =>
              `<div style="padding:4px 0;border-top:1px solid #444;">
                v${v.versionNumber} ${StudentProjectsPanel.kindLabel(v.kind)} — ${new Date(v.submittedAt || v.createdAt).toLocaleString()}
                <button data-open="${v.id}" style="margin-left:6px;font-size:11px;">Open</button>
              </div>`
          )
          .join('');
        panel.style.display = 'block';
        panel.querySelectorAll('[data-open]').forEach((ob) => {
          ob.addEventListener('click', async () => {
            await StudentProjectsPanel.openVersionInEditor(ob.getAttribute('data-open'), dialog);
          });
        });
      });
    });
  }

  static async openVersionInEditor(versionId, parentDialog) {
    try {
      const res = await fetch(`/api/student/versions/${versionId}/download`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load project ZIP');
      const blob = await res.blob();
      if (!window.hotspotEditor) throw new Error('Editor not ready');
      await window.hotspotEditor.loadZIPTemplate(blob);

      const hres = await fetch(`/api/student/projects`, { credentials: 'include' });
      const threadData = await hres.json();
      let ver = null;
      for (const p of threadData.projects || []) {
        const vres = await fetch(`/api/student/projects/${p.threadId}/versions`, { credentials: 'include' });
        const hd = await vres.json();
        ver = (hd.versions || []).find((v) => v.id === versionId);
        if (ver) break;
      }
      if (ver && ver.adminNote) {
        StudentProjectsPanel.showFeedbackModal(ver);
        await fetch(`/api/student/versions/${versionId}/seen`, {
          method: 'POST',
          credentials: 'include',
        });
        StudentProjectsPanel.refreshUnreadBadge();
      }
      if (parentDialog) parentDialog.remove();
    } catch (err) {
      alert('Could not open project: ' + err.message);
    }
  }

  static showFeedbackModal(version) {
    const existing = document.getElementById('teacher-feedback-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'teacher-feedback-modal';
    modal.style.cssText = `
      position:fixed;bottom:24px;right:24px;max-width:360px;background:#1e3a5f;color:#fff;
      padding:16px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:${EDITOR_LAYER.dialog + 1};
      border-left:4px solid #2196F3;font-family:Arial;
    `;
    modal.innerHTML = `
      <strong style="display:block;margin-bottom:8px;">Teacher feedback</strong>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.4;">${StudentProjectsPanel.escapeHtml(version.adminNote)}</p>
      <button id="dismiss-feedback" style="padding:6px 14px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;">Got it</button>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#dismiss-feedback').addEventListener('click', async () => {
      await fetch(`/api/student/versions/${version.id}/seen`, { method: 'POST', credentials: 'include' });
      modal.remove();
      StudentProjectsPanel.refreshUnreadBadge();
    });
  }
}

window.StudentProjectsPanel = StudentProjectsPanel;

const AdminReviewMode = {
  versionId: null,
  versionMeta: null,

  async checkAdminAndStart(startEditor) {
    try {
      const res = await fetch('/admin/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated) {
        window.location.href = '/admin-submissions.html';
        return;
      }
      startEditor();
    } catch (_) {
      window.location.href = '/admin-submissions.html';
    }
  },

  async init(versionId) {
    this.versionId = versionId;
    const bar = document.getElementById('admin-review-bar');
    const submitSection = document.getElementById('submit-to-professor')?.closest('.panel-section');
    const loginGate = document.getElementById('student-login-gate');
    if (loginGate) loginGate.style.display = 'none';
    if (submitSection) submitSection.style.display = 'none';
    if (bar) bar.classList.add('visible');

    document.getElementById('admin-review-close-btn')?.addEventListener('click', () => {
      window.location.href = '/admin-submissions.html';
    });
    document.getElementById('admin-save-send-btn')?.addEventListener('click', () => {
      AdminReviewMode.showReturnDialog();
    });

    try {
      const res = await fetch(`/admin/versions/${versionId}/zip`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load submission ZIP');
      const blob = await res.blob();

      const inboxRes = await fetch('/admin/submissions-inbox', { credentials: 'include' });
      const inbox = await inboxRes.json();
      this.versionMeta = inbox.find((s) => s.id === versionId) || { id: versionId };

      const metaEl = document.getElementById('admin-review-meta');
      if (metaEl) {
        metaEl.textContent = `${this.versionMeta.studentDisplayName || 'Student'} — ${this.versionMeta.projectName || 'Project'} (v${this.versionMeta.versionNumber || '?'})`;
      }
      const noteEl = document.getElementById('admin-review-student-note');
      if (noteEl && this.versionMeta.studentNote) {
        noteEl.textContent = 'Student note: ' + this.versionMeta.studentNote;
      }

      const waitForEditor = () =>
        new Promise((resolve) => {
          const tick = () => {
            if (window.hotspotEditor) resolve();
            else setTimeout(tick, 200);
          };
          tick();
        });
      await waitForEditor();
      await window.hotspotEditor.loadZIPTemplate(blob);
    } catch (err) {
      alert('Failed to load submission for review: ' + err.message);
    }
  },

  showReturnDialog() {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:${EDITOR_LAYER.dialog};
      display:flex;align-items:center;justify-content:center;font-family:Arial;
    `;
    dialog.innerHTML = `
      <div style="background:#2a2a2a;color:#fff;border-radius:10px;padding:24px;max-width:480px;width:90%;">
        <h3 style="margin:0 0 12px;color:#4CAF50;">Save and Send to Student</h3>
        <p style="color:#ccc;font-size:14px;">Your edits will be saved as a new version. The student's original submission is never overwritten.</p>
        <label style="display:block;margin:16px 0 6px;color:#ccc;">Feedback note for student:</label>
        <textarea id="admin-return-note" rows="4" style="width:100%;padding:10px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;box-sizing:border-box;" placeholder="Optional feedback..."></textarea>
        <div id="admin-return-status" style="margin-top:12px;color:#ccc;font-size:13px;"></div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button id="admin-return-confirm" style="padding:10px 18px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Send to Student</button>
          <button id="admin-return-cancel" style="padding:10px 18px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#admin-return-cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('#admin-return-confirm').addEventListener('click', () => {
      AdminReviewMode.sendToStudent(dialog);
    });
  },

  async sendToStudent(dialog) {
    const status = dialog.querySelector('#admin-return-status');
    const note = dialog.querySelector('#admin-return-note')?.value || '';
    const confirmBtn = dialog.querySelector('#admin-return-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    status.textContent = 'Generating ZIP...';

    try {
      if (!window.hotspotEditor) throw new Error('Editor not ready');
      const exportMode = await window.hotspotEditor.showExportModeDialog({
        title: 'Send to Student',
        description: 'Choose how media should be included in the returned package.',
      });
      if (!exportMode) {
        if (confirmBtn) confirmBtn.disabled = false;
        status.textContent = '';
        return;
      }

      const JSZip = window.JSZip || (await window.hotspotEditor.loadJSZip());
      const zip = new JSZip();
      const skyboxImg = document.querySelector('#main-panorama');
      const skyboxSrc = skyboxImg ? skyboxImg.src : '';
      const safeName = (this.versionMeta?.projectName || 'VR_Project').replace(/[^a-zA-Z0-9]/g, '_');
      await window.hotspotEditor.addFilesToZip(zip, safeName, skyboxSrc, exportMode);
      const blob = await zip.generateAsync({ type: 'blob' });

      status.textContent = 'Uploading...';
      const formData = new FormData();
      formData.append('project', blob, `${safeName}_return.zip`);
      formData.append('adminNote', note);

      const res = await fetch(`/admin/versions/${this.versionId}/return`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Send failed');

      status.innerHTML = '<span style="color:#4CAF50;">Sent successfully!</span>';
      setTimeout(() => {
        dialog.remove();
        window.location.href = '/admin-submissions.html';
      }, 1200);
    } catch (err) {
      status.innerHTML = `<span style="color:#f44336;">${err.message}</span>`;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  },
};

window.AdminReviewMode = AdminReviewMode;

class StudentSubmission {
  static showSubmissionDialog() {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: ${EDITOR_LAYER.dialog}; display: flex; 
      align-items: center; justify-content: center; font-family: Arial;
    `;

    dialog.innerHTML = `
      <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; color: white; max-width: 500px;">
        <h3 style="margin-top: 0; color: #4CAF50;">📤 Submit Your VR Project</h3>
        <p style="color: #ccc;">Submit your VR hotspot project to the admin:</p>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Project Name:</label>
          <input type="text" id="project-name" style="
            width: 100%; padding: 10px; border: 1px solid #555; 
            background: #333; color: white; border-radius: 4px;
          " placeholder="My project name">
        </div>

        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Note for teacher (optional):</label>
          <textarea id="student-submit-note" rows="3" style="
            width: 100%; padding: 10px; border: 1px solid #555;
            background: #333; color: white; border-radius: 4px; resize: vertical;
          " placeholder="Questions or comments for your teacher..."></textarea>
          <p style="color: #888; font-size: 12px; margin: 8px 0 0;">Each submit creates a new version. You can keep working after submitting.</p>
        </div>
        
        <div id="submit-project-actions" style="margin: 25px 0; text-align: center;">
          <button id="submit-project-btn" style="
            background: #4CAF50; color: white; border: none; padding: 15px 25px;
            border-radius: 6px; cursor: pointer; margin: 5px; font-weight: bold;
          ">📤 Submit Project</button>
          <button id="cancel-submission-btn" style="
            background: #666; color: white; border: none; padding: 15px 25px;
            border-radius: 6px; cursor: pointer; margin: 5px;
          ">Cancel</button>
        </div>
        
        <div id="submission-status" style="margin-top: 20px; text-align: center;"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Add event listeners
    document.getElementById('submit-project-btn').addEventListener('click', () => {
      const note = document.getElementById('student-submit-note')?.value || '';
      StudentSubmission.submitProject(document.getElementById('project-name').value, { studentNote: note });
    });

    document.getElementById('cancel-submission-btn').addEventListener('click', () => {
      dialog.remove();
    });
  }

  static hideSubmissionFormControls() {
    const actions = document.getElementById('submit-project-actions');
    if (actions) actions.style.display = 'none';
    const projectName = document.getElementById('project-name');
    const note = document.getElementById('student-submit-note');
    if (projectName) projectName.disabled = true;
    if (note) note.disabled = true;
  }

  static createStatusOverlay(title) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:${EDITOR_LAYER.dialog};
      display:flex;align-items:center;justify-content:center;font-family:Arial;
    `;
    overlay.innerHTML = `
      <div style="background:#2a2a2a;padding:24px;border-radius:8px;color:#fff;min-width:280px;text-align:center;">
        <p style="margin:0 0 12px;color:#4CAF50;">${title}</p>
        <div id="submission-status"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay._remove = () => overlay.remove();
    return overlay;
  }

  static async saveCloudDraft() {
    const projectName = document.getElementById('template-name')?.value?.trim();
    if (!projectName) {
      alert('Enter a template name in the Template Name field first.');
      return;
    }
    const studentNote = prompt('Optional note for this draft (or leave blank):') ?? '';
    const overlay = StudentSubmission.createStatusOverlay('☁️ Saving draft to cloud...');
    try {
      await StudentSubmission.submitProject(projectName, {
        studentNote,
        kind: 'draft',
        successMessage: 'Draft saved to cloud!',
      });
    } catch (_) {
      /* submitProject shows error in status */
    }
    setTimeout(() => overlay._remove && overlay._remove(), 2500);
  }

  static async submitProject(projectDisplayName, options = {}) {
    if (!projectDisplayName || !projectDisplayName.trim()) {
      alert('Please enter a project name!');
      return;
    }

    const projectName = projectDisplayName.trim();
    let studentName = projectName;

    try {
      const sessRes = await fetch('/api/student/session', { credentials: 'include' });
      const sess = await sessRes.json();
      if (sess.authRequired && !sess.authenticated) {
        alert('Please sign in before submitting your project.');
        return;
      }
      if (sess.authenticated && sess.student) {
        studentName = sess.student.displayName;
        window.currentStudent = sess.student;
      }
    } catch (_) {
      /* continue with project name */
    }

    const exportMode = await window.hotspotEditor.showExportModeDialog({
      title: 'Submit to Admin',
      description: 'Choose how media should be included in the package uploaded to admin.',
      defaultMode: window.hotspotEditor._getDefaultExportModeForProject(),
    });
    if (!exportMode) return;

    StudentSubmission.hideSubmissionFormControls();

    const statusDiv = document.getElementById('submission-status');
    const submitBtn = document.getElementById('submit-project-btn');
    const cancelBtn = document.getElementById('cancel-submission-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (statusDiv) statusDiv.innerHTML = '<p style="color: #4CAF50;">📦 Generating project...</p>';

    let submissionSucceeded = false;

    try {
      // Generate the complete project using existing export functionality
      if (!window.hotspotEditor) {
        throw new Error('Editor not initialized');
      }

      // Sanitize for zip/filename paths
      const safeProjectName = projectName.replace(/[^a-zA-Z0-9]/g, '_') || 'My_Project';

      // Create the project zip using the existing method
      const JSZip = window.JSZip || (await window.hotspotEditor.loadJSZip());
      const zip = new JSZip();

      // Get current skybox image
      const skyboxImg = document.querySelector('#main-panorama');
      const skyboxSrc = skyboxImg ? skyboxImg.src : '';

      // Add files to zip using existing method
      await window.hotspotEditor.addFilesToZip(zip, safeProjectName, skyboxSrc, exportMode);

      // Generate blob
      const content = await zip.generateAsync({ type: 'blob' });

      const studentNote = options.studentNote || '';
      const kind = options.kind || 'submitted';

      let prepareData = { fileName: null, b2Path: null, threadId: null, versionNumber: null };
      try {
        const prepRes = await fetch('/api/student/projects/prepare-upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName, kind, threadId: options.threadId || null }),
        });
        if (prepRes.status === 402) {
          const quota = await prepRes.json();
          throw new Error(quota.message || 'Usage limit reached.');
        }
        if (prepRes.ok) {
          prepareData = await prepRes.json();
        }
      } catch (prepErr) {
        if (prepErr.message && prepErr.message.includes('Usage limit')) throw prepErr;
      }

      if (statusDiv) {
        statusDiv.innerHTML = `
        <p style="color: #4CAF50; margin-bottom: 10px;">📤 Uploading to server...</p>
        <div style="
          width: 100%; height: 12px; background: #444; border-radius: 999px;
          overflow: hidden; border: 1px solid #555; margin: 8px 0 6px;
        ">
          <div id="submission-upload-fill" style="height: 100%; width: 0%; background: #4CAF50;"></div>
        </div>
        <div style="display:flex; justify-content: space-between; font-size: 12px; color: #ccc;">
          <span id="submission-upload-label">Uploading...</span>
          <span><span id="submission-upload-pct">0</span>%</span>
        </div>
      `;
      }

      const uploadFill = document.getElementById('submission-upload-fill');
      const uploadPct = document.getElementById('submission-upload-pct');
      const uploadLabel = document.getElementById('submission-upload-label');

      // Submit to server directly via B2
      const result = await new Promise(async (resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 3;

        try {
          const attemptUpload = async () => {
            attempts++;
            
            // 1. Get fresh B2 upload URL for EVERY attempt (B2 invalidates URLs after failed uploads)
            if (uploadLabel) {
               uploadLabel.textContent = attempts > 1 ? `Requesting fresh secure link (Attempt ${attempts})...` : 'Requesting secure upload link...';
            }
            
            let authData;
            try {
              const authRes = await fetch('/api/b2-upload-url', { credentials: 'include' });
              if (!authRes.ok) throw new Error('Could not get upload credentials');
              authData = await authRes.json();
              if (!authData.success) throw new Error(authData.message || 'B2 Auth failed');
            } catch (err) {
              return handleRetry(err);
            }

            const safeStudent = safeProjectName.replace(/[^a-zA-Z0-9]/g, '_') || 'project';
            const fileName = prepareData.fileName || `${safeStudent}_${Date.now()}.zip`;
            const remotePath =
              prepareData.b2Path ||
              prepareData.remotePath ||
              (authData.studentId && authData.classSlug
                ? `student-projects/${authData.classSlug}/${authData.studentId}/${fileName}`
                : `student-projects/${fileName}`);

            let xhr = new XMLHttpRequest();
            xhr.open('POST', authData.uploadUrl);
            
            // Backblaze B2 Upload requires these headers
            xhr.setRequestHeader('Authorization', authData.authorizationToken);
            // CRITICAL: Must use encodeURIComponent so '/' becomes '%2F' 
            xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(remotePath));
            xhr.setRequestHeader('Content-Type', 'application/zip');
            xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');

            xhr.upload.onprogress = (e) => {
              try {
                if (!e || !e.lengthComputable) return;
                const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
                if (uploadFill) uploadFill.style.width = pct + '%';
                if (uploadPct) uploadPct.textContent = String(pct);
                if (uploadLabel) {
                   uploadLabel.textContent = pct >= 100 
                     ? (attempts > 1 ? `Finalizing... (Attempt ${attempts})` : 'Finalizing...') 
                     : (attempts > 1 ? `Uploading to Cloud... (Attempt ${attempts})` : 'Uploading to Cloud...');
                }
              } catch (_) {
                /* ignore */
              }
            };

            const handleRetry = (err) => {
              // CRITICAL BUGFIX: Free up Chrome's internal memory immediately!
              if (xhr) {
                xhr.onload = xhr.onerror = xhr.onabort = xhr.upload.onprogress = null;
                try { xhr.abort(); } catch(e) {}
                xhr = null;
              }

              if (attempts < maxAttempts) {
                console.warn(`Upload failed (${err ? err.message : 'Unknown'}). Retrying... attempt ${attempts + 1}`);
                if (uploadLabel) uploadLabel.textContent = `Retrying upload... (${attempts}/${maxAttempts})`;
                setTimeout(attemptUpload, 2000);
              } else {
                reject(err || new Error('Upload failed after maximum retries'));
              }
            };

            xhr.onerror = () => handleRetry(new Error('Network error while uploading'));
            xhr.onabort = () => handleRetry(new Error('Upload aborted'));
            xhr.onload = async () => {
              try {
                const ok = xhr.status >= 200 && xhr.status < 300;
                const text = xhr.responseText || '';
                if (!ok) {
                  return handleRetry(new Error(`Cloud storage error (${xhr.status}: ${text})`));
                }
                
                // 3. Upload successful, notify backend metadata
                if (uploadLabel) uploadLabel.textContent = 'Logging submission...';
                const metaRes = await fetch(
                  kind === 'draft' ? '/api/student/projects/save-draft' : '/api/submit-project-meta',
                  {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    studentName,
                    projectName,
                    fileName,
                    remotePath,
                    studentNote,
                    threadId: prepareData.threadId || null,
                    versionNumber: prepareData.versionNumber || null,
                    kind,
                  })
                });
                
                if (metaRes.status === 402) {
                  const quota = await metaRes.json();
                  throw new Error(quota.message || 'Usage limit reached. Ask your teacher about upgrading.');
                }
                
                if (!metaRes.ok) throw new Error('Failed to log submission');
                const metaData = await metaRes.json();
                resolve(metaData);
              } catch (e) {
                reject(e);
              }
            };

            // 2. Send raw zip content/blob directly to B2
            xhr.send(content);
          };

          attemptUpload();
        } catch (err) {
          reject(err);
        }
      });

      if (result.success) {
        submissionSucceeded = true;
        if (statusDiv) {
        statusDiv.innerHTML = `
          <p style="color: #4CAF50;">✅ ${options.successMessage || 'Project submitted successfully!'}</p>
          <p style="color: #ccc; font-size: 0.9em;">File: ${result.fileName}</p>
          ${result.versionNumber ? `<p style="color: #ccc; font-size: 0.85em;">Version #${result.versionNumber}</p>` : ''}
          <button id="close-submission-dialog" style="
            background: #4CAF50; color: white; border: none; padding: 10px 20px;
            border-radius: 4px; cursor: pointer; margin-top: 10px;
          ">Close</button>
        `;
        }

        // Add event listener for the close button
        const closeBtn = document.getElementById('close-submission-dialog');
        if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          const dialog = this.closest('[style*="position: fixed"]');
          if (dialog) dialog.remove();
        });
        }
        if (window.StudentProjectsPanel) StudentProjectsPanel.refreshUnreadBadge();
      } else {
        throw new Error(result.message || 'Submission failed');
      }
    } catch (error) {
      console.error('Submission error:', error);
      if (statusDiv) {
      statusDiv.innerHTML = `
        <p style="color: #f44336;">❌ Submission failed</p>
        <p style="color: #ccc; font-size: 0.9em;">${error.message}</p>
        <p style="color: #ccc; font-size: 0.8em;">Make sure the server is running!</p>
      `;
      } else {
        alert('Submission failed: ' + error.message);
      }
    } finally {
      if (!submissionSucceeded) {
        const actions = document.getElementById('submit-project-actions');
        if (actions) actions.style.display = '';
        const projectName = document.getElementById('project-name');
        const note = document.getElementById('student-submit-note');
        if (projectName) projectName.disabled = false;
        if (note) note.disabled = false;
        const submitBtn2 = document.getElementById('submit-project-btn');
        const cancelBtn2 = document.getElementById('cancel-submission-btn');
        if (submitBtn2) submitBtn2.disabled = false;
        if (cancelBtn2) cancelBtn2.disabled = false;
      }
    }
  }
}

// Clear localStorage function
async function clearLocalStorage() {
  try {
    // Clear VR Hotspots specific data from localStorage
    localStorage.removeItem('vr-hotspot-scenes-data');
    localStorage.removeItem('vr-hotspot-css-styles');
    console.log('✅ Cleared VR Hotspots localStorage data');

    // Also clear IndexedDB stores for videos, images, audio, and models
    try {
      if (
        window.hotspotEditor &&
        typeof window.hotspotEditor.clearAllVideosFromIDB === 'function'
      ) {
        await window.hotspotEditor.clearAllVideosFromIDB();
      }
      if (
        window.hotspotEditor &&
        typeof window.hotspotEditor.clearAllImagesFromIDB === 'function'
      ) {
        await window.hotspotEditor.clearAllImagesFromIDB();
      }
      if (
        window.hotspotEditor &&
        typeof window.hotspotEditor.clearAllAudiosFromIDB === 'function'
      ) {
        await window.hotspotEditor.clearAllAudiosFromIDB();
      }
      if (
        window.hotspotEditor &&
        typeof window.hotspotEditor.clearAllModelsFromIDB === 'function'
      ) {
        await window.hotspotEditor.clearAllModelsFromIDB();
      }
      console.log('✅ Cleared IndexedDB videos, images, audio, and models');
    } catch (e) {
      console.warn('Warning: Failed to clear some IndexedDB stores', e);
    }

    // Show notification to user
    alert('Data cleared! The page will reload with fresh data.');
    window.location.reload();
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
}

// Initialize the editor when the page loads
const CommonAssetsPicker = {
  assets: {},
  activeCategory: 'images',
  assetSource: 'my',
  canManageStudentAssets: false,
  searchFilter: { tags: [], text: '' },
  tagFilterBar: null,
  targetFieldId: null,
  filterCategory: null,
  filterCategories: null,
  onSelect: null,
  armPlacementAfterSelect: false,

  FIELD_FILE_MAP: {
    'hotspot-audio-url': 'hotspot-audio',
    'hotspot-image-url': 'hotspot-image-file',
    'hotspot-model-url': 'hotspot-model-file',
    'global-sound-url': 'global-sound-file',
    'weblink-image-url': 'weblink-image-file',
  },

  FIELD_CATEGORY_MAP: {
    'hotspot-audio-url': 'audio',
    'hotspot-image-url': 'images',
    'hotspot-model-url': '3d',
    'global-sound-url': 'audio',
    'weblink-image-url': 'images',
  },

  updateSourceUi() {
    const uploadEl = document.getElementById('my-assets-upload');
    const introEl = document.getElementById('shared-assets-intro');
    const signInEl = document.getElementById('my-assets-signin-hint');
    const onMyAssets = this.assetSource === 'my';
    const canUpload = onMyAssets && this.canManageStudentAssets;
    if (uploadEl) uploadEl.style.display = canUpload ? 'block' : 'none';
    if (introEl) introEl.style.display = this.assetSource === 'shared' ? 'block' : 'none';
    if (signInEl) signInEl.style.display = onMyAssets && !this.canManageStudentAssets ? 'block' : 'none';
  },

  canEditTags() {
    return this.assetSource === 'my' && this.canManageStudentAssets;
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
    const storageKey =
      this.assetSource === 'my' ? 'asset-tag-filter:student' : 'asset-tag-filter:shared';
    this.tagFilterBar = AssetTagsUI.AssetTagFilterBar.create(mount, {
      theme: 'dark',
      placeholder: 'Filename...',
      storageKey,
      fetchRecentTags: async () => {
        if (picker.assetSource === 'my' && picker.canManageStudentAssets) {
          const res = await fetch('/api/student-assets/tags?sort=recent', {
            credentials: 'include',
          });
          const data = await res.json();
          if (data.success && data.tags?.length) return data.tags;
        }
        return picker.collectAllTagsFromAssets().slice(0, 8);
      },
      fetchAllTags: async () => {
        if (picker.assetSource === 'my' && picker.canManageStudentAssets) {
          const res = await fetch('/api/student-assets/tags?sort=alpha', {
            credentials: 'include',
          });
          const data = await res.json();
          if (data.success) return data.tags || [];
        }
        return picker.collectAllTagsFromAssets();
      },
      onChange: (state) => {
        picker.searchFilter = state;
        picker.render();
      },
    });
  },

  init() {
    const openBtn = document.getElementById('open-common-assets');
    const modal = document.getElementById('common-assets-modal');
    const closeBtn = document.getElementById('close-common-assets');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => this.openFor({}));
    closeBtn.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    document.getElementById('common-assets-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.ca-tab');
      if (!tab) return;
      const cat = tab.dataset.category;
      const visible = this.getVisibleCategories();
      if (!visible.includes(cat)) return;
      this.activeCategory = cat;
      this.renderTabs();
      this.render();
    });

    document.getElementById('common-assets-list').addEventListener('click', (e) => {
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
      if (btn.dataset.caAction === 'use') this.useUrl(asset);
      if (btn.dataset.caAction === 'tags') this.editAssetTags(asset);
      if (btn.dataset.caAction === 'delete') this.deleteStudentAsset(asset);
    });

    document.querySelectorAll('.btn-ca-browse').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openFor({
          targetFieldId: btn.dataset.caTarget,
          category: btn.dataset.caCategory,
        });
      });
    });

    document.querySelectorAll('.ca-source-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.assetSource = tab.dataset.source;
        document.querySelectorAll('.ca-source-tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.style.background = t === tab ? '#4caf50' : '#444';
        });
        this.updateSourceUi();
        this.initTagFilterBar();
        this.load();
      });
    });

    const uploadBtn = document.getElementById('student-asset-upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.uploadStudentAsset());
    }

    this.initTagFilterBar();
    this.updateSourceUi();
  },

  async uploadStudentAsset() {
    const fileInput = document.getElementById('student-asset-file');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      alert('Choose a file first');
      return;
    }
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('category', this.activeCategory);
    const tagsInput = document.getElementById('student-asset-tags');
    if (tagsInput && tagsInput.value.trim()) {
      fd.append('tags', tagsInput.value.trim());
    }
    try {
      const res = await fetch('/api/student-assets/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (res.status === 402) {
        alert('Storage limit reached. Ask your teacher about upgrading.');
        return;
      }
      if (!data.success) throw new Error(data.message || 'Upload failed');
      fileInput.value = '';
      if (tagsInput) tagsInput.value = '';
      await this.load();
    } catch (err) {
      alert(err.message || 'Upload failed');
    }
  },

  getVisibleCategories() {
    if (this.filterCategories && this.filterCategories.length) return this.filterCategories;
    if (this.filterCategory) return [this.filterCategory];
    return ['images', 'videos', '360-images', '360-videos', 'audio', '3d', 'other'];
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

  async openFor({
    targetFieldId = null,
    category = null,
    categories = null,
    onSelect = null,
    armPlacementAfterSelect = null,
  } = {}) {
    this.targetFieldId = targetFieldId;
    this.armPlacementAfterSelect = armPlacementAfterSelect ?? Boolean(targetFieldId);
    this.filterCategories = Array.isArray(categories) && categories.length ? categories : null;
    this.filterCategory = this.filterCategories ? null : category;
    this.onSelect = typeof onSelect === 'function' ? onSelect : null;
    if (this.filterCategories) {
      this.activeCategory = this.filterCategories[0];
    } else if (category) {
      this.activeCategory = category;
    } else {
      const editor = window.hotspotEditor;
      const type = editor ? editor.selectedHotspotType : 'text';
      if (type === 'audio' || type === 'text-audio') this.activeCategory = 'audio';
      else if (type === 'image') {
        const editor = window.hotspotEditor;
        this.activeCategory =
          editor && typeof editor.getImageMediaKind === 'function' && editor.getImageMediaKind() === 'video'
            ? 'videos'
            : 'images';
      }
      else if (type === 'model') this.activeCategory = '3d';
    }
    this.renderTabs();
    this.updateSourceUi();
    this.initTagFilterBar();
    if (this.tagFilterBar) this.tagFilterBar.clear();
    showAssetLibraryModal();
    await this.load();
  },

  close() {
    const modal = document.getElementById('common-assets-modal');
    modal.style.display = 'none';
    modal.style.zIndex = '';
    this.targetFieldId = null;
    this.onSelect = null;
    this.armPlacementAfterSelect = false;
    this.filterCategory = null;
    this.filterCategories = null;
    this.onSelect = null;
    this.renderTabs();
  },

  async load() {
    const list = document.getElementById('common-assets-list');
    list.innerHTML = '<p style="color:#ccc;text-align:center;">Loading...</p>';
    try {
      if (this.assetSource === 'my') {
        const res = await fetch('/api/student-assets', { credentials: 'include' });
        if (res.status === 401) {
          this.canManageStudentAssets = false;
          this.assetSource = 'shared';
          document.querySelectorAll('.ca-source-tab').forEach((t) => {
            const active = t.dataset.source === 'shared';
            t.classList.toggle('active', active);
            t.style.background = active ? '#4caf50' : '#444';
          });
          this.updateSourceUi();
          return this.load();
        }
        this.canManageStudentAssets = true;
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load');
        this.assets = data.assets || {};
      } else {
        const res = await fetch('/api/common-assets');
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load');
        this.assets = data.assets || {};
      }
      this.updateSourceUi();
      this.initTagFilterBar();
      if (this.tagFilterBar) this.tagFilterBar.refreshTagLists();
      this.render();
    } catch (err) {
      list.innerHTML =
        '<p style="color:#f44336;text-align:center;padding:16px;">' +
        (err.message.includes('fetch') || err.message.includes('Failed')
          ? 'API server not running. Run <strong>npm run dev</strong> (starts Express + Vite) and reload.'
          : err.message) +
        '</p>';
    }
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

  async editAssetTags(asset) {
    if (!window.AssetTagsUI || !this.canEditTags()) return;
    const cat = asset.category || this.activeCategory;
    await AssetTagsUI.openEditTagsModal({
      assetName: asset.name,
      tags: asset.tags || [],
      onSave: async (tags) => {
        const res = await fetch(
          `/api/student-assets/${encodeURIComponent(cat)}/${encodeURIComponent(asset.name)}/tags`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags }),
          }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to save tags');
        asset.tags = data.tags || [];
        const listAsset = (this.assets[cat] || []).find((a) => a.name === asset.name);
        if (listAsset) listAsset.tags = asset.tags;
        this.render();
        return true;
      },
    });
  },

  openPreview(asset) {
    const items = this.getFilteredItems();
    const index = items.findIndex((a) => a.name === asset.name);
    const cat = asset.category || this.activeCategory;
    if (!window.AssetPreview) return;
    const canEditTags = this.canEditTags();
    AssetPreview.open({
      category: cat,
      asset: { ...asset, category: cat },
      items: items.map((a) => ({ ...a, category: a.category || this.activeCategory })),
      index: index >= 0 ? index : 0,
      showSelect: true,
      showEditTags: canEditTags,
      replaceHost: '#common-assets-modal',
      onSelect: (selected) => this.useUrl(selected),
      onEditTags: (selected) => {
        AssetPreview.close({ restoreHost: true });
        this.editAssetTags(selected);
      },
    });
  },

  render() {
    const list = document.getElementById('common-assets-list');
    let items = this.getFilteredItems();
    if (!items.length) {
      if (this.canEditTags()) {
        list.innerHTML =
          '<p style="color:#888;text-align:center;padding:20px;">No files in this category yet. Use the upload section above to add a file and tags.</p>';
      } else if (this.assetSource === 'my') {
        list.innerHTML =
          '<p style="color:#888;text-align:center;padding:20px;">Sign in to upload your own files and add tags.</p>';
      } else {
        list.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">No assets found.</p>';
      }
      return;
    }
    list.innerHTML = items
      .map((asset) => {
        const cat = asset.category || this.activeCategory;
        const icon = window.CommonAssetsPreview
          ? CommonAssetsPreview.renderPickerThumb(cat, asset)
          : `<div class="ca-item-thumb ca-item-thumb-fallback">📄</div>`;
        const tagChips = window.AssetTagsUI ? AssetTagsUI.renderTagChips(asset.tags) : '';
        const tagsBtn = this.canEditTags()
            ? `<button data-ca-action="tags" data-name="${asset.name}" class="btn-tags-edit">Edit Tags</button>`
            : '';
        return `<div class="ca-item">
          ${icon}
          <div class="ca-item-info"><div class="ca-item-name">${asset.name}</div>${tagChips}</div>
          <div class="ca-item-actions">
            ${tagsBtn}
            <button data-ca-action="preview" data-name="${asset.name}" class="btn-preview-ca">Preview</button>
            <button data-ca-action="copy" data-name="${asset.name}" style="background:#6f42c1;color:#fff;">Copy</button>
            <button data-ca-action="use" data-name="${asset.name}" style="background:#4caf50;color:#fff;">Select</button>
            ${this.canEditTags() ? `<button data-ca-action="delete" data-name="${asset.name}" style="background:#f44336;color:#fff;">Delete</button>` : ''}
          </div>
        </div>`;
      })
      .join('');
  },

  async deleteStudentAsset(asset) {
    if (!confirm(`Delete ${asset.name}?`)) return;
    const cat = asset.category || this.activeCategory;
    const res = await fetch(
      `/api/student-assets/${encodeURIComponent(cat)}/${encodeURIComponent(asset.name)}`,
      { method: 'DELETE', credentials: 'include' }
    );
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Delete failed');
      return;
    }
    await this.load();
  },

  async copyUrl(url) {
    await navigator.clipboard.writeText(url);
    alert('URL copied to clipboard!');
  },

  applyToField(targetId, asset) {
    const expectedCategory = this.FIELD_CATEGORY_MAP[targetId];
    if (expectedCategory && asset.category !== expectedCategory) {
      alert(`That asset is not compatible with this field. Choose a ${expectedCategory} file.`);
      return false;
    }

    const el = document.getElementById(targetId);
    if (!el) return false;

    const editor = window.hotspotEditor;
    el.value = asset.proxyUrl || asset.url;
    if (editor) {
      editor._skipClearCommonAssetDataset = true;
      editor.setCommonAssetDataset(el, asset);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (editor) editor._skipClearCommonAssetDataset = false;

    const fileInputId = this.FIELD_FILE_MAP[targetId];
    if (fileInputId) {
      const fileInput = document.getElementById(fileInputId);
      if (fileInput) fileInput.value = '';
    }

    return true;
  },

  resolveTargetFieldId(asset) {
    if (this.targetFieldId) return this.targetFieldId;

    const editor = window.hotspotEditor;
    const type = editor ? editor.selectedHotspotType : 'text';

    if (asset.category === 'audio') {
      if (type === 'text' || type === 'navigation' || type === 'weblink') return 'global-sound-url';
      return 'hotspot-audio-url';
    }
    if (asset.category === 'images') {
      if (type === 'weblink') return 'weblink-image-url';
      return 'hotspot-image-url';
    }
    if (asset.category === '3d') {
      return 'hotspot-model-url';
    }
    return null;
  },

  useUrl(asset) {
    if (this.onSelect) {
      const handler = this.onSelect;
      this.close();
      handler(asset);
      return;
    }

    const targetId = this.resolveTargetFieldId(asset);
    if (!targetId) {
      this.copyUrl(asset.url);
      return;
    }

    if (this.applyToField(targetId, asset)) {
      const placementFields = [
        'hotspot-audio-url',
        'hotspot-image-url',
        'hotspot-model-url',
        'global-sound-url',
        'weblink-image-url',
      ];
      const shouldArm =
        this.armPlacementAfterSelect || placementFields.includes(targetId);
      this.close();
      if (shouldArm && window.hotspotEditor) {
        window.hotspotEditor.armHotspotPlacement();
      }
    } else {
      this.copyUrl(asset.url);
    }
  },
};

window.CommonAssetsPicker = CommonAssetsPicker;

document.addEventListener('DOMContentLoaded', () => {
  CommonAssetsPicker.init();
  const urlParams = new URLSearchParams(window.location.search);
  const adminReview = urlParams.get('adminReview') === '1';
  const reviewVersionId = urlParams.get('versionId');

  const startEditor = () => {
    setTimeout(() => {
      window.hotspotEditor = new HotspotEditor();
      if (adminReview && reviewVersionId) {
        AdminReviewMode.init(reviewVersionId);
      } else if (window.StudentProjectsPanel) {
        StudentProjectsPanel.bind();
      }
    }, 1000);
  };

  if (adminReview) {
    AdminReviewMode.checkAdminAndStart(startEditor);
    return;
  }

  if (typeof requireStudentSession === 'function') {
    requireStudentSession('student-login-gate', (student) => {
      window.currentStudent = student;
      if (student && window.StudentProjectsPanel) {
        const subsBtn = document.getElementById('student-my-submissions-btn');
        const cloudBtn = document.getElementById('save-cloud-draft');
        if (subsBtn) subsBtn.style.display = '';
        if (cloudBtn) cloudBtn.style.display = '';
      }
      startEditor();
    });
  } else {
    startEditor();
  }
});
