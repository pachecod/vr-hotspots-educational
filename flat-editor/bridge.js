import {
  STORAGE_KEY,
  PROJECT_VERSION,
  DEFAULT_PAGE_ID,
  EXPORT_FOLDER,
  FILE_DEFS,
  defaultFilesContent,
  createDefaultPage,
  createDefaultProject,
} from './defaults.js';
import { buildPreviewDocument } from './buildPreview.js';
import { saveFlatPage, publishFlatPage } from './flat-page-api.js';
import { buildInsertHtml, defaultHtmlInsertPos } from './insertAssetHtml.js';

export class FlatPageEditorBridge {
  constructor() {
    this.project = createDefaultProject();
    this.activeFileId = 'index.html';
    this._visible = false;
    this._listeners = new Set();
    this._cloudStatus = '';
    this._cloudStatusError = false;
    this._editorSelections = {};
    this._loadFromStorage();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const normalized = this._normalizeProject(JSON.parse(raw));
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
    this._notify();
  }

  importProject(input) {
    const normalized = this._normalizeProject(input);
    if (!normalized) return false;
    this.project = normalized;
    this.activeFileId = 'index.html';
    this.save();
    return true;
  }

  _normalizeProject(input) {
    if (!input || typeof input !== 'object') return null;
    let pages = input.pages;
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
      cleanPages[pageId] = {
        id: pageId,
        name: page.name || 'Flat Web Page',
        framework: page.framework || 'html',
        files: FILE_DEFS.map((def) => ({
          id: def.id,
          name: def.name,
          type: def.type,
          content: byId[def.id] != null ? byId[def.id] : defaults[def.id] || '',
        })),
      };
    });

    const activePageId =
      input.activePageId && cleanPages[input.activePageId]
        ? input.activePageId
        : Object.keys(cleanPages)[0] || DEFAULT_PAGE_ID;

    return { version: PROJECT_VERSION, activePageId, pages: cleanPages };
  }

  getState() {
    return {
      project: this.project,
      activeFileId: this.activeFileId,
      visible: this._visible,
      cloudStatus: this._cloudStatus,
      cloudStatusError: this._cloudStatusError,
      showCloudActions: !!window.currentStudent,
    };
  }

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

  setActiveFile(fileId) {
    this.activeFileId = fileId;
    this._notify();
  }

  updateEditorSelection(fileId, selection) {
    if (!fileId || !selection) return;
    this._editorSelections[fileId] = {
      anchor: selection.anchor,
      head: selection.head,
    };
  }

  /** Insert HTML from an online asset at the last HTML cursor position (flat page mode). */
  insertAsset(category, asset) {
    if (!this._visible) return false;
    const cat = category || asset?.category || 'images';
    const snippet = buildInsertHtml(cat, asset);
    if (!snippet) return false;

    const htmlFileId = 'index.html';
    let content = this.getFileContent(htmlFileId);
    const sel = this._editorSelections[htmlFileId];
    const insertAt =
      sel && typeof sel.head === 'number'
        ? Math.max(0, Math.min(sel.head, content.length))
        : defaultHtmlInsertPos(content);

    const padded = `\n${snippet}\n`;
    const nextContent = content.slice(0, insertAt) + padded + content.slice(insertAt);
    this.setFileContent(htmlFileId, nextContent);

    const nextPos = insertAt + padded.length;
    this._editorSelections[htmlFileId] = { anchor: nextPos, head: nextPos };
    this._pendingSelection = { fileId: htmlFileId, anchor: nextPos, head: nextPos };

    if (this.activeFileId !== htmlFileId) {
      this.setActiveFile(htmlFileId);
    } else {
      this._notify();
    }
    return true;
  }

  consumePendingSelection() {
    const pending = this._pendingSelection;
    this._pendingSelection = null;
    return pending;
  }

  setPageName(name) {
    const page = this.getActivePage();
    page.name = name || 'Flat Web Page';
    this.save();
  }

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

  buildPreviewDocument(page) {
    return buildPreviewDocument(page || this.getActivePage());
  }

  show() {
    this._visible = true;
    this._notify();
  }

  hide() {
    this._visible = false;
    this._notify();
  }

  isVisible() {
    return this._visible;
  }

  getConfigPayload() {
    return JSON.parse(JSON.stringify(this.project));
  }

  addToZip(zip) {
    if (!zip || typeof zip.folder !== 'function') return null;
    const manifest = { version: PROJECT_VERSION, activePageId: this.project.activePageId, pages: {} };
    const root = zip.folder(EXPORT_FOLDER);
    Object.keys(this.project.pages).forEach((pageId) => {
      const page = this.project.pages[pageId];
      const pageFolder = root.folder(pageId);
      const pageManifest = {
        id: page.id,
        name: page.name,
        framework: page.framework,
        files: [],
      };
      (page.files || []).forEach((file) => {
        pageFolder.file(file.name, file.content || '');
        pageManifest.files.push({ id: file.id, name: file.name, type: file.type });
      });
      pageFolder.file('manifest.json', JSON.stringify(pageManifest, null, 2));
      manifest.pages[pageId] = pageManifest;
    });
    return manifest;
  }

  async loadFromImport(config, zip) {
    let loaded = null;
    if (config && config.flatPages) {
      loaded = this._normalizeProject(config.flatPages);
    }
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
      this.importProject(loaded);
      return true;
    }
    return false;
  }

  async _loadFilesFromZip(zip, baseProject) {
    try {
      const pages = {};
      const pageIds = new Set();
      zip.forEach((relativePath) => {
        if (!relativePath.startsWith(EXPORT_FOLDER + '/')) return;
        const rest = relativePath.slice(EXPORT_FOLDER.length + 1);
        const parts = rest.split('/');
        if (parts.length >= 2 && parts[0] && parts[1] !== 'manifest.json') pageIds.add(parts[0]);
      });
      if (!pageIds.size) return null;

      for (const pid of pageIds) {
        const manifestFile = zip.file(`${EXPORT_FOLDER}/${pid}/manifest.json`);
        let pageName = 'Flat Web Page';
        if (manifestFile) {
          try {
            const m = JSON.parse(await manifestFile.async('text'));
            if (m.name) pageName = m.name;
          } catch (_) {}
        } else if (baseProject?.pages?.[pid]?.name) {
          pageName = baseProject.pages[pid].name;
        }
        const defaults = defaultFilesContent();
        const files = [];
        for (const def of FILE_DEFS) {
          const entry = zip.file(`${EXPORT_FOLDER}/${pid}/${def.name}`);
          const content = entry ? await entry.async('text') : defaults[def.id] || '';
          files.push({ id: def.id, name: def.name, type: def.type, content });
        }
        pages[pid] = { id: pid, name: pageName, framework: 'html', files };
      }

      const activePageId =
        baseProject?.activePageId && pages[baseProject.activePageId]
          ? baseProject.activePageId
          : Object.keys(pages)[0];

      return { version: PROJECT_VERSION, activePageId, pages };
    } catch (err) {
      console.warn('[FlatPage] Failed to read flat pages from ZIP:', err);
      return null;
    }
  }

  getInternalLinkUrl(pageId) {
    const id = pageId || this.project.activePageId || DEFAULT_PAGE_ID;
    return `./${EXPORT_FOLDER}/${id}/index.html`;
  }

  onStudentSession() {
    this._notify();
  }

  /** Load a cloud-saved flat page into the editor (from Online Assets → My Saved Pages). */
  importCloudPage(page, slug) {
    if (!page) return false;
    const pageId = slug || page.slug || DEFAULT_PAGE_ID;
    const typeByName = { 'index.html': 'html', 'style.css': 'css', 'script.js': 'javascript' };
    const files = (page.files || []).map((f) => ({
      id: f.name,
      name: f.name,
      type: typeByName[f.name] || 'html',
      content: f.content || '',
    }));
    if (!files.some((f) => f.name === 'index.html')) {
      const defaults = defaultFilesContent();
      files.unshift({
        id: 'index.html',
        name: 'index.html',
        type: 'html',
        content: defaults['index.html'] || '',
      });
    }
    this.project.pages[pageId] = {
      id: pageId,
      name: page.name || 'Flat Web Page',
      framework: 'html',
      files,
    };
    this.project.activePageId = pageId;
    this.activeFileId = 'index.html';
    this.save();
    this._visible = true;
    this._notify();
    return true;
  }

  _setCloudStatus(msg, isError) {
    this._cloudStatus = msg || '';
    this._cloudStatusError = !!isError;
    this._notify();
  }

  _filesPayload() {
    const page = this.getActivePage();
    return {
      name: page.name,
      framework: page.framework,
      files: (page.files || []).map((f) => ({
        name: f.name,
        type: f.type,
        content: f.content || '',
      })),
    };
  }

  async cloudSave() {
    this._setCloudStatus('Saving…');
    try {
      const data = await saveFlatPage(this._filesPayload());
      this._setCloudStatus('Saved to cloud ✓ — find it under Online Assets → My Saved Pages');
      return data;
    } catch (err) {
      this._setCloudStatus(err.message || 'Save failed', true);
      alert('Could not save flat page to the cloud: ' + (err.message || 'unknown error'));
    }
  }

  async publish() {
    this._setCloudStatus('Publishing…');
    try {
      const page = this.getActivePage();
      const slug = page.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'flat-web-page';
      const data = await publishFlatPage(slug, this._filesPayload());
      this._setCloudStatus('Published ✓');
      if (data.url && confirm(`Published to:\n${data.url}\n\nCopy this URL to your clipboard?`)) {
        try {
          await navigator.clipboard.writeText(data.url);
        } catch (_) {}
      }
    } catch (err) {
      this._setCloudStatus(err.message || 'Publish failed', true);
      alert('Could not publish flat page: ' + (err.message || 'unknown error'));
    }
  }

  reset() {
    this.project = createDefaultProject();
    this.activeFileId = 'index.html';
    this.save();
  }
}
