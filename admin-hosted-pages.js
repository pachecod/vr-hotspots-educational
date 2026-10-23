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

requireAdminSession('admin-gate', () => {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  renderAdminNav('hosted');
  loadHostedClasses().catch((err) => {
    if (err.code === 'AUTH_REQUIRED') location.reload();
  });
});
