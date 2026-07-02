let activeSlug = 'terms';
let dbEnabled = true;

const PUBLIC_LINKS = {
  terms: '/terms.html',
  privacy: '/privacy-policy.html',
};

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg || 'Saved!';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1800);
}

function setStatus(msg, isError) {
  const el = document.getElementById('legal-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (msg ? (isError ? ' err' : ' ok') : '');
}

function getFormData() {
  return {
    title: document.getElementById('legal-title').value.trim(),
    content: document.getElementById('legal-content').value,
    css_content: document.getElementById('legal-css').value,
  };
}

function setFormData(page) {
  document.getElementById('legal-title').value = page?.title || '';
  document.getElementById('legal-content').value = page?.content || '';
  document.getElementById('legal-css').value = page?.css_content || '';
}

function updateTabUi() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.slug === activeSlug);
  });
  const link = document.getElementById('public-link');
  if (link) {
    link.href = PUBLIC_LINKS[activeSlug] || '/terms.html';
    link.textContent =
      activeSlug === 'privacy' ? 'View Privacy Policy page' : 'View Terms of Use page';
  }
}

function renderPreview() {
  const iframe = document.getElementById('legal-preview');
  if (!iframe) return;
  const page = getFormData();
  const srcdoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${page.title || 'Preview'}</title>
<style>
body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; color: #111827; background: #fff; }
${page.css_content || ''}
</style>
</head>
<body>${page.content || ''}</body>
</html>`;
  iframe.srcdoc = srcdoc;
}

async function loadLegalPage(slug) {
  activeSlug = slug;
  updateTabUi();
  setStatus('Loading…');
  try {
    const res = await adminFetch(`/admin/legal/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load page');
    dbEnabled = !!data.dbEnabled;
    setFormData(data.page);
    renderPreview();
    if (!dbEnabled) {
      setStatus('Database not configured — editing unavailable.', true);
      document.getElementById('save-legal-btn').disabled = true;
    } else {
      setStatus('');
      document.getElementById('save-legal-btn').disabled = false;
    }
  } catch (err) {
    setStatus(err.message || 'Failed to load page', true);
  }
}

async function saveLegalPage() {
  const payload = getFormData();
  if (!payload.title) {
    setStatus('Title is required.', true);
    return;
  }
  if (!payload.content.trim()) {
    setStatus('HTML content is required.', true);
    return;
  }
  setStatus('Saving…');
  try {
    const res = await adminFetch(`/admin/legal/${encodeURIComponent(activeSlug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Save failed');
    setFormData(data.page);
    renderPreview();
    setStatus('Saved.');
    showToast('Legal page saved');
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const slug = btn.dataset.slug;
    if (slug && slug !== activeSlug) loadLegalPage(slug);
  });
});

document.getElementById('save-legal-btn')?.addEventListener('click', saveLegalPage);
document.getElementById('preview-legal-btn')?.addEventListener('click', renderPreview);

async function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('legal');
  await loadLegalPage('terms');
}

requireAdminSession('login-root', initMainApp);
