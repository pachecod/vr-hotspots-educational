/*
 * Flat Web Page editor (WebXRIDE-style) for the 360 Hotspot tool.
 *
 * This module adds a second content mode to the editor: a "Flat Web Page" that a
 * student authors with raw HTML / CSS / JavaScript and a live visual preview,
 * mirroring the WebXRIDE IDE (file tabs + code editor + iframe preview).
 *
 * It is intentionally dependency-free (no React / CodeMirror build step) so it keeps
 * working in every way the host app already runs: Vite dev, static Express hosting,
 * and even opening index.html directly offline. The host monolith (script.js) only
 * hooks into this module for mode switching, persistence, and export/import.
 *
 * Spherical (A-Frame) content and flat-page content are stored separately and never
 * overwrite each other; both travel together inside one exported/submitted project.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'vr-flat-pages-data';
  const PROJECT_VERSION = '2.5';
  const DEFAULT_PAGE_ID = 'main';
  const EXPORT_FOLDER = 'flat-pages';

  const FILE_DEFS = [
    { id: 'index.html', name: 'index.html', type: 'html', label: 'HTML' },
    { id: 'style.css', name: 'style.css', type: 'css', label: 'CSS' },
    { id: 'script.js', name: 'script.js', type: 'javascript', label: 'JS' },
    { id: 'config.json', name: 'config.json', type: 'json', label: 'Config' },
  ];

  const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Flat Web Page</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>My Flat Web Page</h1>
    <p>Edit the HTML, CSS, and JavaScript tabs and watch the preview update live.</p>
    <button id="hello">Click me</button>
  </main>
  <script src="script.js"></script>
</body>
</html>`;

  const DEFAULT_CSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8fafc;
  color: #1f2933;
  margin: 0;
}
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
  text-align: center;
}
h1 { color: #2563eb; }
button {
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
button:hover { background: #1d4ed8; }`;

  const DEFAULT_JS = `document.getElementById('hello')?.addEventListener('click', function () {
  alert('Hello from your flat web page!');
});`;

  function defaultFilesContent() {
    return {
      'index.html': DEFAULT_HTML,
      'style.css': DEFAULT_CSS,
      'script.js': DEFAULT_JS,
      'config.json': '{}',
    };
  }

  function createDefaultPage(name) {
    const content = defaultFilesContent();
    return {
      id: DEFAULT_PAGE_ID,
      name: name || 'Flat Web Page',
      framework: 'html',
      files: FILE_DEFS.map((def) => ({
        id: def.id,
        name: def.name,
        type: def.type,
        content: content[def.id] || '',
      })),
    };
  }

  function createDefaultProject() {
    return {
      version: PROJECT_VERSION,
      activePageId: DEFAULT_PAGE_ID,
      pages: { [DEFAULT_PAGE_ID]: createDefaultPage() },
    };
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  class FlatPageEditor {
    constructor() {
      this.project = createDefaultProject();
      this.activeFileId = 'index.html';
      this._mounted = false;
      this._visible = false;
      this._previewTimer = null;
      this._els = {};
      this._loadFromStorage();
    }

    /* ---------- persistence ---------- */
    _loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const normalized = this._normalizeProject(parsed);
        if (normalized) this.project = normalized;
      } catch (err) {
        console.warn('[FlatPage] Failed to load saved flat pages:', err);
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      } catch (err) {
        console.warn('[FlatPage] Failed to persist flat pages:', err);
      }
    }

    // Accept either the 2.5 project shape or a loose { files: [...] } object.
    _normalizeProject(input) {
      if (!input || typeof input !== 'object') return null;
      let pages = input.pages;
      // Loose single-page payload (e.g. a WebXRIDE-style Project)
      if (!pages && Array.isArray(input.files)) {
        pages = {
          [DEFAULT_PAGE_ID]: {
            id: DEFAULT_PAGE_ID,
            name: input.name || 'Flat Web Page',
            framework: input.framework || 'html',
            files: input.files,
          },
        };
      }
      if (!pages || typeof pages !== 'object') return null;

      const cleanPages = {};
      Object.keys(pages).forEach((pageId) => {
        const page = pages[pageId] || {};
        const byId = {};
        (Array.isArray(page.files) ? page.files : []).forEach((f) => {
          if (f && f.id) byId[f.id] = typeof f.content === 'string' ? f.content : '';
          else if (f && f.name) byId[f.name] = typeof f.content === 'string' ? f.content : '';
        });
        const defaults = defaultFilesContent();
        const files = FILE_DEFS.map((def) => ({
          id: def.id,
          name: def.name,
          type: def.type,
          content: byId[def.id] != null ? byId[def.id] : defaults[def.id] || '',
        }));
        cleanPages[pageId] = {
          id: pageId,
          name: page.name || 'Flat Web Page',
          framework: page.framework || 'html',
          files,
        };
      });

      const activePageId =
        input.activePageId && cleanPages[input.activePageId]
          ? input.activePageId
          : Object.keys(cleanPages)[0] || DEFAULT_PAGE_ID;

      return { version: PROJECT_VERSION, activePageId, pages: cleanPages };
    }

    /* ---------- state accessors ---------- */
    getActivePage() {
      const id = this.project.activePageId || DEFAULT_PAGE_ID;
      if (!this.project.pages[id]) {
        this.project.pages[id] = createDefaultPage();
      }
      return this.project.pages[id];
    }

    getFileContent(fileId) {
      const page = this.getActivePage();
      const file = page.files.find((f) => f.id === fileId);
      return file ? file.content : '';
    }

    setFileContent(fileId, content) {
      const page = this.getActivePage();
      const file = page.files.find((f) => f.id === fileId);
      if (file) {
        file.content = content;
        this.save();
      }
    }

    setPageName(name) {
      const page = this.getActivePage();
      page.name = name || 'Flat Web Page';
      this.save();
    }

    // True when the student has authored anything beyond the untouched starter.
    hasContent() {
      const defaults = defaultFilesContent();
      return Object.keys(this.project.pages).some((pageId) => {
        const page = this.project.pages[pageId];
        return (page.files || []).some((f) => {
          const def = (defaults[f.id] || '').trim();
          return (f.content || '').trim() !== def;
        });
      });
    }

    /* ---------- preview ---------- */
    buildPreviewDocument(page) {
      page = page || this.getActivePage();
      const getContent = (id) => {
        const f = page.files.find((x) => x.id === id);
        return f ? f.content || '' : '';
      };
      let html = getContent('index.html') || '<!DOCTYPE html><html><head></head><body></body></html>';
      const css = getContent('style.css');
      const js = getContent('script.js');
      const configJson = getContent('config.json');

      // Inline CSS: replace a <link> to style.css, else inject before </head>.
      if (css) {
        const styleTag = `<style>\n${css}\n</style>`;
        const linkRe = /<link[^>]*href=["']\.?\/?(?:styles?\.css)["'][^>]*>/i;
        if (linkRe.test(html)) {
          html = html.replace(linkRe, styleTag);
        } else if (/<\/head>/i.test(html)) {
          html = html.replace(/<\/head>/i, `${styleTag}\n</head>`);
        } else {
          html = `${styleTag}\n${html}`;
        }
      }

      if (configJson && configJson.trim() && configJson.trim() !== '{}') {
        try {
          const parsed = JSON.parse(configJson);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
            const bootstrap =
              '<script>window.__FLAT_PAGE_CONFIG__=' + JSON.stringify(parsed) + ';</script>';
            if (/<\/body>/i.test(html)) {
              html = html.replace(/<\/body>/i, bootstrap + '\n</body>');
            } else {
              html = html + '\n' + bootstrap;
            }
          }
        } catch (_) {}
      }

      // Inline JS: replace a <script src="script.js">, else inject before </body>.
      if (js) {
        const scriptTag = `<script>\n${js}\n<\/script>`;
        const srcRe = /<script[^>]*src=["']\.?\/?(?:script\.js)["'][^>]*>\s*<\/script>/i;
        if (srcRe.test(html)) {
          html = html.replace(srcRe, scriptTag);
        } else if (/<\/body>/i.test(html)) {
          html = html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
        } else {
          html = `${html}\n${scriptTag}`;
        }
      }
      return html;
    }

    refreshPreview() {
      if (!this._els.preview) return;
      try {
        this._els.preview.srcdoc = this.buildPreviewDocument();
      } catch (err) {
        console.warn('[FlatPage] preview refresh failed', err);
      }
    }

    _schedulePreview() {
      if (this._previewTimer) clearTimeout(this._previewTimer);
      this._previewTimer = setTimeout(() => this.refreshPreview(), 350);
    }

    /* ---------- UI ---------- */
    ensureMounted() {
      if (this._mounted) return;
      this._buildDom();
      this._mounted = true;
    }

    _buildDom() {
      const root = document.createElement('div');
      root.id = 'flat-page-editor';
      root.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:var(--hotspot-editor-panel-width, 350px)',
        'bottom:0',
        'display:none',
        'flex-direction:column',
        'background:#1e1e1e',
        'color:#e0e0e0',
        'font-family:Arial, sans-serif',
        'z-index:1002',
      ].join(';');

      // Toolbar: page name + tabs + actions
      const toolbar = document.createElement('div');
      toolbar.style.cssText =
        'display:flex;align-items:center;gap:10px;padding:8px 12px;background:#2a2a2a;border-bottom:1px solid #444;flex-wrap:wrap;';

      const title = document.createElement('span');
      title.textContent = 'Flat Web Page';
      title.style.cssText = 'font-weight:bold;color:#4caf50;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Page name';
      nameInput.style.cssText =
        'padding:6px 8px;border:1px solid #555;border-radius:4px;background:#333;color:#fff;font-size:13px;min-width:160px;';
      nameInput.value = this.getActivePage().name;
      nameInput.addEventListener('input', () => this.setPageName(nameInput.value));

      // Cloud actions (Render Postgres + Backblaze) — only useful when signed in.
      const cloudActions = document.createElement('div');
      cloudActions.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const cloudSaveBtn = document.createElement('button');
      cloudSaveBtn.type = 'button';
      cloudSaveBtn.textContent = '☁️ Save to Cloud';
      cloudSaveBtn.style.cssText =
        'padding:6px 10px;border:none;border-radius:4px;background:#3d5a80;color:#fff;cursor:pointer;font-size:12px;';
      cloudSaveBtn.addEventListener('click', () => this.cloudSave());
      const publishBtn = document.createElement('button');
      publishBtn.type = 'button';
      publishBtn.textContent = '🌐 Publish';
      publishBtn.style.cssText =
        'padding:6px 10px;border:none;border-radius:4px;background:#2196f3;color:#fff;cursor:pointer;font-size:12px;';
      publishBtn.addEventListener('click', () => this.publish());
      const cloudStatus = document.createElement('span');
      cloudStatus.style.cssText = 'font-size:11px;color:#9ad29a;';
      cloudActions.appendChild(cloudSaveBtn);
      cloudActions.appendChild(publishBtn);
      cloudActions.appendChild(cloudStatus);
      this._els.cloudStatus = cloudStatus;
      // Hidden until a student session is detected (parity with cloud-draft button).
      cloudActions.style.display = window.currentStudent ? 'flex' : 'none';
      this._els.cloudActions = cloudActions;

      const tabs = document.createElement('div');
      tabs.style.cssText = 'display:flex;gap:4px;margin-left:auto;';
      this._els.tabButtons = {};
      FILE_DEFS.forEach((def) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = def.name;
        btn.style.cssText = this._tabStyle(def.id === this.activeFileId);
        btn.addEventListener('click', () => this.setActiveFile(def.id));
        this._els.tabButtons[def.id] = btn;
        tabs.appendChild(btn);
      });

      toolbar.appendChild(title);
      toolbar.appendChild(nameInput);
      toolbar.appendChild(cloudActions);
      toolbar.appendChild(tabs);

      // Body: code editor (left) + live preview (right)
      const body = document.createElement('div');
      body.style.cssText = 'flex:1;display:flex;min-height:0;';

      const editorPane = document.createElement('div');
      editorPane.style.cssText =
        'flex:1;display:flex;flex-direction:column;min-width:0;border-right:1px solid #444;';

      const editorBar = document.createElement('div');
      editorBar.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#252526;border-bottom:1px solid #3a3a3a;font-size:12px;color:#aaa;';
      const editorLabel = document.createElement('span');
      editorLabel.id = 'flat-editor-active-label';
      editorLabel.textContent = 'index.html';
      this._els.editorLabel = editorLabel;
      editorBar.appendChild(editorLabel);

      const textarea = document.createElement('textarea');
      textarea.id = 'flat-editor-textarea';
      textarea.spellcheck = false;
      textarea.setAttribute('autocomplete', 'off');
      textarea.setAttribute('autocapitalize', 'off');
      textarea.style.cssText = [
        'flex:1',
        'width:100%',
        'box-sizing:border-box',
        'resize:none',
        'border:none',
        'outline:none',
        'padding:14px',
        'background:#1e1e1e',
        'color:#d4d4d4',
        "font-family:'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        'font-size:13px',
        'line-height:1.5',
        'tab-size:2',
        'white-space:pre',
        'overflow:auto',
      ].join(';');
      textarea.value = this.getFileContent(this.activeFileId);
      textarea.addEventListener('input', () => {
        this.setFileContent(this.activeFileId, textarea.value);
        this._schedulePreview();
      });
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          this.setFileContent(this.activeFileId, textarea.value);
          this._schedulePreview();
        }
      });
      this._els.textarea = textarea;

      editorPane.appendChild(editorBar);
      editorPane.appendChild(textarea);

      const previewPane = document.createElement('div');
      previewPane.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;background:#fff;';
      const previewBar = document.createElement('div');
      previewBar.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#252526;border-bottom:1px solid #3a3a3a;font-size:12px;color:#aaa;';
      const previewLabel = document.createElement('span');
      previewLabel.textContent = 'Live Preview';
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.textContent = '↻ Refresh';
      refreshBtn.style.cssText =
        'margin-left:auto;padding:4px 10px;border:none;border-radius:4px;background:#3a3a3a;color:#fff;cursor:pointer;font-size:12px;';
      refreshBtn.addEventListener('click', () => this.refreshPreview());
      previewBar.appendChild(previewLabel);
      previewBar.appendChild(refreshBtn);

      const iframe = document.createElement('iframe');
      iframe.id = 'flat-editor-preview';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals allow-popups allow-forms');
      iframe.style.cssText = 'flex:1;width:100%;border:none;background:#fff;';
      this._els.preview = iframe;

      previewPane.appendChild(previewBar);
      previewPane.appendChild(iframe);

      body.appendChild(editorPane);
      body.appendChild(previewPane);

      root.appendChild(toolbar);
      root.appendChild(body);
      document.body.appendChild(root);

      this._els.root = root;
      this._els.nameInput = nameInput;
      this.refreshPreview();
    }

    _tabStyle(active) {
      return [
        'padding:6px 12px',
        'border:1px solid ' + (active ? '#4caf50' : '#555'),
        'border-radius:4px',
        'background:' + (active ? 'rgba(76,175,80,0.2)' : '#333'),
        'color:#fff',
        'cursor:pointer',
        'font-size:12px',
        'font-family:monospace',
      ].join(';');
    }

    setActiveFile(fileId) {
      this.activeFileId = fileId;
      if (this._els.textarea) this._els.textarea.value = this.getFileContent(fileId);
      if (this._els.editorLabel) this._els.editorLabel.textContent = fileId;
      Object.keys(this._els.tabButtons || {}).forEach((id) => {
        this._els.tabButtons[id].style.cssText = this._tabStyle(id === fileId);
      });
    }

    show() {
      this.ensureMounted();
      this._visible = true;
      if (this._els.root) this._els.root.style.display = 'flex';
      // Refresh content from current state in case it was imported while hidden.
      if (this._els.nameInput) this._els.nameInput.value = this.getActivePage().name;
      this.setActiveFile(this.activeFileId);
      this.refreshPreview();
    }

    hide() {
      this._visible = false;
      if (this._els.root) this._els.root.style.display = 'none';
    }

    isVisible() {
      return this._visible;
    }

    /* ---------- export / import (called by host script.js) ---------- */

    // Returns the metadata object stored inside config.json (no large blobs).
    getConfigPayload() {
      return JSON.parse(JSON.stringify(this.project));
    }

    // Writes flat page source files into the export ZIP under flat-pages/<id>/.
    addToZip(zip) {
      if (!zip || typeof zip.folder !== 'function') return null;
      const manifest = { version: PROJECT_VERSION, activePageId: this.project.activePageId, pages: {} };
      const root = zip.folder(EXPORT_FOLDER);
      Object.keys(this.project.pages).forEach((pageId) => {
        const page = this.project.pages[pageId];
        const pageFolder = root.folder(pageId);
        (page.files || []).forEach((file) => {
          pageFolder.file(file.name, file.content || '');
        });
        manifest.pages[pageId] = {
          id: page.id,
          name: page.name,
          framework: page.framework,
          files: (page.files || []).map((f) => ({ id: f.id, name: f.name, type: f.type })),
        };
      });
      return manifest;
    }

    // Loads flat pages from an imported project. Prefers config.flatPages, then the
    // flat-pages/ ZIP folder. Returns true when flat content was found.
    async loadFromImport(config, zip) {
      let loaded = null;

      if (config && config.flatPages) {
        loaded = this._normalizeProject(config.flatPages);
      }

      // If config only carried a manifest (no file contents), hydrate from the ZIP.
      const needsHydration = (proj) =>
        !proj ||
        Object.keys(proj.pages || {}).every((pid) =>
          (proj.pages[pid].files || []).every((f) => !f.content)
        );

      if (zip && (needsHydration(loaded) || !loaded)) {
        const fromZip = await this._loadFilesFromZip(zip, loaded);
        if (fromZip) loaded = fromZip;
      }

      if (loaded && Object.keys(loaded.pages).length) {
        this.project = loaded;
        this.activeFileId = 'index.html';
        this.save();
        if (this._mounted) {
          if (this._els.nameInput) this._els.nameInput.value = this.getActivePage().name;
          this.setActiveFile(this.activeFileId);
          this.refreshPreview();
        }
        return true;
      }
      return false;
    }

    async _loadFilesFromZip(zip, baseProject) {
      try {
        const folder = zip.folder(EXPORT_FOLDER);
        if (!folder) return null;
        const pages = {};
        const pageIds = new Set();

        // Discover page folders and files under flat-pages/.
        zip.forEach((relativePath) => {
          if (!relativePath.startsWith(EXPORT_FOLDER + '/')) return;
          const rest = relativePath.slice(EXPORT_FOLDER.length + 1);
          const parts = rest.split('/');
          if (parts.length >= 2 && parts[0]) pageIds.add(parts[0]);
        });

        if (!pageIds.size) return null;

        const baseName = (pid) =>
          (baseProject && baseProject.pages[pid] && baseProject.pages[pid].name) || 'Flat Web Page';

        for (const pid of pageIds) {
          const defaults = defaultFilesContent();
          const files = [];
          for (const def of FILE_DEFS) {
            const entry = zip.file(`${EXPORT_FOLDER}/${pid}/${def.name}`);
            const content = entry ? await entry.async('text') : defaults[def.id] || '';
            files.push({ id: def.id, name: def.name, type: def.type, content });
          }
          pages[pid] = { id: pid, name: baseName(pid), framework: 'html', files };
        }

        const activePageId =
          baseProject && baseProject.activePageId && pages[baseProject.activePageId]
            ? baseProject.activePageId
            : Object.keys(pages)[0];

        return { version: PROJECT_VERSION, activePageId, pages };
      } catch (err) {
        console.warn('[FlatPage] Failed to read flat pages from ZIP:', err);
        return null;
      }
    }

    // Relative URL used by spherical weblink hotspots that point at the flat page.
    getInternalLinkUrl(pageId) {
      const id = pageId || this.project.activePageId || DEFAULT_PAGE_ID;
      return `./${EXPORT_FOLDER}/${id}/index.html`;
    }

    // Reveals cloud actions once a student session is known (called by host).
    onStudentSession(student) {
      if (student && this._els.cloudActions) this._els.cloudActions.style.display = 'flex';
    }

    _setCloudStatus(msg, isError) {
      if (!this._els.cloudStatus) return;
      this._els.cloudStatus.textContent = msg || '';
      this._els.cloudStatus.style.color = isError ? '#ff8a80' : '#9ad29a';
    }

    _resolveCloudPageName() {
      const page = this.getActivePage();
      const templateName = document.getElementById('template-name')?.value?.trim();
      if (templateName) return templateName;
      return page.name || 'Flat Web Page';
    }

    _filesPayload() {
      const page = this.getActivePage();
      const name = this._resolveCloudPageName();
      return {
        name,
        framework: page.framework,
        files: (page.files || []).map((f) => ({ name: f.name, type: f.type, content: f.content || '' })),
      };
    }

    // Save the current flat page to Render Postgres + Backblaze (no spherical content).
    async cloudSave() {
      this._setCloudStatus('Saving…');
      try {
        const page = this.getActivePage();
        const resp = await fetch('/api/student/flat-pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(this._filesPayload()),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
          throw new Error(data.message || `Save failed (${resp.status})`);
        }
        await this._syncSavedPagesToAssets(data, page);
        this._setCloudStatus('Saved to cloud ✓ — find it under Online Assets → My Saved Pages');
      } catch (err) {
        console.warn('[FlatPage] cloud save failed', err);
        this._setCloudStatus(err.message || 'Save failed', true);
        alert('Could not save flat page to the cloud: ' + (err.message || 'unknown error'));
      }
    }

    async _syncSavedPagesToAssets(data, page, slugHint, { published = false } = {}) {
      const picker = window.CommonAssetsPicker;
      if (!picker) return;
      const slug =
        data?.slug ||
        slugHint ||
        (data?.name || page?.name || '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') ||
        'flat-web-page';
      if (typeof picker.notifyFlatPageSaved === 'function') {
        picker.notifyFlatPageSaved({
          slug,
          name: data?.name || page?.name || slug,
          hostedUrl: data?.url || null,
          isHosted: published,
          updatedAt: new Date().toISOString(),
        });
      }
      if (typeof picker.refreshSavedPages === 'function') {
        await picker.refreshSavedPages();
      }
    }

    // Publish the flat page to a live hosted URL via the backend.
    async publish() {
      this._setCloudStatus('Publishing…');
      try {
        const page = this.getActivePage();
        const cloudName = this._resolveCloudPageName();
        page.name = cloudName;
        this.save();
        if (this._mounted && this._els.nameInput) {
          this._els.nameInput.value = cloudName;
        }
        const resp = await fetch('/api/student/flat-pages/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(this._filesPayload()),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
          throw new Error(data.message || `Publish failed (${resp.status})`);
        }
        await this._syncSavedPagesToAssets(data, page, data.slug, { published: true });
        this._setCloudStatus('Published ✓ — find it under Online Assets → My Saved Pages');
        if (data.url) {
          const useIt =
            typeof window.hotspotEditor !== 'undefined' &&
            confirm(`Published to:\n${data.url}\n\nCopy this URL to your clipboard?`);
          if (useIt) {
            try {
              await navigator.clipboard.writeText(data.url);
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('[FlatPage] publish failed', err);
        this._setCloudStatus(err.message || 'Publish failed', true);
        alert('Could not publish flat page: ' + (err.message || 'unknown error'));
      }
    }

    // Resets flat page content (used by "Clear Data").
    reset() {
      this.project = createDefaultProject();
      this.activeFileId = 'index.html';
      this.save();
      if (this._mounted) {
        if (this._els.nameInput) this._els.nameInput.value = this.getActivePage().name;
        this.setActiveFile(this.activeFileId);
        this.refreshPreview();
      }
    }
  }

  window.FlatPageEditor = FlatPageEditor;
  window.flatPageEditor = new FlatPageEditor();
})();
