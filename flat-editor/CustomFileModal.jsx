import React, { useState } from 'react';

export default function CustomFileModal({ open, onClose, onConfirm, blockedExtensions = [] }) {
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = fileName.trim();
    if (!name) return;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (ext && blockedExtensions.includes(ext)) {
      setError(`File type ".${ext}" is not allowed.`);
      return;
    }
    onConfirm(name);
    setFileName('');
    setError('');
    onClose();
  };

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal">
        <div className="flat-modal-header">
          <h2>Add File</h2>
          <button type="button" className="flat-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flat-modal-body">
          <label className="flat-form-label">
            File name (with extension)
            <input
              type="text"
              className="flat-form-input"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value);
                setError('');
              }}
              placeholder="e.g. data.json"
            />
          </label>
          {error && <p className="flat-error">{error}</p>}
          <div className="flat-modal-footer">
            <button type="button" className="flat-tool-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="flat-tool-btn flat-tool-btn-accent">
              Add File
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
