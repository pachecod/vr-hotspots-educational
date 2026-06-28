function renderAdminNav(activeTab) {
  const nav = document.getElementById('admin-nav');
  if (!nav) return;

  const tabs = [
    { id: 'home', label: 'Overview', href: '/admin' },
    { id: 'submissions', label: 'Submissions', href: 'admin-submissions.html' },
    { id: 'assets', label: 'Assets', href: 'admin-common-assets.html' },
    { id: 'snippets', label: 'Editor Settings', href: 'admin-snippets.html' },
    { id: 'templates', label: 'Templates', href: 'admin-templates.html' },
    { id: 'users', label: 'Users', href: 'admin-users.html' },
    { id: 'billing', label: 'Billing & Limits', href: 'admin-billing.html' },
  ];

  nav.className = 'admin-nav';
  nav.innerHTML =
    tabs
      .map(
        (t) =>
          `<a href="${t.href}"${t.id === activeTab ? ' class="active"' : ''}>${t.label}</a>`
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
  const nav = document.getElementById('admin-nav');
  if (nav && nav.dataset.active) {
    renderAdminNav(nav.dataset.active);
  }
});

window.renderAdminNav = renderAdminNav;
