import React from 'react';
import { CORE_FILE_IDS } from './file-utils.js';

export default function FileTabs({ files, activeFileId, onChangeFile, onAddFile, onRemoveFile }) {
  return (
    <div className="flat-file-tabs" role="tablist" aria-label="Page files">
      {(files || []).map((f) => (
        <span key={f.id} className="flat-file-tab-wrap">
          <button
            type="button"
            role="tab"
            aria-selected={activeFileId === f.id}
            className={`flat-file-tab${activeFileId === f.id ? ' active' : ''}`}
            onClick={() => onChangeFile(f.id)}
          >
            {f.name}
          </button>
          {!CORE_FILE_IDS.includes(f.id) && onRemoveFile && (
            <button
              type="button"
              className="flat-file-tab-remove"
              title={`Remove ${f.name}`}
              aria-label={`Remove ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile(f.id);
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {onAddFile && (
        <button
          type="button"
          className="flat-file-tab flat-file-tab-add"
          onClick={onAddFile}
          title="Add file"
          aria-label="Add file"
        >
          +
        </button>
      )}
    </div>
  );
}
