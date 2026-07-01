import React, { useEffect, useState } from 'react';
import {
  fetchPublicTemplates,
  fetchTemplateBySlug,
  fetchAdminStarterTemplates,
  fetchAdminStarterTemplate,
} from './templates-api.js';

export default function TemplateGalleryModal({ open, onClose, onLoad, mode = 'student' }) {
  const isAdmin = mode === 'admin';
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    const loader = isAdmin
      ? fetchAdminStarterTemplates()
      : fetchPublicTemplates().catch(() => []);

    loader
      .then((list) => setTemplates(list))
      .catch((err) => {
        setError(err.message);
        setTemplates([]);
      })
      .finally(() => setLoading(false));
  }, [open, isAdmin]);

  if (!open) return null;

  const handleLoadPublished = async (slug) => {
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

  const handleLoadStarter = async (slug) => {
    setLoadingSlug(`starter:${slug}`);
    setError('');
    try {
      const template = await fetchAdminStarterTemplate(slug);
      onLoad(template);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSlug(null);
    }
  };

  const title = isAdmin ? 'Starter Templates' : 'Template Gallery';
  const emptyMessage = isAdmin
    ? 'No starter templates found in starter-templates/.'
    : 'No public templates yet. Ask your team leader or teacher to add some.';

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal flat-modal-wide">
        <div className="flat-modal-header">
          <h2>{title}</h2>
          <button type="button" className="flat-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="flat-modal-body">
          {error && <p className="flat-error">{error}</p>}
          {loading ? (
            <p className="flat-muted">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="flat-muted">{emptyMessage}</p>
          ) : (
            <>
              {isAdmin && (
                <p className="flat-muted" style={{ marginTop: 0 }}>
                  Load a starter, customize it, then save as a published template for team members or students.
                </p>
              )}
              <div className="flat-template-list">
                {templates.map((t) => {
                  const slug = t.slug;
                  const loadKey = isAdmin ? `starter:${slug}` : slug;
                  return (
                    <div key={loadKey} className="flat-template-card">
                      <div>
                        <strong>{t.title}</strong>
                        {isAdmin && <span className="flat-badge">Starter</span>}
                        {!isAdmin && t.is_default && <span className="flat-badge">Default</span>}
                        {!isAdmin && t.description && <p className="flat-muted">{t.description}</p>}
                      </div>
                      <button
                        type="button"
                        className="flat-tool-btn flat-tool-btn-accent"
                        disabled={loadingSlug === loadKey}
                        onClick={() =>
                          isAdmin ? handleLoadStarter(slug) : handleLoadPublished(slug)
                        }
                      >
                        {loadingSlug === loadKey ? 'Loading…' : 'Load'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
