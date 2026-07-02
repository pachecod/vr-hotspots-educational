/** Admin workflow: edit combined 360° + flat templates in the main editor and save to welcome. */
const AdminCombinedTemplateMode = {
  templateId: null,
  meta: null,
  starterSlug: null,

  async checkAdminAndStart(startEditor) {
    try {
      const res = await fetch('/admin/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated) {
        window.location.href = '/admin-templates.html';
        return;
      }
      startEditor();
    } catch (_) {
      window.location.href = '/admin-templates.html';
    }
  },

  bindUi() {
    const bar = document.getElementById('admin-combined-bar');
    if (!bar) return;
    bar.classList.add('visible');
    document.getElementById('admin-combined-back-btn')?.addEventListener('click', () => {
      window.location.href = '/admin-templates.html';
    });
    document.getElementById('admin-combined-save-btn')?.addEventListener('click', () => {
      this.saveToWelcomeSample();
    });
    const saveTemplateBtn = document.getElementById('save-template');
    if (saveTemplateBtn) {
      saveTemplateBtn.textContent = 'Save to Welcome Sample';
      saveTemplateBtn.title = 'Upload bundle to this welcome-screen template';
    }
  },

  setStatus(message, isError = false) {
    const el = document.getElementById('admin-combined-status');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#ffcdd2' : 'rgba(255,255,255,0.85)';
  },

  async init(templateId, starterSlug = '') {
    this.templateId = templateId;
    this.starterSlug = starterSlug || null;

    const loginGate = document.getElementById('student-login-gate');
    if (loginGate) loginGate.style.display = 'none';
    if (typeof window.setEntryGateActive === 'function') window.setEntryGateActive(false);

    const submitSection = document.getElementById('submit-to-professor')?.closest('.panel-section');
    if (submitSection) submitSection.style.display = 'none';

    this.bindUi();
    this.setStatus('Loading template…');

    try {
      const res = await adminFetch(`/admin/templates/${encodeURIComponent(templateId)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Template not found');
      this.meta = data.template;
      if (this.meta.scope !== 'combined') {
        throw new Error('This editor mode is only for combined (360° + flat) templates.');
      }

      const metaEl = document.getElementById('admin-combined-meta');
      if (metaEl) {
        metaEl.textContent = this.meta.title || 'Combined sample';
      }

      const nameInput = document.getElementById('template-name');
      if (nameInput) nameInput.value = this.meta.title || '';

      await this.waitForEditor();

      let blob = null;
      if (this.meta.bundle_b2_key) {
        const bundleRes = await adminFetch(
          `/admin/templates/${encodeURIComponent(templateId)}/bundle`
        );
        if (!bundleRes.ok) throw new Error('Could not download saved bundle');
        blob = await bundleRes.blob();
      } else {
        let starter = this.starterSlug;
        if (!starter) {
          const listRes = await adminFetch('/admin/starter-templates/combined/list');
          const listData = await listRes.json();
          starter = listData.templates?.[0]?.slug || 'newhouse60th';
        }
        const starterRes = await adminFetch(
          `/admin/starter-templates/${encodeURIComponent(starter)}/combined-bundle`
        );
        if (!starterRes.ok) {
          const err = await starterRes.json().catch(() => ({}));
          throw new Error(err.message || 'Could not load starter bundle');
        }
        blob = await starterRes.blob();
      }

      await window.hotspotEditor.loadZIPTemplate(blob, { silent: true });
      this.setStatus(
        this.meta.bundle_b2_key
          ? 'Editing saved bundle — click Save to Welcome Sample when done.'
          : 'Loaded starter project — click Save to Welcome Sample when done.'
      );
    } catch (err) {
      this.setStatus(err.message || 'Failed to load template', true);
      alert(err.message || 'Failed to load combined template');
    }
  },

  waitForEditor() {
    return new Promise((resolve) => {
      const tick = () => {
        if (window.hotspotEditor) resolve();
        else setTimeout(tick, 200);
      };
      tick();
    });
  },

  async saveToWelcomeSample() {
    if (!this.templateId || !window.hotspotEditor) return;

    const title =
      document.getElementById('template-name')?.value?.trim() || this.meta?.title || 'Combined sample';
    const saveBtn = document.getElementById('admin-combined-save-btn');
    const panelSaveBtn = document.getElementById('save-template');

    try {
      if (saveBtn) saveBtn.disabled = true;
      if (panelSaveBtn) panelSaveBtn.disabled = true;
      this.setStatus('Building bundle…');

      if (
        window.flatPageEditor &&
        typeof window.flatPageEditor.ensureBundleRelativeVrEmbeds === 'function'
      ) {
        window.flatPageEditor.ensureBundleRelativeVrEmbeds();
      }
      window.hotspotEditor.vrTourEmbed = {
        hostedUrl: null,
        hostedPath: null,
        qrUrl: null,
        publishedAt: null,
      };

      const blob = await window.hotspotEditor.buildCompleteProjectZipBlob(title, 'bundle');
      const fd = new FormData();
      fd.append('bundle', blob, `${this.meta?.slug || 'combined-sample'}.zip`);

      this.setStatus('Uploading bundle…');
      const uploadRes = await adminFetch(`/admin/templates/${encodeURIComponent(this.templateId)}/bundle`, {
        method: 'POST',
        body: fd,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.message || 'Bundle upload failed');
      }

      this.setStatus('Updating template…');
      await adminFetch(`/admin/templates/${encodeURIComponent(this.templateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          is_playground: true,
          is_public: true,
        }),
      });

      try {
        await adminFetch(`/admin/templates/${encodeURIComponent(this.templateId)}/generate-thumbnail`, {
          method: 'POST',
        });
      } catch (_) {}

      this.meta = uploadData.template || this.meta;
      this.setStatus('Saved to welcome screen ✓');
      if (
        confirm(
          `Saved "${title}" to the welcome screen.\n\nReturn to Templates to reorder or edit the description?`
        )
      ) {
        window.location.href = '/admin-templates.html';
      }
    } catch (err) {
      this.setStatus(err.message || 'Save failed', true);
      alert(err.message || 'Could not save welcome sample');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (panelSaveBtn) panelSaveBtn.disabled = false;
    }
  },
};

window.AdminCombinedTemplateMode = AdminCombinedTemplateMode;
