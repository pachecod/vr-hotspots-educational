(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseSearchTerms(query) {
    if (!query || !String(query).trim()) return [];
    return String(query)
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function assetMatchesSearch(asset, query) {
    const terms = parseSearchTerms(query);
    if (!terms.length) return true;
    const name = (asset.name || '').toLowerCase();
    const tags = Array.isArray(asset.tags) ? asset.tags.map((t) => String(t).toLowerCase()) : [];
    return terms.some(
      (term) => name.includes(term) || tags.some((tag) => tag.includes(term))
    );
  }

  function renderTagChips(tags) {
    if (!tags || !tags.length) return '';
    return (
      '<div class="asset-tag-chips">' +
      tags
        .map((tag) => `<span class="asset-tag-chip">${escapeHtml(tag)}</span>`)
        .join('') +
      '</div>'
    );
  }

  function closeModal(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function openEditTagsModal({ assetName, tags, onSave, theme }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'asset-tags-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const panelClass = theme === 'light' ? 'asset-tags-modal-panel light' : 'asset-tags-modal-panel';
      const initial = Array.isArray(tags) ? tags.join(', ') : '';

      overlay.innerHTML = `
        <div class="${panelClass}">
          <div class="asset-tags-modal-header">
            <h3>Edit Tags</h3>
            <button type="button" class="asset-tags-modal-close" aria-label="Close">&times;</button>
          </div>
          <p class="asset-tags-filename">File: <strong>${escapeHtml(assetName)}</strong></p>
          <label class="asset-tags-hint" for="asset-tags-input">Tags (comma-separated)</label>
          <input type="text" id="asset-tags-input" class="asset-tags-input" value="${escapeHtml(initial)}" placeholder="landscape, nature, outdoor" />
          <p class="asset-tags-hint">Use tags to organize and quickly find your files.</p>
          <div class="asset-tags-modal-actions">
            <button type="button" class="asset-tags-btn asset-tags-btn-cancel">Cancel</button>
            <button type="button" class="asset-tags-btn asset-tags-btn-save">Save</button>
          </div>
        </div>
      `;

      const input = overlay.querySelector('#asset-tags-input');
      const finish = (result) => {
        closeModal(overlay);
        resolve(result);
      };

      overlay.querySelector('.asset-tags-modal-close').addEventListener('click', () => finish(null));
      overlay.querySelector('.asset-tags-btn-cancel').addEventListener('click', () => finish(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(null);
      });

      overlay.querySelector('.asset-tags-btn-save').addEventListener('click', async () => {
        const tagArray = input.value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (typeof onSave === 'function') {
          const saveBtn = overlay.querySelector('.asset-tags-btn-save');
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          try {
            const ok = await onSave(tagArray);
            if (ok !== false) finish(tagArray);
            else {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save';
            }
          } catch (err) {
            alert(err.message || 'Failed to save tags');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
          }
        } else {
          finish(tagArray);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('.asset-tags-btn-save').click();
        if (e.key === 'Escape') finish(null);
      });

      document.body.appendChild(overlay);
      input.focus();
    });
  }

  function openTagBrowserModal({ tags, onSelectTag, theme }) {
    const overlay = document.createElement('div');
    overlay.className = 'asset-tags-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panelClass = theme === 'light' ? 'asset-tags-modal-panel light' : 'asset-tags-modal-panel';
    const listHtml =
      tags && tags.length
        ? tags
            .map(
              (item) =>
                `<button type="button" class="asset-tags-browser-item" data-tag="${escapeHtml(item.tag)}">${escapeHtml(item.tag)}<span class="count">(${item.count})</span></button>`
            )
            .join('')
        : '<p class="asset-tags-hint">No tags yet.</p>';

    overlay.innerHTML = `
      <div class="${panelClass}">
        <div class="asset-tags-modal-header">
          <h3>Browse Tags</h3>
          <button type="button" class="asset-tags-modal-close" aria-label="Close">&times;</button>
        </div>
        <p class="asset-tags-hint">Click a tag to add it to your search.</p>
        <div class="asset-tags-browser-list">${listHtml}</div>
      </div>
    `;

    const close = () => closeModal(overlay);
    overlay.querySelector('.asset-tags-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('.asset-tags-browser-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof onSelectTag === 'function') onSelectTag(btn.dataset.tag);
        close();
      });
    });

    document.body.appendChild(overlay);
  }

  global.AssetTagsUI = {
    escapeHtml,
    parseSearchTerms,
    assetMatchesSearch,
    renderTagChips,
    openEditTagsModal,
    openTagBrowserModal,
  };
})(typeof window !== 'undefined' ? window : global);
