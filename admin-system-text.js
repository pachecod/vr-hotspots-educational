let activeKey = 'welcome-screen';
let dbEnabled = true;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg || 'Saved!';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1800);
}

function setStatus(msg, isError) {
  const el = document.getElementById('system-text-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (msg ? (isError ? ' err' : ' ok') : '');
}

function getFormData() {
  return {
    content_html: document.getElementById('system-text-content').value,
  };
}

function setFormData(text) {
  document.getElementById('system-text-content').value = text?.content_html || '';
  const title = document.getElementById('system-text-panel-title');
  if (title) title.textContent = text?.label || 'Welcome screen';
}

function updateTabUi() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.key === activeKey);
  });
}

function renderPreview() {
  const preview = document.getElementById('system-text-preview');
  if (!preview) return;
  preview.innerHTML = getFormData().content_html || '';
}

async function loadSystemText(key) {
  activeKey = key;
  updateTabUi();
  setStatus('Loading…');
  try {
    const res = await adminFetch(`/admin/system-text/${encodeURIComponent(key)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load system text');
    dbEnabled = !!data.dbEnabled;
    setFormData(data.text);
    renderPreview();
    if (!dbEnabled) {
      setStatus('Database not configured — editing unavailable.', true);
      document.getElementById('save-system-text-btn').disabled = true;
    } else {
      setStatus('');
      document.getElementById('save-system-text-btn').disabled = false;
    }
  } catch (err) {
    setStatus(err.message || 'Failed to load system text', true);
  }
}

async function saveSystemText() {
  const payload = getFormData();
  if (!payload.content_html.trim()) {
    setStatus('Content HTML is required.', true);
    return;
  }
  setStatus('Saving…');
  try {
    const res = await adminFetch(`/admin/system-text/${encodeURIComponent(activeKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Save failed');
    setFormData(data.text);
    renderPreview();
    setStatus('Saved.');
    showToast('System text saved');
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    if (key && key !== activeKey) loadSystemText(key);
  });
});

document.getElementById('save-system-text-btn')?.addEventListener('click', saveSystemText);
document.getElementById('preview-system-text-btn')?.addEventListener('click', renderPreview);

async function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('system-text');
  await loadSystemText('welcome-screen');
}

requireAdminSession('login-root', initMainApp);
