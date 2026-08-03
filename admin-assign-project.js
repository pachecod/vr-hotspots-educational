let selectedZipFile = null;

function setAssignStatus(message, type) {
  const el = document.getElementById('assign-status');
  if (!el) return;
  el.style.display = 'block';
  if (type === 'error') {
    el.style.background = '#f8d7da';
    el.style.color = '#721c24';
    el.style.border = '1px solid #f5c6cb';
  } else if (type === 'success') {
    el.style.background = '#d4edda';
    el.style.color = '#155724';
    el.style.border = '1px solid #c3e6cb';
  } else {
    el.style.background = '#d1ecf1';
    el.style.color = '#0c5460';
    el.style.border = '1px solid #bee5eb';
  }
  el.textContent = message;
}

function getAssignFormValues() {
  const studentId = document.getElementById('assign-student')?.value || '';
  const studentName =
    document.getElementById('assign-student')?.selectedOptions?.[0]?.textContent?.trim() || '';
  const projectName = document.getElementById('assign-project-name')?.value?.trim() || '';
  const adminNote = document.getElementById('assign-admin-note')?.value?.trim() || '';
  return { studentId, studentName, projectName, adminNote };
}

function updateAssignButtons() {
  const { studentId, projectName } = getAssignFormValues();
  const ready = !!(studentId && projectName && selectedZipFile);
  const previewBtn = document.getElementById('assign-preview-btn');
  const sendBtn = document.getElementById('assign-send-btn');
  if (previewBtn) previewBtn.disabled = !ready;
  if (sendBtn) sendBtn.disabled = !ready;
}

async function loadAssignClasses() {
  const classSel = document.getElementById('assign-class');
  const studentSel = document.getElementById('assign-student');
  if (!classSel || !studentSel) return;

  try {
    const res = await adminFetch('/admin/classes');
    const classes = await res.json();
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      classSel.appendChild(opt);
    });
  } catch (err) {
    console.warn('Could not load classes:', err);
  }

  classSel.addEventListener('change', async () => {
    studentSel.innerHTML = '<option value="">Select a team member or student…</option>';
    studentSel.disabled = !classSel.value;
    updateAssignButtons();
    if (!classSel.value) return;
    try {
      const sRes = await adminFetch(`/admin/students?classId=${encodeURIComponent(classSel.value)}`);
      const students = await sRes.json();
      students.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.displayName || s.display_name;
        studentSel.appendChild(opt);
      });
    } catch (err) {
      setAssignStatus('Could not load students: ' + err.message, 'error');
    }
  });

  studentSel.addEventListener('change', updateAssignButtons);
  document.getElementById('assign-project-name')?.addEventListener('input', updateAssignButtons);
}

async function stageSelectedZip() {
  if (!selectedZipFile) throw new Error('Choose a project ZIP first');
  const fd = new FormData();
  fd.append('project', selectedZipFile);
  const res = await adminFetch('/admin/projects/stage-zip', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Could not stage ZIP');
  return data.stagingId;
}

async function sendAssignedProject({ useEditorZip = false, stagingId = null } = {}) {
  const { studentId, projectName, adminNote } = getAssignFormValues();
  if (!studentId) throw new Error('Select a student');
  if (!projectName) throw new Error('Enter a project name');
  if (!selectedZipFile && !stagingId) throw new Error('Choose a project ZIP');

  const fd = new FormData();
  fd.append('studentId', studentId);
  fd.append('projectName', projectName);
  if (adminNote) fd.append('adminNote', adminNote);
  if (stagingId) fd.append('stagingId', stagingId);
  else fd.append('project', selectedZipFile);

  const res = await adminFetch('/admin/projects/assign', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Assign failed');
  return data;
}

async function previewAssignedProject() {
  const { studentId, studentName, projectName } = getAssignFormValues();
  if (!studentId || !projectName || !selectedZipFile) return;

  const previewBtn = document.getElementById('assign-preview-btn');
  if (previewBtn) previewBtn.disabled = true;
  setAssignStatus('Staging project for preview…', 'info');

  try {
    const stagingId = await stageSelectedZip();
    const params = new URLSearchParams({
      adminAssign: '1',
      stagingId,
      studentId,
      projectName,
      studentName,
    });
    window.location.href = `/index.html?${params.toString()}`;
  } catch (err) {
    setAssignStatus('Preview failed: ' + err.message, 'error');
    if (previewBtn) previewBtn.disabled = false;
  }
}

async function sendFromAssignPage() {
  const sendBtn = document.getElementById('assign-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  setAssignStatus('Sending project to student…', 'info');

  try {
    await sendAssignedProject();
    setAssignStatus('Project sent successfully.', 'success');
    selectedZipFile = null;
    const zipInput = document.getElementById('assign-zip-input');
    if (zipInput) zipInput.value = '';
    document.getElementById('assign-admin-note').value = '';
    updateAssignButtons();
  } catch (err) {
    setAssignStatus('Send failed: ' + err.message, 'error');
  } finally {
    updateAssignButtons();
  }
}

function initAssignPage() {
  const loginRoot = document.getElementById('login-root');
  const main = document.getElementById('main-content');
  if (loginRoot) loginRoot.innerHTML = '';
  if (main) main.style.display = 'block';

  if (typeof renderAdminNav === 'function') {
    renderAdminNav('assign');
  }

  loadAssignClasses();

  document.getElementById('assign-zip-input')?.addEventListener('change', (e) => {
    selectedZipFile = e.target.files?.[0] || null;
    updateAssignButtons();
  });

  document.getElementById('assign-preview-btn')?.addEventListener('click', previewAssignedProject);
  document.getElementById('assign-send-btn')?.addEventListener('click', sendFromAssignPage);
}

requireAdminSession('login-root', initAssignPage);
