import React, { useEffect, useState } from 'react';
import { fetchPublicTemplates, fetchTemplateBySlug } from './templates-api.js';

export default function TemplateGalleryModal({ open, onClose, onLoad }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    fetchPublicTemplates()
      .then(setTemplates)
      .catch((err) => {
        setError(err.message);
        setTemplates([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleLoad = async (slug) => {
    setLoadingSlug(slug);
    setError('');
    try {
      const template = await fetchTemplateBySlug(slug);
      onLoad(template);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSlug(null);
    }
  };

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal flat-modal-wide">
        <div className="flat-modal-header">
          <h2>Template Gallery</h2>
          <button type="button" className="flat-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="flat-modal-body">
          {error && <p className="flat-error">{error}</p>}
          {loading ? (
            <p className="flat-muted">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="flat-muted">No public templates yet. Ask your teacher to add some.</p>
          ) : (
            <div className="flat-template-list">
              {templates.map((t) => (
                <div key={t.id} className="flat-template-card">
                  <div>
                    <strong>{t.title}</strong>
                    {t.is_default && <span className="flat-badge">Default</span>}
                    {t.description && <p className="flat-muted">{t.description}</p>}
                  </div>
                  <button
                    type="button"
                    className="flat-tool-btn flat-tool-btn-accent"
                    disabled={loadingSlug === t.slug}
                    onClick={() => handleLoad(t.slug)}
                  >
                    {loadingSlug === t.slug ? 'Loading…' : 'Load'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
