/**
 * Client error reporter + project integrity checks.
 * Posts to /api/error-reports for the admin Error Log.
 */
(function (global) {
  const ENDPOINT = '/api/error-reports';
  const INTEGRITY_ENDPOINT = '/api/error-reports/project-integrity';
  const recent = new Map();
  const DEDUP_MS = 5 * 60 * 1000;

  const CODES = {
    UNHANDLED_ERROR: 'unhandled_error',
    UNHANDLED_REJECTION: 'unhandled_rejection',
    CLIENT_ERROR: 'client_error',
    DUPLICATE_HOTSPOT_LAYOUTS: 'duplicate_hotspot_layouts',
    CLOUD_SUBMIT_FAILED: 'cloud_submit_failed',
    B2_DIRECT_UPLOAD_FAILED: 'b2_direct_upload_failed',
    B2_UPLOAD_META_ORPHAN: 'b2_upload_meta_orphan',
    PREPARE_UPLOAD_FAILED: 'prepare_upload_failed',
    LOCAL_PERSIST_QUOTA: 'local_persist_quota',
    IDB_MEDIA_SAVE_FAILED: 'idb_media_save_failed',
    SCENE_VIDEO_LOAD_FAILED: 'scene_video_load_failed',
    SCENE_VIDEO_MISSING_SOURCE: 'scene_video_missing_source',
    SCENE_PANORAMA_LOAD_FAILED: 'scene_panorama_load_failed',
    VIDEO_TEXTURE_BIND_FAILED: 'video_texture_bind_failed',
    HOTSPOT_MEDIA_LOAD_FAILED: 'hotspot_media_load_failed',
    REHYDRATE_MEDIA_INCOMPLETE: 'rehydrate_media_incomplete',
    SCENE_VIDEO_SERVER_UPLOAD_FALLBACK: 'scene_video_server_upload_fallback',
    EDITOR_VIDEO_COMPRESS_FAILED: 'editor_video_compress_failed',
    MOV_TRANSCODE_UNAVAILABLE: 'mov_transcode_unavailable',
    VIDEO_TRANSCODE_STORE_ORIGINAL: 'video_transcode_store_original',
    SESSION_REQUIRED_MID_FLOW: 'session_required_mid_flow',
    CLOUD_WRITE_AUTH_DENIED: 'cloud_write_auth_denied',
    B2_UPLOAD_URL_FAILED: 'b2_upload_url_failed',
    EXPORT_ZIP_FAILED: 'export_zip_failed',
    EXPORT_ASSET_MISSING: 'export_asset_missing',
    VR_CLOUD_PUBLISH_FAILED: 'vr_cloud_publish_failed',
    VR_CLOUD_PREVIEW_EXPIRED: 'vr_cloud_preview_expired',
    FLAT_PAGE_PUBLISH_FAILED: 'flat_page_publish_failed',
    FLAT_PAGE_B2_UPLOAD_FAILED: 'flat_page_b2_upload_failed',
    STUDENT_ASSET_UPLOAD_FAILED: 'student_asset_upload_failed',
    USAGE_QUOTA_BLOCKED: 'usage_quota_blocked',
    LOCAL_PROJECT_SAVE_FAILED: 'local_project_save_failed',
    ZIP_TEMPLATE_LOAD_FAILED: 'zip_template_load_failed',
  };

  function appVersion() {
    try {
      if (typeof APP_VERSION !== 'undefined') return APP_VERSION;
    } catch (_) {}
    return null;
  }

  function resolveUserName() {
    try {
      if (global.currentStudent && global.currentStudent.displayName) {
        return global.currentStudent.displayName;
      }
      if (global.currentStudent && global.currentStudent.username) {
        return global.currentStudent.username;
      }
      const nameInput = document.getElementById('template-name');
      if (nameInput && nameInput.value && nameInput.value.trim()) {
        return nameInput.value.trim();
      }
    } catch (_) {}
    return 'Guest / unknown';
  }

  function dedupKey(code, message) {
    return `${code}::${message}::${resolveUserName()}`;
  }

  function shouldSkip(code, message) {
    const key = dedupKey(code, message);
    const now = Date.now();
    const prev = recent.get(key);
    if (prev && now - prev < DEDUP_MS) return true;
    recent.set(key, now);
    return false;
  }

  async function reportError({
    code = 'client_error',
    message = 'Client error',
    level = 'error',
    source = 'client',
    details = {},
  } = {}) {
    try {
      if (shouldSkip(code, message)) return { deduplicated: true };
      const payload = {
        code,
        message: String(message).slice(0, 2000),
        level,
        source,
        userName: resolveUserName(),
        studentId: (global.currentStudent && global.currentStudent.id) || null,
        appVersion: appVersion(),
        path: typeof location !== 'undefined' ? location.pathname + location.search : null,
        details: details || {},
      };
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload),
      });
      return res.json().catch(() => ({ success: false }));
    } catch (err) {
      console.warn('[error-reporter] failed to send', err);
      return { success: false };
    }
  }

  /**
   * Fire-and-forget helper for caught product failures.
   * Normalizes HTTP 402 → usage_quota_blocked.
   */
  function reportCaught(code, message, details = {}, level = 'error') {
    try {
      let finalCode = code || CODES.CLIENT_ERROR;
      let finalLevel = level || 'error';
      const detailObj = details && typeof details === 'object' ? { ...details } : { value: details };
      const status = Number(detailObj.httpStatus || detailObj.status);
      if (status === 402 || finalCode === CODES.USAGE_QUOTA_BLOCKED) {
        finalCode = CODES.USAGE_QUOTA_BLOCKED;
        finalLevel = 'warning';
      }
      const msg =
        message ||
        (detailObj.error && detailObj.error.message) ||
        (typeof detailObj.error === 'string' ? detailObj.error : null) ||
        finalCode;
      if (detailObj.error && detailObj.error.stack && !detailObj.stack) {
        detailObj.stack = String(detailObj.error.stack).slice(0, 2000);
      }
      if (detailObj.error && typeof detailObj.error !== 'string') {
        detailObj.errorName = detailObj.error.name || null;
        detailObj.errorMessage = detailObj.error.message || String(detailObj.error);
        delete detailObj.error;
      }
      return reportError({
        code: finalCode,
        message: String(msg).slice(0, 2000),
        level: finalLevel,
        source: detailObj.source || 'client',
        details: detailObj,
      });
    } catch (_) {
      return Promise.resolve({ success: false });
    }
  }

  function hotspotFingerprint(h) {
    if (!h || typeof h !== 'object') return '';
    const img = typeof h.image === 'string' ? h.image.split(/[\\/]/).pop() : '';
    return [
      h.type || '',
      String(h.position || ''),
      String(h.text || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 120),
      h.navigationTarget || '',
      img || '',
    ].join('|');
  }

  function detectDuplicateHotspotLayouts(scenes) {
    if (!scenes) return { detected: false, groups: [] };
    const list = Array.isArray(scenes)
      ? scenes.map((sc, i) => [sc && sc.id ? sc.id : `scene_${i}`, sc])
      : Object.entries(scenes);
    const byFp = new Map();
    for (const [sid, sc] of list) {
      if (!sc || typeof sc !== 'object') continue;
      const hs = Array.isArray(sc.hotspots) ? sc.hotspots : [];
      if (!hs.length) continue;
      const fp = hs.map(hotspotFingerprint).filter(Boolean).join(';;');
      if (!fp) continue;
      if (!byFp.has(fp)) byFp.set(fp, []);
      byFp.get(fp).push({ sceneId: sid, sceneName: sc.name || sid, hotspotCount: hs.length });
    }
    const groups = [];
    for (const [fp, members] of byFp.entries()) {
      if (members.length > 1) {
        groups.push({
          layoutFingerprint: fp.slice(0, 240),
          sceneCount: members.length,
          scenes: members,
          sampleText: (fp.split(';;')[0] || '').split('|')[2] || '',
        });
      }
    }
    return { detected: groups.length > 0, groups, sceneCount: list.length };
  }

  async function reportProjectIntegrity(scenes, meta = {}) {
    try {
      const local = detectDuplicateHotspotLayouts(scenes);
      if (!local.detected) return { detected: false };

      const payload = {
        scenes,
        projectName: meta.projectName || null,
        trigger: meta.trigger || 'check',
        currentScene: meta.currentScene || null,
        source: meta.source || 'project-integrity',
        userName: resolveUserName(),
        studentId: (global.currentStudent && global.currentStudent.id) || null,
        appVersion: appVersion(),
      };
      const res = await fetch(INTEGRITY_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload),
      });
      return res.json().catch(() => ({ success: false, detected: true }));
    } catch (err) {
      console.warn('[error-reporter] integrity report failed', err);
      return { success: false };
    }
  }

  function checkEditorProjectIntegrity(trigger) {
    try {
      const ed = global.hotspotEditor;
      if (!ed || !ed.scenes) return Promise.resolve({ detected: false });
      const nameInput = document.getElementById('template-name');
      return reportProjectIntegrity(ed.scenes, {
        trigger,
        source: 'editor',
        projectName: (nameInput && nameInput.value) || ed._localWorkspaceMeta?.projectName || null,
        currentScene: ed.currentScene || null,
      });
    } catch (_) {
      return Promise.resolve({ detected: false });
    }
  }

  function installGlobalHandlers() {
    if (global.__errorReporterInstalled) return;
    global.__errorReporterInstalled = true;

    global.addEventListener('error', (event) => {
      try {
        const msg = event && event.message ? event.message : 'Unhandled error';
        reportError({
          code: CODES.UNHANDLED_ERROR,
          message: msg,
          level: 'error',
          source: 'window.onerror',
          details: {
            filename: event.filename || null,
            lineno: event.lineno || null,
            colno: event.colno || null,
            stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 2000) : null,
          },
        });
      } catch (_) {}
    });

    global.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event && event.reason;
        const message =
          reason && reason.message
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : 'Unhandled promise rejection';
        reportError({
          code: CODES.UNHANDLED_REJECTION,
          message: String(message).slice(0, 2000),
          level: 'error',
          source: 'unhandledrejection',
          details: {
            stack: reason && reason.stack ? String(reason.stack).slice(0, 2000) : null,
          },
        });
      } catch (_) {}
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installGlobalHandlers);
    } else {
      installGlobalHandlers();
    }
  }

  global.ErrorReporter = {
    CODES,
    reportError,
    reportCaught,
    reportProjectIntegrity,
    checkEditorProjectIntegrity,
    detectDuplicateHotspotLayouts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
