(function (global) {
  'use strict';

  const SESSION_RECENT_MAX = 12;
  const RECENT_DISPLAY_MAX = 8;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeTag(raw) {
    if (raw == null) return null;
    let tag = String(raw).toLowerCase().trim().replace(/\s+/g, '-');
    tag = tag.replace(/[^a-z0-9_-]/g, '');
    if (!tag || tag.length > 50) return null;
    return tag;
  }

  function parseSearchTerms(query) {
    if (!query || !String(query).trim()) return [];
    return String(query)
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function normalizeFilterQuery(query) {
    if (query == null) return { tags: [], text: '' };
    if (typeof query === 'string') {
      const terms = parseSearchTerms(query);
      return { tags: terms, text: '' };
    }
    if (typeof query === 'object') {
      const tags = Array.isArray(query.tags)
        ? query.tags.map((t) => normalizeTag(t)).filter(Boolean)
        : [];
      const text = query.text != null ? String(query.text).trim().toLowerCase() : '';
      return { tags, text };
    }
    return { tags: [], text: '' };
  }

  function assetMatchesSearch(asset, query) {
    const { tags: filterTags, text } = normalizeFilterQuery(query);
    if (!filterTags.length && !text) return true;

    const name = (asset.name || '').toLowerCase();
    const assetTags = Array.isArray(asset.tags)
      ? asset.tags.map((t) => String(t).toLowerCase())
      : [];

    const nameMatch = text ? name.includes(text) : false;
    const tagMatch = filterTags.length
      ? filterTags.some((term) => assetTags.some((tag) => tag.includes(term)))
      : false;

    if (filterTags.length && text) return nameMatch || tagMatch;
    if (text) return nameMatch;
    if (filterTags.length) return tagMatch;
    return true;
  }

  function renderTagChips(tags) {
    if (!tags || !tags.length) return '';
    return (
      '<div class="asset-tag-chips">' +
      tags.map((tag) => `<span class="asset-tag-chip">${escapeHtml(tag)}</span>`).join('') +
      '</div>'
    );
  }

  function getSessionRecentTags(storageKey) {
    if (!storageKey) return [];
    try {
      const raw = sessionStorage.getItem(`${storageKey}:recent`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function pushSessionRecentTag(storageKey, tag) {
    if (!storageKey || !tag) return;
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    const existing = getSessionRecentTags(storageKey).filter((t) => t !== normalized);
    existing.unshift(normalized);
    try {
      sessionStorage.setItem(
        `${storageKey}:recent`,
        JSON.stringify(existing.slice(0, SESSION_RECENT_MAX))
      );
    } catch (_) {}
  }

  function mergeRecentTagLists(dbTags, sessionTags, max) {
    const out = [];
    const seen = new Set();
    const add = (tag) => {
      const n = normalizeTag(tag);
      if (!n || seen.has(n)) return;
      seen.add(n);
      out.push(n);
    };
    (dbTags || []).forEach((item) => add(typeof item === 'string' ? item : item.tag));
    (sessionTags || []).forEach(add);
    return out.slice(0, max || RECENT_DISPLAY_MAX);
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

      const panelClass =
        theme === 'light' ? 'asset-tags-modal-panel light' : 'asset-tags-modal-panel';
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

    const panelClass =
      theme === 'light' ? 'asset-tags-modal-panel light' : 'asset-tags-modal-panel';
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

  const AssetTagFilterBar = {
    create(container, options = {}) {
      if (!container) return null;

      const {
        theme = 'dark',
        placeholder = 'Filename...',
        storageKey = '',
        fetchRecentTags = async () => [],
        fetchAllTags = async () => [],
        onChange = null,
      } = options;

      const state = { tags: [], text: '', allPanelOpen: false };
      let dbRecentTags = [];
      let allTagsCache = null;

      container.innerHTML = '';
      const root = document.createElement('div');
      root.className = `asset-tag-filter${theme === 'light' ? ' light' : ''}`;

      root.innerHTML = `
        <div class="asset-tag-filter-row">
          <div class="asset-tag-filter-combo" tabindex="-1">
            <div class="asset-tag-filter-chips"></div>
            <input type="text" class="asset-tag-filter-text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(placeholder)}" aria-label="Filter by filename" />
          </div>
          <div class="asset-tag-filter-recent-wrap">
            <span class="asset-tag-filter-recent-label">Recent:</span>
            <div class="asset-tag-filter-recent"></div>
          </div>
          <button type="button" class="asset-tag-filter-show-all" aria-expanded="false">Show All Tags</button>
        </div>
        <div class="asset-tag-filter-all-panel" hidden>
          <div class="asset-tag-filter-all-list"></div>
        </div>
      `;

      container.appendChild(root);

      const combo = root.querySelector('.asset-tag-filter-combo');
      const chipsEl = root.querySelector('.asset-tag-filter-chips');
      const textInput = root.querySelector('.asset-tag-filter-text');
      const recentEl = root.querySelector('.asset-tag-filter-recent');
      const showAllBtn = root.querySelector('.asset-tag-filter-show-all');
      const allPanel = root.querySelector('.asset-tag-filter-all-panel');
      const allListEl = root.querySelector('.asset-tag-filter-all-list');

      function emitChange() {
        if (typeof onChange === 'function') {
          onChange({ tags: [...state.tags], text: state.text });
        }
      }

      function renderSelectedChips() {
        chipsEl.innerHTML = state.tags
          .map(
            (tag) =>
              `<span class="asset-tag-filter-chip" data-tag="${escapeHtml(tag)}">` +
              `<span class="asset-tag-filter-chip-label">${escapeHtml(tag)}</span>` +
              `<button type="button" class="asset-tag-filter-chip-remove" aria-label="Remove ${escapeHtml(tag)}">&times;</button>` +
              `</span>`
          )
          .join('');

        chipsEl.querySelectorAll('.asset-tag-filter-chip-remove').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chip = btn.closest('.asset-tag-filter-chip');
            const tag = chip?.dataset.tag;
            if (!tag) return;
            state.tags = state.tags.filter((t) => t !== tag);
            renderSelectedChips();
            emitChange();
            textInput.focus();
          });
        });
      }

      function renderRecent() {
        const sessionRecent = getSessionRecentTags(storageKey);
        const merged = mergeRecentTagLists(dbRecentTags, sessionRecent, RECENT_DISPLAY_MAX);
        const wrap = root.querySelector('.asset-tag-filter-recent-wrap');
        if (!merged.length) {
          if (wrap) wrap.style.display = 'none';
          recentEl.innerHTML = '';
          return;
        }
        if (wrap) wrap.style.display = '';
        recentEl.innerHTML = merged
          .map(
            (tag) =>
              `<button type="button" class="asset-tag-filter-suggest" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
          )
          .join('');

        recentEl.querySelectorAll('.asset-tag-filter-suggest').forEach((btn) => {
          btn.addEventListener('click', () => addTag(btn.dataset.tag, { fromClick: true }));
        });
      }

      function renderAllTagsList(tags) {
        if (!tags || !tags.length) {
          allListEl.innerHTML = '<p class="asset-tag-filter-empty">No tags yet.</p>';
          return;
        }
        allListEl.innerHTML = tags
          .map((item) => {
            const tag = typeof item === 'string' ? item : item.tag;
            const count =
              item && item.count != null ? `<span class="asset-tag-filter-count">(${item.count})</span>` : '';
            return `<button type="button" class="asset-tag-filter-all-item" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}${count}</button>`;
          })
          .join('');

        allListEl.querySelectorAll('.asset-tag-filter-all-item').forEach((btn) => {
          btn.addEventListener('click', () => addTag(btn.dataset.tag, { fromClick: true }));
        });
      }

      function addTag(raw, { fromClick = false } = {}) {
        const tag = normalizeTag(raw);
        if (!tag) return;
        if (state.tags.includes(tag)) {
          if (fromClick) pushSessionRecentTag(storageKey, tag);
          renderRecent();
          return;
        }
        state.tags.push(tag);
        if (fromClick) pushSessionRecentTag(storageKey, tag);
        renderSelectedChips();
        renderRecent();
        emitChange();
        textInput.value = '';
        state.text = '';
        textInput.focus();
      }

      function commitInputToken() {
        const raw = textInput.value.trim();
        if (!raw) return;
        const parts = raw.split(',');
        const trailing = parts.pop() || '';
        parts.forEach((p) => addTag(p.trim()));
        textInput.value = trailing.trim();
        state.text = trailing.trim().toLowerCase();
        emitChange();
      }

      function setAllPanelOpen(open) {
        state.allPanelOpen = open;
        showAllBtn.classList.toggle('active', open);
        showAllBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        allPanel.hidden = !open;
        allPanel.classList.toggle('is-open', open);
      }

      textInput.addEventListener('input', () => {
        state.text = textInput.value.trim().toLowerCase();
        emitChange();
      });

      textInput.addEventListener('keydown', (e) => {
        if (e.key === ',' || e.key === 'Enter') {
          e.preventDefault();
          commitInputToken();
          return;
        }
        if (e.key === 'Backspace' && !textInput.value && state.tags.length) {
          state.tags.pop();
          renderSelectedChips();
          emitChange();
        }
      });

      textInput.addEventListener('blur', () => {
        if (textInput.value.includes(',')) commitInputToken();
      });

      combo.addEventListener('click', () => textInput.focus());

      showAllBtn.addEventListener('click', async () => {
        const next = !state.allPanelOpen;
        if (next) {
          if (!allTagsCache) {
            allListEl.innerHTML = '<p class="asset-tag-filter-empty">Loading...</p>';
            try {
              allTagsCache = await fetchAllTags();
            } catch (_) {
              allTagsCache = [];
            }
          }
          renderAllTagsList(allTagsCache);
        }
        setAllPanelOpen(next);
      });

      async function refreshTagLists() {
        try {
          dbRecentTags = await fetchRecentTags();
        } catch (_) {
          dbRecentTags = [];
        }
        allTagsCache = null;
        renderRecent();
        if (state.allPanelOpen) {
          try {
            allTagsCache = await fetchAllTags();
          } catch (_) {
            allTagsCache = [];
          }
          renderAllTagsList(allTagsCache);
        }
      }

      renderSelectedChips();
      refreshTagLists();

      return {
        getState() {
          return { tags: [...state.tags], text: state.text };
        },
        setState({ tags = [], text = '' } = {}) {
          state.tags = (Array.isArray(tags) ? tags : [])
            .map((t) => normalizeTag(t))
            .filter(Boolean);
          state.text = text != null ? String(text).trim().toLowerCase() : '';
          textInput.value = state.text;
          renderSelectedChips();
          emitChange();
        },
        clear() {
          state.tags = [];
          state.text = '';
          textInput.value = '';
          setAllPanelOpen(false);
          renderSelectedChips();
          emitChange();
        },
        refreshTagLists,
        destroy() {
          container.innerHTML = '';
        },
      };
    },
  };

  global.AssetTagsUI = {
    escapeHtml,
    normalizeTag,
    parseSearchTerms,
    normalizeFilterQuery,
    assetMatchesSearch,
    renderTagChips,
    getSessionRecentTags,
    pushSessionRecentTag,
    mergeRecentTagLists,
    openEditTagsModal,
    openTagBrowserModal,
    AssetTagFilterBar,
  };
})(typeof window !== 'undefined' ? window : global);
