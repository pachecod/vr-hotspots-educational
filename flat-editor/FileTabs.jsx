import React from 'react';
import { FILE_DEFS } from './defaults.js';

export default function FileTabs({ activeFileId, onChangeFile }) {
  return (
    <div className="flat-file-tabs">
      {FILE_DEFS.map((def) => (
        <button
          key={def.id}
          type="button"
          className={`flat-file-tab${activeFileId === def.id ? ' active' : ''}`}
          onClick={() => onChangeFile(def.id)}
        >
          {def.name}
        </button>
      ))}
    </div>
  );
}
