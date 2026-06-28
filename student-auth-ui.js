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
  const res = await fetch('/api/local/test-user/start', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not start guest mode');
  }
  return data;
}

async function endLocalTestUser() {
  await fetch('/api/local/test-user/end', { method: 'POST', credentials: 'include' });
}

function hideSceneLoadingOverlay() {
  const overlay = document.getElementById('scene-loading-overlay');
  if (overlay) {
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
}

function welcomeGithubFooterHtml() {
  return `<p style="color: rgba(255,255,255,0.75); margin-top: 18px; margin-bottom: 0; font-size: 12px; line-height: 1.5;">
    Available for free for education use under the MIT License.
    <a href="https://github.com/pachecod/vr-hotspots-educational" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: underline;">See our Github</a>.
  </p>`;
}

function integratedWelcomeCardStyle() {
  return 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 36px; border-radius: 16px; color: white; max-width: 520px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5); text-align: center; position: relative;';
}

function integratedWelcomeShellStyle() {
  return 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;animation:fadeIn 0.3s ease-in;';
}

function ensureWelcomeAnimationStyle() {
  if (document.getElementById('prompt-animation-style')) return;
  const style = document.createElement('style');
  style.id = 'prompt-animation-style';
  style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
  document.head.appendChild(style);
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
  showIntegratedWelcomeLoading(containerId);
  if (student) {
    window.editorAccessMode = 'student';
    showStudentEditorSession(student);
  } else if (window.editorAccessMode === 'local_test') {
    showTestUserEditorSession();
  }
  if (typeof window.applyEditorCapabilities === 'function') window.applyEditorCapabilities();
  onAuthenticated(student);
}

function showStudentEditorSession(student) {
  hideTestUserEditorSession();
  const bar = document.getElementById('student-editor-session');
  const nameEl = document.getElementById('student-editor-name');
  const classEl = document.getElementById('student-editor-class');
  if (!bar || !student) return;
  if (nameEl) nameEl.textContent = student.displayName || 'Student';
  if (classEl) {
    classEl.textContent = student.className ? `Class: ${student.className}` : '';
    classEl.style.display = student.className ? '' : 'none';
  }
  bar.classList.add('visible');
  bindStudentEditorLogout();
  const subsBtn = document.getElementById('student-my-submissions-btn');
  const cloudBtn = document.getElementById('save-cloud-draft');
  if (subsBtn) subsBtn.style.display = '';
  if (cloudBtn) cloudBtn.style.display = '';
  if (window.StudentProjectsPanel) {
    setTimeout(() => window.StudentProjectsPanel.refreshUnreadBadge(), 300);
  }
}

function hideStudentEditorSession() {
  const bar = document.getElementById('student-editor-session');
  if (bar) bar.classList.remove('visible');
}

function showTestUserEditorSession() {
  hideStudentEditorSession();
  const bar = document.getElementById('test-user-editor-session');
  if (bar) bar.classList.add('visible');
  bindTestUserGuestSessionButtons();
}

function hideTestUserEditorSession() {
  const bar = document.getElementById('test-user-editor-session');
  if (bar) bar.classList.remove('visible');
}

function bindTestUserGuestSessionButtons() {
  bindTestUserSignOutBtn();
  bindTestUserSignInBtn();
}

function bindTestUserSignOutBtn() {
  const btn = document.getElementById('test-user-signout-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if (!confirm('Sign out of guest mode and return to the welcome screen?')) return;
    await endLocalTestUser();
    window.editorAccessMode = 'none';
    window.currentStudent = null;
    hideTestUserEditorSession();
    window.location.reload();
  });
}

function bindTestUserSignInBtn() {
  const btn = document.getElementById('test-user-signin-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
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

function renderIntegratedAuthStep(containerId, onAuthenticated, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  hideSceneLoadingOverlay();
  hideStudentEditorSession();
  hideTestUserEditorSession();

  const { inner } = ensureIntegratedWelcomeShell(container);
  const showGuest = options.showGuest !== false;

  inner.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">👋</div>
    <h2 style="margin: 0 0 12px; font-size: 28px; font-weight: bold;">Welcome to VR Hotspot Editor!</h2>
    <p style="color: #f0f0f0; margin: 0 0 28px; font-size: 16px; line-height: 1.6;">
      Every project has a 360° tour and a flat web page. Choose how you'd like to get started.
    </p>
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
        Local files, shared assets, and ZIP export. No cloud save or submit.
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
      background: #4CAF50; color: white; border: none; border-radius: 8px;
      font-size: 16px; font-weight: bold; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    ">Sign in with class account</button>
    <div id="student-login-error" style="color: #ffcdd2; margin-top: 14px; display: none; font-size: 14px;"></div>
    ${welcomeGithubFooterHtml()}
  `;

  const errorEl = document.getElementById('student-login-error');

  const guestBtn = document.getElementById('entry-guest-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      errorEl.style.display = 'none';
      try {
        await startLocalTestUser();
        window.editorAccessMode = 'local_test';
        window.currentStudent = null;
        beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, null);
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
}

function renderEntryGate(containerId, onAuthenticated) {
  renderIntegratedAuthStep(containerId, onAuthenticated, { showGuest: true });
}

function renderStudentLoginGate(containerId, onAuthenticated, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  hideSceneLoadingOverlay();
  hideStudentEditorSession();
  hideTestUserEditorSession();

  let classes = [];
  let selectedClass = null;
  let selectedStudent = null;
  let students = [];

  const useWelcomeShell = options.integratedWelcome !== false;
  let stepEl;
  let errorEl;
  let subtitleEl;

  if (useWelcomeShell) {
    const { inner } = ensureIntegratedWelcomeShell(container);
    inner.innerHTML = `
      <button type="button" id="student-back-entry" style="
        position: absolute; top: 12px; left: 12px;
        background: none; border: none; color: rgba(255,255,255,0.85);
        font-size: 14px; cursor: pointer; padding: 4px 8px;">← Back</button>
      <div style="font-size: 40px; margin-bottom: 12px;">🎓</div>
      <h2 style="margin: 0 0 8px; font-size: 24px; font-weight: bold;">Sign in</h2>
      <p id="student-login-subtitle" style="color: #f0f0f0; margin: 0 0 20px; font-size: 15px;">Choose your class</p>
      <div id="student-login-step" style="text-align: left;"></div>
      <div id="student-login-error" style="color: #ffcdd2; margin-top: 12px; display: none; font-size: 14px;"></div>
    `;
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
        <div style="background:#2a2a2a;color:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%;border:2px solid #4caf50;">
          <h2 style="margin:0 0 8px;color:#4caf50;">VR Hotspots</h2>
          <p id="student-login-subtitle" style="color:#ccc;margin:0 0 20px;">Choose your class</p>
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

  function renderClassStep() {
    selectedStudent = null;
    subtitleEl.textContent = 'Step 1 of 3 — Choose your class';
    const backBtn =
      options.showBackToEntry && !useWelcomeShell
        ? `<button type="button" id="student-back-entry" style="background:none;border:none;color:#4caf50;cursor:pointer;margin-bottom:12px;padding:0;">← Back</button>`
        : '';
    if (!classes.length) {
      stepEl.innerHTML =
        backBtn + '<p style="color:#f0f0f0;">No classes available. Ask your teacher to add you.</p>';
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
            <span style="color:rgba(255,255,255,0.65);font-size:12px;display:block;">${c.student_count || 0} student(s)</span>
          </button>`
          )
          .join('')}
      </div>
    `;
    stepEl.querySelectorAll('.student-class-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        selectedClass = classes.find((c) => c.id === btn.dataset.id);
        await loadStudents(selectedClass.id);
        renderStudentStep();
      });
    });
  }

  function renderStudentStep() {
    subtitleEl.textContent = `Step 2 of 3 — Choose your name (${selectedClass.name})`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-class" style="background:none;border:none;color:rgba(255,255,255,0.9);cursor:pointer;margin-bottom:12px;padding:0;">← Back to classes</button>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto;">
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
          : '<p style="color:#f0f0f0;">No students in this class yet.</p>'}
      </div>
    `;

    document.getElementById('student-back-class').addEventListener('click', renderClassStep);
    stepEl.querySelectorAll('.student-name-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedStudent = students.find((s) => s.id === btn.dataset.id);
        renderPasswordStep();
      });
    });
  }

  function renderPasswordStep() {
    subtitleEl.textContent = `Step 3 of 3 — Enter your password`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-student" style="background:none;border:none;color:rgba(255,255,255,0.9);cursor:pointer;margin-bottom:12px;padding:0;">← Back to names</button>
      <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
        <div style="color:rgba(255,255,255,0.65);font-size:12px;">Class</div>
        <div style="font-weight:bold;">${escapeHtml(selectedClass.name)}</div>
        <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:8px;">Student</div>
        <div style="font-weight:bold;">${escapeHtml(selectedStudent.display_name)}</div>
      </div>
      <label style="display:block;color:#f0f0f0;margin-bottom:6px;font-size:13px;">Password from your teacher</label>
      <input type="password" id="student-password-input" placeholder="Enter your password" autocomplete="current-password" style="
        width:100%;padding:10px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;background:rgba(0,0,0,0.2);color:#fff;box-sizing:border-box;margin-bottom:12px;" />
      <button type="button" id="student-login-submit" style="
        width:100%;padding:12px;background:#4CAF50;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Sign In</button>
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
        } else if (window.__integratedWelcomePending || options.integratedWelcome) {
          beginIntegratedWelcomeAfterAuth(containerId, onAuthenticated, info);
        } else {
          clearEntryGateOverlay();
          showStudentEditorSession(info);
          if (typeof window.applyEditorCapabilities === 'function') window.applyEditorCapabilities();
          onAuthenticated(info);
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
      throw new Error(data?.message || 'Could not load classes');
    }
  }

  async function loadStudents(classId) {
    const res = await fetch(`/api/classes/${classId}/students`);
    students = await res.json();
  }

  loadClasses()
    .then(renderClassStep)
    .catch((err) => {
      showError(err.message || 'Could not load classes. Try again later.');
      subtitleEl.textContent = 'Choose your class';
      stepEl.innerHTML =
        '<p style="color:#f0f0f0;">Could not load classes. Check your connection or ask your teacher.</p>';
    });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function requireStudentSession(containerId, onAuthenticated) {
  const status = await checkStudentSession();

  if (status.authenticated && status.student) {
    window.editorAccessMode = 'student';
    showStudentEditorSession(status.student);
    onAuthenticated(status.student);
    return;
  }

  if (status.localTestUser || status.mode === 'local_test') {
    window.editorAccessMode = 'local_test';
    window.currentStudent = null;
    showTestUserEditorSession();
    onAuthenticated(null);
    return;
  }

  if (status.testUserModeAvailable) {
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
