let classes = [];
let students = [];
let filterClassId = 'all';

async function initAdminUsers() {
  const billingNav = document.getElementById('billing-nav');
  try {
    const res = await fetch('/api/billing/enabled');
    const data = await res.json();
    if (data.enabled && billingNav) billingNav.style.display = '';
  } catch (_) {}

  await loadClasses();
  await loadStudents();
  bindEvents();
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
          <button class="btn-secondary" onclick="resetPassword('${s.id}')">Reset Password</button>
          <button class="btn-danger" onclick="deleteStudent('${s.id}')">Delete</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
}

async function addStudent() {
  const displayName = document.getElementById('new-student-name').value.trim();
  const classId = document.getElementById('filter-class').value;
  if (!displayName) return alert('Student name required');
  if (classId === 'all') return alert('Select a specific class first');
  const res = await adminFetch('/admin/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, displayName }),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  const msg = document.getElementById('students-msg');
  msg.className = 'success';
  msg.textContent = `Added ${data.student.display_name}. Username: ${data.student.username} — Password: ${data.password} (save this now!)`;
  document.getElementById('new-student-name').value = '';
  await loadStudents();
  await loadClasses();
}

async function resetPassword(id) {
  const res = await adminFetch(`/admin/students/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  alert(`New password for ${data.student.display_name}: ${data.password}`);
}

async function deleteStudent(id) {
  if (!confirm('Delete this student?')) return;
  await adminFetch(`/admin/students/${id}`, { method: 'DELETE' });
  await loadStudents();
  await loadClasses();
}

async function exportPasswords() {
  const res = await adminFetch('/admin/students/password-report?format=csv');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'password-report.csv';
  a.click();
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
  initAdminUsers();
});
