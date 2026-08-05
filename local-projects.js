/**
 * Guest "Save Locally" library — multi-project snapshots in IndexedDB.
 * Signed-in users may only list/open existing local leftovers (no Save Locally).
 */
(function (global) {
  const LOCAL_PROJECTS_STORE = 'localProjects';
  const LOCAL_PROJECTS_MAX = 8;
  const LAST_OPENED_LOCAL_KEY = 'vr-hotspot-last-opened-local-id';
  const TEMPLATE_NAME_FROM_LOCAL_KEY = 'vr-hotspot-template-name-from-local';
  const SCENES_KEY = 'vr-hotspot-scenes-data';
  const CSS_KEY = 'vr-hotspot-css-styles';
  const FLAT_KEY = 'vr-flat-pages-data';

  function dialogZ() {
    return (global.EDITOR_LAYER && global.EDITOR_LAYER.dialog) || 10050;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function canSaveLocally() {
    return typeof global.getEditorCapabilities === 'function'
      ? !!global.getEditorCapabilities().canSaveLocally
      : global.editorAccessMode === 'local_test';
  }

  function isGuestOrStudent() {
    return (
      global.editorAccessMode === 'local_test' ||
      !!global.currentStudent
    );
  }

  function storageStoreForKey(key) {
    const k = String(key || '');
    if (k.startsWith('video_')) return 'videos';
    if (k.startsWith('audio_')) return 'audio';
    if (k.startsWith('model_')) return 'models';
    if (k.startsWith('image_') || k.startsWith('ground_')) return 'images';
    return 'images';
  }

  function collectStorageKeys(obj, out) {
    const set = out || new Set();
    if (!obj || typeof obj !== 'object') return set;
    if (Array.isArray(obj)) {
      obj.forEach((v) => collectStorageKeys(v, set));
      return set;
    }
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (k.endsWith('StorageKey') && typeof v === 'string' && v.trim()) {
        set.add(v.trim());
      } else if (v && typeof v === 'object') {
        collectStorageKeys(v, set);
      }
    });
    return set;
  }

  async function openDb() {
    const editor = global.hotspotEditor;
    if (editor && typeof editor.openVideoDB === 'function') {
      return editor.openVideoDB();
    }
    return new Promise((resolve) => {
      if (!('indexedDB' in global)) return resolve(null);
      const req = indexedDB.open('vr-hotspots', 5);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        ['videos', 'images', 'audio', 'models', LOCAL_PROJECTS_STORE].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'key' });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains(storeName)) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbPut(storeName, record) {
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbGetAll(storeName) {
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains(storeName)) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function idbClearStore(storeName) {
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function collectMediaRecords(scenesData) {
    const keys = collectStorageKeys(scenesData);
    const media = [];
    for (const key of keys) {
      const store = storageStoreForKey(key);
      const rec = await idbGet(store, key);
      if (rec && rec.blob) {
        media.push({
          store,
          key: rec.key,
          name: rec.name || key,
          type: rec.type || '',
          size: rec.size || 0,
          blob: rec.blob,
        });
      }
    }
    return media;
  }

  function readActiveWorkspace() {
    let scenesData = null;
    let cssStyles = '';
    let flatPages = null;
    try {
      const raw = localStorage.getItem(SCENES_KEY);
      if (raw) scenesData = JSON.parse(raw);
    } catch (_) {}
    try {
      cssStyles = localStorage.getItem(CSS_KEY) || '';
    } catch (_) {}
    try {
      const flatRaw = localStorage.getItem(FLAT_KEY);
      if (flatRaw) flatPages = JSON.parse(flatRaw);
    } catch (_) {}
    if (
      scenesData &&
      !scenesData.flatPages &&
      flatPages &&
      global.flatPageEditor &&
      typeof global.flatPageEditor.getConfigPayload === 'function'
    ) {
      try {
        scenesData.flatPages = global.flatPageEditor.getConfigPayload();
      } catch (_) {}
    } else if (scenesData && !scenesData.flatPages && flatPages) {
      scenesData.flatPages = flatPages;
    }
    return { scenesData, cssStyles, flatPages };
  }

  function defaultProjectName() {
    const nameInput = document.getElementById('template-name');
    if (nameInput && nameInput.value.trim()) return nameInput.value.trim();
    try {
      const raw = localStorage.getItem(SCENES_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.currentScene) return String(data.currentScene);
        if (data.spherical && data.spherical.currentScene) {
          return String(data.spherical.currentScene);
        }
      }
    } catch (_) {}
    return `Local project ${new Date().toLocaleString()}`;
  }

  function hasMeaningfulWorkspace() {
    const { scenesData } = readActiveWorkspace();
    if (!scenesData) return false;
    const scenes = (scenesData.spherical && scenesData.spherical.scenes) || scenesData.scenes;
    if (scenes && typeof scenes === 'object' && Object.keys(scenes).length > 0) return true;
    if (scenesData.flatPages) return true;
    return false;
  }

  const LocalProjects = {
    MAX: LOCAL_PROJECTS_MAX,

    rememberOpenedId(id) {
      if (!id) return;
      try {
        sessionStorage.setItem(LAST_OPENED_LOCAL_KEY, String(id));
      } catch (_) {}
    },

    getLastOpenedId() {
      try {
        return sessionStorage.getItem(LAST_OPENED_LOCAL_KEY);
      } catch (_) {
        return null;
      }
    },

    clearLastOpenedId() {
      try {
        sessionStorage.removeItem(LAST_OPENED_LOCAL_KEY);
      } catch (_) {}
    },

    applyTemplateNameToEditor() {
      try {
        const fromLocal = sessionStorage.getItem(TEMPLATE_NAME_FROM_LOCAL_KEY);
        if (!fromLocal) return;
        const nameInput = document.getElementById('template-name');
        if (nameInput) nameInput.value = fromLocal;
        sessionStorage.removeItem(TEMPLATE_NAME_FROM_LOCAL_KEY);
      } catch (_) {}
    },

    /**
     * Best-effort link between the active editor session and a local IndexedDB row
     * before cloud save (guest → sign-in often skips open/save after tracking was added).
     */
    async ensureTrackedForCloudSave(projectName) {
      if (this.getLastOpenedId()) return;
      const list = await this.list();
      if (!list.length) return;
      if (list.length === 1) {
        this.rememberOpenedId(list[0].id);
        return;
      }
      const needle = String(projectName || '').trim().toLowerCase();
      if (!needle) return;
      const match = list.find((p) => String(p.name || '').trim().toLowerCase() === needle);
      if (match) this.rememberOpenedId(match.id);
    },

    /**
     * After a successful cloud draft save, drop the matching IndexedDB local copy
     * (tracked open/save id first, then case-insensitive name match, then sole local row).
     */
    async removeAfterCloudSave(projectName) {
      await this.ensureTrackedForCloudSave(projectName);
      const list = await this.list();
      let id = this.getLastOpenedId();
      if (!id && projectName) {
        const needle = String(projectName).trim().toLowerCase();
        const match = list.find((p) => String(p.name || '').trim().toLowerCase() === needle);
        if (match) id = match.id;
      }
      if (!id && list.length === 1) {
        id = list[0].id;
      }
      if (!id) return false;
      const rec = await this.get(id);
      if (!rec) {
        this.clearLastOpenedId();
        return false;
      }
      await this.remove(id);
      this.clearLastOpenedId();
      return true;
    },

    async list() {
      const rows = await idbGetAll(LOCAL_PROJECTS_STORE);
      return rows
        .map((r) => ({
          id: r.id || r.key,
          key: r.key,
          name: r.name || 'Untitled',
          updatedAt: r.updatedAt || 0,
        }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    async count() {
      const list = await this.list();
      return list.length;
    },

    async get(id) {
      return idbGet(LOCAL_PROJECTS_STORE, id);
    },

    async saveCurrent(name, existingId) {
      if (!canSaveLocally()) {
        throw new Error('Save Locally is only available in guest mode.');
      }
      const editor = global.hotspotEditor;
      if (editor && typeof editor.saveScenesData === 'function') {
        editor.saveScenesData();
      }
      if (editor && typeof editor.saveCSSToLocalStorage === 'function') {
        try {
          editor.saveCSSToLocalStorage();
        } catch (_) {}
      }
      if (global.flatPageEditor && typeof global.flatPageEditor.save === 'function') {
        try {
          global.flatPageEditor.save();
        } catch (_) {}
      }

      const { scenesData, cssStyles, flatPages } = readActiveWorkspace();
      if (!scenesData && !flatPages) {
        throw new Error('Nothing to save yet. Add a scene or flat page first.');
      }

      const list = await this.list();
      if (!existingId && list.length >= LOCAL_PROJECTS_MAX) {
        throw new Error(
          `You can save up to ${LOCAL_PROJECTS_MAX} local projects. Delete one from My Local Projects first.`
        );
      }

      const id = existingId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const media = await collectMediaRecords(scenesData || {});
      const record = {
        key: id,
        id,
        name: String(name || defaultProjectName()).trim() || defaultProjectName(),
        updatedAt: Date.now(),
        scenesData,
        cssStyles: cssStyles || '',
        flatPages: flatPages || (scenesData && scenesData.flatPages) || null,
        media,
      };
      const ok = await idbPut(LOCAL_PROJECTS_STORE, record);
      if (!ok) {
        try {
          if (global.ErrorReporter && typeof global.ErrorReporter.reportCaught === 'function') {
            global.ErrorReporter.reportCaught(
              global.ErrorReporter.CODES.LOCAL_PROJECT_SAVE_FAILED,
              'Browser storage is full or unavailable for local project save',
              { projectId: id, projectName: record.name },
              'error'
            );
          }
        } catch (_) {
          /* ignore */
        }
        throw new Error('Browser storage is full or unavailable. Try removing media or projects.');
      }
      this.rememberOpenedId(id);
      try {
        const nameInput = document.getElementById('template-name');
        if (nameInput) nameInput.value = record.name;
      } catch (_) {}
      await this.refreshButtonVisibility();
      return record;
    },

    async rename(id, name) {
      const rec = await this.get(id);
      if (!rec) throw new Error('Project not found.');
      rec.name = String(name || '').trim() || rec.name;
      rec.updatedAt = Date.now();
      await idbPut(LOCAL_PROJECTS_STORE, rec);
      await this.refreshButtonVisibility();
    },

    async remove(id) {
      await idbDelete(LOCAL_PROJECTS_STORE, id);
      await this.refreshButtonVisibility();
    },

    async clearAll() {
      await idbClearStore(LOCAL_PROJECTS_STORE);
      await this.refreshButtonVisibility();
    },

    async open(id) {
      const rec = await this.get(id);
      if (!rec) throw new Error('Project not found.');

      // Replace active media with snapshot media (leave localProjects alone).
      await idbClearStore('videos');
      await idbClearStore('images');
      await idbClearStore('audio');
      await idbClearStore('models');

      for (const item of rec.media || []) {
        if (!item || !item.key || !item.blob) continue;
        const store = item.store || storageStoreForKey(item.key);
        await idbPut(store, {
          key: item.key,
          name: item.name || item.key,
          type: item.type || '',
          size: item.size || 0,
          updated: Date.now(),
          blob: item.blob,
        });
      }

      try {
        if (rec.scenesData) {
          localStorage.setItem(SCENES_KEY, JSON.stringify(rec.scenesData));
        } else {
          localStorage.removeItem(SCENES_KEY);
        }
        if (rec.cssStyles) {
          localStorage.setItem(CSS_KEY, rec.cssStyles);
        } else {
          localStorage.removeItem(CSS_KEY);
        }
        const flat = rec.flatPages || (rec.scenesData && rec.scenesData.flatPages) || null;
        if (flat) {
          localStorage.setItem(FLAT_KEY, JSON.stringify(flat));
        } else {
          localStorage.removeItem(FLAT_KEY);
        }
      } catch (e) {
        try {
          if (global.ErrorReporter && typeof global.ErrorReporter.reportCaught === 'function') {
            global.ErrorReporter.reportCaught(
              global.ErrorReporter.CODES.LOCAL_PROJECT_SAVE_FAILED,
              'Could not write opened local project into browser storage',
              { error: e, projectId: id },
              'error'
            );
          }
        } catch (_) {
          /* ignore */
        }
        throw new Error('Could not write project to browser storage.');
      }

      this.rememberOpenedId(id);
      try {
        if (rec.name) {
          sessionStorage.setItem(TEMPLATE_NAME_FROM_LOCAL_KEY, String(rec.name));
        }
      } catch (_) {}
      global.location.reload();
    },

    async promptSave() {
      if (!canSaveLocally()) {
        alert('Sign in uses cloud save. Save Locally is for guest mode.');
        return;
      }
      if (!hasMeaningfulWorkspace()) {
        alert('Nothing to save yet. Add a scene or flat page first.');
        return;
      }

      const list = await this.list();
      const suggested = defaultProjectName();
      const name = window.prompt('Name for this local save:', suggested);
      if (name == null) return;
      const trimmed = String(name).trim();
      if (!trimmed) {
        alert('Please enter a name.');
        return;
      }

      const existing = list.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      let existingId = null;
      if (existing) {
        const overwrite = window.confirm(
          `"${existing.name}" already exists in My Local Projects. Overwrite it?`
        );
        if (!overwrite) return;
        existingId = existing.id;
      } else if (list.length >= LOCAL_PROJECTS_MAX) {
        alert(
          `You can save up to ${LOCAL_PROJECTS_MAX} local projects. Delete one from My Local Projects first.`
        );
        return;
      }

      try {
        await this.saveCurrent(trimmed, existingId);
        alert(`Saved locally as "${trimmed}". Open My Local Projects anytime to switch.`);
        await this.refreshButtonVisibility();
      } catch (e) {
        alert(e.message || 'Could not save locally.');
      }
    },

    async confirmDiscardIfNeeded(actionLabel) {
      if (!hasMeaningfulWorkspace()) return true;
      return window.confirm(
        `Opening this will replace your current unsaved editor work${actionLabel ? ` (${actionLabel})` : ''}. Continue?`
      );
    },

    async refreshButtonVisibility() {
      const guestBtn = document.getElementById('my-local-projects-btn');
      const studentBtn = document.getElementById('student-my-local-projects-btn');
      const guest = canSaveLocally();
      const count = await this.count().catch(() => 0);

      document.querySelectorAll('.save-locally-trigger').forEach((btn) => {
        btn.style.display = guest ? '' : 'none';
      });

      // Guests always see My Local Projects (empty state explains Save Locally).
      if (guestBtn) {
        guestBtn.style.display = global.editorAccessMode === 'local_test' ? '' : 'none';
        this._setCountBadge(guestBtn, count);
      }

      // Signed-in: only show when library is non-empty (no other flow changes).
      if (studentBtn) {
        const show = !!global.currentStudent && count > 0;
        studentBtn.style.display = show ? '' : 'none';
        this._setCountBadge(studentBtn, count);
      }
    },

    _setCountBadge(btn, count) {
      if (!btn) return;
      let badge = btn.querySelector('.local-projects-count');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'local-projects-count';
          badge.style.cssText =
            'margin-left:6px;background:#ff9800;color:#111;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:bold;';
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    },

    bind() {
      document.querySelectorAll('.save-locally-trigger').forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => this.promptSave());
      });

      const guestBtn = document.getElementById('my-local-projects-btn');
      if (guestBtn && guestBtn.dataset.bound !== '1') {
        guestBtn.dataset.bound = '1';
        guestBtn.addEventListener('click', () => this.show());
      }

      const studentBtn = document.getElementById('student-my-local-projects-btn');
      if (studentBtn && studentBtn.dataset.bound !== '1') {
        studentBtn.dataset.bound = '1';
        studentBtn.addEventListener('click', () => this.show());
      }

      this.refreshButtonVisibility();
    },

    async show() {
      if (!isGuestOrStudent() && global.editorAccessMode !== 'local_test') {
        // Still allow if somehow opened with leftovers while student session loads
      }
      const projects = await this.list();
      const guest = canSaveLocally();

      const dialog = document.createElement('div');
      dialog.id = 'my-local-projects-dialog';
      dialog.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:${dialogZ()};
        display:flex;align-items:center;justify-content:center;font-family:Arial;
      `;
      dialog.innerHTML = `
        <div style="background:#2a2a2a;color:#fff;border-radius:10px;padding:24px;max-width:640px;width:92%;max-height:85vh;overflow:auto;">
          <h3 style="margin:0 0 8px;color:#ff9800;">My Local Projects</h3>
          <p style="margin:0 0 16px;color:#aaa;font-size:13px;line-height:1.45;">
            Stored only in this browser (not on our servers).
            ${guest ? ' Use <strong>Save Locally</strong> to add projects.' : ' Open a project, then use cloud save or submit as usual.'}
          </p>
          <div id="my-local-projects-list"></div>
          <button type="button" id="close-my-local-projects" style="margin-top:16px;padding:10px 20px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>
        </div>`;
      document.body.appendChild(dialog);
      dialog.querySelector('#close-my-local-projects').addEventListener('click', () => dialog.remove());

      const list = dialog.querySelector('#my-local-projects-list');
      if (!projects.length) {
        list.innerHTML = guest
          ? '<p style="color:#aaa;">No local projects yet. Click <strong>Save Locally</strong> in the Template panel to keep a named copy, then switch between them here.</p>'
          : '<p style="color:#aaa;">No local projects in this browser.</p>';
        return;
      }

      list.innerHTML = projects
        .map((p) => {
          const when = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '';
          return `
          <div style="border:1px solid #555;border-radius:6px;padding:12px;margin-bottom:10px;" data-id="${escapeHtml(p.id)}">
            <strong>${escapeHtml(p.name)}</strong>
            <span style="color:#888;font-size:12px;margin-left:6px;">${escapeHtml(when)}</span>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-open="${escapeHtml(p.id)}" style="padding:6px 12px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Open</button>
              <button type="button" data-rename="${escapeHtml(p.id)}" style="padding:6px 12px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Rename</button>
              <button type="button" data-delete="${escapeHtml(p.id)}" style="padding:6px 12px;background:#c62828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Delete</button>
            </div>
          </div>`;
        })
        .join('');

      list.querySelectorAll('[data-open]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-open');
          const ok = await this.confirmDiscardIfNeeded('replace current work');
          if (!ok) return;
          try {
            dialog.remove();
            await this.open(id);
          } catch (e) {
            alert(e.message || 'Could not open local project.');
          }
        });
      });

      list.querySelectorAll('[data-rename]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-rename');
          const proj = projects.find((p) => p.id === id);
          const next = window.prompt('Rename project:', proj ? proj.name : '');
          if (next == null) return;
          const trimmed = String(next).trim();
          if (!trimmed) return;
          try {
            await this.rename(id, trimmed);
            dialog.remove();
            await this.show();
          } catch (e) {
            alert(e.message || 'Could not rename.');
          }
        });
      });

      list.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-delete');
          const proj = projects.find((p) => p.id === id);
          if (!window.confirm(`Delete local project "${proj ? proj.name : id}"? This cannot be undone.`)) {
            return;
          }
          try {
            await this.remove(id);
            dialog.remove();
            await this.show();
          } catch (e) {
            alert(e.message || 'Could not delete.');
          }
        });
      });
    },
  };

  global.LocalProjects = LocalProjects;
})(typeof window !== 'undefined' ? window : globalThis);
