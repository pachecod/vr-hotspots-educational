import React, { useEffect, useState, useCallback, useRef } from 'react';
import Editor from './Editor.jsx';
import Preview from './Preview.jsx';
import FileTabs from './FileTabs.jsx';
import SnippetsModal from './SnippetsModal.jsx';
import AIAssistant from './AIAssistant.jsx';
import CustomFileModal from './CustomFileModal.jsx';
import TemplateGalleryModal from './TemplateGalleryModal.jsx';
import RideyIcon from './RideyIcon.jsx';
import { FileType } from './types.js';
import { formatCode } from './formatCode.js';
import ConfigFormPanel from './configForm/ConfigFormPanel.jsx';

const SPLIT_PRESETS = {
  editor: { editor: 80, preview: 20 },
  balanced: { editor: 50, preview: 50 },
  preview: { editor: 20, preview: 80 },
};

const SPLIT_STORAGE_KEY = 'flat-editor-split-preset';
const CONFIG_MODE_STORAGE_KEY = 'flat-editor-config-mode';
const AUTO_RELOAD_PREVIEW_DEFAULT = false;

function initialConfigMode(bridge) {
  try {
    const saved = localStorage.getItem(CONFIG_MODE_STORAGE_KEY);
    if (saved === 'code' || saved === 'visual') return saved;
  } catch (_) {}
  return bridge.hasConfigUiSchema() ? 'visual' : 'code';
}

function fileTypeForId(fileId) {
  if (fileId === 'style.css' || String(fileId).endsWith('.css')) return FileType.CSS;
  if (
    fileId === 'script.js' ||
    fileId === 'config.json' ||
    String(fileId).endsWith('.js') ||
    String(fileId).endsWith('.mjs') ||
    String(fileId).endsWith('.json')
  ) {
    return FileType.JS;
  }
  return FileType.HTML;
}

export default function FlatPageEditorUI({ bridge }) {
  const [, bump] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [autoReloadPreview, setAutoReloadPreview] = useState(AUTO_RELOAD_PREVIEW_DEFAULT);
  const wasVisibleRef = useRef(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showRidey, setShowRidey] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copyLabel, setCopyLabel] = useState('');
  const [downloadStarterLabel, setDownloadStarterLabel] = useState('');
  const [splitPreset, setSplitPreset] = useState(
    () => localStorage.getItem(SPLIT_STORAGE_KEY) || 'balanced'
  );
  const [configMode, setConfigMode] = useState(() => initialConfigMode(bridge));

  const forcePreviewReload = useCallback(() => setPreviewKey((k) => k + 1), []);
  const requestPreviewReload = useCallback(() => {
    if (autoReloadPreview) setPreviewKey((k) => k + 1);
  }, [autoReloadPreview]);

  useEffect(
    () =>
      bridge.subscribe(() => {
        const visible = bridge.getState().visible;
        if (visible && !wasVisibleRef.current) {
          setAutoReloadPreview(AUTO_RELOAD_PREVIEW_DEFAULT);
          forcePreviewReload();
        }
        wasVisibleRef.current = visible;
        bump((n) => n + 1);
        requestPreviewReload();
        if (bridge.consumePendingConfigVisual()) {
          setConfigEditorMode('visual');
        }
      }),
    [bridge, forcePreviewReload, requestPreviewReload]
  );

  useEffect(() => {
    if (bridge.consumePendingConfigVisual()) {
      setConfigEditorMode('visual');
    }
  }, [bridge]);

  const state = bridge.getState();
  const page = bridge.getActivePage();
  const activeFileId = state.activeFileId;
  const fileContent = bridge.getFileContent(activeFileId);
  const split = SPLIT_PRESETS[splitPreset] || SPLIT_PRESETS.balanced;
  const isConfigTab = activeFileId === 'config.json';
  const showConfigVisual = isConfigTab && configMode === 'visual';

  const setConfigEditorMode = (mode) => {
    setConfigMode(mode);
    try {
      localStorage.setItem(CONFIG_MODE_STORAGE_KEY, mode);
    } catch (_) {}
  };

  const handleContentChange = useCallback(
    (value) => {
      bridge.setFileContent(activeFileId, value);
      requestPreviewReload();
    },
    [bridge, activeFileId, requestPreviewReload]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel(''), 1200);
    } catch (_) {
      setCopyLabel('Failed');
    }
  };

  const handleFormat = () => {
    const formatted = formatCode(fileContent, activeFileId);
    bridge.setFileContent(activeFileId, formatted);
    requestPreviewReload();
  };

  const changeSplit = (preset) => {
    setSplitPreset(preset);
    localStorage.setItem(SPLIT_STORAGE_KEY, preset);
  };

  const handleAddFile = (name) => {
    const result = bridge.addFile(name);
    if (!result.ok) alert(result.error);
  };

  const handleRemoveFile = (fileId) => {
    if (!confirm(`Remove ${fileId}?`)) return;
    const result = bridge.removeFile(fileId);
    if (!result.ok) alert(result.error);
  };

  const handleDownloadStarter = async () => {
    try {
      setDownloadStarterLabel('…');
      await bridge.downloadStarterZip();
      setDownloadStarterLabel('Downloaded!');
      setTimeout(() => setDownloadStarterLabel(''), 2000);
    } catch (err) {
      setDownloadStarterLabel('');
      alert(err.message || 'Download failed');
    }
  };

  if (!state.visible) return null;

  return (
    <div id="flat-page-editor" className="flat-page-editor-root">
      <div className="flat-toolbar">
        <span className="flat-toolbar-title">
          {state.adminTemplateMode ? 'Admin Template Editor' : 'Flat Web Page'}
        </span>
        {!state.adminTemplateMode && (
          <input
            type="text"
            className="flat-page-name"
            value={page.name}
            placeholder="Page name"
            onChange={(e) => bridge.setPageName(e.target.value)}
          />
        )}
        {!state.adminTemplateMode && state.showCloudActions && (
          <div className="flat-cloud-actions">
            <button type="button" className="flat-btn flat-btn-cloud" onClick={() => bridge.cloudSave()}>
              ☁️ Save to Cloud
            </button>
            <button type="button" className="flat-btn flat-btn-publish" onClick={() => bridge.publish()}>
              🌐 Publish
            </button>
            {state.cloudStatus && (
              <span className={`flat-cloud-status${state.cloudStatusError ? ' error' : ''}`}>
                {state.cloudStatus}
              </span>
            )}
          </div>
        )}
        <FileTabs
          files={state.files}
          activeFileId={activeFileId}
          onChangeFile={(id) => bridge.setActiveFile(id)}
          onAddFile={() => setShowAddFile(true)}
          onRemoveFile={handleRemoveFile}
        />
      </div>
      <div
        className="flat-body"
        style={{
          gridTemplateColumns: `${split.editor}fr ${split.preview}fr`,
        }}
      >
        <div className="flat-editor-pane">
          <div className="flat-pane-bar">
            <span>{activeFileId}</span>
            <div className="flat-pane-tools">
              {isConfigTab && (
                <div className="flat-config-mode-toggle">
                  <button
                    type="button"
                    className={`flat-config-mode-btn${configMode === 'visual' ? ' active' : ''}`}
                    onClick={() => setConfigEditorMode('visual')}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    className={`flat-config-mode-btn${configMode === 'code' ? ' active' : ''}`}
                    onClick={() => setConfigEditorMode('code')}
                  >
                    Code
                  </button>
                </div>
              )}
              <button type="button" className="flat-tool-btn" onClick={handleCopy}>
                {copyLabel || 'Copy'}
              </button>
              <button type="button" className="flat-tool-btn" onClick={() => setShowSnippets(true)}>
                Snippets
              </button>
              <button type="button" className="flat-tool-btn" onClick={handleFormat} disabled={showConfigVisual}>
                Format
              </button>
              {state.adminTemplateMode ? (
                <>
                  <button type="button" className="flat-tool-btn" onClick={() => setShowTemplates(true)}>
                    Load Starter
                  </button>
                  <button
                    type="button"
                    className="flat-tool-btn"
                    onClick={handleDownloadStarter}
                    title="Download all files as a ZIP folder for starter-templates/"
                  >
                    {downloadStarterLabel || 'Download Starter'}
                  </button>
                </>
              ) : (
                <button type="button" className="flat-tool-btn" onClick={() => setShowTemplates(true)}>
                  Templates
                </button>
              )}
              {state.rideyEnabled && (
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-ridey"
                  onClick={() => setShowRidey(true)}
                  title="Ridey · AI Code Assistant"
                >
                  <RideyIcon size={20} />
                  Ask Ridey
                </button>
              )}
            </div>
          </div>
          {showConfigVisual ? (
            <ConfigFormPanel bridge={bridge} onUpdated={requestPreviewReload} />
          ) : (
            <Editor
              key={activeFileId}
              value={fileContent}
              onChange={handleContentChange}
              language={fileTypeForId(activeFileId)}
              bridge={bridge}
              activeFileId={activeFileId}
            />
          )}
        </div>
        <div className="flat-preview-pane">
          <div className="flat-pane-bar">
            <span>Live Preview</span>
            <div className="flat-split-btns">
              <button
                type="button"
                className={`flat-tool-btn${splitPreset === 'editor' ? ' active' : ''}`}
                onClick={() => changeSplit('editor')}
                title="More editor"
              >
                Editor
              </button>
              <button
                type="button"
                className={`flat-tool-btn${splitPreset === 'balanced' ? ' active' : ''}`}
                onClick={() => changeSplit('balanced')}
                title="Balanced"
              >
                50/50
              </button>
              <button
                type="button"
                className={`flat-tool-btn${splitPreset === 'preview' ? ' active' : ''}`}
                onClick={() => changeSplit('preview')}
                title="More preview"
              >
                Preview
              </button>
            </div>
            <div className="flat-preview-controls">
              <button type="button" className="flat-btn-refresh" onClick={forcePreviewReload}>
                ↻ Refresh
              </button>
              <label className="flat-preview-auto-reload">
                <input
                  type="checkbox"
                  checked={autoReloadPreview}
                  onChange={(e) => setAutoReloadPreview(e.target.checked)}
                />
                automatically
              </label>
            </div>
          </div>
          <Preview page={page} refreshKey={previewKey} />
        </div>
      </div>

      <SnippetsModal
        open={showSnippets}
        onClose={() => setShowSnippets(false)}
        onInsert={(code) => bridge.insertSnippet(code)}
      />

      <AIAssistant
        open={showRidey}
        onClose={() => setShowRidey(false)}
        code={fileContent}
        language={fileTypeForId(activeFileId)}
        fileName={activeFileId}
        projectFiles={(page.files || []).map((f) => ({
          fileName: f.id || f.name,
          language: fileTypeForId(f.id || f.name).toLowerCase(),
          content: f.content || '',
        }))}
        onApplySuggestion={(fileUpdates) => {
          (fileUpdates || []).forEach((update) => {
            if (update?.fileName && update.suggestion != null) {
              bridge.setFileContent(update.fileName, update.suggestion);
            }
          });
          requestPreviewReload();
        }}
      />

      <CustomFileModal
        open={showAddFile}
        onClose={() => setShowAddFile(false)}
        onConfirm={handleAddFile}
        blockedExtensions={state.blockedExtensions}
      />

      <TemplateGalleryModal
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        mode={state.adminTemplateMode ? 'admin' : 'student'}
        onLoad={(template) => {
          bridge.loadTemplate(template);
          if (state.adminTemplateMode && template?.title) {
            window.dispatchEvent(
              new CustomEvent('admin-starter-template-loaded', { detail: { title: template.title } })
            );
          }
          requestPreviewReload();
        }}
      />
    </div>
  );
}
