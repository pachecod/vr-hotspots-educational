/**
 * Shared upload helpers for admin common-assets (Assets page + template editor modal).
 */
(function (global) {
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  async function pollUploadJob(jobId, onUpdate) {
    if (typeof global.adminFetch !== 'function') {
      throw new Error('Admin session is not available');
    }
    for (let i = 0; i < 1200; i++) {
      const res = await global.adminFetch(`/admin/common-assets/upload-jobs/${jobId}`);
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

  function resolveElements(ids) {
    const get = (key, fallback) => {
      const id = ids[key] || fallback;
      return id ? document.getElementById(id) : null;
    };
    return {
      zone: get('zone', 'upload-zone'),
      fileInput: get('fileInput', 'file-input'),
      browseBtn: get('browseBtn', 'browse-btn'),
      toggleBtn: get('toggleBtn', 'upload-common-toggle'),
      status: get('status', 'upload-status'),
      tagsInput: get('tagsInput', 'upload-tags-input'),
      getProgressEls: () => ({
        panel: get('panel', 'upload-progress-panel'),
        uploadLabel: get('uploadLabel', 'upload-bytes-label'),
        uploadPct: get('uploadPct', 'upload-bytes-pct'),
        uploadFill: get('uploadFill', 'upload-bytes-fill'),
        transcodeStep: get('transcodeStep', 'transcode-progress-step'),
        transcodeLabel: get('transcodeLabel', 'transcode-phase-label'),
        transcodePct: get('transcodePct', 'transcode-phase-pct'),
        transcodeFill: get('transcodeFill', 'transcode-phase-fill'),
      }),
    };
  }

  function createUploadController(options) {
    const { getActiveCategory, onSuccess, ids = {} } = options;
    const els = resolveElements(ids);

    function resetUploadProgress() {
      const progress = els.getProgressEls();
      if (!progress.panel) return;
      progress.panel.classList.remove('is-active');
      if (progress.uploadFill) {
        progress.uploadFill.style.width = '0%';
        progress.uploadFill.classList.remove('is-indeterminate');
      }
      if (progress.transcodeFill) {
        progress.transcodeFill.style.width = '0%';
        progress.transcodeFill.classList.remove('is-indeterminate');
      }
      if (progress.transcodeStep) progress.transcodeStep.style.display = 'none';
      if (progress.uploadLabel) progress.uploadLabel.textContent = 'Uploading file…';
      if (progress.uploadPct) progress.uploadPct.textContent = '0%';
      if (progress.transcodeLabel) progress.transcodeLabel.textContent = 'Compressing video…';
      if (progress.transcodePct) progress.transcodePct.textContent = '0%';
    }

    function showUploadByteProgress(file, loaded, total) {
      const progress = els.getProgressEls();
      if (!progress.panel) return;
      progress.panel.classList.add('is-active');
      const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      if (progress.uploadFill) progress.uploadFill.style.width = `${pct}%`;
      if (progress.uploadPct) progress.uploadPct.textContent = `${pct}%`;
      if (progress.uploadLabel) {
        progress.uploadLabel.textContent =
          total > 0
            ? `Uploading ${file.name} (${formatBytes(loaded)} / ${formatBytes(total)})`
            : `Uploading ${file.name}…`;
      }
    }

    function showTranscodeProgress(job) {
      const progress = els.getProgressEls();
      if (!progress.panel || !progress.transcodeStep) return;
      progress.transcodeStep.style.display = 'block';
      if (progress.uploadFill) progress.uploadFill.style.width = '100%';
      if (progress.uploadPct) progress.uploadPct.textContent = '100%';
      if (progress.uploadLabel) progress.uploadLabel.textContent = 'Upload complete';

      const phase = job.phase || 'transcoding';
      const pct = typeof job.transcodePercent === 'number' ? job.transcodePercent : 0;
      const message = job.message || 'Compressing video…';

      if (progress.transcodeLabel) progress.transcodeLabel.textContent = message;
      if (progress.transcodeFill) {
        progress.transcodeFill.classList.remove('is-indeterminate');
        if (phase === 'transcoding' && pct <= 0) {
          progress.transcodeFill.classList.add('is-indeterminate');
          if (progress.transcodePct) progress.transcodePct.textContent = '…';
        } else if (phase === 'storing') {
          progress.transcodeFill.style.width = '100%';
          if (progress.transcodePct) progress.transcodePct.textContent = '100%';
        } else {
          progress.transcodeFill.style.width = `${Math.max(pct, phase === 'done' ? 100 : 0)}%`;
          if (progress.transcodePct) progress.transcodePct.textContent = `${Math.max(pct, 0)}%`;
        }
      }
    }

    function describeUploadResult(fileName, asset, category) {
      if (asset?.transcoded && asset.originalSize && asset.size) {
        return `Uploaded ${fileName} — compressed ${formatBytes(asset.originalSize)} → ${formatBytes(asset.size)}`;
      }
      if (category === '360-videos') {
        return `Uploaded ${fileName} (${formatBytes(asset?.size || 0)}) — stored original (compression not applied)`;
      }
      return `Uploaded ${fileName}`;
    }

    async function uploadFiles(fileList) {
      const status = els.status;
      const tagsInput = els.tagsInput;
      const uploadTags = tagsInput && tagsInput.value.trim() ? tagsInput.value.trim() : '';
      const files = Array.from(fileList || []);
      if (!files.length) return { hadSuccess: false, hadFailure: false };

      const activeCategory = getActiveCategory();
      let hadFailure = false;
      let hadSuccess = false;

      resetUploadProgress();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.size) {
          if (status) status.textContent = `Skipped ${file.name}: file is empty (0 bytes).`;
          hadFailure = true;
          continue;
        }

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
        if (isVideo && activeCategory !== '360-videos' && activeCategory !== 'videos') {
          if (status) {
            status.textContent = `Select the Flat Videos or 360 Videos tab before uploading ${file.name}.`;
          }
          hadFailure = true;
          continue;
        }

        resetUploadProgress();
        if (status) status.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}...`;
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
            if (status) status.textContent = `Failed: ${file.name} — ${data.message}`;
            hadFailure = true;
            continue;
          }

          let asset = data.asset || null;

          if (data.async && data.jobId) {
            if (status) status.textContent = `Upload finished — compressing ${file.name}…`;
            const jobResult = await pollUploadJob(data.jobId, showTranscodeProgress);
            asset = jobResult.asset || null;
          }

          if (status) {
            status.textContent = asset
              ? describeUploadResult(file.name, asset, activeCategory)
              : `Uploaded ${file.name}`;
          }
          hadSuccess = true;
        } catch (err) {
          if (err.code === 'AUTH_REQUIRED') throw err;
          if (status) status.textContent = `Failed: ${file.name} — ${err.message}`;
          hadFailure = true;
        }
      }

      if (hadSuccess) {
        if (status) {
          status.textContent = hadFailure
            ? 'Some uploads finished. Refreshing list…'
            : 'Upload complete. Refreshing list…';
        }
        if (typeof onSuccess === 'function') {
          await onSuccess();
        }
        if (status && !hadFailure) status.textContent = 'Upload complete.';
      }

      resetUploadProgress();

      if (tagsInput) tagsInput.value = '';
      setTimeout(() => {
        if (!hadFailure && status) status.textContent = '';
      }, 4000);

      return { hadSuccess, hadFailure };
    }

    function setup() {
      const { zone, fileInput, browseBtn, toggleBtn } = els;
      if (!zone || !fileInput) return;

      browseBtn?.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        uploadFiles(fileInput.files).catch((err) => {
          if (err.code === 'AUTH_REQUIRED') location.reload();
          else alert(err.message || 'Upload failed');
        });
        fileInput.value = '';
      });

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        uploadFiles(e.dataTransfer.files).catch((err) => {
          if (err.code === 'AUTH_REQUIRED') location.reload();
          else alert(err.message || 'Upload failed');
        });
      });

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const open = !zone.classList.contains('is-open');
          zone.classList.toggle('is-open', open);
          toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
    }

    return { uploadFiles, setup, resetUploadProgress };
  }

  global.AdminCommonAssetUpload = {
    formatBytes,
    createUploadController,
  };
})(window);
