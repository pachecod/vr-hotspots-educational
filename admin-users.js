let classes = [];
let students = [];
let filterClassId = 'all';
let passwordModalStudentId = null;
let passwordReportRows = [];
let passwordsVisible = false;
let passwordsPanelOpen = false;

async function fetchSamplePassword() {
  const res = await adminFetch('/admin/students/sample-password');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not generate password');
  return data.password;
}

async function initAdminUsers() {
  const billingLink = document.getElementById('billing-link-wrap');
  if (billingLink) billingLink.style.display = '';

  await loadClasses();
  await loadStudents();
  bindEvents();

  const peekId = new URLSearchParams(window.location.search).get('peek');
  if (peekId && window.StudentPeek) {
    const returnTo =
      new URLSearchParams(window.location.search).get('from') === 'assets' ? 'assets' : 'users';
    await StudentPeek.open(peekId, { returnTo });
  }
}

function bindEvents() {
  document.getElementById('add-class-btn').addEventListener('click', addClass);
  document.getElementById('add-student-btn').addEventListener('click', addStudent);
  document.getElementById('generate-new-password-btn').addEventListener('click', async () => {
    try {
      document.getElementById('new-student-password').value = await fetchSamplePassword();
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('filter-class').addEventListener('change', (e) => {
    filterClassId = e.target.value;
    loadStudents();
    if (passwordsPanelOpen) loadPasswordReport();
  });
  document.getElementById('export-passwords-btn').addEventListener('click', exportPasswords);
  document.getElementById('view-passwords-btn').addEventListener('click', togglePasswordsPanel);
  document.getElementById('hide-passwords-panel-btn').addEventListener('click', closePasswordsPanel);
  document.getElementById('toggle-password-visibility-btn').addEventListener('click', togglePasswordVisibility);
  document.getElementById('refresh-passwords-btn').addEventListener('click', loadPasswordReport);
  bindPasswordModal();
}

function bindPasswordModal() {
  const modal = document.getElementById('password-modal');
  const input = document.getElementById('password-modal-input');
  const msg = document.getElementById('password-modal-msg');

  document.getElementById('password-modal-cancel-btn').addEventListener('click', closePasswordModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePasswordModal();
  });
  document.getElementById('password-modal-generate-btn').addEventListener('click', async () => {
    msg.style.display = 'none';
    try {
      input.value = await fetchSamplePassword();
      input.focus();
      input.select();
    } catch (err) {
      msg.textContent = err.message;
      msg.style.display = 'block';
    }
  });
  document.getElementById('password-modal-save-btn').addEventListener('click', savePasswordFromModal);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') savePasswordFromModal();
    if (e.key === 'Escape') closePasswordModal();
  });
}

function openPasswordModal(studentId) {
  const student = students.find((s) => s.id === studentId);
  if (!student) return;
  passwordModalStudentId = studentId;
  document.getElementById('password-modal-student').textContent =
    `Set a password for ${student.display_name} (${student.username}). Type your own, click Generate to preview, or leave blank and Save to auto-generate.`;
  document.getElementById('password-modal-input').value = '';
  document.getElementById('password-modal-msg').style.display = 'none';
  document.getElementById('password-modal').classList.add('open');
  document.getElementById('password-modal-input').focus();
}

function closePasswordModal() {
  passwordModalStudentId = null;
  document.getElementById('password-modal').classList.remove('open');
}

async function savePasswordFromModal() {
  const input = document.getElementById('password-modal-input');
  const msg = document.getElementById('password-modal-msg');
  const password = input.value.trim();
  if (!passwordModalStudentId) return;
  msg.style.display = 'none';
  const body = password ? { password } : {};
  const res = await adminFetch(`/admin/students/${passwordModalStudentId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) {
    msg.textContent = data.message || 'Could not save password';
    msg.style.display = 'block';
    return;
  }
  closePasswordModal();
  alert(
    `Password saved for ${data.student.display_name}: ${data.password}\n\nIncluded in password list and CSV download.`
  );
  if (passwordsPanelOpen) loadPasswordReport();
}

async function togglePasswordsPanel() {
  if (passwordsPanelOpen) {
    closePasswordsPanel();
    return;
  }
  const ok = confirm(
    'View student passwords on this page?\n\nOnly continue on a trusted device. Anyone with admin access can see these passwords.'
  );
  if (!ok) return;
  passwordsPanelOpen = true;
  passwordsVisible = false;
  document.getElementById('passwords-panel').classList.add('open');
  document.getElementById('view-passwords-btn').textContent = 'Hide Passwords';
  await loadPasswordReport();
}

function closePasswordsPanel() {
  passwordsPanelOpen = false;
  passwordsVisible = false;
  passwordReportRows = [];
  document.getElementById('passwords-panel').classList.remove('open');
  document.getElementById('view-passwords-btn').textContent = 'View Passwords';
  document.getElementById('passwords-list').innerHTML = '';
  document.getElementById('passwords-panel-status').textContent = '';
  updatePasswordVisibilityButton();
}

function togglePasswordVisibility() {
  passwordsVisible = !passwordsVisible;
  renderPasswordReport();
  updatePasswordVisibilityButton();
}

function updatePasswordVisibilityButton() {
  const btn = document.getElementById('toggle-password-visibility-btn');
  btn.textContent = passwordsVisible ? 'Mask All' : 'Reveal All';
}

function passwordReportUrl() {
  const base = '/admin/students/password-report?format=json';
  return filterClassId === 'all' ? base : `${base}&classId=${encodeURIComponent(filterClassId)}`;
}

async function loadPasswordReport() {
  const status = document.getElementById('passwords-panel-status');
  const list = document.getElementById('passwords-list');
  status.textContent = 'Loading…';
  list.innerHTML = '';
  try {
    const res = await adminFetch(passwordReportUrl());
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Load failed (${res.status})`);
    }
    passwordReportRows = await res.json();
    const scope =
      filterClassId === 'all'
        ? 'all classes'
        : classes.find((c) => c.id === filterClassId)?.name || 'selected class';
    status.textContent = `${passwordReportRows.length} student(s) — ${scope}`;
    renderPasswordReport();
  } catch (err) {
    status.textContent = '';
    list.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function renderPasswordReport() {
  const list = document.getElementById('passwords-list');
  if (!passwordReportRows.length) {
    list.innerHTML = '<p style="color:#666;">No students found.</p>';
    return;
  }
  list.innerHTML = `<table>
    <thead><tr>
      <th>Class</th><th>Name</th><th>Username</th><th>Password</th><th>Set</th><th></th>
    </tr></thead>
    <tbody>${passwordReportRows.map((row, index) => {
      const hasPassword = !!row.password;
      const pwDisplay = !hasPassword
        ? '<span class="pw-missing">Not stored — use Set Password</span>'
        : passwordsVisible
          ? `<span class="pw-cell">${escapeHtml(row.password)}</span>`
          : '<span class="pw-cell pw-masked">••••••••••••</span>';
      const setAt = row.password_set_at
        ? new Date(row.password_set_at).toLocaleDateString()
        : '—';
      return `<tr>
        <td>${escapeHtml(row.class_name)}</td>
        <td>${escapeHtml(row.display_name)}</td>
        <td><code>${escapeHtml(row.username)}</code></td>
        <td>${pwDisplay}</td>
        <td>${escapeHtml(setAt)}</td>
        <td>${hasPassword ? `<button type="button" class="btn-link" data-copy-pw="${index}">Copy</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

  list.querySelectorAll('[data-copy-pw]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = passwordReportRows[Number(btn.getAttribute('data-copy-pw'))];
      if (!row?.password) return;
      try {
        await navigator.clipboard.writeText(row.password);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      } catch {
        alert('Could not copy to clipboard');
      }
    });
  });
}

async function loadClasses() {
  const res = await adminFetch('/admin/classes');
  classes = await res.json();
  renderClasses();
  const filter = document.getElementById('filter-class');
  filter.innerHTML = '<option value="all">All classes</option>' +
    classes.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function renderClasses() {
  const el = document.getElementById('classes-list');
  if (!classes.length) {
    el.innerHTML = '<p style="color:#666;">No classes yet.</p>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Students</th><th>Plan</th><th>Actions</th></tr></thead>
    <tbody>${classes.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong><br><small style="color:#888;">${escapeHtml(c.description || '')}</small></td>
        <td>${c.student_count || 0}</td>
        <td>${escapeHtml(c.plan_tier || 'free')}</td>
        <td>
          <a class="btn btn-secondary" href="admin-billing.html?classId=${encodeURIComponent(c.id)}">Limits</a>
          <button class="btn-danger" onclick="deleteClass('${c.id}')">Delete</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
}

async function addClass() {
  const name = document.getElementById('new-class-name').value.trim();
  const description = document.getElementById('new-class-desc').value.trim();
  if (!name) return alert('Class name required');
  const res = await adminFetch('/admin/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  document.getElementById('new-class-name').value = '';
  document.getElementById('new-class-desc').value = '';
  await loadClasses();
}

async function deleteClass(id) {
  if (!confirm('Delete this class and all its students?')) return;
  await adminFetch(`/admin/classes/${id}`, { method: 'DELETE' });
  await loadClasses();
  await loadStudents();
}

async function loadStudents() {
  const url = filterClassId === 'all' ? '/admin/students' : `/admin/students?classId=${filterClassId}`;
  const res = await adminFetch(url);
  students = await res.json();
  renderStudents();
}

function renderStudents() {
  const el = document.getElementById('students-list');
  if (!students.length) {
    el.innerHTML = '<p style="color:#666;">No students yet.</p>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Username</th><th>Class</th><th>Active</th><th>Actions</th></tr></thead>
    <tbody>${students.map((s) => `
      <tr>
        <td>${escapeHtml(s.display_name)}</td>
        <td><code>${escapeHtml(s.username)}</code></td>
        <td>${escapeHtml(s.class_name || '')}</td>
        <td>${s.is_active ? 'Yes' : 'No'}</td>
        <td>
          <a class="btn btn-secondary" href="admin-common-assets.html?view=content&studentId=${encodeURIComponent(s.id)}&classId=${encodeURIComponent(s.class_id || '')}">Content</a>
          <button class="btn-peek" onclick="openStudentPeek('${s.id}')">Peek</button>
          <button class="btn-secondary" onclick="openPasswordModal('${s.id}')">Set Password</button>
          <button class="btn-danger" onclick="deleteStudent('${s.id}')">Delete</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
}

async function addStudent() {
  const displayName = document.getElementById('new-student-name').value.trim();
  const password = document.getElementById('new-student-password').value;
  const classId = document.getElementById('filter-class').value;
  if (!displayName) return alert('Student name required');
  if (classId === 'all') return alert('Select a specific class first');
  const body = { classId, displayName };
  if (password.trim()) body.password = password.trim();
  const res = await adminFetch('/admin/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  const msg = document.getElementById('students-msg');
  msg.className = 'success';
  msg.textContent = `Added ${data.student.display_name}. Username: ${data.student.username} — Password: ${data.password} (saved on server; view or download anytime)`;
  document.getElementById('new-student-name').value = '';
  document.getElementById('new-student-password').value = '';
  await loadStudents();
  await loadClasses();
  if (passwordsPanelOpen) loadPasswordReport();
}

async function resetPassword(id) {
  openPasswordModal(id);
}

async function deleteStudent(id) {
  if (!confirm('Delete this student?')) return;
  await adminFetch(`/admin/students/${id}`, { method: 'DELETE' });
  await loadStudents();
  await loadClasses();
}

async function exportPasswords() {
  try {
    const base = '/admin/students/password-report?format=csv';
    const url =
      filterClassId === 'all' ? base : `${base}&classId=${encodeURIComponent(filterClassId)}`;
    const res = await adminFetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'student-passwords.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Could not download passwords: ' + err.message);
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.deleteClass = deleteClass;
window.deleteStudent = deleteStudent;
window.resetPassword = resetPassword;
window.openPasswordModal = openPasswordModal;

requireAdminSession('admin-gate', () => {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  renderAdminNav('users');
  initAdminUsers();
});
