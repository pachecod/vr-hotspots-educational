var escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
  ? window.escapeHtml
  : function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
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

function showEmbedPracticeClosed() {
  closeGuestAgreementOverlay();
  if (typeof window.hideProjectLoadingOverlay === 'function') {
    window.hideProjectLoadingOverlay();
  }
  if (typeof window.hideSceneLoadingOverlay === 'function') {
    window.hideSceneLoadingOverlay();
  }
  if (typeof window.setEntryGateActive === 'function') {
    window.setEntryGateActive(false);
  } else {
    document.body.classList.remove('entry-gate-active');
  }

  let el = document.getElementById('embed-practice-closed');
  if (!el) {
    el = document.createElement('div');
    el.id = 'embed-practice-closed';
    el.className = 'embed-practice-closed';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="embed-practice-closed-card">
        <h2 class="embed-practice-closed-title">Practice closed</h2>
        <p class="embed-practice-closed-text">Reload this page to try the practice editor again.</p>
      </div>
    `;
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.documentElement.classList.add('embed-practice-closed-active');
  document.body.classList.add('embed-practice-closed-active');
}

const PLAYGROUND_DRAFT_KEY = 'vr-hotspot-playground-draft';

function markPlaygroundGuestDraft(slug) {
  try {
    if (slug) localStorage.setItem(PLAYGROUND_DRAFT_KEY, String(slug));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Welcome / bare homepage should not reopen the last guest sample.
 * Named "Save Locally" projects are separate and are not cleared here.
 */
function clearEphemeralEditorWorkspaceForWelcome() {
  if (
    window.__pendingPlaygroundSlug ||
    window.__playgroundTemplateLoading ||
    window.__embedEditorMode ||
    window.__playgroundDeepLink
  ) {
    return false;
  }
  try {
    localStorage.removeItem(PLAYGROUND_DRAFT_KEY);
    localStorage.removeItem('vr-hotspot-scenes-data');
    localStorage.removeItem('vr-hotspot-css-styles');
    localStorage.removeItem('vr-flat-pages-data');
    return true;
  } catch (_) {
    return false;
  }
}

async function promptGuestAgreementIfNeeded(options = {}) {
  if (!shouldPromptGuestAgreement()) return true;
  const page = await fetchGuestAgreementPage();
  const agreed = await showGuestAgreementOverlay(page);
  if (!agreed) {
    if (options.onDeclineEmbedClosed) {
      showEmbedPracticeClosed();
    } else if (options.onDeclineReturnToWelcome && typeof window.returnToWelcomeScreen === 'function') {
      await window.returnToWelcomeScreen();
    }
  }
  return agreed;
}

function isEmbedEditIntentTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  if (
    target.closest(
      '#guest-agreement-overlay, #embed-practice-closed, #test-user-signin-btn, #test-user-signout-btn, #scene-loading-overlay'
    )
  ) {
    return false;
  }
  // Flat live preview is view-only until they use editor chrome.
  if (target.closest('.flat-preview-pane, .flat-preview-frame')) return false;
  if (target.closest('#hotspot-editor, #edit-mode-bar, #edit-indicator')) return true;
  if (target.closest('#flat-page-editor, #flat-page-editor-mount, .flat-page-editor-root, .flat-editor-pane, .flat-toolbar')) {
    return true;
  }
  // Spherical scene clicks count as edit only while Edit Mode is on.
  const editModeOn = !!(
    window.hotspotEditor &&
    (window.hotspotEditor.isEditMode || window.hotspotEditor.editMode)
  );
  if (editModeOn && target.closest('a-scene, #main-content, canvas')) return true;
  return false;
}

function removeEmbedGuestAgreementGate() {
  const gate = window.__embedGuestAgreementGate;
  if (!gate) return;
  document.removeEventListener('pointerdown', gate.onPointerDown, true);
  document.removeEventListener('keydown', gate.onKeyDown, true);
  window.__embedGuestAgreementGate = null;
  window.__embedGuestAgreementPending = false;
}

function installEmbedGuestAgreementGate() {
  if (!window.__embedEditorMode) return;
  if (window.__guestAgreementAccepted || !shouldPromptGuestAgreement()) return;
  if (window.__embedGuestAgreementGate) return;

  window.__embedGuestAgreementPending = true;
  let prompting = false;

  const runGate = async (event) => {
    if (!window.__embedGuestAgreementPending || window.__guestAgreementAccepted) {
      removeEmbedGuestAgreementGate();
      return;
    }
    if (prompting) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!isEmbedEditIntentTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    prompting = true;
    try {
      const agreed = await promptGuestAgreementIfNeeded({ onDeclineEmbedClosed: true });
      if (agreed) {
        try {
          localStorage.setItem('vr-hotspot-welcome-seen', '1');
        } catch (_) {}
        removeEmbedGuestAgreementGate();
      } else {
        window.__embedGuestAgreementPending = false;
        removeEmbedGuestAgreementGate();
      }
    } finally {
      prompting = false;
    }
  };

  const onPointerDown = (event) => {
    runGate(event);
  };
  const onKeyDown = (event) => {
    // Ignore pure navigation keys in preview; gate typing / Enter / Backspace in editor chrome.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      runGate(event);
      return;
    }
    if (event.key === 'Tab' || event.key === 'Escape' || event.key === 'Shift') return;
    runGate(event);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.__embedGuestAgreementGate = { onPointerDown, onKeyDown };
}

const EMBED_MOBILE_MQ = '(max-width: 768px)';

function isEmbedMobileViewport() {
  return (
    !!window.__embedEditorMode &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(EMBED_MOBILE_MQ).matches
  );
}

/** Collapse Editing Tools / edit-mode chrome without rewriting the user's desktop localStorage prefs. */
function collapseEmbedEditorChrome() {
  const panel = document.getElementById('hotspot-editor');
  const toggle = document.getElementById('hotspot-editor-toggle');
  const icon = document.getElementById('hotspot-editor-toggle-icon');
  if (panel) {
    panel.classList.add('collapsed');
    document.body.classList.add('hotspot-editor-collapsed');
  }
  if (icon) icon.textContent = '‹';
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Show editor tools';
  }

  const bar = document.getElementById('edit-mode-bar');
  const barToggle = document.getElementById('edit-mode-bar-toggle');
  const barIcon = document.getElementById('edit-mode-bar-toggle-icon');
  if (bar) bar.classList.add('collapsed');
  if (barIcon) barIcon.textContent = '›';
  if (barToggle) {
    barToggle.setAttribute('aria-expanded', 'false');
    barToggle.title = 'Show edit mode panel';
  }
}

function applyEmbedMobileEditorLayout() {
  if (!window.__embedEditorMode) return;
  const mobile = isEmbedMobileViewport();
  document.documentElement.classList.toggle('embed-mobile-compact', mobile);
  if (mobile) collapseEmbedEditorChrome();
}

function installEmbedMobileEditorLayout() {
  if (!window.__embedEditorMode || window.__embedMobileEditorLayoutInstalled) return;
  window.__embedMobileEditorLayoutInstalled = true;

  const mq = window.matchMedia(EMBED_MOBILE_MQ);
  const onChange = () => {
    if (!mq.matches) {
      document.documentElement.classList.remove('embed-mobile-flat-expanded');
    }
    applyEmbedMobileEditorLayout();
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange);

  // Flat editor: let mobile users reopen the code pane via Editor / 50/50 split controls.
  document.addEventListener(
    'click',
    (event) => {
      if (!document.documentElement.classList.contains('embed-mobile-compact')) return;
      const btn = event.target && event.target.closest && event.target.closest('.flat-split-btns .flat-tool-btn');
      if (!btn) return;
      const label = `${btn.getAttribute('title') || ''} ${btn.textContent || ''}`.toLowerCase();
      if (label.includes('preview') && !label.includes('editor')) {
        document.documentElement.classList.remove('embed-mobile-flat-expanded');
      } else {
        document.documentElement.classList.add('embed-mobile-flat-expanded');
      }
    },
    true
  );

  applyEmbedMobileEditorLayout();
  // HotspotEditor may expand panels from localStorage after boot — re-apply shortly after.
  setTimeout(applyEmbedMobileEditorLayout, 0);
  setTimeout(applyEmbedMobileEditorLayout, 400);
}

async function ensureGuestSessionForPlayground() {
  if (window.editorAccessMode === 'local_test' || window.editorAccessMode === 'student') return;
  // JSON body ensures Safari sends an Origin header (needed if CSRF is re-enabled for this path).
  try {
    const res = await fetch('/api/local/test-user/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok || !data || !data.success) {
      // Third-party iframes may block cookies; allow client-side practice anyway.
      if (window.__embedEditorMode) {
        window.editorAccessMode = 'local_test';
        window.currentStudent = null;
        window.__embedGuestCookieBlocked = true;
        return;
      }
      throw new Error((data && data.message) || 'Could not start guest mode');
    }
    window.editorAccessMode = 'local_test';
    window.currentStudent = null;
  } catch (err) {
    if (window.__embedEditorMode) {
      window.editorAccessMode = 'local_test';
      window.currentStudent = null;
      window.__embedGuestCookieBlocked = true;
      return;
    }
    throw err;
  }
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

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(message || 'Timed out');
        err.code = 'PLAYGROUND_LOAD_TIMEOUT';
        reject(err);
      }, ms);
    }),
  ]);
}

async function loadPlaygroundTemplateBySlug(slug) {
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
    return template;
  }

  if (template.files_manifest && template.files_manifest.length) {
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
    return template;
  }

  throw new Error('This sample is not ready yet (no bundle or flat files).');
}

async function runPendingPlaygroundLoad() {
  const slug = window.__pendingPlaygroundSlug;
  if (!slug || !window.hotspotEditor) return;
  window.__pendingPlaygroundSlug = null;
  window.__playgroundTemplateLoading = true;
  window.__playgroundGuestTemplate = true;
  window.__integratedWelcomePending = false;
  const deepLink = !!window.__playgroundDeepLink;
  const embedEditor = !!window.__embedEditorMode;

  try {
    if (typeof window.clearEntryGateOverlay === 'function') window.clearEntryGateOverlay();

    // Embed practice editor: load immediately and defer the guest agreement until first edit.
    if (embedEditor) {
      if (typeof window.showProjectLoadingOverlay === 'function') {
        window.showProjectLoadingOverlay('Loading Project.');
      }
      await withTimeout(
        loadPlaygroundTemplateBySlug(slug),
        60000,
        'Sample project load timed out. Please reload and try again.'
      );
      markPlaygroundGuestDraft(slug);
      installEmbedGuestAgreementGate();
      installEmbedMobileEditorLayout();
      return;
    }

    // Deep links: show I Agree immediately. Safari can hang inside ZIP/media decode;
    // never keep the full-screen loader in front of the terms modal.
    if (deepLink) {
      if (typeof window.hideProjectLoadingOverlay === 'function') {
        window.hideProjectLoadingOverlay();
      }
      if (typeof window.hideSceneLoadingOverlay === 'function') {
        window.hideSceneLoadingOverlay();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

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

      if (typeof window.showProjectLoadingOverlay === 'function') {
        window.showProjectLoadingOverlay('Loading Project.');
      }
      await withTimeout(
        loadPlaygroundTemplateBySlug(slug),
        60000,
        'Sample project load timed out. Please reload and try again.'
      );
      markPlaygroundGuestDraft(slug);
      return;
    }

    await loadPlaygroundTemplateBySlug(slug);
    markPlaygroundGuestDraft(slug);

    if (typeof window.hideProjectLoadingOverlay === 'function') window.hideProjectLoadingOverlay();
    if (typeof window.hideSceneLoadingOverlay === 'function') window.hideSceneLoadingOverlay();
    await new Promise((resolve) => setTimeout(resolve, 50));

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
  } finally {
    window.__playgroundTemplateLoading = false;
    window.__playgroundDeepLink = false;
    if (typeof window.hideProjectLoadingOverlay === 'function') window.hideProjectLoadingOverlay();
    if (typeof window.hideSceneLoadingOverlay === 'function') window.hideSceneLoadingOverlay();
    try {
      if (
        window.hotspotEditor &&
        typeof window.hotspotEditor._completeProjectBootstrap === 'function'
      ) {
        window.hotspotEditor._completeProjectBootstrap();
      }
    } catch (_) {
      /* ignore */
    }
  }
}

window.fetchPlaygroundTemplates = fetchPlaygroundTemplates;
window.mountPlaygroundTemplatesSection = mountPlaygroundTemplatesSection;
window.renderGuestTemplatePicker = renderGuestTemplatePicker;
window.openPlaygroundTemplate = openPlaygroundTemplate;
window.showEmbedPracticeClosed = showEmbedPracticeClosed;
window.installEmbedGuestAgreementGate = installEmbedGuestAgreementGate;
window.installEmbedMobileEditorLayout = installEmbedMobileEditorLayout;
window.isEmbedMobileViewport = isEmbedMobileViewport;
window.clearEphemeralEditorWorkspaceForWelcome = clearEphemeralEditorWorkspaceForWelcome;
window.runPendingPlaygroundLoad = runPendingPlaygroundLoad;
window.promptGuestAgreementIfNeeded = promptGuestAgreementIfNeeded;
window.promptGuestAgreementAfterPlaygroundLoad = promptGuestAgreementAfterPlaygroundLoad;
window.closeGuestAgreementOverlay = closeGuestAgreementOverlay;
