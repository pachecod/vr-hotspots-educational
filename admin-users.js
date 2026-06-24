let classes = [];
let students = [];
let filterClassId = 'all';

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
  document.getElementById('filter-class').addEventListener('change', (e) => {
    filterClassId = e.target.value;
    loadStudents();
  });
  document.getElementById('export-passwords-btn').addEventListener('click', exportPasswords);
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
          <button class="btn-peek" onclick="openStudentPeek('${s.id}')">Peek</button>
          <button class="btn-secondary" onclick="resetPassword('${s.id}')">Reset Password</button>
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
  msg.textContent = `Added ${data.student.display_name}. Username: ${data.student.username} — Password: ${data.password} (saved on server; download CSV anytime)`;
  document.getElementById('new-student-name').value = '';
  document.getElementById('new-student-password').value = '';
  await loadStudents();
  await loadClasses();
}

async function resetPassword(id) {
  const custom = prompt(
    'Enter a new password for this student, or leave blank to auto-generate one:'
  );
  if (custom === null) return;
  const body = {};
  if (custom.trim()) body.password = custom.trim();
  const res = await adminFetch(`/admin/students/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  alert(
    `New password for ${data.student.display_name}: ${data.password}\n\nSaved on server — included in CSV download.`
  );
}

async function deleteStudent(id) {
  if (!confirm('Delete this student?')) return;
  await adminFetch(`/admin/students/${id}`, { method: 'DELETE' });
  await loadStudents();
  await loadClasses();
}

async function exportPasswords() {
  try {
    const res = await adminFetch('/admin/students/password-report?format=csv');
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

requireAdminSession('admin-gate', () => {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  renderAdminNav('users');
  initAdminUsers();
});
