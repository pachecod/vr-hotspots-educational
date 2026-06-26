import React, { useEffect, useState, useCallback } from 'react';
import Editor from './Editor.jsx';
import Preview from './Preview.jsx';
import FileTabs from './FileTabs.jsx';
import { FileType } from './types.js';

function fileTypeForId(fileId) {
  if (fileId === 'style.css') return FileType.CSS;
  if (fileId === 'script.js') return FileType.JS;
  return FileType.HTML;
}

export default function FlatPageEditorUI({ bridge }) {
  const [, bump] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);

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

  const handleContentChange = useCallback(
    (value) => {
      bridge.setFileContent(activeFileId, value);
      setPreviewKey((k) => k + 1);
    },
    [bridge, activeFileId]
  );

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
        <FileTabs activeFileId={activeFileId} onChangeFile={(id) => bridge.setActiveFile(id)} />
      </div>
      <div className="flat-body">
        <div className="flat-editor-pane">
          <div className="flat-pane-bar">
            <span>{activeFileId}</span>
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
            <button type="button" className="flat-btn-refresh" onClick={() => setPreviewKey((k) => k + 1)}>
              ↻ Refresh
            </button>
          </div>
          <Preview page={page} refreshKey={previewKey} />
        </div>
      </div>
    </div>
  );
}
