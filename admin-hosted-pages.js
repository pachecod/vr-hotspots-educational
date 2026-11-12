var escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
  ? window.escapeHtml
  : function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

function galleryPath(slug) {
  return `/${encodeURIComponent(slug || '')}/hosted-projects.html`;
}

/** Number of featured pages in a class gallery, or null if it can't be read. */
async function featuredCount(slug) {
  try {
    const res = await fetch(`/api/classes/${encodeURIComponent(slug)}/hosted-projects/list`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.projects) ? data.projects.length : null;
  } catch (_) {
    return null;
  }
}

async function loadHostedClasses() {
  const container = document.getElementById('hosted-classes');
  let classes;
  try {
    const res = await adminFetch('/admin/classes');
    const data = await res.json();
    classes = Array.isArray(data) ? data : data.classes || [];
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') throw err;
    container.innerHTML = `<p class="error">Could not load teams or classes: ${escapeHtml(err.message)}</p>`;
    return;
  }
  classes = classes.filter((c) => c.slug);
  if (!classes.length) {
    container.innerHTML =
      '<p class="empty">No teams or classes yet. Create one in <a href="admin-users.html">Users and Classes</a>.</p>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>Team or class</th><th>Featured pages</th><th>Visitor password</th><th>Hosted pages list</th></tr>
      </thead>
      <tbody>
        ${classes
          .map((c) => {
            const href = galleryPath(c.slug);
            return `
          <tr data-slug="${escapeHtml(c.slug)}">
            <td>
              <span class="class-name">${escapeHtml(c.name)}</span>
              <span class="class-link">${escapeHtml(window.location.origin + href)}</span>
            </td>
            <td><span class="badge" data-featured-count>…</span></td>
            <td>${
              c.has_sign_in_password
                ? '<span class="badge badge-ok">Set</span>'
                : '<span class="badge badge-warn" title="Set one in Users and Classes so visitors can open this gallery">Not set</span>'
            }</td>
            <td class="actions">
              <a class="btn btn-primary" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open hosted pages ↗</a>
              <button type="button" class="btn btn-secondary" data-copy="${escapeHtml(window.location.origin + href)}">Copy link</button>
            </td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied!';
      } catch (_) {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => {
        btn.textContent = 'Copy link';
      }, 1500);
    });
  });

  await Promise.all(
    classes.map(async (c) => {
      const count = await featuredCount(c.slug);
      const cell = container.querySelector(`tr[data-slug="${CSS.escape(c.slug)}"] [data-featured-count]`);
      if (cell) cell.textContent = count == null ? '—' : String(count);
    })
  );
}

// ---- Everything hosted: one list of hosted versions with Hosted List controls ----

let hostedVersions = [];

function versionDate(v) {
  const when = v.submittedAt || v.createdAt;
  return when ? new Date(when).toLocaleDateString() : '';
}

/** Versions where a newer version of the same project is also hosted. */
function olderVersionIds(versions) {
  const newestByThread = {};
  versions.forEach((v) => {
    const n = v.versionNumber || 0;
    if (!(v.threadId in newestByThread) || n > newestByThread[v.threadId]) newestByThread[v.threadId] = n;
  });
  return new Set(versions.filter((v) => (v.versionNumber || 0) < newestByThread[v.threadId]).map((v) => v.id));
}

function renderHostedVersions() {
  const container = document.getElementById('hosted-versions');
  const older = olderVersionIds(hostedVersions);
  const featuredOnly = document.getElementById('hv-featured-only')?.checked;
  const olderOnly = document.getElementById('hv-older-only')?.checked;
  const rows = hostedVersions.filter(
    (v) => (!featuredOnly || v.featuredOnHostedGallery) && (!olderOnly || older.has(v.id))
  );
  const olderFeatured = hostedVersions.filter((v) => older.has(v.id) && v.featuredOnHostedGallery);
  const bulkBtn = document.getElementById('hv-remove-older');
  if (bulkBtn) {
    bulkBtn.disabled = !olderFeatured.length;
    bulkBtn.textContent =
      olderFeatured.length === 1
        ? 'Remove 1 older version from the Hosted List'
        : olderFeatured.length
        ? `Remove all ${olderFeatured.length} older versions from the Hosted List`
        : 'No older versions on the Hosted List';
  }
  if (!hostedVersions.length) {
    container.innerHTML = '<p class="empty">Nothing is hosted yet.</p>';
    return;
  }
  if (!rows.length) {
    container.innerHTML = '<p class="empty">No hosted versions match these filters.</p>';
    return;
  }
  // Group by student; within a student, the most recently updated project first. Each project's
  // newest hosted version sits at the normal indent, its older hosted versions indented below it.
  const students = new Map();
  rows.forEach((v) => {
    const key = v.studentId || v.studentUsername || 'unknown';
    if (!students.has(key)) {
      students.set(key, {
        name: v.studentUsername || v.studentDisplayName || '—',
        className: v.className || '',
        projects: new Map(),
      });
    }
    const projects = students.get(key).projects;
    if (!projects.has(v.threadId)) projects.set(v.threadId, []);
    projects.get(v.threadId).push(v);
  });
  const newestTime = (list) =>
    Math.max(...list.map((v) => new Date(v.submittedAt || v.createdAt || 0).getTime() || 0));

  const versionRow = (v, isOlder) => {
    const url = v.hostedUrl || (v.hostedPath ? `/hosted/${v.hostedPath}/index.html` : '');
    return `
          <tr class="${isOlder ? 'hv-older' : 'hv-latest'}" data-version-id="${escapeHtml(v.id)}">
            <td class="hv-version">${
              isOlder
                ? `<span class="hv-indent">↳ v${escapeHtml(v.versionNumber)} · ${escapeHtml(versionDate(v))}</span>`
                : `<span class="hv-project">${escapeHtml(v.projectName || '')}</span> v${escapeHtml(
                    v.versionNumber
                  )} · ${escapeHtml(versionDate(v))}`
            }<span class="hv-sub${isOlder ? ' hv-indent' : ''}">hosted ${escapeHtml(
      v.hostedAt ? new Date(v.hostedAt).toLocaleDateString() : ''
    )}</span></td>
            <td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.hostedPath || url)}</a>` : '—'}</td>
            <td>${v.featuredOnHostedGallery ? '<span class="badge badge-feat">Featured</span>' : '—'}</td>
            <td class="actions">
              ${
                v.featuredOnHostedGallery
                  ? '<button type="button" class="btn btn-secondary btn-small" data-hv-action="unfeature">Remove from Hosted List</button>'
                  : '<button type="button" class="btn btn-primary btn-small" data-hv-action="feature">Feature on Hosted List</button>'
              }
              <button type="button" class="btn btn-danger btn-small" data-hv-action="unhost">Unhost</button>
            </td>
          </tr>`;
  };

  let body = '';
  students.forEach((student) => {
    body += `
          <tr class="hv-student-row"><td colspan="4"><span class="hv-student">${escapeHtml(student.name)}</span>
            <span class="hv-class">${escapeHtml(student.className)}</span></td></tr>`;
    [...student.projects.values()]
      .sort((a, b) => newestTime(b) - newestTime(a))
      .forEach((list) => {
        list
          .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))
          .forEach((v) => {
            body += versionRow(v, older.has(v.id));
          });
      });
  });

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>Project · version</th><th>Hosted address</th><th>Hosted List</th><th></th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

async function setFeatured(version, featured) {
  const res = await adminFetch(`/admin/hosted-gallery-feature/${encodeURIComponent(version.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured, fileName: version.fileName }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Could not update the Hosted List');
  version.featuredOnHostedGallery = featured;
}

async function loadHostedVersions() {
  const container = document.getElementById('hosted-versions');
  try {
    const res = await adminFetch('/admin/hosted-versions');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not load hosted versions');
    hostedVersions = data.versions || [];
    renderHostedVersions();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') throw err;
    container.innerHTML = `<p class="error">Could not load hosted versions: ${escapeHtml(err.message)}</p>`;
  }
}

function bindHostedVersions() {
  document.getElementById('hv-featured-only')?.addEventListener('change', renderHostedVersions);
  document.getElementById('hv-older-only')?.addEventListener('change', renderHostedVersions);

  document.getElementById('hosted-versions').addEventListener('click', async (evt) => {
    const btn = evt.target.closest('[data-hv-action]');
    if (!btn) return;
    const id = btn.closest('tr')?.dataset.versionId;
    const version = hostedVersions.find((v) => v.id === id);
    if (!version) return;
    const label = `${version.studentUsername || ''} — ${version.projectName || ''} v${version.versionNumber}`;
    const action = btn.dataset.hvAction;
    btn.disabled = true;
    try {
      if (action === 'unfeature') {
        await setFeatured(version, false);
      } else if (action === 'feature') {
        await setFeatured(version, true);
      } else if (action === 'unhost') {
        if (!confirm(`Unhost ${label}?\n\nIts link (${version.hostedPath}) will stop working. The version stays in Submissions and can be hosted again.`)) {
          btn.disabled = false;
          return;
        }
        const res = await adminFetch(`/admin/unhost-version/${encodeURIComponent(version.id)}`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unhost failed');
        hostedVersions = hostedVersions.filter((v) => v.id !== version.id);
      }
      renderHostedVersions();
      loadHostedClasses().catch(() => {});
    } catch (err) {
      btn.disabled = false;
      alert(err.message);
    }
  });

  document.getElementById('hv-remove-older')?.addEventListener('click', async (evt) => {
    const older = olderVersionIds(hostedVersions);
    const targets = hostedVersions.filter((v) => older.has(v.id) && v.featuredOnHostedGallery);
    if (!targets.length) return;
    if (
      !confirm(
        `Remove ${targets.length} older version(s) from the Hosted List?\n\nThe newest hosted version of each project stays listed. Older links keep working.`
      )
    ) {
      return;
    }
    const btn = evt.currentTarget;
    btn.disabled = true;
    const failed = [];
    for (const v of targets) {
      btn.textContent = `Removing… (${targets.indexOf(v) + 1} of ${targets.length})`;
      try {
        await setFeatured(v, false);
      } catch (err) {
        failed.push(`${v.studentUsername} v${v.versionNumber}: ${err.message}`);
      }
    }
    renderHostedVersions();
    loadHostedClasses().catch(() => {});
    if (failed.length) alert(`Some could not be removed:\n${failed.join('\n')}`);
  });
}

requireAdminSession('admin-gate', () => {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  renderAdminNav('hosted');
  loadHostedClasses().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
  });
  bindHostedVersions();
  loadHostedVersions().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
  });
});
