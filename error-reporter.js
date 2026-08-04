/**
 * Client error reporter + project integrity checks.
 * Posts to /api/error-reports for the admin Error Log.
 */
(function (global) {
  const ENDPOINT = '/api/error-reports';
  const INTEGRITY_ENDPOINT = '/api/error-reports/project-integrity';
  const recent = new Map();
  const DEDUP_MS = 5 * 60 * 1000;

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
          code: 'unhandled_error',
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
          code: 'unhandled_rejection',
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
    reportError,
    reportProjectIntegrity,
    checkEditorProjectIntegrity,
    detectDuplicateHotspotLayouts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
