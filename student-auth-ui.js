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
  await fetch('/api/student/logout', { method: 'POST', credentials: 'include' });
}

function hideSceneLoadingOverlay() {
  const overlay = document.getElementById('scene-loading-overlay');
  if (overlay) {
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
}

function renderStudentLoginGate(containerId, onAuthenticated) {
  const container = document.getElementById(containerId);
  if (!container) return;

  hideSceneLoadingOverlay();

  let classes = [];
  let selectedClass = null;
  let students = [];
  let step = 'class';

  container.innerHTML = `
    <div id="student-login-shell" style="
      position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100000;
      display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;">
      <div style="background:#2a2a2a;color:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%;border:2px solid #4caf50;">
        <h2 style="margin:0 0 8px;color:#4caf50;">VR Hotspots</h2>
        <p id="student-login-subtitle" style="color:#ccc;margin:0 0 20px;">Choose your class to sign in</p>
        <div id="student-login-step"></div>
        <div id="student-login-error" style="color:#f44336;margin-top:12px;display:none;"></div>
        <div id="student-session-bar" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid #444;">
          <span id="student-session-label" style="color:#aaa;font-size:13px;"></span>
          <button id="student-logout-btn" type="button" style="margin-left:12px;padding:4px 10px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;">Logout</button>
        </div>
      </div>
    </div>
  `;

  const stepEl = document.getElementById('student-login-step');
  const errorEl = document.getElementById('student-login-error');
  const subtitleEl = document.getElementById('student-login-subtitle');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function clearError() {
    errorEl.style.display = 'none';
  }

  function renderClassStep() {
    step = 'class';
    subtitleEl.textContent = 'Choose your class';
    if (!classes.length) {
      stepEl.innerHTML = '<p style="color:#aaa;">No classes available. Ask your teacher to add you.</p>';
      return;
    }
    stepEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto;">
        ${classes
          .map(
            (c) => `
          <button type="button" class="student-class-btn" data-id="${c.id}" style="
            text-align:left;padding:12px;background:#333;border:1px solid #555;border-radius:6px;color:#fff;cursor:pointer;">
            <strong>${escapeHtml(c.name)}</strong>
            <span style="color:#888;font-size:12px;display:block;">${c.student_count || 0} student(s)</span>
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
    step = 'student';
    subtitleEl.textContent = `Class: ${selectedClass.name} — choose your name`;
    stepEl.innerHTML = `
      <button type="button" id="student-back-class" style="background:none;border:none;color:#4caf50;cursor:pointer;margin-bottom:12px;padding:0;">← Back to classes</button>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto;margin-bottom:16px;">
        ${students
          .map(
            (s) => `
          <button type="button" class="student-name-btn" data-id="${s.id}" style="
            text-align:left;padding:12px;background:#333;border:1px solid #555;border-radius:6px;color:#fff;cursor:pointer;">
            ${escapeHtml(s.display_name)}
          </button>`
          )
          .join('')}
      </div>
      <div id="student-password-section" style="display:none;">
        <label style="display:block;color:#ccc;margin-bottom:6px;font-size:13px;">Password</label>
        <input type="password" id="student-password-input" placeholder="Enter your password" style="
          width:100%;padding:10px;border:1px solid #555;border-radius:4px;background:#333;color:#fff;box-sizing:border-box;margin-bottom:12px;" />
        <button type="button" id="student-login-submit" style="
          width:100%;padding:12px;background:#4caf50;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Sign In</button>
      </div>
    `;

    let selectedStudent = null;
    document.getElementById('student-back-class').addEventListener('click', renderClassStep);
    stepEl.querySelectorAll('.student-name-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedStudent = students.find((s) => s.id === btn.dataset.id);
        stepEl.querySelectorAll('.student-name-btn').forEach((b) => {
          b.style.borderColor = b === btn ? '#4caf50' : '#555';
        });
        document.getElementById('student-password-section').style.display = 'block';
        document.getElementById('student-password-input').focus();
        stepEl._selectedStudent = selectedStudent;
      });
    });

    document.getElementById('student-login-submit').addEventListener('click', async () => {
      clearError();
      const student = stepEl._selectedStudent;
      const password = document.getElementById('student-password-input').value;
      if (!student) return showError('Please select your name');
      if (!password) return showError('Please enter your password');
      try {
        const info = await studentLogin(selectedClass.id, student.id, password);
        document.getElementById('student-login-shell').style.display = 'none';
        updateSessionBar(info);
        onAuthenticated(info);
      } catch (err) {
        showError(err.message);
      }
    });
  }

  function updateSessionBar(student) {
    const bar = document.getElementById('student-session-bar');
    const label = document.getElementById('student-session-label');
    if (student && bar && label) {
      label.textContent = `Signed in as ${student.displayName} (${student.className || ''})`;
      bar.style.display = 'block';
    }
  }

  document.getElementById('student-logout-btn').addEventListener('click', async () => {
    await studentLogout();
    document.getElementById('student-login-shell').style.display = 'flex';
    renderClassStep();
  });

  async function loadClasses() {
    const res = await fetch('/api/classes');
    classes = await res.json();
  }

  async function loadStudents(classId) {
    const res = await fetch(`/api/classes/${classId}/students`);
    students = await res.json();
  }

  loadClasses().then(renderClassStep);
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
  if (!status.authRequired) {
    onAuthenticated(null);
    return;
  }
  if (status.authenticated && status.student) {
    onAuthenticated(status.student);
    return;
  }
  hideSceneLoadingOverlay();
  renderStudentLoginGate(containerId, onAuthenticated);
}

window.checkStudentSession = checkStudentSession;
window.requireStudentSession = requireStudentSession;
window.studentLogout = studentLogout;
