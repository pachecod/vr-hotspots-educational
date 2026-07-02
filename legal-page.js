(function () {
  const config = window.__LEGAL_PAGE_CONFIG__ || {};
  const slug = config.slug || 'terms';
  const backHref = config.backHref || '/index.html';
  const loadingEl = document.getElementById('legal-loading');
  const errorEl = document.getElementById('legal-error');
  const contentEl = document.getElementById('legal-content');
  const metaEl = document.getElementById('legal-meta');
  const backLink = document.getElementById('legal-back');

  if (backLink) backLink.href = backHref;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return '';
    }
  }

  function renderPage(page) {
    if (!page) throw new Error('Legal page not found');

    document.title = `${page.title} — WebXRIDE Immersive Storytelling Tool`;

    const style = document.createElement('style');
    style.textContent = page.css_content || '';
    document.head.appendChild(style);

    contentEl.innerHTML = page.content;

    if (metaEl) {
      const parts = [];
      if (page.updated_at) parts.push(`Last updated: ${formatDate(page.updated_at)}`);
      if (page.updated_by) parts.push(`by ${escapeHtml(page.updated_by)}`);
      metaEl.textContent = parts.join(' ');
      metaEl.style.display = parts.length ? 'block' : 'none';
    }

    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    contentEl.style.display = 'block';
  }

  async function load() {
    try {
      const res = await fetch(`/api/legal/${encodeURIComponent(slug)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.page) {
        throw new Error(data.message || 'Could not load page');
      }
      renderPage(data.page);
    } catch (err) {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = err.message || 'Could not load this page.';
    }
  }

  load();
})();
