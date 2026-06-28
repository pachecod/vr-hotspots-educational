function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLegacyVersion(versionId) {
  return String(versionId || '').startsWith('legacy:');
}

function legacyFileName(versionId, fileName) {
  return fileName || String(versionId).replace(/^legacy:/, '');
}

function formatHostedLinks(sub) {
  if (!sub.isHosted && !sub.hostedUrl && !sub.tourUrl) return '';
  const tourUrl = sub.tourUrl || sub.hostedUrl;
  const flatUrl = sub.flatPageUrl;
  let html = '';
  if (tourUrl) {
    html += `<br><strong>360° tour:</strong> <a href="${escapeHtml(tourUrl)}" target="_blank" rel="noopener">${escapeHtml(tourUrl)}</a>`;
  }
  if (flatUrl) {
    html += `<br><strong>Flat page:</strong> <a href="${escapeHtml(flatUrl)}" target="_blank" rel="noopener">${escapeHtml(flatUrl)}</a>`;
  }
  return html;
}

function showHostSuccess(result) {
  let banner = document.getElementById('host-result');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'host-result';
    banner.className = 'host-result';
    const main = document.getElementById('main-content');
    const anchor = main?.querySelector('h1');
    if (anchor && anchor.nextSibling) {
      main.insertBefore(banner, anchor.nextSibling);
    } else if (main) {
      main.prepend(banner);
    }
  }
  const tourUrl = result.tourUrl || result.hostedUrl;
  let html = '<strong>Hosted successfully</strong><br>';
  if (tourUrl) {
    html += `360° tour: <a href="${escapeHtml(tourUrl)}" target="_blank" rel="noopener">${escapeHtml(tourUrl)}</a><br>`;
  }
  if (result.flatPageUrl) {
    html += `Flat page: <a href="${escapeHtml(result.flatPageUrl)}" target="_blank" rel="noopener">${escapeHtml(result.flatPageUrl)}</a>`;
  }
  banner.innerHTML = html;
  banner.style.display = 'block';
}

function kindBadge(kind) {
  const labels = {
    submitted: 'Submitted',
    admin_return: 'Teacher feedback',
    draft: 'Draft',
  };
  const cls = kind === 'admin_return' ? 'badge-return' : kind === 'draft' ? 'badge-draft' : 'badge-submitted';
  return `<span class="badge ${cls}">${labels[kind] || kind}</span>`;
}

async function loadClassesAndStudents() {
  try {
    const res = await adminFetch('/api/classes');
    const classes = await res.json();
    const classSel = document.getElementById('filter-class');
    const studentSel = document.getElementById('filter-student');
    if (!classSel) return;

    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      classSel.appendChild(opt);
    });

    classSel.addEventListener('change', async () => {
      studentSel.innerHTML = '<option value="">All students</option>';
      const classId = classSel.value;
      if (!classId) return;
      const sRes = await adminFetch(`/api/classes/${classId}/students`);
      const students = await sRes.json();
      students.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.displayName || s.display_name;
        studentSel.appendChild(opt);
      });
    });
  } catch (err) {
    console.warn('Could not load class filters:', err);
  }
}

async function loadInbox() {
  const container = document.getElementById('inbox-list');
  try {
    const classId = document.getElementById('filter-class')?.value || '';
    const studentId = document.getElementById('filter-student')?.value || '';
    const filter = document.getElementById('filter-notes')?.value || 'all';
    const params = new URLSearchParams();
    if (classId) params.set('classId', classId);
    if (studentId) params.set('studentId', studentId);
    if (filter && filter !== 'all') params.set('filter', filter);
    const url = '/admin/submissions-inbox' + (params.toString() ? '?' + params.toString() : '');
    const response = await adminFetch(url);
    const submissions = await response.json();

    if (!submissions.length) {
      container.innerHTML = '<p>No submissions yet.</p>';
      return;
    }

    container.innerHTML = submissions
      .map((sub) => {
        const versionId = sub.id;
        const threadId = sub.threadId;
        const noteBlock = sub.studentNote
          ? `<div class="note-block"><strong>Student note:</strong>${escapeHtml(sub.studentNote)}</div>`
          : '';
        const hostedLink = formatHostedLinks(sub);

        const legacy = isLegacyVersion(versionId);
        const historyBtn = legacy
          ? ''
          : `<button class="btn-history" onclick="toggleHistory('${threadId}', this)">📜 Version history</button>`;
        const reviewLink = legacy
          ? ''
          : `<a class="btn btn-review" href="/index.html?adminReview=1&versionId=${versionId}">✏️ Review in Editor</a>`;

        return `
          <div class="submission-card" data-version-id="${versionId}" data-thread-id="${threadId}">
            <h3>${escapeHtml(sub.projectName)} ${kindBadge('submitted')}${legacy ? ' <span class="badge badge-draft">B2 only</span>' : ''}</h3>
            <div class="meta">
              <strong>Student:</strong> ${escapeHtml(sub.studentDisplayName || sub.studentName || 'Unknown')}
              ${sub.className ? ` (${escapeHtml(sub.className)})` : ''}<br>
              <strong>Version:</strong> #${sub.versionNumber || 1}<br>
              <strong>Submitted:</strong> ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}<br>
              <strong>File:</strong> ${escapeHtml(sub.fileName)}${hostedLink}
            </div>
            ${noteBlock}
            <div class="actions">
              <button class="btn-download" onclick="downloadVersion('${versionId}', '${escapeHtml(sub.fileName)}')">📥 Download</button>
              <button class="btn-host" onclick="hostVersion('${versionId}', '${escapeHtml(sub.studentDisplayName || sub.studentName || 'project')}')">🌐 Host</button>
              ${reviewLink}
              ${historyBtn}
              <button class="btn-delete" onclick="deleteVersion('${versionId}')">🗑️ Delete</button>
            </div>
            <div class="version-history" id="history-${threadId}"></div>
          </div>`;
      })
      .join('');
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') {
      const main = document.getElementById('main-content');
      if (main) main.style.display = 'none';
      requireAdminSession('login-root', initInbox);
      return;
    }
    container.innerHTML = '<p style="color:#dc3545;">Error loading inbox.</p>';
  }
}

async function downloadVersion(versionId, fileName) {
  try {
    const downloadUrl = isLegacyVersion(versionId)
      ? `/admin/download/${encodeURIComponent(legacyFileName(versionId, fileName))}`
      : `/admin/versions/${versionId}/download`;
    const response = await adminFetch(downloadUrl);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Download failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + err.message);
  }
}

async function hostVersion(versionId, studentName) {
  const suggestedPath = studentName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const urlPath = prompt('URL path for hosting (e.g. john_doe):', suggestedPath);
  if (!urlPath || !/^[a-zA-Z0-9_-]+$/.test(urlPath)) {
    if (urlPath) alert('Invalid URL path.');
    return;
  }
  try {
    const hostUrl = isLegacyVersion(versionId)
      ? `/admin/host/${encodeURIComponent(legacyFileName(versionId))}`
      : `/admin/host-version/${versionId}`;
    const response = await adminFetch(hostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlPath }),
    });
    const result = await response.json();
    if (result.success) {
      showHostSuccess(result);
      loadInbox();
    } else {
      alert(result.message || 'Hosting failed');
    }
  } catch (err) {
    alert('Hosting failed: ' + err.message);
  }
}

async function deleteVersion(versionId) {
  if (!confirm('Delete this project and all its versions (including teacher feedback) from cloud storage?')) return;
  try {
    const deleteUrl = isLegacyVersion(versionId)
      ? `/admin/delete/${encodeURIComponent(legacyFileName(versionId))}`
      : `/admin/delete-version/${versionId}`;
    const response = await adminFetch(deleteUrl, { method: 'DELETE' });
    const result = await response.json();
    if (result.success) loadInbox();
    else alert(result.message || 'Delete failed');
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

async function toggleHistory(threadId, btn) {
  const panel = document.getElementById('history-' + threadId);
  if (!panel) return;
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    return;
  }
  panel.innerHTML = 'Loading...';
  panel.classList.add('open');
  try {
    const res = await adminFetch(`/admin/projects/${threadId}/versions`);
    const data = await res.json();
    const versions = data.versions || [];
    panel.innerHTML = versions
      .map((v) => {
        const note =
          v.studentNote || v.adminNote
            ? `<br><em>${escapeHtml(v.studentNote || v.adminNote)}</em>`
            : '';
        return `<div class="version-row">
          ${kindBadge(v.kind)} v${v.versionNumber} — ${v.submittedAt || v.createdAt ? new Date(v.submittedAt || v.createdAt).toLocaleString() : ''}
          ${note}
          <button onclick="downloadVersion('${v.id}', '${escapeHtml(v.fileName)}')" style="margin-left:8px;font-size:11px;">Download</button>
        </div>`;
      })
      .join('');
  } catch (err) {
    panel.innerHTML = 'Could not load history.';
  }
}

document.getElementById('apply-filters')?.addEventListener('click', loadInbox);

function initInbox() {
  const loginRoot = document.getElementById('login-root');
  const main = document.getElementById('main-content');
  if (loginRoot) loginRoot.innerHTML = '';
  if (main) main.style.display = 'block';

  renderAdminNav('submissions');

  const importInput = document.getElementById('import-project-zip-input');
  if (importInput && importInput.dataset.bound !== '1') {
    importInput.dataset.bound = '1';
    importInput.addEventListener('change', (e) => {
      importProjectZip(e.target.files[0]);
    });
  }

  loadClassesAndStudents();
  loadInbox();
}

async function importProjectZip(file) {
  if (!file) return;
  const statusDiv = document.getElementById('import-status');
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.style.background = '#d1ecf1';
  statusDiv.style.color = '#0c5460';
  statusDiv.style.border = '1px solid #bee5eb';
  statusDiv.innerHTML = 'Importing project ZIP...';
  try {
    const fd = new FormData();
    fd.append('project', file);
    const res = await fetch('/submit-project', { method: 'POST', body: fd });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const data = ct.includes('application/json')
      ? await res.json()
      : { success: false, message: await res.text() };
    if (!data.success) throw new Error(data.message || 'Import failed');
    statusDiv.style.background = '#d4edda';
    statusDiv.style.color = '#155724';
    statusDiv.style.border = '1px solid #c3e6cb';
    statusDiv.innerHTML =
      'Imported: ' +
      (data.projectName || 'Project') +
      ' (File: ' +
      data.fileName +
      '). Refreshing list...';
    setTimeout(() => {
      loadInbox();
      statusDiv.style.display = 'none';
    }, 1500);
  } catch (e) {
    statusDiv.style.background = '#f8d7da';
    statusDiv.style.color = '#721c24';
    statusDiv.style.border = '1px solid #f5c6cb';
    statusDiv.textContent = 'Import failed: ' + (e.message || 'Unknown error');
  }
  const input = document.getElementById('import-project-zip-input');
  if (input) input.value = '';
}

requireAdminSession('login-root', initInbox);
