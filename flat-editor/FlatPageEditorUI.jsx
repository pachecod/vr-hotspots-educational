import React, { useEffect, useState, useCallback } from 'react';
import Editor from './Editor.jsx';
import Preview from './Preview.jsx';
import FileTabs from './FileTabs.jsx';
import SnippetsModal from './SnippetsModal.jsx';
import AIAssistant from './AIAssistant.jsx';
import CustomFileModal from './CustomFileModal.jsx';
import TemplateGalleryModal from './TemplateGalleryModal.jsx';
import { FileType } from './types.js';
import { formatCode } from './formatCode.js';

const SPLIT_PRESETS = {
  editor: { editor: 80, preview: 20 },
  balanced: { editor: 50, preview: 50 },
  preview: { editor: 20, preview: 80 },
};

const SPLIT_STORAGE_KEY = 'flat-editor-split-preset';

function fileTypeForId(fileId) {
  if (fileId === 'style.css' || String(fileId).endsWith('.css')) return FileType.CSS;
  if (fileId === 'script.js' || String(fileId).endsWith('.js') || String(fileId).endsWith('.mjs'))
    return FileType.JS;
  return FileType.HTML;
}

export default function FlatPageEditorUI({ bridge }) {
  const [, bump] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showRidey, setShowRidey] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copyLabel, setCopyLabel] = useState('');
  const [splitPreset, setSplitPreset] = useState(
    () => localStorage.getItem(SPLIT_STORAGE_KEY) || 'balanced'
  );

  useEffect(
    () =>
      bridge.subscribe(() => {
        bump((n) => n + 1);
        setPreviewKey((k) => k + 1);
      }),
    [bridge]
  );

  const state = bridge.getState();
  const page = bridge.getActivePage();
  const activeFileId = state.activeFileId;
  const fileContent = bridge.getFileContent(activeFileId);
  const split = SPLIT_PRESETS[splitPreset] || SPLIT_PRESETS.balanced;

  const handleContentChange = useCallback(
    (value) => {
      bridge.setFileContent(activeFileId, value);
      setPreviewKey((k) => k + 1);
    },
    [bridge, activeFileId]
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
    setPreviewKey((k) => k + 1);
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

  if (!state.visible) return null;

  return (
    <div id="flat-page-editor" className="flat-page-editor-root">
      <div className="flat-toolbar">
        <span className="flat-toolbar-title">Flat Web Page</span>
        <input
          type="text"
          className="flat-page-name"
          value={page.name}
          placeholder="Page name"
          onChange={(e) => bridge.setPageName(e.target.value)}
        />
        {state.showCloudActions && (
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
              <button type="button" className="flat-tool-btn" onClick={handleCopy}>
                {copyLabel || 'Copy'}
              </button>
              <button type="button" className="flat-tool-btn" onClick={() => setShowSnippets(true)}>
                Snippets
              </button>
              <button type="button" className="flat-tool-btn" onClick={handleFormat}>
                Format
              </button>
              <button type="button" className="flat-tool-btn" onClick={() => setShowTemplates(true)}>
                Templates
              </button>
              {state.rideyEnabled && (
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-ridey"
                  onClick={() => setShowRidey(true)}
                >
                  Ask Ridey
                </button>
              )}
            </div>
          </div>
          <Editor
            key={activeFileId}
            value={fileContent}
            onChange={handleContentChange}
            language={fileTypeForId(activeFileId)}
            bridge={bridge}
            activeFileId={activeFileId}
          />
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
            <button type="button" className="flat-btn-refresh" onClick={() => setPreviewKey((k) => k + 1)}>
              ↻ Refresh
            </button>
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
        onApplySuggestion={(suggestion) => {
          bridge.setFileContent(activeFileId, suggestion);
          setPreviewKey((k) => k + 1);
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
        onLoad={(template) => {
          bridge.loadTemplate(template);
          setPreviewKey((k) => k + 1);
        }}
      />
    </div>
  );
}
