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
import {
  CORE_FILE_IDS,
  MAX_FILES_PER_PAGE,
  inferFileType,
  sanitizeFilename,
  getExtension,
} from './file-utils.js';
import {
  buildProjectVrInsertHtml,
  deriveQrUrlFromTourUrl,
  hasVrTourEmbed,
  resolveAbsoluteUrl,
  rewriteVrTourEmbedsInHtml,
  stripExistingVrTourEmbeds,
} from './vrTourEmbed.js';

export class FlatPageEditorBridge {
  constructor(options = {}) {
    this._storageKey = options.storageKey || STORAGE_KEY;
    this._adminTemplateMode = !!options.adminTemplateMode;
    this.project = createDefaultProject();
    this.activeFileId = 'index.html';
    this._visible = !!options.startVisible;
    this._listeners = new Set();
    this._cloudStatus = '';
    this._cloudStatusError = false;
    this._editorSelections = {};
    this._blockedExtensions = [];
    this._rideyStatus = { enabled: false, hasApiKey: false };
    this._loadFromStorage();
    this._loadEditorSettings();
  }

  async _loadEditorSettings() {
    try {
      const [rideyRes, extRes] = await Promise.all([
        fetch('/api/ridey/status').then((r) => r.json()).catch(() => ({})),
        fetch('/api/blocked-extensions').then((r) => r.json()).catch(() => ({})),
      ]);
      if (rideyRes.success) {
        this._rideyStatus = { enabled: !!rideyRes.enabled, hasApiKey: !!rideyRes.hasApiKey };
      }
      if (extRes.success && Array.isArray(extRes.extensions)) {
        this._blockedExtensions = extRes.extensions;
      }
      this._notify();
    } catch (_) {}
  }

  _buildFileEntry(id, content) {
    return {
      id,
      name: id,
      type: inferFileType(id),
      content: typeof content === 'string' ? content : '',
    };
  }

  _mergePageFiles(byId) {
    const defaults = defaultFilesContent();
    const files = [];
    const seen = new Set();

    CORE_FILE_IDS.forEach((id) => {
      files.push(this._buildFileEntry(id, byId[id] != null ? byId[id] : defaults[id] || ''));
      seen.add(id);
    });

    Object.keys(byId).forEach((id) => {
      if (seen.has(id)) return;
      if (!sanitizeFilename(id)) return;
      files.push(this._buildFileEntry(id, byId[id]));
      seen.add(id);
    });

    return files;
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
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const normalized = this._normalizeProject(JSON.parse(raw));
      if (normalized) this.project = normalized;
    } catch (err) {
      console.warn('[FlatPage] Failed to load saved flat pages:', err);
    }
  }

  save() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this.project));
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
      const defaults = defaultFilesContent();
      const byId = {};
      (Array.isArray(page.files) ? page.files : []).forEach((f) => {
        if (f && f.id) byId[f.id] = typeof f.content === 'string' ? f.content : '';
        else if (f && f.name) byId[f.name] = typeof f.content === 'string' ? f.content : '';
      });
      cleanPages[pageId] = {
        id: pageId,
        name: page.name || 'Flat Web Page',
        framework: page.framework || 'html',
        files: this._mergePageFiles(byId),
      };
    });

    const activePageId =
      input.activePageId && cleanPages[input.activePageId]
        ? input.activePageId
        : Object.keys(cleanPages)[0] || DEFAULT_PAGE_ID;

    return { version: PROJECT_VERSION, activePageId, pages: cleanPages };
  }

  getState() {
    const page = this.getActivePage();
    return {
      project: this.project,
      activeFileId: this.activeFileId,
      visible: this._visible,
      cloudStatus: this._cloudStatus,
      cloudStatusError: this._cloudStatusError,
      showCloudActions: !!window.currentStudent,
      files: page.files || [],
      rideyEnabled: this._rideyStatus.enabled && this._rideyStatus.hasApiKey,
      blockedExtensions: this._blockedExtensions,
      adminTemplateMode: this._adminTemplateMode,
    };
  }

  getTemplateFilesManifest() {
    const page = this.getActivePage();
    return (page.files || []).map((f) => ({
      name: f.name,
      content: f.content || '',
    }));
  }

  getPageFiles() {
    return this.getActivePage().files || [];
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

  _syncScenesData() {
    try {
      if (window.hotspotEditor && typeof window.hotspotEditor.saveScenesData === 'function') {
        window.hotspotEditor.saveScenesData();
      }
    } catch (_) {}
  }

  /** Upgrade legacy iframe-only embeds to include the QR block (e.g. after Generate for Embed). */
  upgradeVrTourEmbeds(vrTourEmbed = {}) {
    const embedUrl = resolveAbsoluteUrl(vrTourEmbed.hostedUrl || '');
    if (!embedUrl) return false;
    const qrUrl =
      resolveAbsoluteUrl(vrTourEmbed.qrUrl || '') || deriveQrUrlFromTourUrl(embedUrl);
    let html = this.getFileContent('index.html');
    if (!hasVrTourEmbed(html)) return false;

    const needsQrBlock = !/vr-tour-mobile-qr-img/i.test(html);
    if (needsQrBlock) {
      html = stripExistingVrTourEmbeds(html);
      const name =
        (window.hotspotEditor &&
          typeof window.hotspotEditor.getProjectVrEmbedInfo === 'function' &&
          window.hotspotEditor.getProjectVrEmbedInfo().name) ||
        '360° VR Tour';
      const snippet = buildProjectVrInsertHtml(name, embedUrl, qrUrl);
      const insertAt = defaultHtmlInsertPos(html);
      html = `${html.slice(0, insertAt)}\n${snippet}\n${html.slice(insertAt)}`;
    } else {
      html = rewriteVrTourEmbedsInHtml(html, { hostedUrl: embedUrl, useOnlineUrl: true });
    }

    this.setFileContent('index.html', html);
    this._syncScenesData();
    this._notify();
    return true;
  }

  /** Insert HTML from an online asset at the last HTML cursor position (flat page mode). */
  insertAsset(category, asset) {
    if (!this._visible) return false;
    const cat = category || asset?.category || 'images';
    const snippet = buildInsertHtml(cat, asset);
    if (!snippet) return false;

    const htmlFileId = 'index.html';
    let content = this.getFileContent(htmlFileId);
    if (cat === 'project-vr') {
      content = stripExistingVrTourEmbeds(content);
    }
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

    if (cat === 'project-vr') {
      this._syncScenesData();
    }

    if (this.activeFileId !== htmlFileId) {
      this.setActiveFile(htmlFileId);
    } else {
      this._notify();
    }
    return true;
  }

  insertSnippet(code) {
    if (!this._visible || !code) return false;
    return this._insertAtCursor(this.activeFileId, code);
  }

  _insertAtCursor(fileId, snippet) {
    let content = this.getFileContent(fileId);
    const sel = this._editorSelections[fileId];
    const insertAt =
      sel && typeof sel.head === 'number'
        ? Math.max(0, Math.min(sel.head, content.length))
        : fileId === 'index.html'
          ? defaultHtmlInsertPos(content)
          : content.length;

    const padded = `\n${snippet}\n`;
    const nextContent = content.slice(0, insertAt) + padded + content.slice(insertAt);
    this.setFileContent(fileId, nextContent);

    const nextPos = insertAt + padded.length;
    this._editorSelections[fileId] = { anchor: nextPos, head: nextPos };
    this._pendingSelection = { fileId, anchor: nextPos, head: nextPos };
    this._notify();
    return true;
  }

  addFile(name) {
    const safe = sanitizeFilename(name);
    if (!safe) return { ok: false, error: 'Invalid file name' };
    const ext = getExtension(safe);
    if (ext && this._blockedExtensions.includes(ext)) {
      return { ok: false, error: `File type ".${ext}" is not allowed.` };
    }
    const page = this.getActivePage();
    if ((page.files || []).some((f) => f.id === safe)) {
      return { ok: false, error: 'File already exists' };
    }
    if ((page.files || []).length >= MAX_FILES_PER_PAGE) {
      return { ok: false, error: `Maximum ${MAX_FILES_PER_PAGE} files per page` };
    }
    page.files.push(this._buildFileEntry(safe, ''));
    this.activeFileId = safe;
    this.save();
    return { ok: true };
  }

  removeFile(fileId) {
    if (CORE_FILE_IDS.includes(fileId)) return { ok: false, error: 'Cannot remove core files' };
    const page = this.getActivePage();
    const next = (page.files || []).filter((f) => f.id !== fileId);
    if (next.length === page.files.length) return { ok: false, error: 'File not found' };
    page.files = next;
    if (this.activeFileId === fileId) this.activeFileId = 'index.html';
    this.save();
    return { ok: true };
  }

  loadTemplate(template) {
    if (!template || !Array.isArray(template.files_manifest)) return false;
    const byId = {};
    template.files_manifest.forEach((f) => {
      if (f && f.name) byId[f.name] = f.content || '';
    });
    const page = this.getActivePage();
    page.name = template.title || page.name;
    page.files = this._mergePageFiles(byId);
    this.activeFileId = 'index.html';
    this.save();
    this._syncScenesData();
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

  addToZip(zip, options = {}) {
    if (!zip || typeof zip.folder !== 'function') return null;
    const exportMode = options.exportMode || 'bundle';
    const hostedUrl = options.vrTourEmbed?.hostedUrl || '';
    const useOnlineUrl = exportMode === 'urls';
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
        let content = file.content || '';
        if (file.id === 'index.html' && hostedUrl) {
          content = rewriteVrTourEmbedsInHtml(content, { hostedUrl, useOnlineUrl });
        }
        pageFolder.file(file.name, content);
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
        const byId = { ...defaults };
        const allNames = new Set();
        zip.forEach((relativePath) => {
          const prefix = `${EXPORT_FOLDER}/${pid}/`;
          if (!relativePath.startsWith(prefix)) return;
          const name = relativePath.slice(prefix.length);
          if (!name || name.includes('/') || name === 'manifest.json') return;
          allNames.add(name);
        });
        const files = [];
        for (const name of allNames) {
          const entry = zip.file(`${EXPORT_FOLDER}/${pid}/${name}`);
          const content = entry ? await entry.async('text') : defaults[name] || '';
          files.push({
            id: name,
            name,
            type: inferFileType(name),
            content,
          });
        }
        if (!files.some((f) => f.name === 'index.html')) {
          files.unshift({
            id: 'index.html',
            name: 'index.html',
            type: 'html',
            content: defaults['index.html'] || '',
          });
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
      const vrTourEmbed = window.hotspotEditor?.vrTourEmbed;
      if (vrTourEmbed?.hostedUrl && typeof this.upgradeVrTourEmbeds === 'function') {
        this.upgradeVrTourEmbeds(vrTourEmbed);
      }
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
