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

function formatSubmittedBy(sub) {
  return sub.studentUsername || sub.studentName || sub.studentDisplayName || 'Unknown';
}

/** Host URL slug: keep date slashes as dashes (8/6 → 8-6), not stripped to 86. */
function suggestHostPath(projectName, studentName, { repaired = false } = {}) {
  const slugPart = (value, { keepEmpty = false } = {}) => {
    const s = String(value || '')
      .trim()
      .replace(/\//g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return s || (keepEmpty ? '' : '');
  };
  const projectPart = slugPart(projectName) || 'project';
  const studentPart = slugPart(studentName, { keepEmpty: true });
  let path = studentPart ? `${projectPart}_${studentPart}` : projectPart;
  if (repaired) path += '_repaired';
  return path.replace(/_+/g, '_');
}

function isSubmissionHosted(sub) {
  return !!(sub.isHosted || sub.hostedUrl || sub.tourUrl || sub.hostedPath);
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

const HOST_PROGRESS_STAGES = [
  { percent: 8, label: 'Downloading project from storage…' },
  { percent: 22, label: 'Extracting project files…' },
  { percent: 45, label: 'Uploading files to cloud storage…' },
  { percent: 68, label: 'Uploading media and assets…' },
  { percent: 82, label: 'Almost done — finishing upload…' },
];

let hostProgressTimer = null;
let hostProgressStageIndex = 0;
let hostProgressValue = 0;

function setHostProgressUi(percent, statusText) {
  const bar = document.getElementById('host-progress-bar');
  const status = document.getElementById('host-progress-status');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (status && statusText) status.textContent = statusText;
}

function setSubmissionActionsDisabled(disabled) {
  document.querySelectorAll('.submission-card .actions button').forEach((el) => {
    el.disabled = disabled;
  });
}

function startHostProgress(projectName, urlPath) {
  const overlay = document.getElementById('host-progress-overlay');
  const title = document.getElementById('host-progress-title');
  if (title) {
    const name = String(projectName || 'Project').trim();
    const path = String(urlPath || '').trim();
    title.textContent = path ? `Hosting ${name} at /${path}` : `Hosting ${name}`;
  }
  hostProgressStageIndex = 0;
  hostProgressValue = 0;
  setHostProgressUi(0, HOST_PROGRESS_STAGES[0].label);
  if (overlay) {
    overlay.hidden = false;
    overlay.setAttribute('aria-busy', 'true');
  }
  setSubmissionActionsDisabled(true);

  if (hostProgressTimer) clearInterval(hostProgressTimer);
  hostProgressTimer = setInterval(() => {
    const stage = HOST_PROGRESS_STAGES[hostProgressStageIndex];
    const nextStage = HOST_PROGRESS_STAGES[hostProgressStageIndex + 1];
    const target = nextStage ? nextStage.percent : 88;
    if (hostProgressValue < target) {
      hostProgressValue = Math.min(target, hostProgressValue + 1.5);
      setHostProgressUi(hostProgressValue, stage.label);
      return;
    }
    if (nextStage) {
      hostProgressStageIndex += 1;
      setHostProgressUi(hostProgressValue, nextStage.label);
    }
  }, 700);
}

async function finishHostProgress(success) {
  if (hostProgressTimer) {
    clearInterval(hostProgressTimer);
    hostProgressTimer = null;
  }
  if (success) {
    setHostProgressUi(100, 'Hosting complete.');
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  stopHostProgress();
}

function stopHostProgress() {
  if (hostProgressTimer) {
    clearInterval(hostProgressTimer);
    hostProgressTimer = null;
  }
  const overlay = document.getElementById('host-progress-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-busy', 'false');
  }
  setHostProgressUi(0, 'Starting…');
  setSubmissionActionsDisabled(false);
}

function kindBadge(kind) {
  const labels = {
    submitted: 'Submitted',
    admin_return: 'Teacher feedback',
    admin_assigned: 'Assigned project',
    admin_repair: 'Repaired copy',
    draft: 'Draft',
  };
  const cls =
    kind === 'admin_return' || kind === 'admin_assigned' || kind === 'admin_repair'
      ? 'badge-return'
      : kind === 'draft'
      ? 'badge-draft'
      : 'badge-submitted';
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
      studentSel.innerHTML = '<option value="">All team members or students</option>';
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
    const hostedFilter = document.getElementById('filter-hosted')?.value || 'all';
    const featuredFilter = document.getElementById('filter-featured')?.value || 'all';
    const params = new URLSearchParams();
    if (classId) params.set('classId', classId);
    if (studentId) params.set('studentId', studentId);
    if (filter && filter !== 'all') params.set('filter', filter);
    if (hostedFilter && hostedFilter !== 'all') params.set('hostedFilter', hostedFilter);
    if (featuredFilter && featuredFilter !== 'all') params.set('featuredFilter', featuredFilter);
    params.set('_', String(Date.now()));
    const url = '/admin/submissions-inbox' + (params.toString() ? '?' + params.toString() : '');
    const response = await adminFetch(url, { cache: 'no-store' });
    const submissions = await response.json();

    if (!submissions.length) {
      const hasFilters =
        document.getElementById('filter-class')?.value ||
        document.getElementById('filter-student')?.value ||
        (document.getElementById('filter-notes')?.value || 'all') !== 'all' ||
        (document.getElementById('filter-hosted')?.value || 'all') !== 'all' ||
        (document.getElementById('filter-featured')?.value || 'all') !== 'all';
      container.innerHTML = hasFilters
        ? '<p>No submissions match the current filters.</p>'
        : '<p>No submissions yet.</p>';
      return;
    }

    container.innerHTML = submissions
      .map((sub) => {
        const versionId = sub.id;
        const threadId = sub.threadId;
        const noteBlock = sub.studentNote
          ? `<div class="note-block"><strong>Team member or student note:</strong>${escapeHtml(sub.studentNote)}</div>`
          : '';
        const hostedLink = formatHostedLinks(sub);
        const hosted = isSubmissionHosted(sub);
        const featured = !!sub.featuredOnHostedGallery;

        const legacy = isLegacyVersion(versionId);
        const historyBtn = legacy
          ? ''
          : `<button class="btn-history" onclick="toggleHistory('${threadId}', this)">📜 Version history</button>`;
        const reviewLink = legacy
          ? ''
          : `<a class="btn btn-review" href="/index.html?adminReview=1&versionId=${versionId}">✏️ Review in Editor</a>`;

        return `
          <div class="submission-card" data-version-id="${versionId}" data-thread-id="${threadId}">
            <h3>${escapeHtml(sub.projectName)} ${kindBadge('submitted')}${featured ? ' <span class="badge badge-featured">Featured</span>' : ''}${legacy ? ' <span class="badge badge-draft">B2 only</span>' : ''}</h3>
            <p class="submitted-by">Submitted by: <strong>${escapeHtml(formatSubmittedBy(sub))}</strong>${sub.className ? ` <span class="submitted-by-class">(${escapeHtml(sub.className)})</span>` : ''}</p>
            <div class="meta">
              <strong>Version:</strong> #${sub.versionNumber || 1}<br>
              <strong>Submitted:</strong> ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}<br>
              <strong>File:</strong> ${escapeHtml(sub.fileName)}${hostedLink}
              ${sub.studentId ? `<br><a href="admin-common-assets.html?view=content&studentId=${encodeURIComponent(sub.studentId)}">View in Content Hub</a>` : ''}
            </div>
            ${noteBlock}
            <div class="actions">
              <button class="btn-download" onclick="downloadVersion('${versionId}', '${escapeHtml(sub.fileName)}')">📥 Download</button>
              ${
                legacy
                  ? ''
                  : `<button class="btn-repair" onclick="repairMediaVersion('${versionId}', '${escapeHtml(sub.projectName || 'project')}', '${escapeHtml(formatSubmittedBy(sub))}')">🔧 Repair media</button>`
              }
              ${
                hosted
                  ? `<button class="btn-unhost" onclick="unhostVersion('${versionId}', '${escapeHtml(sub.fileName)}', '${escapeHtml(sub.projectName || 'project')}')">🚫 Unhost</button>`
                  : `<button class="btn-host" onclick="hostVersion('${versionId}', '${escapeHtml(sub.projectName || 'project')}')">🌐 Host</button>`
              }
              ${
                hosted
                  ? featured
                    ? `<button class="btn-unfeature" onclick="setHostedGalleryFeature('${versionId}', '${escapeHtml(sub.fileName)}', false)">Remove from Hosted List</button>`
                    : `<button class="btn-feature" onclick="setHostedGalleryFeature('${versionId}', '${escapeHtml(sub.fileName)}', true)">Feature on Hosted List</button>`
                  : ''
              }
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

function formatRenameList(renames) {
  if (!Array.isArray(renames) || !renames.length) return '';
  return renames
    .map((r) => {
      const from = String(r.from || '').split('/').pop();
      const to = String(r.to || '').split('/').pop();
      return `• ${from} → ${to}`;
    })
    .join('\n');
}

async function repairMediaVersion(versionId, projectName, studentName) {
  if (isLegacyVersion(versionId)) {
    alert('Media repair is not available for legacy B2-only submissions.');
    return;
  }
  const confirmed = confirm(
    `Scan "${projectName || 'this project'}" for image/video files missing extensions and save a repaired copy?\n\nThe original submission is not changed. The copy stays hidden from the student until you send it.`
  );
  if (!confirmed) return;

  try {
    const response = await adminFetch(`/admin/versions/${versionId}/repair-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.message || 'Repair failed');
    }

    if (!result.repaired) {
      alert(result.message || 'No extensionless media found to rename.');
      return;
    }

    const renameBlock = formatRenameList(result.renames);
    const choice = prompt(
      `${result.message || 'Repaired copy saved.'}\n\nRenamed:\n${renameBlock}\n\nNext step — type one of:\n  host   = host the repaired copy for testing\n  send   = send repaired copy to the student\n  download = download the repaired ZIP\n  (leave blank to do nothing)`,
      'host'
    );
    const action = String(choice || '')
      .trim()
      .toLowerCase();
    const repairedId = result.versionId;
    const repairedName = result.fileName || 'repaired.zip';
    const hostHint = suggestHostPath(projectName, studentName, { repaired: true });

    if (action === 'host') {
      await hostVersion(repairedId, hostHint, { suggestedPath: hostHint });
    } else if (action === 'send') {
      await sendRepairedVersion(repairedId);
    } else if (action === 'download') {
      await downloadVersion(repairedId, repairedName);
    }

    // Refresh history panel if open for this card's thread
    await loadInbox();
  } catch (err) {
    alert('Repair failed: ' + err.message);
  }
}

async function sendRepairedVersion(versionId) {
  if (!versionId) return;
  const note = prompt(
    'Note for the student (optional):',
    'Media filenames repaired so pictures display correctly. Please open this version and confirm your image hotspots look right.'
  );
  if (note === null) return; // cancelled
  try {
    const response = await adminFetch(`/admin/versions/${versionId}/send-repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNote: note }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Send failed');
    }
    alert(result.message || `Sent as v${result.versionNumber}. Student will see new feedback.`);
    await loadInbox();
  } catch (err) {
    alert('Send failed: ' + err.message);
  }
}

async function hostVersion(versionId, projectName, options = {}) {
  const suggestedPath =
    options.suggestedPath ||
    suggestHostPath(projectName, options.studentName || '', {
      repaired: !!options.repaired,
    });
  const urlPath = prompt('URL path for hosting (e.g. 8-6_student10_repaired):', suggestedPath);
  if (!urlPath || !/^[a-zA-Z0-9_-]+$/.test(urlPath)) {
    if (urlPath) alert('Invalid URL path.');
    return;
  }
  startHostProgress(projectName, urlPath);
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
      await finishHostProgress(true);
      showHostSuccess(result);
      await loadInbox();
    } else {
      stopHostProgress();
      alert(result.message || result.error || 'Hosting failed');
    }
  } catch (err) {
    stopHostProgress();
    alert('Hosting failed: ' + err.message);
  }
}

async function setHostedGalleryFeature(versionId, fileName, featured) {
  if (featured) {
    const confirmed = confirm(
      'Feature this project on the class Hosted List?\n\nAnyone who can open that class gallery page with the classroom password will be able to see it.'
    );
    if (!confirmed) return;
  } else {
    const confirmed = confirm('Remove this project from the class Featured Hosted List?');
    if (!confirmed) return;
  }

  try {
    const response = await adminFetch(`/admin/hosted-gallery-feature/${encodeURIComponent(versionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured, fileName }),
    });
    const result = await response.json();
    if (result.success) {
      await loadInbox();
      alert(result.message || (featured ? 'Project featured.' : 'Project unfeatured.'));
    } else {
      alert(result.message || 'Could not update featured status');
    }
  } catch (err) {
    alert('Could not update featured status: ' + err.message);
  }
}

async function unhostVersion(versionId, fileName, projectName) {
  const label = String(projectName || fileName || 'this project').trim();
  const confirmed = confirm(
    `Remove public hosting for "${label}"?\n\nThe submission will stay in the queue. You can host it again later.`
  );
  if (!confirmed) return;

  try {
    const unhostUrl = isLegacyVersion(versionId)
      ? `/admin/unhost/${encodeURIComponent(legacyFileName(versionId, fileName))}`
      : `/admin/unhost-version/${versionId}`;
    const response = await adminFetch(unhostUrl, { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      const banner = document.getElementById('host-result');
      if (banner) banner.style.display = 'none';
      await loadInbox();
      alert(result.message || 'Project unhosted successfully.');
    } else {
      alert(result.message || 'Unhost failed');
    }
  } catch (err) {
    alert('Unhost failed: ' + err.message);
  }
}

async function unhostEverything() {
  const confirmed = confirm(
    'This will make all public links to hosted projects inaccessible, but they will still appear in the submission queue.\n\nAre you sure?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('unhost-all-btn');
  if (btn) btn.disabled = true;
  try {
    const response = await adminFetch('/admin/unhost-all', { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      const banner = document.getElementById('host-result');
      if (banner) banner.style.display = 'none';
      await loadInbox();
      alert(result.message || 'All hosted projects were unhosted.');
    } else {
      alert(result.message || 'Unhost failed');
    }
  } catch (err) {
    alert('Unhost failed: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
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
        const projectLabel = escapeHtml(v.projectName || 'project');
        const studentLabel = escapeHtml(
          v.studentUsername || v.studentName || v.studentDisplayName || ''
        );
        const repairHostHint = suggestHostPath(v.projectName, studentLabel, { repaired: true });
        const repairActions =
          v.kind === 'admin_repair'
            ? `<button onclick="hostVersion('${v.id}', '${escapeHtml(repairHostHint)}', { suggestedPath: '${escapeHtml(repairHostHint)}' })" style="margin-left:6px;font-size:11px;">Host</button>` +
              `<button onclick="sendRepairedVersion('${v.id}')" style="margin-left:6px;font-size:11px;">Send to student</button>`
            : v.kind === 'submitted' || v.kind === 'admin_return' || v.kind === 'admin_assigned'
            ? `<button onclick="repairMediaVersion('${v.id}', '${projectLabel}', '${studentLabel}')" style="margin-left:6px;font-size:11px;">Repair media</button>`
            : '';
        return `<div class="version-row">
          ${kindBadge(v.kind)} v${v.versionNumber} — ${v.submittedAt || v.createdAt ? new Date(v.submittedAt || v.createdAt).toLocaleString() : ''}
          ${note}
          <button onclick="downloadVersion('${v.id}', '${escapeHtml(v.fileName)}')" style="margin-left:8px;font-size:11px;">Download</button>
          ${repairActions}
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

  loadClassesAndStudents();
  loadInbox();
}

requireAdminSession('login-root', initInbox);
