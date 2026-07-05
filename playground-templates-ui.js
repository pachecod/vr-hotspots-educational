async function fetchPlaygroundConfig() {
  const res = await fetch('/api/playground/config');
  if (!res.ok) return { enabled: false };
  return res.json();
}

async function fetchPlaygroundTemplates() {
  const res = await fetch('/api/playground/templates');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load templates');
  return data;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scopeBadgeLabel(scope) {
  return scope === 'combined' ? '360° + Web' : 'Flat page';
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function bindPlaygroundGridClicks(gridWrap, templates, state, { containerId, onAuthenticated }) {
  gridWrap.addEventListener('click', async (e) => {
    const btn = e.target.closest('.welcome-playground-card');
    if (!btn || state.loadingSlug) return;
    const slug = btn.dataset.slug;
    if (!slug) return;
    state.loadingSlug = slug;
    gridWrap.innerHTML = renderPlaygroundCards(templates, state.loadingSlug);
    try {
      await openPlaygroundTemplate(slug, { containerId, onAuthenticated });
    } catch (err) {
      if (!err || err.code !== 'GUEST_AGREEMENT_CANCELLED') {
        alert(err.message || 'Could not open sample project');
      }
    } finally {
      state.loadingSlug = null;
      gridWrap.innerHTML = renderPlaygroundCards(templates, state.loadingSlug);
    }
  });
}

function renderPlaygroundCards(templates, loadingSlug) {
  if (!templates.length) {
    return '<p class="welcome-playground-empty">No public templates are available yet.</p>';
  }
  return `<div class="welcome-playground-grid">${templates
    .map(
      (t) => `
    <button type="button" class="welcome-playground-card" data-slug="${escapeHtml(t.slug)}" ${
        loadingSlug === t.slug ? 'disabled' : ''
      }>
      <div class="welcome-playground-thumb${t.thumbnail_url ? ' has-image' : ''}">
        ${
          t.thumbnail_url
            ? `<img src="${escapeAttr(t.thumbnail_url)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.remove('has-image');var f=this.parentElement.querySelector('.welcome-playground-thumb-fallback');if(f)f.style.display='flex';" />`
            : ''
        }
        <span class="welcome-playground-thumb-fallback"${t.thumbnail_url ? ' style="display:none"' : ''}>🌐</span>
      </div>
      <div class="welcome-playground-card-body">
        <div class="welcome-playground-card-title">${escapeHtml(t.title)}</div>
        <div class="welcome-playground-card-scope">${scopeBadgeLabel(t.scope)}</div>
        ${t.description ? `<div class="welcome-playground-card-desc">${escapeHtml(t.description)}</div>` : ''}
        <span class="welcome-playground-card-cta">${loadingSlug === t.slug ? 'Opening…' : 'Open sample'}</span>
      </div>
    </button>`
    )
    .join('')}</div>`;
}

async function mountPlaygroundTemplatesSection(innerEl, { containerId, onAuthenticated, welcomeInner }) {
  const shell = welcomeInner || innerEl.closest('#integrated-welcome-inner');
  let section = innerEl.querySelector('.welcome-playground-section');
  if (!section) {
    section = document.createElement('div');
    section.className = 'welcome-playground-section';
    innerEl.appendChild(section);
  }
  section.innerHTML =
    '<p class="welcome-playground-loading">Loading sample projects…</p>';

  try {
    const config = await fetchPlaygroundConfig();
    if (!config.enabled) {
      section.remove();
      if (shell) shell.classList.remove('integrated-welcome-with-playground');
      return;
    }

    if (shell) shell.classList.add('integrated-welcome-with-playground');
    const data = await fetchPlaygroundTemplates();

    section.innerHTML = `
      <div class="welcome-playground-head">
        <h3 class="welcome-playground-title">Try a sample project</h3>
        <p class="welcome-playground-subtitle">No sign-in required — open in guest mode and explore.</p>
      </div>
      <div class="welcome-playground-grid-wrap">${renderPlaygroundCards(data.templates || [], null)}</div>
    `;

    const gridWrap = section.querySelector('.welcome-playground-grid-wrap');
    bindPlaygroundGridClicks(gridWrap, data.templates || [], { loadingSlug: null }, { containerId, onAuthenticated });
  } catch (err) {
    section.innerHTML = `<p class="welcome-playground-error">${escapeHtml(err.message || 'Failed to load templates.')}</p>`;
  }
}

async function renderGuestTemplatePicker(containerId, onAuthenticated) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (typeof window.setEntryGateActive === 'function') window.setEntryGateActive(true);
  if (typeof window.hideSceneLoadingOverlay === 'function') window.hideSceneLoadingOverlay();

  let inner = container.querySelector('#integrated-welcome-inner');
  if (!inner) {
    container.innerHTML = `
      <div id="student-login-shell">
        <div id="integrated-welcome-inner" class="guest-template-picker"></div>
      </div>`;
    inner = container.querySelector('#integrated-welcome-inner');
  } else {
    inner.className = 'guest-template-picker';
    inner.innerHTML = '<p class="welcome-playground-loading">Loading templates…</p>';
  }

  const enterEditorWithoutTemplate = () => {
    if (typeof window.beginIntegratedWelcomeAfterAuth === 'function') {
      window.beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, null);
    } else if (typeof onAuthenticated === 'function') {
      onAuthenticated(null);
    }
  };

  try {
    const config = await fetchPlaygroundConfig();
    if (!config.enabled) {
      enterEditorWithoutTemplate();
      return;
    }

    const data = await fetchPlaygroundTemplates();
    const templates = data.templates || [];
    if (!templates.length) {
      enterEditorWithoutTemplate();
      return;
    }

    inner.innerHTML = `
      <button type="button" id="guest-template-picker-back" class="guest-template-picker-back" aria-label="Back to welcome">← Back</button>
      <div class="guest-template-picker-content">
        <div class="welcome-playground-head guest-template-picker-head">
          <h2 class="welcome-playground-title">Choose a template to start from</h2>
          <p class="welcome-playground-subtitle guest-template-picker-hint">You can change your template later by clicking the <strong>Templates</strong> menu item at the upper left of the flat page editor.</p>
        </div>
        <div class="welcome-playground-grid-wrap">${renderPlaygroundCards(templates, null)}</div>
      </div>
    `;

    document.getElementById('guest-template-picker-back')?.addEventListener('click', async () => {
      window.__guestAgreementAccepted = false;
      try {
        await fetch('/api/local/test-user/end', { method: 'POST', credentials: 'include' });
      } catch (_) {}
      window.editorAccessMode = 'none';
      window.currentStudent = null;
      if (typeof window.renderIntegratedAuthStep === 'function') {
        window.renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: true });
      }
    });

    const gridWrap = inner.querySelector('.welcome-playground-grid-wrap');
    bindPlaygroundGridClicks(gridWrap, templates, { loadingSlug: null }, { containerId, onAuthenticated });
  } catch (err) {
    inner.innerHTML = `<p class="welcome-playground-error">${escapeHtml(err.message || 'Failed to load templates.')}</p>`;
  }
}

async function fetchGuestAgreementPage() {
  const res = await fetch('/api/legal/guest-agreement');
  const data = await res.json();
  if (!res.ok || !data.success || !data.page) {
    throw new Error(data.message || 'Could not load guest agreement');
  }
  return data.page;
}

function shouldPromptGuestAgreement() {
  return window.editorAccessMode !== 'student' && !window.__guestAgreementAccepted;
}

function closeGuestAgreementOverlay() {
  const overlay = document.getElementById('guest-agreement-overlay');
  if (overlay) overlay.remove();
  document.body.classList.remove('guest-agreement-open');
}

function getGuestAgreementMountNode() {
  if (document.body.classList.contains('entry-gate-active')) {
    const gate = document.getElementById('student-login-gate');
    if (gate) return gate;
  }
  return document.body;
}

function showGuestAgreementOverlay(page) {
  return new Promise((resolve) => {
    closeGuestAgreementOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'guest-agreement-overlay';
    overlay.className = 'guest-agreement-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'guest-agreement-title');

    const styleBlock = page.css_content
      ? `<style>${page.css_content}</style>`
      : '';

    overlay.innerHTML = `
      <div class="guest-agreement-backdrop" data-action="cancel"></div>
      <div class="guest-agreement-dialog">
        <h2 id="guest-agreement-title" class="guest-agreement-title">${escapeHtml(page.title)}</h2>
        <div class="guest-agreement-content">${page.content}</div>
        <div class="guest-agreement-actions">
          <button type="button" class="guest-agreement-btn guest-agreement-cancel" data-action="cancel">Cancel</button>
          <button type="button" class="guest-agreement-btn guest-agreement-agree" data-action="agree">I Agree</button>
        </div>
      </div>
      ${styleBlock}
    `;

    const finish = (agreed) => {
      if (agreed) window.__guestAgreementAccepted = true;
      closeGuestAgreementOverlay();
      document.removeEventListener('keydown', onKeyDown);
      resolve(agreed);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish(false);
    };

    overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'agree') finish(true);
      if (action === 'cancel') finish(false);
    });

    document.addEventListener('keydown', onKeyDown);
    getGuestAgreementMountNode().appendChild(overlay);
    document.body.classList.add('guest-agreement-open');
    overlay.querySelector('.guest-agreement-agree')?.focus();
  });
}

async function promptGuestAgreementIfNeeded(options = {}) {
  if (!shouldPromptGuestAgreement()) return true;
  const page = await fetchGuestAgreementPage();
  const agreed = await showGuestAgreementOverlay(page);
  if (!agreed && options.onDeclineReturnToWelcome && typeof window.returnToWelcomeScreen === 'function') {
    await window.returnToWelcomeScreen();
  }
  return agreed;
}

async function ensureGuestSessionForPlayground() {
  if (window.editorAccessMode === 'local_test' || window.editorAccessMode === 'student') return;
  const res = await fetch('/api/local/test-user/start', { method: 'POST', credentials: 'include' });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not start guest mode');
  }
  window.editorAccessMode = 'local_test';
  window.currentStudent = null;
}

async function openPlaygroundTemplate(slug, { containerId, onAuthenticated } = {}) {
  if (!slug) return;

  window.__pendingPlaygroundSlug = slug;
  window.__playgroundTemplateLoading = true;
  window.__playgroundGuestTemplate = true;
  window.__integratedWelcomePending = false;

  await ensureGuestSessionForPlayground();

  if (typeof showTestUserEditorSession === 'function') showTestUserEditorSession();
  if (typeof window.applyEditorCapabilities === 'function') window.applyEditorCapabilities();

  if (window.hotspotEditor && typeof window.runPendingPlaygroundLoad === 'function') {
    await window.runPendingPlaygroundLoad();
    return;
  }

  // Playground samples skip the post-auth 360°/flat welcome — agreement + load happen in runPendingPlaygroundLoad.
  if (typeof onAuthenticated === 'function') {
    onAuthenticated(window.currentStudent || null);
  }
}

async function promptGuestAgreementAfterPlaygroundLoad() {
  if (!shouldPromptGuestAgreement()) return true;
  const agreed = await promptGuestAgreementIfNeeded({ onDeclineReturnToWelcome: true });
  if (!agreed) {
    const err = new Error('Guest agreement cancelled');
    err.code = 'GUEST_AGREEMENT_CANCELLED';
    throw err;
  }
  try {
    localStorage.setItem('vr-hotspot-welcome-seen', '1');
  } catch (_) {}
  return true;
}

async function runPendingPlaygroundLoad() {
  const slug = window.__pendingPlaygroundSlug;
  if (!slug || !window.hotspotEditor) return;
  window.__pendingPlaygroundSlug = null;
  window.__playgroundTemplateLoading = true;
  window.__playgroundGuestTemplate = true;
  window.__integratedWelcomePending = false;

  try {
    const agreed = await promptGuestAgreementIfNeeded({ onDeclineReturnToWelcome: true });
    if (!agreed) {
      window.__playgroundGuestTemplate = false;
      const err = new Error('Guest agreement cancelled');
      err.code = 'GUEST_AGREEMENT_CANCELLED';
      throw err;
    }
    try {
      localStorage.setItem('vr-hotspot-welcome-seen', '1');
    } catch (_) {}

    const detailRes = await fetch(`/api/playground/templates/${encodeURIComponent(slug)}`);
    const detail = await detailRes.json();
    if (!detailRes.ok || !detail.success) {
      throw new Error(detail.message || 'Template not found');
    }
    const template = detail.template;

    if (template.has_bundle) {
      const bundleRes = await fetch(`/api/playground/templates/${encodeURIComponent(slug)}/bundle`, {
        credentials: 'include',
      });
      if (!bundleRes.ok) throw new Error('Could not download project bundle');
      const blob = await bundleRes.blob();
      await window.hotspotEditor.loadZIPTemplate(blob, {
        silent: true,
        initialContentMode: 'spherical',
      });
      // Re-bind image hotspot textures after ZIP import (avoids black billboards on guest samples).
      if (typeof window.hotspotEditor.rehydrateImageHotspotsFromIDB === 'function') {
        await window.hotspotEditor.rehydrateImageHotspotsFromIDB();
      }
      await window.hotspotEditor.loadCurrentScene();
    } else if (template.files_manifest && template.files_manifest.length) {
      if (window.flatPageEditor && typeof window.flatPageEditor.loadTemplate === 'function') {
        window.flatPageEditor.loadTemplate({
          title: template.title,
          slug: template.slug,
          description: template.description,
          files_manifest: template.files_manifest,
          config_ui_schema: template.config_ui_schema,
        });
      }
      window.hotspotEditor.setContentMode('flat', { skipVrGenerate: true });
    } else {
      throw new Error('This sample is not ready yet (no bundle or flat files).');
    }

    if (typeof window.clearEntryGateOverlay === 'function') window.clearEntryGateOverlay();
  } finally {
    window.__playgroundTemplateLoading = false;
  }
}

window.fetchPlaygroundTemplates = fetchPlaygroundTemplates;
window.mountPlaygroundTemplatesSection = mountPlaygroundTemplatesSection;
window.renderGuestTemplatePicker = renderGuestTemplatePicker;
window.openPlaygroundTemplate = openPlaygroundTemplate;
window.runPendingPlaygroundLoad = runPendingPlaygroundLoad;
window.promptGuestAgreementIfNeeded = promptGuestAgreementIfNeeded;
window.promptGuestAgreementAfterPlaygroundLoad = promptGuestAgreementAfterPlaygroundLoad;
window.closeGuestAgreementOverlay = closeGuestAgreementOverlay;
