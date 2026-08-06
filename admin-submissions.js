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
  if (!sub || (!sub.isHosted && !sub.hostedUrl && !sub.tourUrl && !sub.hostedPath)) return '';
  const path =
    sub.hostedPath ||
    (typeof sub.hostedUrl === 'string' && sub.hostedUrl.match(/^\/hosted\/([^/]+)/)?.[1]) ||
    (typeof sub.tourUrl === 'string' && sub.tourUrl.match(/^\/hosted\/([^/]+)/)?.[1]) ||
    '';
  const tourUrl = sub.tourUrl || sub.hostedUrl || (path ? `/hosted/${path}/index.html` : '');
  const flatUrl =
    sub.flatPageUrl || (path ? `/hosted/${path}/flat-pages/main/index.html` : '');
  let html = '';
  if (path) {
    html += `<br><strong>Hosted name:</strong> <code>${escapeHtml(path)}</code>`;
  }
  if (tourUrl) {
    html += `<br><strong>360° tour:</strong> <a href="${escapeHtml(tourUrl)}" target="_blank" rel="noopener">${escapeHtml(tourUrl)}</a>`;
  }
  if (flatUrl) {
    html += `<br><strong>Flat page:</strong> <a href="${escapeHtml(flatUrl)}" target="_blank" rel="noopener">${escapeHtml(flatUrl)}</a>`;
  }
  return html;
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
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
        const studentLabel = formatSubmittedBy(sub);
        const historyBtn = legacy
          ? ''
          : `<button class="btn-history" onclick="toggleHistory('${threadId}', this)">📜 Version history</button>`;
        const repairsBtn = legacy
          ? ''
          : `<button class="btn-repairs" type="button" onclick="toggleRepairs(${jsString(threadId)}, this, ${jsString(
              sub.projectName || 'project'
            )}, ${jsString(studentLabel)}, ${jsString(sub.studentId || '')}, ${jsString(
              sub.classId || ''
            )}, ${jsString(versionId)})">🧩 Repaired versions</button>`;
        const reviewLink = legacy
          ? ''
          : `<a class="btn btn-review" href="/index.html?adminReview=1&versionId=${versionId}">✏️ Review in Editor</a>`;

        return `
          <div class="submission-card" data-version-id="${versionId}" data-thread-id="${threadId}" data-project-name="${escapeHtml(sub.projectName || '')}" data-student-name="${escapeHtml(studentLabel)}" data-student-id="${escapeHtml(sub.studentId || '')}" data-class-id="${escapeHtml(sub.classId || '')}">
            <h3>${escapeHtml(sub.projectName)} ${kindBadge('submitted')}${featured ? ' <span class="badge badge-featured">Featured</span>' : ''}${legacy ? ' <span class="badge badge-draft">B2 only</span>' : ''}</h3>
            <p class="submitted-by">Submitted by: <strong>${escapeHtml(studentLabel)}</strong>${sub.className ? ` <span class="submitted-by-class">(${escapeHtml(sub.className)})</span>` : ''}</p>
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
                  : `<button class="btn-repair" onclick="repairMediaVersion('${versionId}', '${escapeHtml(sub.projectName || 'project')}', '${escapeHtml(studentLabel)}', '${escapeHtml(threadId)}', '${escapeHtml(sub.studentId || '')}', '${escapeHtml(sub.classId || '')}')">🔧 Repair media</button>`
              }
              ${repairsBtn}
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
            <div class="version-history repairs-panel" id="repairs-${threadId}"></div>
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

function renderRepairRows(repairs, ctx) {
  if (!repairs.length) {
    return '<p class="repairs-empty">No repaired copies yet. Use <strong>Repair media</strong> on this submission first.</p>';
  }
  return repairs
    .map((v) => {
      const hostHint = suggestHostPath(ctx.projectName, ctx.studentName, { repaired: true });
      const hostedName = v.hostedPath || '';
      const note = v.adminNote ? `<div class="repair-note"><em>${escapeHtml(v.adminNote)}</em></div>` : '';
      const links = formatHostedLinks(v);
      return `<div class="repair-card" data-repair-id="${escapeHtml(v.id)}">
        <div class="repair-card-head">
          ${kindBadge('admin_repair')} <strong>v${v.versionNumber}</strong>
          <span class="repair-parent">from submitted v${escapeHtml(String(ctx.parentVersionNumber || ''))} · ${escapeHtml(ctx.projectName || '')}</span>
        </div>
        <div class="meta">
          <strong>File:</strong> ${escapeHtml(v.fileName || '—')}<br>
          <strong>Created:</strong> ${v.createdAt ? new Date(v.createdAt).toLocaleString() : '—'}
          ${
            hostedName
              ? `<br><strong>Hosted as:</strong> <code>${escapeHtml(hostedName)}</code>`
              : '<br><em>Not hosted yet — host to preview the fix</em>'
          }
          ${links}
        </div>
        ${note}
        <div class="actions repair-actions">
          <button class="btn-download" type="button" onclick="downloadVersion(${jsString(v.id)}, ${jsString(v.fileName || 'repaired.zip')})">Download</button>
          <button class="btn-host" type="button" onclick="hostVersion(${jsString(v.id)}, ${jsString(hostHint)}, { suggestedPath: ${jsString(
            hostedName || hostHint
          )}, repaired: true, threadId: ${jsString(ctx.threadId)}, projectName: ${jsString(
            ctx.projectName
          )}, studentName: ${jsString(ctx.studentName)}, studentId: ${jsString(
            ctx.studentId
          )}, classId: ${jsString(ctx.classId)}, parentVersionId: ${jsString(ctx.parentVersionId)} })">Host</button>
          <a class="btn btn-review" href="/index.html?adminReview=1&versionId=${encodeURIComponent(v.id)}">Review</a>
          <button class="btn-assign-repair" type="button" onclick="openAssignFromRepair(${jsString(
            v.hostedPath || ''
          )}, ${jsString(ctx.studentId)}, ${jsString(ctx.classId)}, ${jsString(
            ctx.projectName
          )}, ${jsString(ctx.studentName)}, ${jsString(v.id)})">Assign / send to student</button>
        </div>
      </div>`;
    })
    .join('');
}

async function fetchThreadRepairs(threadId) {
  const res = await adminFetch(`/admin/projects/${encodeURIComponent(threadId)}/versions`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Could not load versions');
  return (data.versions || []).filter((v) => v.kind === 'admin_repair');
}

async function toggleRepairs(
  threadId,
  btn,
  projectName,
  studentName,
  studentId,
  classId,
  parentVersionId,
  options = {}
) {
  const panel = document.getElementById('repairs-' + threadId);
  if (!panel) return;
  const forceOpen = !!options.forceOpen;
  if (panel.classList.contains('open') && !forceOpen) {
    panel.classList.remove('open');
    if (btn) btn.classList.remove('active');
    return;
  }
  panel.innerHTML = 'Loading repaired versions…';
  panel.classList.add('open');
  if (btn) btn.classList.add('active');
  try {
    const repairs = await fetchThreadRepairs(threadId);
    const card = document.querySelector(`.submission-card[data-thread-id="${threadId}"]`);
    const parentVersionNumber =
      card?.querySelector('.meta')?.textContent?.match(/Version:\s*#?(\d+)/)?.[1] || '';
    panel.innerHTML =
      `<div class="repairs-heading">Repaired copies of this submission</div>` +
      renderRepairRows(repairs, {
        threadId,
        projectName:
          projectName || card?.getAttribute('data-project-name') || 'project',
        studentName: studentName || card?.getAttribute('data-student-name') || '',
        studentId: studentId || card?.getAttribute('data-student-id') || '',
        classId: classId || card?.getAttribute('data-class-id') || '',
        parentVersionId:
          parentVersionId || card?.getAttribute('data-version-id') || '',
        parentVersionNumber,
      });
    if (btn) {
      btn.textContent = repairs.length
        ? `🧩 Repaired versions (${repairs.length})`
        : '🧩 Repaired versions';
    }
  } catch (err) {
    panel.innerHTML = `<p style="color:#dc3545;">Could not load repairs: ${escapeHtml(err.message)}</p>`;
  }
}

function openAssignFromRepair(
  hostedPath,
  studentId,
  classId,
  projectName,
  studentName,
  repairVersionId
) {
  if (!hostedPath) {
    alert(
      'Host the repaired copy first, then use Assign / send to student. That opens Assign Project with the hosted repair preselected.'
    );
    return;
  }
  const qs = new URLSearchParams({
    source: 'hosted',
    hostedPath,
    projectName: projectName || 'project',
  });
  if (studentId) qs.set('studentId', studentId);
  if (classId) qs.set('classId', classId);
  if (studentName) qs.set('studentName', studentName);
  if (repairVersionId) qs.set('repairVersionId', repairVersionId);
  qs.set(
    'adminNote',
    'Media filenames repaired so pictures display correctly. Please open this version and confirm your image hotspots look right.'
  );
  window.location.href = `/admin-assign-project.html?${qs.toString()}`;
}

async function repairMediaVersion(
  versionId,
  projectName,
  studentName,
  threadId,
  studentId,
  classId
) {
  if (isLegacyVersion(versionId)) {
    alert('Media repair is not available for legacy B2-only submissions.');
    return;
  }
  const confirmed = confirm(
    `Scan "${projectName || 'this project'}" for image/video files missing extensions and save a repaired copy?\n\nThe original submission is not changed. The copy stays hidden from the student until you assign/send it.`
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
      `${result.message || 'Repaired copy saved.'}\n\nRenamed:\n${renameBlock}\n\nNext step — type one of:\n  host   = host the repaired copy for testing\n  open   = show repaired versions under this submission\n  download = download the repaired ZIP\n  (leave blank to open repaired versions)`,
      'host'
    );
    const action = String(choice || 'open')
      .trim()
      .toLowerCase();
    const repairedId = result.versionId;
    const repairedName = result.fileName || 'repaired.zip';
    const hostHint = suggestHostPath(projectName, studentName, { repaired: true });
    const tid =
      threadId ||
      document.querySelector(`.submission-card[data-version-id="${versionId}"]`)?.getAttribute(
        'data-thread-id'
      ) ||
      '';

    if (action === 'host') {
      await hostVersion(repairedId, hostHint, {
        suggestedPath: hostHint,
        repaired: true,
        threadId: tid,
        projectName,
        studentName,
        studentId,
        classId,
        parentVersionId: versionId,
      });
    } else if (action === 'download') {
      await downloadVersion(repairedId, repairedName);
      await loadInbox();
      if (tid) {
        const btn = document.querySelector(
          `.submission-card[data-thread-id="${tid}"] .btn-repairs`
        );
        await toggleRepairs(tid, btn, projectName, studentName, studentId, classId, versionId, {
          forceOpen: true,
        });
      }
    } else {
      await loadInbox();
      if (tid) {
        const btn = document.querySelector(
          `.submission-card[data-thread-id="${tid}"] .btn-repairs`
        );
        await toggleRepairs(tid, btn, projectName, studentName, studentId, classId, versionId, {
          forceOpen: true,
        });
      }
    }
  } catch (err) {
    alert('Repair failed: ' + err.message);
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
      const tid = options.threadId;
      await loadInbox();
      if (tid) {
        const btn = document.querySelector(
          `.submission-card[data-thread-id="${tid}"] .btn-repairs`
        );
        await toggleRepairs(
          tid,
          btn,
          options.projectName || projectName,
          options.studentName || '',
          options.studentId || '',
          options.classId || '',
          options.parentVersionId || '',
          { forceOpen: true }
        );
      }
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
        const projectLabel = v.projectName || 'project';
        const studentLabel =
          v.studentUsername || v.studentName || v.studentDisplayName || '';
        const repairHostHint = suggestHostPath(projectLabel, studentLabel, { repaired: true });
        const card = document.querySelector(`.submission-card[data-thread-id="${threadId}"]`);
        const parentId = card?.getAttribute('data-version-id') || '';
        const classId = card?.getAttribute('data-class-id') || v.classId || '';
        const studentId = card?.getAttribute('data-student-id') || v.studentId || '';
        const links = v.kind === 'admin_repair' ? formatHostedLinks(v) : '';
        const repairActions =
          v.kind === 'admin_repair'
            ? `<button type="button" onclick="hostVersion(${jsString(v.id)}, ${jsString(
                repairHostHint
              )}, { suggestedPath: ${jsString(v.hostedPath || repairHostHint)}, repaired: true, threadId: ${jsString(
                threadId
              )}, projectName: ${jsString(projectLabel)}, studentName: ${jsString(
                studentLabel
              )}, studentId: ${jsString(studentId)}, classId: ${jsString(
                classId
              )}, parentVersionId: ${jsString(parentId)} })" style="margin-left:6px;font-size:11px;">Host</button>` +
              `<button type="button" onclick="openAssignFromRepair(${jsString(
                v.hostedPath || ''
              )}, ${jsString(studentId)}, ${jsString(classId)}, ${jsString(
                projectLabel
              )}, ${jsString(studentLabel)}, ${jsString(
                v.id
              )})" style="margin-left:6px;font-size:11px;">Assign / send</button>`
            : v.kind === 'submitted' || v.kind === 'admin_return' || v.kind === 'admin_assigned'
            ? `<button type="button" onclick="repairMediaVersion(${jsString(v.id)}, ${jsString(
                projectLabel
              )}, ${jsString(studentLabel)}, ${jsString(threadId)}, ${jsString(
                studentId
              )}, ${jsString(classId)})" style="margin-left:6px;font-size:11px;">Repair media</button>`
            : '';
        return `<div class="version-row">
          ${kindBadge(v.kind)} v${v.versionNumber} — ${v.submittedAt || v.createdAt ? new Date(v.submittedAt || v.createdAt).toLocaleString() : ''}
          ${v.kind === 'admin_repair' && v.hostedPath ? `<br><strong>Hosted as:</strong> <code>${escapeHtml(v.hostedPath)}</code>` : ''}
          ${links}
          ${note}
          <button type="button" onclick="downloadVersion(${jsString(v.id)}, ${jsString(
            v.fileName || ''
          )})" style="margin-left:8px;font-size:11px;">Download</button>
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
