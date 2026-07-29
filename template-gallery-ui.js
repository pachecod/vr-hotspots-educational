/**
 * Template Gallery for spherical (360°) Editing Tools — same data as flat editor Templates.
 * Flat mode already has its own Templates button in FlatPageEditorUI.
 */
(function (global) {
  function dialogZ() {
    return (global.EDITOR_LAYER && global.EDITOR_LAYER.dialog) || 10050;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchPublicTemplates() {
    const res = await fetch('/api/templates');
    const data = await res.json().catch(() => ({}));
    if (!data.success) throw new Error(data.message || 'Failed to load templates');
    return data.templates || [];
  }

  async function fetchTemplateBySlug(slug) {
    const res = await fetch(`/api/templates/${encodeURIComponent(slug)}`);
    const data = await res.json().catch(() => ({}));
    if (!data.success) throw new Error(data.message || 'Template not found');
    return data.template;
  }

  async function fetchTemplateBundle(slug) {
    const res = await fetch(`/api/templates/${encodeURIComponent(slug)}/bundle`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Could not download project bundle');
    }
    return res.blob();
  }

  async function loadCombined(slug) {
    const blob = await fetchTemplateBundle(slug);
    if (!global.hotspotEditor || typeof global.hotspotEditor.loadZIPTemplate !== 'function') {
      throw new Error('360° editor is not ready. Please reload the page.');
    }
    await global.hotspotEditor.loadZIPTemplate(blob, {
      silent: true,
      initialContentMode: 'spherical',
    });
  }

  async function loadTemplateIntoEditor(template) {
    if (template?.scope === 'combined' && template?.has_bundle) {
      await loadCombined(template.slug);
      return;
    }
    const bridge = global.flatPageEditor;
    if (!bridge || typeof bridge.loadTemplate !== 'function') {
      throw new Error('Flat page editor is not ready. Please reload the page.');
    }
    if (!bridge.loadTemplate(template)) {
      throw new Error('This template has no loadable flat page files.');
    }
    if (global.hotspotEditor && typeof global.hotspotEditor.setContentMode === 'function') {
      await global.hotspotEditor.setContentMode('flat', { skipVrGenerate: true });
    }
  }

  async function confirmReplaceIfNeeded() {
    const isGuest =
      typeof global.getEditorCapabilities === 'function' &&
      global.getEditorCapabilities().isTestUser;
    if (!isGuest) {
      return window.confirm(
        'Loading a template replaces your current editor work. Continue?'
      );
    }
    if (global.LocalProjects) {
      const count = await global.LocalProjects.count().catch(() => 0);
      const msg =
        count > 0
          ? 'Loading a template replaces your current editor work. Save Locally first if you want to keep it. Continue?'
          : 'Loading a template replaces your current editor work. Continue?';
      return window.confirm(msg);
    }
    return window.confirm('Loading a template replaces your current editor work. Continue?');
  }

  const SphericalTemplateGallery = {
    async show() {
      const existing = document.getElementById('spherical-template-gallery');
      if (existing) existing.remove();

      const dialog = document.createElement('div');
      dialog.id = 'spherical-template-gallery';
      dialog.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:${dialogZ()};
        display:flex;align-items:center;justify-content:center;font-family:Arial;
      `;
      dialog.innerHTML = `
        <div style="background:#2a2a2a;color:#fff;border-radius:10px;padding:24px;max-width:640px;width:92%;max-height:85vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.45);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
            <h3 style="margin:0;color:#4CAF50;">Template Gallery</h3>
            <button type="button" id="spherical-tpl-close-x" style="background:transparent;border:none;color:#aaa;font-size:24px;line-height:1;cursor:pointer;" aria-label="Close">×</button>
          </div>
          <p style="margin:0 0 16px;color:#aaa;font-size:13px;line-height:1.45;">
            Same templates as Flat Web Page → Templates. Combined projects open in 360°; flat-only templates switch you to Flat Web Page.
          </p>
          <div id="spherical-tpl-list"><p style="color:#aaa;">Loading templates…</p></div>
          <button type="button" id="spherical-tpl-close" style="margin-top:16px;padding:10px 20px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>
        </div>`;
      document.body.appendChild(dialog);

      const close = () => dialog.remove();
      dialog.querySelector('#spherical-tpl-close').addEventListener('click', close);
      dialog.querySelector('#spherical-tpl-close-x').addEventListener('click', close);
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) close();
      });

      const list = dialog.querySelector('#spherical-tpl-list');
      let templates = [];
      try {
        templates = await fetchPublicTemplates();
      } catch (err) {
        list.innerHTML = `<p style="color:#ef9a9a;">${escapeHtml(err.message || 'Could not load templates')}</p>`;
        return;
      }

      if (!templates.length) {
        list.innerHTML =
          '<p style="color:#aaa;">No public templates yet. Ask your team leader or teacher to add some.</p>';
        return;
      }

      list.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${templates
        .map((t) => {
          const badges = [];
          if (t.is_default) badges.push('Default');
          if (t.scope === 'combined') badges.push('360° + Flat');
          const badgeHtml = badges
            .map(
              (b) =>
                `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:10px;background:#455a64;font-size:11px;">${escapeHtml(b)}</span>`
            )
            .join('');
          const desc = t.description
            ? `<p style="margin:6px 0 0;color:#aaa;font-size:12px;line-height:1.4;">${escapeHtml(t.description)}</p>`
            : '';
          return `
            <div style="border:1px solid #555;border-radius:6px;padding:12px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;">
              <div style="min-width:0;">
                <strong>${escapeHtml(t.title || t.slug)}</strong>${badgeHtml}
                ${desc}
              </div>
              <button type="button" data-slug="${escapeHtml(t.slug)}" class="spherical-tpl-load" style="flex-shrink:0;padding:8px 14px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">Load</button>
            </div>`;
        })
        .join('')}</div>`;

      list.querySelectorAll('.spherical-tpl-load').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const slug = btn.getAttribute('data-slug');
          if (!slug) return;
          const ok = await confirmReplaceIfNeeded();
          if (!ok) return;
          btn.disabled = true;
          btn.textContent = 'Loading…';
          try {
            const template = await fetchTemplateBySlug(slug);
            await loadTemplateIntoEditor(template);
            close();
          } catch (err) {
            alert(err.message || 'Could not load template');
            btn.disabled = false;
            btn.textContent = 'Load';
          }
        });
      });
    },

    bind() {
      const btn = document.getElementById('spherical-templates-btn');
      if (!btn || btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.show());
    },
  };

  global.SphericalTemplateGallery = SphericalTemplateGallery;
})(typeof window !== 'undefined' ? window : globalThis);
