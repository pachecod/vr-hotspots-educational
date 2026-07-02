let activeSlug = 'terms';
let dbEnabled = true;

const PUBLIC_LINKS = {
  terms: '/terms.html',
  privacy: '/privacy-policy.html',
  'guest-agreement': null,
};

const PUBLIC_LINK_LABELS = {
  terms: 'View Terms of Use page',
  privacy: 'View Privacy Policy page',
  'guest-agreement': 'Shown when guests open a sample project (no public page)',
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
    const publicHref = PUBLIC_LINKS[activeSlug];
    link.textContent = PUBLIC_LINK_LABELS[activeSlug] || 'View public page';
    if (publicHref) {
      link.href = publicHref;
      link.removeAttribute('aria-disabled');
      link.style.pointerEvents = '';
      link.style.color = '';
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.style.pointerEvents = 'none';
      link.style.color = '#6c757d';
    }
  }
}

function renderPreview() {
  const iframe = document.getElementById('legal-preview');
  if (!iframe) return;
  const page = getFormData();
  const guestShell =
    activeSlug === 'guest-agreement'
      ? `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;padding:16px;box-sizing:border-box;font-family:Arial,sans-serif;">
<div style="width:min(100%,460px);max-height:82vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;color:#fff;">
<div style="padding:18px 20px 10px;font:700 1.125rem/1.3 Arial,sans-serif;color:#fff;">${page.title || 'Guest sample project'}</div>
<div style="padding:0 20px 16px;overflow:auto;font:14px/1.55 Arial,sans-serif;color:#f0f0f0;text-align:left;">${page.content || ''}</div>
<div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 20px 18px;border-top:1px solid rgba(255,255,255,0.22);background:rgba(0,0,0,0.12);">
<span style="padding:9px 16px;border:1px solid rgba(255,255,255,0.45);border-radius:8px;color:#fff;">Cancel</span>
<span style="padding:9px 16px;border-radius:8px;background:#fff;color:#667eea;font-weight:bold;">I Agree</span>
</div>
</div>
</div>`
      : page.content || '';
  const bodyContent = activeSlug === 'guest-agreement' ? guestShell : page.content || '';
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
<body>${bodyContent}</body>
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
