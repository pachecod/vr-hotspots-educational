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
async function checkStudentSession() {
  try {
    const res = await fetch('/api/student/session', { credentials: 'include' });
    if (!res.ok) return { authenticated: false, authRequired: false };
    return await res.json();
  } catch (_) {
    return { authenticated: false, authRequired: false };
  }
}

async function studentLogin(classId, studentId, password) {
  const res = await fetch('/api/student/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, studentId, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Login failed');
  }
  return data.student;
}

async function studentLogout() {
  const res = await fetch('/api/student/logout', { method: 'POST', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Logout failed');
  }
}

async function startLocalTestUser() {
  // Include a JSON body so Safari sends Origin (bodyless POSTs can fail CSRF elsewhere).
  const res = await fetch('/api/local/test-user/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not start guest mode');
  }
  return data;
}

async function endLocalTestUser() {
  await fetch('/api/local/test-user/end', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
}

function setEntryGateActive(active) {
  if (document.body) {
    document.body.classList.toggle('entry-gate-active', !!active);
  }
}

function showProjectLoadingOverlay(message = 'Loading Project.') {
  const overlay = document.getElementById('scene-loading-overlay');
  if (overlay) {
    const titleEl = overlay.querySelector('[data-project-loading-title]');
    if (titleEl && message) titleEl.textContent = message;
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
  }
  if (document.body) {
    document.body.classList.add('project-loading-active');
  }
}

function hideProjectLoadingOverlay() {
  const overlay = document.getElementById('scene-loading-overlay');
  if (overlay) {
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
  if (document.body) {
    document.body.classList.remove('project-loading-active');
  }
}

function hideSceneLoadingOverlay() {
  hideProjectLoadingOverlay();
}

const DEFAULT_WELCOME_SCREEN_HTML = `<h2>Welcome to the WebXRIDE<br/>Immersive Storytelling Tool</h2>
<p>Create 360° tours that work on desktop and mobile browsers and Quest headsets, along with traditional web pages that highlight your immersive content. You can also make storytelling worlds users can move through using WASD keys or thumbs (on mobile).</p>
<p>Choose how you'd like to get started.</p>`;

let welcomeSystemTextCache = null;
let noTeamsSigninTextCache = null;

const DEFAULT_NO_TEAMS_SIGNIN_HTML = `<p>No teams or classes currently exist in this install.</p>
<p>If you have admin access, open the <a href="/admin-users.html">Users</a> tab and add a team or class with a password. Then add users to that team or class.</p>
<p>After that, your users can sign in, upload their own content, and submit it to you to review as a team leader or teacher.</p>`;

async function fetchWelcomeSystemText() {
  if (welcomeSystemTextCache) return welcomeSystemTextCache;
  try {
    const res = await fetch('/api/system-text/welcome-screen');
    const data = await res.json();
    if (data.success && data.text?.content_html) {
      welcomeSystemTextCache = data.text.content_html;
      return welcomeSystemTextCache;
    }
  } catch (_) {
    /* use default */
  }
  welcomeSystemTextCache = DEFAULT_WELCOME_SCREEN_HTML;
  return welcomeSystemTextCache;
}

async function fetchNoTeamsSigninText() {
  if (noTeamsSigninTextCache) return noTeamsSigninTextCache;
  try {
    const res = await fetch('/api/system-text/no-teams-signin');
    const data = await res.json();
    if (data.success && data.text?.content_html) {
      noTeamsSigninTextCache = data.text.content_html;
      return noTeamsSigninTextCache;
    }
  } catch (_) {
    /* use default */
  }
  noTeamsSigninTextCache = DEFAULT_NO_TEAMS_SIGNIN_HTML;
  return noTeamsSigninTextCache;
}

function welcomeGithubFooterHtml() {
  return `<p class="welcome-github-footer">
    Available for free for education use under the MIT License.
    <a href="https://github.com/pachecod/vr-hotspots-educational" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: underline;">See our Github</a>.
    <span class="welcome-legal-links">
      <a href="/terms.html" style="color: #fff; text-decoration: underline;">Terms of Use</a>
      <span aria-hidden="true"> · </span>
      <a href="/privacy-policy.html" style="color: #fff; text-decoration: underline;">Privacy Policy</a>
    </span>
  </p>`;
}

function integratedWelcomeCardStyle() {
  return '';
}

function integratedWelcomeShellStyle() {
  return '';
}

function ensureWelcomeAnimationStyle() {
  /* fadeIn keyframes live in welcome-playground.css */
}

function ensureIntegratedWelcomeShell(container) {
  ensureWelcomeAnimationStyle();
  let shell = container.querySelector('#student-login-shell');
  if (!shell) {
      container.innerHTML = `
        <div id="student-login-shell" style="${integratedWelcomeShellStyle()}">
          <div id="integrated-welcome-inner" style="${integratedWelcomeCardStyle()}"></div>
        </div>`;
    shell = container.querySelector('#student-login-shell');
  }
  return {
    shell,
    inner: container.querySelector('#integrated-welcome-inner'),
  };
}

function clearEntryGateOverlay() {
  const container = document.getElementById('student-login-gate');
  if (container) container.innerHTML = '';
  setEntryGateActive(false);
}

function showIntegratedWelcomeLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { inner } = ensureIntegratedWelcomeShell(container);
  if (!inner) return;
  inner.innerHTML = `
    <div style="font-size: 42px; margin-bottom: 16px;">⏳</div>
    <h2 style="margin: 0 0 10px; font-size: 22px;">Loading editor…</h2>
    <p style="color: #f0f0f0; margin: 0; font-size: 15px;">One moment while we set things up.</p>
  `;
}

function beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, student) {
  window.__integratedWelcomePending = true;
  window.__integratedWelcomeContainerId = containerId;
  window.__postAuthWelcomeMounted = false;
  try {
    sessionStorage.setItem('vr-hotspot-pending-welcome', '1');
  } catch (_) {}
  showIntegratedWelcomeLoading(containerId);
  if (student) {
    window.editorAccessMode = 'student';
    window.currentStudent = student;
    showStudentEditorSession(student);
  } else if (window.editorAccessMode === 'local_test') {
    showTestUserEditorSession();
  }
  if (typeof window.applyEditorCapabilities === 'function') window.applyEditorCapabilities();
  onAuthenticated(student);
}

function showStudentEditorSession(student) {
  if (student) {
    window.currentStudent = student;
    window.editorAccessMode = 'student';
  }
  hideTestUserEditorSession();
  const bar = document.getElementById('student-editor-session');
  const nameEl = document.getElementById('student-editor-name');
  const classEl = document.getElementById('student-editor-class');
  if (!bar || !student) return;
  if (nameEl) nameEl.textContent = student.displayName || 'Team member or student';
  if (classEl) {
    classEl.textContent = student.className ? `Team or Class: ${student.className}` : '';
    classEl.style.display = student.className ? '' : 'none';
  }
  bar.classList.add('visible');
  bindStudentEditorLogout();
  const subsBtn = document.getElementById('student-my-submissions-btn');
  const cloudSavesBtn = document.getElementById('student-my-cloud-saves-btn');
  const cloudBtn = document.getElementById('save-cloud-draft');
  if (subsBtn) subsBtn.style.display = '';
  if (cloudSavesBtn) cloudSavesBtn.style.display = '';
  if (cloudBtn) cloudBtn.style.display = '';
  if (window.StudentProjectsPanel) {
    if (typeof window.StudentProjectsPanel.bind === 'function') {
      window.StudentProjectsPanel.bind();
    }
    setTimeout(() => window.StudentProjectsPanel.refreshUnreadBadge(), 300);
  }
  if (window.LocalProjects && typeof window.LocalProjects.bind === 'function') {
    window.LocalProjects.bind();
  } else if (window.LocalProjects && typeof window.LocalProjects.refreshButtonVisibility === 'function') {
    window.LocalProjects.refreshButtonVisibility();
  }
  refreshClassHostedProjectsPromo();
}

function hideStudentEditorSession() {
  const bar = document.getElementById('student-editor-session');
  if (bar) bar.classList.remove('visible');
  hideClassHostedProjectsPromo();
}

async function refreshClassHostedProjectsPromo() {
  const promo = document.getElementById('class-hosted-projects-promo');
  const btn = document.getElementById('class-hosted-projects-btn');
  if (!promo || !btn) return;

  const params = new URLSearchParams(window.location.search);
  if (
    window.editorAccessMode !== 'student' ||
    !window.currentStudent ||
    params.get('adminReview') === '1' ||
    params.get('adminAssign') === '1' ||
    params.get('adminCombined') === '1'
  ) {
    hideClassHostedProjectsPromo();
    return;
  }

  try {
    const res = await fetch('/api/student/class-hosted-gallery', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.show || !data.url) {
      hideClassHostedProjectsPromo();
      return;
    }
    if (btn.dataset.bound !== '1') {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        window.open(btn.dataset.galleryUrl || data.url, '_blank', 'noopener,noreferrer');
      });
    }
    btn.dataset.galleryUrl = data.url;
    promo.classList.add('visible');
  } catch (_) {
    hideClassHostedProjectsPromo();
  }
}

function hideClassHostedProjectsPromo() {
  const promo = document.getElementById('class-hosted-projects-promo');
  if (promo) promo.classList.remove('visible');
}

function showTestUserEditorSession() {
  hideStudentEditorSession();
  const bar = document.getElementById('test-user-editor-session');
  if (bar) bar.classList.add('visible');
  bindTestUserGuestSessionButtons();
  if (window.LocalProjects && typeof window.LocalProjects.bind === 'function') {
    window.LocalProjects.bind();
  } else if (window.LocalProjects && typeof window.LocalProjects.refreshButtonVisibility === 'function') {
    window.LocalProjects.refreshButtonVisibility();
  }
}

function hideTestUserEditorSession() {
  const bar = document.getElementById('test-user-editor-session');
  if (bar) bar.classList.remove('visible');
}

function bindTestUserGuestSessionButtons() {
  bindTestUserSignOutBtn();
  bindTestUserSignInBtn();
}

function isEmbedEditorMode() {
  return !!(
    window.__embedEditorMode ||
    document.documentElement.classList.contains('embed-editor-mode')
  );
}

function promptEmbedOpenInNewTab() {
  return window.confirm('In order to proceed we need to open this in a new tab.');
}

function openEmbedSignInInNewTab() {
  const url = `${window.location.origin}/?signin=1`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function bindTestUserSignOutBtn() {
  const btn = document.getElementById('test-user-signout-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if (isEmbedEditorMode()) {
      if (!confirm('Sign out of guest mode?')) return;
      try {
        await endLocalTestUser();
      } catch (_) {
        /* ignore cookie/network failures in third-party iframes */
      }
      window.editorAccessMode = 'none';
      window.currentStudent = null;
      hideTestUserEditorSession();
      if (typeof window.showEmbedPracticeClosed === 'function') {
        window.showEmbedPracticeClosed();
      }
      return;
    }
    if (!confirm('Sign out of guest mode and return to the welcome screen?')) return;
    await endLocalTestUser();
    window.editorAccessMode = 'none';
    window.currentStudent = null;
    hideTestUserEditorSession();
    window.location.reload();
  });
}

function closeGuestSignInWarningOverlay() {
  const overlay = document.getElementById('guest-signin-warning-overlay');
  if (overlay) overlay.remove();
  document.body.classList.remove('guest-agreement-open');
}

function promptGuestSignInWarning() {
  return new Promise((resolve) => {
    closeGuestSignInWarningOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'guest-signin-warning-overlay';
    overlay.className = 'guest-agreement-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'guest-signin-warning-title');

    overlay.innerHTML = `
      <div class="guest-agreement-backdrop" data-action="cancel"></div>
      <div class="guest-agreement-dialog">
        <h2 id="guest-signin-warning-title" class="guest-agreement-title">Sign in?</h2>
        <div class="guest-agreement-content">
          <p>Signing in does not upload guest work automatically. Projects you <strong>Save Locally</strong> stay in this browser under <strong>My Local Projects</strong> so you can open them after you sign in, then use cloud save or submit.</p>
          <p>You can also click <strong>Save Template</strong> for a ZIP backup before signing in.</p>
        </div>
        <div class="guest-agreement-actions">
          <button type="button" class="guest-agreement-btn guest-agreement-cancel" data-action="cancel">Cancel</button>
          <button type="button" class="guest-agreement-btn guest-agreement-agree" data-action="ok">OK</button>
        </div>
      </div>
    `;

    const finish = (proceed) => {
      closeGuestSignInWarningOverlay();
      document.removeEventListener('keydown', onKeyDown);
      resolve(proceed);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish(false);
    };

    overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'ok') finish(true);
      if (action === 'cancel') finish(false);
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    document.body.classList.add('guest-agreement-open');
    overlay.querySelector('[data-action="ok"]')?.focus();
  });
}

function bindTestUserSignInBtn() {
  const btn = document.getElementById('test-user-signin-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if (isEmbedEditorMode()) {
      if (!promptEmbedOpenInNewTab()) return;
      openEmbedSignInInNewTab();
      return;
    }

    const proceed = await promptGuestSignInWarning();
    if (!proceed) return;

    renderStudentLoginGate(
      'student-login-gate',
      (student) => {
        window.currentStudent = student;
        if (window.flatPageEditor && typeof window.flatPageEditor.onStudentSession === 'function') {
          window.flatPageEditor.onStudentSession(student);
        }
      },
      { showBackToEntry: true, integratedWelcome: true, guestUpgrade: true }
    );
  });
}

function bindStudentEditorLogout() {
  const btn = document.getElementById('student-editor-logout-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if (!confirm('Log out and return to the sign-in screen?')) return;
    try {
      if (window.StudentProjectsPanel && typeof window.StudentProjectsPanel.stopFeedbackPolling === 'function') {
        window.StudentProjectsPanel.stopFeedbackPolling();
      }
      await studentLogout();
      window.currentStudent = null;
      window.editorAccessMode = 'none';
      hideStudentEditorSession();
      window.location.reload();
    } catch (err) {
      alert(err.message || 'Could not log out. Please try again.');
    }
  });
}

async function renderIntegratedAuthStep(containerId, onAuthenticated, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (typeof window.clearEphemeralEditorWorkspaceForWelcome === 'function') {
    window.clearEphemeralEditorWorkspaceForWelcome();
  }

  setEntryGateActive(true);
  hideSceneLoadingOverlay();
  hideStudentEditorSession();
  hideTestUserEditorSession();

  const { inner } = ensureIntegratedWelcomeShell(container);
  const showGuest = options.showGuest !== false;
  const welcomeHtml = await fetchWelcomeSystemText();

  inner.innerHTML = `
    <div class="integrated-welcome-layout">
      <div class="integrated-welcome-auth">
        <div class="welcome-system-text">${welcomeHtml}</div>
        ${
          showGuest
            ? `
          <button type="button" id="entry-guest-btn" style="
            width: 100%; padding: 15px 24px; margin-bottom: 10px;
            background: white; color: #667eea; border: none; border-radius: 8px;
            font-size: 16px; font-weight: bold; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          ">Continue as Guest</button>
          <p style="color: rgba(255,255,255,0.75); font-size: 12px; margin: 0 0 16px;">
            Local files, shared assets, and ZIP export. No cloud saves or submissions to administrators.
          </p>
          <div style="display: flex; align-items: center; gap: 12px; margin: 20px 0 16px;">
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.25);"></div>
            <span style="color: rgba(255,255,255,0.7); font-size: 12px;">or</span>
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.25);"></div>
          </div>
        `
            : ''
        }
        <button type="button" id="entry-signin-btn" style="
          width: 100%; padding: 14px 24px;
          background: #2E7D32; color: white; border: none; border-radius: 8px;
          font-size: 16px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        ">Sign in to a team or class account</button>
        <div id="student-login-error" style="color: #ffcdd2; margin-top: 14px; display: none; font-size: 14px;"></div>
        <p class="welcome-more-about">
          <a href="/about-webxride.html">More about WebXRIDE</a>
        </p>
        ${welcomeGithubFooterHtml()}
      </div>
      <div class="integrated-welcome-samples" id="integrated-welcome-samples"></div>
    </div>
  `;

  const errorEl = document.getElementById('student-login-error');

  const guestBtn = document.getElementById('entry-guest-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      errorEl.style.display = 'none';
      try {
        const agreed = await window.promptGuestAgreementIfNeeded();
        if (!agreed) return;
        await startLocalTestUser();
        window.editorAccessMode = 'local_test';
        window.currentStudent = null;
        if (typeof window.renderGuestTemplatePicker === 'function') {
          await window.renderGuestTemplatePicker(containerId, onAuthenticated);
        } else {
          beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, null);
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  }

  document.getElementById('entry-signin-btn').addEventListener('click', () => {
    renderStudentLoginGate(containerId, onAuthenticated, {
      showBackToEntry: showGuest,
      integratedWelcome: true,
    });
  });

  const welcomeInner = container.querySelector('#integrated-welcome-inner');
  const samplesEl = container.querySelector('#integrated-welcome-samples');
  if (welcomeInner && samplesEl && typeof window.mountPlaygroundTemplatesSection === 'function') {
    window.mountPlaygroundTemplatesSection(samplesEl, { containerId, onAuthenticated, welcomeInner });
  }
}

function renderEntryGate(containerId, onAuthenticated) {
  window.__welcomeOnAuthenticated = onAuthenticated;
  window.__integratedWelcomeContainerId = containerId;
  const slug = window.__pendingPlaygroundSlug;
  // Deep link (?playground=slug): skip welcome chrome; open guest editor directly.
  if (slug && typeof window.openPlaygroundTemplate === 'function') {
    showProjectLoadingOverlay('Loading Project.');
    setEntryGateActive(false);
    const gate = document.getElementById(containerId);
    if (gate) gate.innerHTML = '';
    window.openPlaygroundTemplate(slug, { containerId, onAuthenticated }).catch((err) => {
      if (err && err.code === 'GUEST_AGREEMENT_CANCELLED') return;
      hideProjectLoadingOverlay();
      window.__pendingPlaygroundSlug = null;
      window.__playgroundDeepLink = false;
      alert(err.message || 'Could not open sample project');
      renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: true });
    });
    return;
  }
  renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: true });
}

async function returnToWelcomeScreen() {
  if (typeof window.closeGuestAgreementOverlay === 'function') {
    window.closeGuestAgreementOverlay();
  }
  try {
    await endLocalTestUser();
  } catch (_) {}
  window.editorAccessMode = 'none';
  window.currentStudent = null;
  window.__pendingPlaygroundSlug = null;
  window.__playgroundGuestTemplate = false;
  window.__playgroundTemplateLoading = false;
  window.__playgroundDeepLink = false;
  window.__integratedWelcomePending = false;
  window.__guestAgreementAccepted = false;
  if (typeof window.clearEphemeralEditorWorkspaceForWelcome === 'function') {
    window.clearEphemeralEditorWorkspaceForWelcome();
  }
  hideTestUserEditorSession();
  hideStudentEditorSession();
  const containerId = window.__integratedWelcomeContainerId || 'student-login-gate';
  const onAuthenticated = window.__welcomeOnAuthenticated;
  setEntryGateActive(true);
  if (typeof onAuthenticated === 'function') {
    renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: true });
    return;
  }
  window.location.reload();
}

function renderStudentLoginGate(containerId, onAuthenticated, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  hideSceneLoadingOverlay();
  hideStudentEditorSession();
  hideTestUserEditorSession();

  let classes = [];
  let noTeamsMessageHtml = DEFAULT_NO_TEAMS_SIGNIN_HTML;
  let selectedClass = null;
  let selectedStudent = null;
  let students = [];

  const useWelcomeShell = options.integratedWelcome !== false;
  let stepEl;
  let errorEl;
  let subtitleEl;

  setEntryGateActive(true);
  hideSceneLoadingOverlay();

  if (useWelcomeShell) {
    const { inner } = ensureIntegratedWelcomeShell(container);
    const showPlayground = inner.classList.contains('integrated-welcome-with-playground');
    const authMarkup = `
      <button type="button" id="student-back-entry" style="
        position: absolute; top: 12px; left: 12px;
        background: none; border: none; color: rgba(255,255,255,0.85);
        font-size: 14px; cursor: pointer; padding: 4px 8px;">← Back</button>
      <div style="font-size: 40px; margin-bottom: 12px;">🎓</div>
      <h2 style="margin: 0 0 8px; font-size: 24px; font-weight: bold;">Sign in</h2>
      <p id="student-login-subtitle" style="color: #f0f0f0; margin: 0 0 20px; font-size: 15px;">Choose your team or class</p>
      <div id="student-login-step" class="student-login-step" style="text-align: left;"></div>
      <div id="student-login-error" style="color: #ffcdd2; margin-top: 12px; display: none; font-size: 14px;"></div>
    `;
    if (showPlayground) {
      inner.innerHTML = `
        <div class="integrated-welcome-layout">
          <div class="integrated-welcome-auth student-login-auth-panel">
            ${authMarkup}
          </div>
          <div class="integrated-welcome-samples" id="integrated-welcome-samples"></div>
        </div>
      `;
      const samplesEl = document.getElementById('integrated-welcome-samples');
      if (samplesEl && typeof window.mountPlaygroundTemplatesSection === 'function') {
        window.mountPlaygroundTemplatesSection(samplesEl, {
          containerId,
          onAuthenticated,
          welcomeInner: inner,
        });
      }
    } else {
      inner.innerHTML = authMarkup;
    }
    stepEl = document.getElementById('student-login-step');
    errorEl = document.getElementById('student-login-error');
    subtitleEl = document.getElementById('student-login-subtitle');
    const backBtn = document.getElementById('student-back-entry');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (options.guestUpgrade) {
          clearEntryGateOverlay();
          return;
        }
        if (options.showBackToEntry) {
          renderEntryGate(containerId, onAuthenticated);
        } else {
          renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: false });
        }
      });
    }
  } else {
    container.innerHTML = `
      <div id="student-login-shell" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100000;
        display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;">
        <div style="background:#2a2a2a;color:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%;border:2px solid #2E7D32;">
          <h2 style="margin:0 0 8px;color:#2E7D32;">WebXRIDE Immersive Storytelling Tool</h2>
          <p id="student-login-subtitle" style="color:#ccc;margin:0 0 20px;">Choose your team or class</p>
          <div id="student-login-step"></div>
          <div id="student-login-error" style="color:#f44336;margin-top:12px;display:none;"></div>
        </div>
      </div>
    `;
    stepEl = document.getElementById('student-login-step');
    errorEl = document.getElementById('student-login-error');
    subtitleEl = document.getElementById('student-login-subtitle');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function clearError() {
    errorEl.style.display = 'none';
  }

  function classRequiresSignInPassword(cls) {
    if (!cls) return false;
    const value = cls.require_sign_in_password ?? cls.requireSignInPassword;
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function signInStepCount() {
    return selectedClass && classRequiresSignInPassword(selectedClass) ? 4 : 3;
  }

  function afterClassSelected() {
    if (classRequiresSignInPassword(selectedClass)) {
      renderClassPasswordStep();
      return;
    }
    loadStudents(selectedClass.id)
      .then(() => {
        clearError();
        renderStudentStep();
      })
      .catch((err) => showError(err.message));
  }

  function renderClassStep() {
    selectedStudent = null;
    students = [];
    const total = 4;
    subtitleEl.textContent = `Step 1 of ${total} — Choose your team or class`;
    const backBtn =
      options.showBackToEntry && !useWelcomeShell
        ? `<button type="button" id="student-back-entry" style="background:none;border:none;color:#2E7D32;cursor:pointer;margin-bottom:12px;padding:0;">← Back</button>`
        : '';
    if (!classes.length) {
      stepEl.innerHTML =
        backBtn +
        `<div class="no-teams-signin-message welcome-system-text">${noTeamsMessageHtml}</div>`;
      return;
    }
    stepEl.innerHTML =
      backBtn +
      `
      <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto;">
        ${classes
          .map(
            (c) => `
          <button type="button" class="student-class-btn" data-id="${c.id}" style="
            text-align:left;padding:12px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;cursor:pointer;">
            <strong>${escapeHtml(c.name)}</strong>
            <span style="color:rgba(255,255,255,0.65);font-size:12px;display:block;">${c.student_count || 0} team member(s) or student(s)</span>
          </button>`
          )
          .join('')}
      </div>
    `;
    stepEl.querySelectorAll('.student-class-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedClass = classes.find((c) => c.id === btn.dataset.id);
        clearError();
        afterClassSelected();
      });
    });
  }

  function renderClassPasswordStep() {
    selectedStudent = null;
    students = [];
    const total = signInStepCount();
    subtitleEl.textContent = `Step 2 of ${total} — Enter team or class password (${selectedClass.name})`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-class" style="background:none;border:none;color:rgba(255,255,255,0.9);cursor:pointer;margin-bottom:12px;padding:0;">← Back to teams or classes</button>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:0 0 12px;">
        Your team leader or teacher will give you this password. It unlocks the list of names for this team or class.
      </p>
      <label style="display:block;color:#f0f0f0;margin-bottom:6px;font-size:13px;">Team or class password</label>
      <input type="password" id="class-password-input" placeholder="Enter team or class password" autocomplete="current-password" style="
        width:100%;padding:10px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;background:rgba(0,0,0,0.2);color:#fff;box-sizing:border-box;margin-bottom:12px;" />
      <button type="button" id="class-password-submit" style="
        width:100%;padding:12px;background:#2E7D32;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Continue</button>
    `;

    const passwordInput = document.getElementById('class-password-input');
    document.getElementById('student-back-class').addEventListener('click', renderClassStep);

    const submit = async () => {
      clearError();
      const password = passwordInput.value;
      if (!password) return showError('Please enter the team or class password');
      try {
        await verifyClassPassword(selectedClass.id, password);
        await loadStudents(selectedClass.id);
        renderStudentStep();
      } catch (err) {
        showError(err.message);
        passwordInput.focus();
        passwordInput.select();
      }
    };

    document.getElementById('class-password-submit').addEventListener('click', submit);
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    passwordInput.focus();
  }

  function renderStudentStep() {
    const total = signInStepCount();
    const stepNum = classRequiresSignInPassword(selectedClass) ? 3 : 2;
    subtitleEl.textContent = `Step ${stepNum} of ${total} — Choose your name (${selectedClass.name})`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-class" style="background:none;border:none;color:rgba(255,255,255,0.9);cursor:pointer;margin-bottom:12px;padding:0;">← Back to teams or classes</button>
      <div class="student-login-step-list">
        ${students.length
          ? students
              .map(
                (s) => `
          <button type="button" class="student-name-btn" data-id="${s.id}" style="
            text-align:left;padding:12px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;cursor:pointer;">
            ${escapeHtml(s.display_name)}
          </button>`
              )
              .join('')
          : '<p style="color:#f0f0f0;">No team members or students in this team or class yet.</p>'}
      </div>
    `;

    document.getElementById('student-back-class').addEventListener('click', () => {
      if (classRequiresSignInPassword(selectedClass)) {
        renderClassPasswordStep();
      } else {
        renderClassStep();
      }
    });
    stepEl.querySelectorAll('.student-name-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedStudent = students.find((s) => s.id === btn.dataset.id);
        renderPasswordStep();
      });
    });
  }

  function renderPasswordStep() {
    const total = signInStepCount();
    const stepNum = classRequiresSignInPassword(selectedClass) ? 4 : 3;
    subtitleEl.textContent = `Step ${stepNum} of ${total} — Enter your password`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-student" style="background:none;border:none;color:rgba(255,255,255,0.9);cursor:pointer;margin-bottom:12px;padding:0;">← Back to names</button>
      <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
        <div style="color:rgba(255,255,255,0.65);font-size:12px;">Team or Class</div>
        <div style="font-weight:bold;">${escapeHtml(selectedClass.name)}</div>
        <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:8px;">Team member or student</div>
        <div style="font-weight:bold;">${escapeHtml(selectedStudent.display_name)}</div>
      </div>
      <label style="display:block;color:#f0f0f0;margin-bottom:6px;font-size:13px;">Password you were given</label>
      <input type="password" id="student-password-input" placeholder="Enter your password" autocomplete="current-password" style="
        width:100%;padding:10px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;background:rgba(0,0,0,0.2);color:#fff;box-sizing:border-box;margin-bottom:12px;" />
      <button type="button" id="student-login-submit" style="
        width:100%;padding:12px;background:#2E7D32;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Sign In</button>
    `;

    const passwordInput = document.getElementById('student-password-input');
    document.getElementById('student-back-student').addEventListener('click', renderStudentStep);

    const submit = async () => {
      clearError();
      const password = passwordInput.value;
      if (!password) return showError('Please enter your password');
      try {
        const info = await studentLogin(selectedClass.id, selectedStudent.id, password);
        window.editorAccessMode = 'student';
        window.currentStudent = info;
        if (options.guestUpgrade) {
          clearEntryGateOverlay();
          hideTestUserEditorSession();
          showStudentEditorSession(info);
          if (typeof window.applyEditorCapabilities === 'function') window.applyEditorCapabilities();
          onAuthenticated(info);
        } else {
          beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, info);
        }
      } catch (err) {
        showError(err.message);
        passwordInput.focus();
        passwordInput.select();
      }
    };

    document.getElementById('student-login-submit').addEventListener('click', submit);
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    passwordInput.focus();
  }

  async function loadClasses() {
    const res = await fetch('/api/classes');
    const data = await res.json();
    classes = Array.isArray(data) ? data : [];
    if (!res.ok && !classes.length) {
      throw new Error(data?.message || 'Could not load teams or classes');
    }
  }

  async function verifyClassPassword(classId, password) {
    const res = await fetch(`/api/classes/${classId}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Incorrect team or class password');
    }
    return data;
  }

  async function loadStudents(classId) {
    const res = await fetch(`/api/classes/${classId}/students`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Could not load team members or students');
    }
    students = Array.isArray(data) ? data : [];
  }

  Promise.all([loadClasses(), fetchNoTeamsSigninText()])
    .then(([, messageHtml]) => {
      noTeamsMessageHtml = messageHtml;
      renderClassStep();
    })
    .catch((err) => {
      showError(err.message || 'Could not load teams or classes. Try again later.');
      subtitleEl.textContent = 'Choose your team or class';
      stepEl.innerHTML =
        '<p style="color:#f0f0f0;">Could not load teams or classes. Check your connection or ask your team leader or teacher.</p>';
    });
}


async function requireStudentSession(containerId, onAuthenticated) {
  window.__welcomeOnAuthenticated = onAuthenticated;
  window.__integratedWelcomeContainerId = containerId;
  const status = await checkStudentSession();
  const forceSignIn =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('signin') === '1';

  if (status.authenticated && status.student) {
    showProjectLoadingOverlay('Loading Project.');
    setEntryGateActive(false);
    window.editorAccessMode = 'student';
    window.currentStudent = status.student;
    showStudentEditorSession(status.student);
    onAuthenticated(status.student);
    return;
  }

  // Breakout from embed practice editor: open sign-in / sign-up in a top-level tab.
  if (forceSignIn) {
    hideSceneLoadingOverlay();
    renderStudentLoginGate(containerId, onAuthenticated, {
      showBackToEntry: !!status.testUserModeAvailable,
      integratedWelcome: true,
      guestUpgrade: !!(status.localTestUser || status.mode === 'local_test'),
    });
    return;
  }

  // Guest cookie alone must not skip the welcome screen. Deep links / embedEditor
  // boot their own path before requireStudentSession; bare "/" should always show welcome.
  // (Auto-resuming guest here restored the last playground project and felt like a stuck redirect.)
  if (status.localTestUser || status.mode === 'local_test' || status.testUserModeAvailable) {
    hideSceneLoadingOverlay();
    renderEntryGate(containerId, onAuthenticated);
    return;
  }

  if (status.authRequired) {
    hideSceneLoadingOverlay();
    renderStudentLoginGate(containerId, onAuthenticated, { integratedWelcome: true, showGuest: false });
    return;
  }

  window.editorAccessMode = 'anonymous';
  showProjectLoadingOverlay('Loading Project.');
  setEntryGateActive(false);
  hideStudentEditorSession();
  hideTestUserEditorSession();
  onAuthenticated(null);
}

window.checkStudentSession = checkStudentSession;
window.requireStudentSession = requireStudentSession;
window.studentLogout = studentLogout;
window.showStudentEditorSession = showStudentEditorSession;
window.showTestUserEditorSession = showTestUserEditorSession;
window.clearEntryGateOverlay = clearEntryGateOverlay;
window.setEntryGateActive = setEntryGateActive;
window.returnToWelcomeScreen = returnToWelcomeScreen;
window.renderIntegratedAuthStep = renderIntegratedAuthStep;
window.beginIntegratedWelcomeAfterAuth = beginIntegratedWelcomeAfterAuth;
window.hideSceneLoadingOverlay = hideSceneLoadingOverlay;
window.showProjectLoadingOverlay = showProjectLoadingOverlay;
window.hideProjectLoadingOverlay = hideProjectLoadingOverlay;
