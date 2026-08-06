let selectedZipFile = null;
let selectedHostedPath = null;
let hostedProjects = [];
let assignSource = 'zip';

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

function getSelectedHostedProject() {
  if (!selectedHostedPath) return null;
  return hostedProjects.find((p) => p.hostedPath === selectedHostedPath) || null;
}

function hasProjectSource() {
  if (assignSource === 'zip') return !!selectedZipFile;
  return !!selectedHostedPath;
}

function updateAssignButtons() {
  const { studentId, projectName } = getAssignFormValues();
  const ready = !!(studentId && projectName && hasProjectSource());
  const previewBtn = document.getElementById('assign-preview-btn');
  const sendBtn = document.getElementById('assign-send-btn');
  if (previewBtn) previewBtn.disabled = !ready;
  if (sendBtn) sendBtn.disabled = !ready;
}

function updateHostedMeta() {
  const meta = document.getElementById('assign-hosted-meta');
  if (!meta) return;
  const project = getSelectedHostedProject();
  if (!project) {
    meta.innerHTML = '';
    return;
  }
  const parts = [
    `<strong>${escapeHtml(project.sourceLabel || project.source)}</strong>`,
  ];
  if (project.studentName) {
    parts.push(`Originally by ${escapeHtml(project.studentName)}${project.className ? ` (${escapeHtml(project.className)})` : ''}`);
  }
  if (project.tourUrl) {
    parts.push(`<a href="${escapeHtml(project.tourUrl)}" target="_blank" rel="noopener noreferrer">View hosted tour</a>`);
  }
  meta.innerHTML = parts.join(' · ');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readAdminJson(res, fallbackMessage) {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      fallbackMessage ||
        (res.ok
          ? 'Server returned an empty response'
          : `Request failed (${res.status}). The server may have restarted while preparing the project.`)
    );
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(fallbackMessage || `Invalid server response (${res.status})`);
  }
}

function setAssignSource(source) {
  assignSource = source === 'hosted' ? 'hosted' : 'zip';
  document.getElementById('assign-source-zip')?.classList.toggle('active', assignSource === 'zip');
  document.getElementById('assign-source-hosted')?.classList.toggle('active', assignSource === 'hosted');
  const zipRadio = document.querySelector('input[name="assign-source"][value="zip"]');
  const hostedRadio = document.querySelector('input[name="assign-source"][value="hosted"]');
  if (zipRadio) zipRadio.checked = assignSource === 'zip';
  if (hostedRadio) hostedRadio.checked = assignSource === 'hosted';
  if (assignSource === 'zip') {
    selectedHostedPath = null;
    const hostedSelect = document.getElementById('assign-hosted-select');
    if (hostedSelect) hostedSelect.value = '';
    updateHostedMeta();
  } else {
    selectedZipFile = null;
    const zipInput = document.getElementById('assign-zip-input');
    if (zipInput) zipInput.value = '';
  }
  updateAssignButtons();
}

/** Normalize /hosted/foo/index.html or foo → foo */
function normalizeHostedPathParam(raw) {
  let path = String(raw || '').trim();
  try {
    path = decodeURIComponent(path);
  } catch (_) {
    /* keep */
  }
  path = path.replace(/^https?:\/\/[^/]+/i, '');
  const hostedMatch = path.match(/\/hosted\/([^/]+)/i);
  if (hostedMatch) path = hostedMatch[1];
  path = path.replace(/^\/+/, '').replace(/\/index\.html$/i, '').replace(/\/+$/, '');
  return path;
}

function selectHostedProjectPath(hostedPath, { title } = {}) {
  const path = normalizeHostedPathParam(hostedPath);
  const select = document.getElementById('assign-hosted-select');
  if (!path || !select) return false;

  setAssignSource('hosted');

  let matchValue = [...select.options].find((o) => o.value === path)?.value || '';
  if (!matchValue) {
    // Case-insensitive / suffix fallback
    const lower = path.toLowerCase();
    matchValue =
      [...select.options].find((o) => o.value && o.value.toLowerCase() === lower)?.value || '';
  }

  if (!matchValue) {
    const opt = document.createElement('option');
    opt.value = path;
    opt.textContent = `${title || path} (repaired / hosted)`;
    opt.dataset.title = title || path;
    // Put at top of list (after placeholder)
    if (select.options.length > 1) {
      select.add(opt, select.options[1]);
    } else {
      select.appendChild(opt);
    }
    if (!hostedProjects.some((p) => p.hostedPath === path)) {
      hostedProjects.unshift({
        hostedPath: path,
        title: title || path,
        source: 'repair',
        sourceLabel: 'Repaired hosted copy',
        tourUrl: `/hosted/${path}/index.html`,
      });
    }
    matchValue = path;
  }

  select.value = matchValue;
  selectedHostedPath = matchValue;
  // Ensure UI reflects selection even if value was already set
  select.dispatchEvent(new Event('change', { bubbles: true }));
  updateHostedMeta();
  updateAssignButtons();
  return select.value === matchValue;
}

async function loadStudentsForClass(classId) {
  const studentSel = document.getElementById('assign-student');
  if (!studentSel) return [];
  studentSel.innerHTML = '<option value="">Select a team member or student…</option>';
  studentSel.disabled = !classId;
  if (!classId) return [];
  const sRes = await adminFetch(`/admin/students?classId=${encodeURIComponent(classId)}`);
  const students = await sRes.json();
  students.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.displayName || s.display_name;
    studentSel.appendChild(opt);
  });
  return students;
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
    updateAssignButtons();
    try {
      await loadStudentsForClass(classSel.value);
    } catch (err) {
      setAssignStatus('Could not load students: ' + err.message, 'error');
    }
    updateAssignButtons();
  });

  studentSel.addEventListener('change', updateAssignButtons);
  document.getElementById('assign-project-name')?.addEventListener('input', updateAssignButtons);
}

async function loadHostedAssignableProjects() {
  const select = document.getElementById('assign-hosted-select');
  if (!select) return;

  try {
    const res = await adminFetch('/admin/projects/hosted-assignable');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not load hosted projects');
    hostedProjects = data.projects || [];
    select.innerHTML = '<option value="">Select a hosted project…</option>';
    if (!hostedProjects.length) {
      select.innerHTML = '<option value="">No hosted VR projects found</option>';
      return;
    }
    hostedProjects.forEach((project) => {
      const opt = document.createElement('option');
      opt.value = project.hostedPath;
      const owner = project.studentName ? ` — ${project.studentName}` : '';
      opt.textContent = `${project.title}${owner} (${project.sourceLabel || project.source})`;
      opt.dataset.title = project.title;
      select.appendChild(opt);
    });
  } catch (err) {
    select.innerHTML = '<option value="">Could not load hosted projects</option>';
    setAssignStatus('Could not load hosted projects: ' + err.message, 'error');
  }
}

async function stageCurrentProject() {
  if (assignSource === 'zip') {
    if (!selectedZipFile) throw new Error('Choose a project ZIP first');
    const fd = new FormData();
    fd.append('project', selectedZipFile);
    const res = await adminFetch('/admin/projects/stage-zip', { method: 'POST', body: fd });
    const data = await readAdminJson(res, 'Could not stage ZIP');
    if (!data.success) throw new Error(data.message || 'Could not stage ZIP');
    return data.stagingId;
  }

  if (!selectedHostedPath) throw new Error('Choose a hosted project first');
  const res = await adminFetch('/admin/projects/stage-hosted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostedPath: selectedHostedPath }),
  });
  const data = await readAdminJson(
    res,
    'Could not prepare hosted project for preview. Large projects may take a minute — try again if the dev server restarted.'
  );
  if (!data.success) throw new Error(data.message || 'Could not stage hosted project');
  return data.stagingId;
}

async function sendAssignedProject({ stagingId = null } = {}) {
  const { studentId, projectName, adminNote } = getAssignFormValues();
  if (!studentId) throw new Error('Select a student');
  if (!projectName) throw new Error('Enter a project name');
  if (!stagingId && !selectedZipFile && !selectedHostedPath) {
    throw new Error('Choose a project ZIP or hosted project');
  }

  const fd = new FormData();
  fd.append('studentId', studentId);
  fd.append('projectName', projectName);
  if (adminNote) fd.append('adminNote', adminNote);
  if (stagingId) {
    fd.append('stagingId', stagingId);
  } else if (assignSource === 'hosted' && selectedHostedPath) {
    fd.append('hostedPath', selectedHostedPath);
  } else if (selectedZipFile) {
    fd.append('project', selectedZipFile);
  }

  const res = await adminFetch('/admin/projects/assign', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Assign failed');
  return data;
}

async function previewAssignedProject() {
  const { studentId, studentName, projectName } = getAssignFormValues();
  if (!studentId || !projectName || !hasProjectSource()) return;

  const previewBtn = document.getElementById('assign-preview-btn');
  if (previewBtn) previewBtn.disabled = true;
  setAssignStatus('Preparing project for preview…', 'info');

  try {
    const stagingId = await stageCurrentProject();
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
    selectedHostedPath = null;
    const zipInput = document.getElementById('assign-zip-input');
    if (zipInput) zipInput.value = '';
    const hostedSelect = document.getElementById('assign-hosted-select');
    if (hostedSelect) hostedSelect.value = '';
    updateHostedMeta();
    document.getElementById('assign-admin-note').value = '';
    updateAssignButtons();
  } catch (err) {
    setAssignStatus('Send failed: ' + err.message, 'error');
  } finally {
    updateAssignButtons();
  }
}

async function applyAssignQueryPrefill() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return;

  const source = params.get('source');
  const hostedPathRaw = params.get('hostedPath') || params.get('hosted') || '';
  const hostedPath = normalizeHostedPathParam(hostedPathRaw);
  const projectName = params.get('projectName') || '';
  const classId = params.get('classId') || '';
  const studentId = params.get('studentId') || '';
  const adminNote = params.get('adminNote') || '';

  if (projectName) {
    const nameInput = document.getElementById('assign-project-name');
    if (nameInput) nameInput.value = projectName;
  }
  if (adminNote) {
    const noteInput = document.getElementById('assign-admin-note');
    if (noteInput) noteInput.value = adminNote;
  }

  let hostedSelected = false;
  if (source === 'hosted' || hostedPath) {
    setAssignSource('hosted');
  }
  if (hostedPath) {
    hostedSelected = selectHostedProjectPath(hostedPath, {
      title: projectName || hostedPath,
    });
    const nameInput = document.getElementById('assign-project-name');
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = projectName || hostedPath;
    }
  }

  if (classId) {
    const classSel = document.getElementById('assign-class');
    if (classSel) {
      classSel.value = classId;
      try {
        await loadStudentsForClass(classId);
      } catch (err) {
        setAssignStatus('Could not load students for prefill: ' + err.message, 'error');
      }
    }
  }

  if (studentId) {
    const studentSel = document.getElementById('assign-student');
    if (studentSel) studentSel.value = studentId;
  }

  // Re-assert hosted selection after student loads (in case anything reset the select)
  if (hostedPath) {
    hostedSelected = selectHostedProjectPath(hostedPath, {
      title: projectName || hostedPath,
    });
  }

  updateAssignButtons();
  if (hostedPath || studentId) {
    setAssignStatus(
      hostedSelected
        ? `Prefilled repaired project “${hostedPath}”. Preview or send when ready.`
        : `Opened assign form, but could not select hosted path “${hostedPath || '(missing)'}”. Pick it from the list.`,
      hostedSelected ? 'info' : 'error'
    );
  }
}

async function initAssignPage() {
  const loginRoot = document.getElementById('login-root');
  const main = document.getElementById('main-content');
  if (loginRoot) loginRoot.innerHTML = '';
  if (main) main.style.display = 'block';

  if (typeof renderAdminNav === 'function') {
    renderAdminNav('assign');
  }

  document.querySelectorAll('input[name="assign-source"]').forEach((radio) => {
    radio.addEventListener('change', (e) => setAssignSource(e.target.value));
  });

  document.getElementById('assign-zip-input')?.addEventListener('change', (e) => {
    selectedZipFile = e.target.files?.[0] || null;
    updateAssignButtons();
  });

  document.getElementById('assign-hosted-select')?.addEventListener('change', (e) => {
    selectedHostedPath = e.target.value || null;
    // Keep source on hosted when user picks from the list
    if (selectedHostedPath && assignSource !== 'hosted') {
      setAssignSource('hosted');
      // setAssignSource clears select when switching to zip only; switching to hosted is fine
      const select = document.getElementById('assign-hosted-select');
      if (select && selectedHostedPath) select.value = selectedHostedPath;
    }
    const selectedOption = e.target.selectedOptions?.[0];
    const title = selectedOption?.dataset?.title;
    const nameInput = document.getElementById('assign-project-name');
    if (title && nameInput && !nameInput.value.trim()) {
      nameInput.value = title;
    }
    updateHostedMeta();
    updateAssignButtons();
  });

  document.getElementById('assign-preview-btn')?.addEventListener('click', previewAssignedProject);
  document.getElementById('assign-send-btn')?.addEventListener('click', sendFromAssignPage);

  await loadAssignClasses();
  await loadHostedAssignableProjects();
  await applyAssignQueryPrefill();
}

requireAdminSession('login-root', initAssignPage);
