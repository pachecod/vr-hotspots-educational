import React, { useEffect, useState } from 'react';
import { fetchSnippets } from './snippets-api.js';

export default function SnippetsModal({ open, onClose, onInsert }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchSnippets()
      .then(setSnippets)
      .catch(() => setSnippets([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal flat-modal-wide">
        <div className="flat-modal-header">
          <h2>Code Snippets</h2>
          <button type="button" className="flat-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {onInsert && (
          <p className="flat-modal-tip">
            Insert adds code at your cursor. Place the cursor first, or use Copy and paste manually.
          </p>
        )}
        <div className="flat-modal-body">
          {loading ? (
            <p className="flat-muted">Loading…</p>
          ) : snippets.length === 0 ? (
            <p className="flat-muted">No snippets available.</p>
          ) : (
            <div className="flat-snippet-grid">
              {snippets.map((snippet) => (
                <div key={snippet.id} className="flat-snippet-card">
                  <div className="flat-snippet-card-head">
                    <strong>{snippet.title}</strong>
                    <span className="flat-snippet-lang">{snippet.language || 'html'}</span>
                  </div>
                  <pre className="flat-snippet-code">{snippet.code}</pre>
                  <div className="flat-snippet-actions">
                    <button
                      type="button"
                      className="flat-tool-btn"
                      onClick={() => handleCopy(snippet.code, snippet.id)}
                    >
                      {copiedId === snippet.id ? 'Copied!' : 'Copy'}
                    </button>
                    {onInsert && (
                      <button
                        type="button"
                        className="flat-tool-btn flat-tool-btn-accent"
                        onClick={() => {
                          onInsert(snippet.code);
                          onClose();
                        }}
                      >
                        Insert
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
