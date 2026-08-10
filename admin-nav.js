function ensureAdminLandmarks() {
  const content = document.getElementById('admin-content');
  if (content && !document.getElementById('admin-main')) {
    const main = document.createElement('main');
    main.id = 'admin-main';
    content.parentNode.insertBefore(main, content);
    main.appendChild(content);
  }

  if (!document.getElementById('admin-skip-link')) {
    const skip = document.createElement('a');
    skip.id = 'admin-skip-link';
    skip.className = 'admin-skip-link';
    skip.href = '#admin-main';
    skip.textContent = 'Skip to main content';
    document.body.insertBefore(skip, document.body.firstChild);
  }
}

function renderAdminNav(activeTab) {
  const nav = document.getElementById('admin-nav');
  if (!nav) return;

  const tabs = [
    { id: 'home', label: 'Overview', href: '/admin' },
    { id: 'submissions', label: 'Submissions', href: '/admin-submissions.html' },
    { id: 'assign', label: 'Assign Project', href: '/admin-assign-project.html' },
    { id: 'assets', label: 'Assets', href: '/admin-common-assets.html' },
    { id: 'snippets', label: 'Editor Settings', href: '/admin-snippets.html' },
    { id: 'legal', label: 'Legal Pages', href: '/admin-legal.html' },
    { id: 'system-text', label: 'System Text', href: '/admin-system-text.html' },
    { id: 'templates', label: 'Templates', href: '/admin-templates.html' },
    { id: 'users', label: 'Users and Classes', href: '/admin-users.html' },
    { id: 'billing', label: 'Billing & Limits', href: '/admin-billing.html' },
    { id: 'usage', label: 'Usage', href: '/admin-usage.html' },
    { id: 'activity', label: 'Activity', href: '/admin-activity.html' },
    { id: 'errors', label: 'Error Log', href: '/admin-error-log.html' },
  ];

  nav.className = 'admin-nav';
  nav.setAttribute('aria-label', 'Admin');
  nav.innerHTML =
    tabs
      .map(
        (t) =>
          `<a href="${t.href}"${
            t.id === activeTab ? ' class="active" aria-current="page"' : ''
          }>${t.label}</a>`
      )
      .join('') +
    '<button type="button" id="admin-nav-logout" class="admin-nav-logout">Logout</button>';

  const logoutBtn = document.getElementById('admin-nav-logout');
  if (logoutBtn && logoutBtn.dataset.bound !== '1') {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', async () => {
      if (typeof adminLogout === 'function') {
        await adminLogout();
      }
      location.reload();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureAdminLandmarks();
  const nav = document.getElementById('admin-nav');
  if (nav && nav.dataset.active) {
    renderAdminNav(nav.dataset.active);
  }
});

window.renderAdminNav = renderAdminNav;
window.ensureAdminLandmarks = ensureAdminLandmarks;
