let snippets = [];
let blockedExtensions = [];
let editingId = null;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg || 'Saved!';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1800);
}

function setStatus(elId, msg, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (msg ? (isError ? ' err' : ' ok') : '');
}

function updateRideyVersionRowVisibility() {
  const enabled = document.getElementById('ridey-enabled').checked;
  const row = document.getElementById('ridey-version-row');
  if (row) row.style.display = enabled ? 'block' : 'none';
}

function getSelectedRideyVersion() {
  const selected = document.querySelector('input[name="ridey-version"]:checked');
  return selected?.value === '2.0' ? '2.0' : '1.0';
}

function setSelectedRideyVersion(version) {
  const v = version === '2.0' ? '2.0' : '1.0';
  const input = document.getElementById(v === '2.0' ? 'ridey-version-2' : 'ridey-version-1');
  if (input) input.checked = true;
}

async function saveRideySettings({ enabled, version } = {}) {
  const checkbox = document.getElementById('ridey-enabled');
  const body = {
    enabled: enabled !== undefined ? enabled : checkbox.checked,
    version: version !== undefined ? version : getSelectedRideyVersion(),
  };
  const res = await adminFetch('/admin/editor-settings/ridey', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  checkbox.checked = !!data.rideyEnabled;
  setSelectedRideyVersion(data.rideyVersion);
  updateRideyVersionRowVisibility();
  const versionLabel = data.rideyVersion === '2.0' ? '2.0 (beta)' : '1.0';
  setStatus(
    'ridey-status',
    data.rideyEnabled ? `Ridey enabled (${versionLabel}).` : 'Ridey disabled.'
  );
  showToast('Ridey settings saved');
}

async function loadSettings() {
  const res = await adminFetch('/admin/editor-settings');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load settings');

  document.getElementById('ridey-enabled').checked = !!data.rideyEnabled;
  setSelectedRideyVersion(data.rideyVersion);
  updateRideyVersionRowVisibility();
  document.getElementById('ridey-warn').style.display = data.hasApiKey ? 'none' : 'block';

  blockedExtensions = data.blockedExtensions || [];
  renderExtChips();

  if (!data.dbEnabled) {
    setStatus('snippet-status', 'Database not configured — snippet admin unavailable.', true);
    document.getElementById('add-snippet-btn').disabled = true;
  }
}

async function loadSnippets() {
  const res = await adminFetch('/admin/snippets');
  const data = await res.json();
  if (!data.success) {
    if (res.status === 503) return;
    throw new Error(data.message || 'Failed to load snippets');
  }
  snippets = data.snippets || [];
  renderSnippets();
}

function renderSnippets() {
  const list = document.getElementById('snippet-list');
  if (!snippets.length) {
    list.innerHTML = '<p class="hint">No snippets yet.</p>';
    return;
  }
  list.innerHTML = snippets
    .map(
      (s) => `
    <div class="snippet-card" data-id="${s.id}">
      <div class="snippet-card-header">
        <strong>${escapeHtml(s.title)}</strong>
        <span class="snippet-lang">${escapeHtml(s.language || 'html')}</span>
        <div class="snippet-actions">
          <button type="button" class="btn btn-secondary btn-small" data-action="edit">Edit</button>
          <button type="button" class="btn btn-danger btn-small" data-action="delete">Delete</button>
        </div>
      </div>
      <div class="snippet-code">${escapeHtml(s.code)}</div>
    </div>
  `
    )
    .join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderExtChips() {
  const el = document.getElementById('ext-chips');
  if (!blockedExtensions.length) {
    el.innerHTML = '<span class="hint">No blocked extensions.</span>';
    return;
  }
  el.innerHTML = blockedExtensions
    .map(
      (ext) => `
    <span class="ext-chip">.${escapeHtml(ext)}
      <button type="button" class="btn btn-danger btn-small" data-ext="${escapeHtml(ext)}">×</button>
    </span>
  `
    )
    .join('');
}

document.getElementById('ridey-enabled').addEventListener('change', async (e) => {
  try {
    await saveRideySettings({ enabled: e.target.checked });
  } catch (err) {
    setStatus('ridey-status', err.message, true);
    e.target.checked = !e.target.checked;
    updateRideyVersionRowVisibility();
  }
});

document.querySelectorAll('input[name="ridey-version"]').forEach((input) => {
  input.addEventListener('change', async () => {
    if (!document.getElementById('ridey-enabled').checked) return;
    try {
      await saveRideySettings({ version: getSelectedRideyVersion() });
    } catch (err) {
      setStatus('ridey-status', err.message, true);
    }
  });
});

document.getElementById('add-ext-btn').addEventListener('click', () => {
  const input = document.getElementById('new-ext');
  const ext = input.value.trim().toLowerCase().replace(/^\./, '');
  if (!ext) return;
  if (blockedExtensions.includes(ext)) {
    setStatus('ext-status', `Extension ".${ext}" is already blocked.`, true);
    return;
  }
  blockedExtensions.push(ext);
  input.value = '';
  renderExtChips();
  setStatus('ext-status', '');
});

document.getElementById('ext-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-ext]');
  if (!btn) return;
  const ext = btn.dataset.ext;
  blockedExtensions = blockedExtensions.filter((x) => x !== ext);
  renderExtChips();
});

document.getElementById('save-ext-btn').addEventListener('click', async () => {
  try {
    const res = await adminFetch('/admin/editor-settings/blocked-extensions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensions: blockedExtensions }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    blockedExtensions = data.blockedExtensions || [];
    renderExtChips();
    setStatus('ext-status', 'Blocked extensions saved.');
    showToast('Extensions saved');
  } catch (err) {
    setStatus('ext-status', err.message, true);
  }
});

document.getElementById('add-snippet-btn').addEventListener('click', async () => {
  const title = document.getElementById('snippet-title').value.trim();
  const code = document.getElementById('snippet-code').value;
  const language = document.getElementById('snippet-language').value;
  if (!title || !code) {
    setStatus('snippet-status', 'Title and code are required.', true);
    return;
  }
  try {
    const url = editingId ? `/admin/snippets/${editingId}` : '/admin/snippets';
    const method = editingId ? 'PUT' : 'POST';
    const res = await adminFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, code, language }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    document.getElementById('snippet-title').value = '';
    document.getElementById('snippet-code').value = '';
    editingId = null;
    document.getElementById('add-snippet-btn').textContent = 'Add Snippet';
    setStatus('snippet-status', 'Snippet saved.');
    showToast('Snippet saved');
    await loadSnippets();
  } catch (err) {
    setStatus('snippet-status', err.message, true);
  }
});

document.getElementById('snippet-list').addEventListener('click', async (e) => {
  const card = e.target.closest('.snippet-card');
  if (!card) return;
  const id = card.dataset.id;
  const action = e.target.dataset.action;
  const snippet = snippets.find((s) => s.id === id);
  if (!snippet) return;

  if (action === 'edit') {
    editingId = id;
    document.getElementById('snippet-title').value = snippet.title;
    document.getElementById('snippet-code').value = snippet.code;
    document.getElementById('snippet-language').value = snippet.language || 'html';
    document.getElementById('add-snippet-btn').textContent = 'Update Snippet';
    setStatus('snippet-status', 'Editing — change fields and click Update.');
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Delete snippet "${snippet.title}"?`)) return;
    try {
      const res = await adminFetch(`/admin/snippets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      showToast('Snippet deleted');
      await loadSnippets();
    } catch (err) {
      setStatus('snippet-status', err.message, true);
    }
  }
});

async function initMainApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('main-content').style.display = 'block';
  renderAdminNav('snippets');
  try {
    await loadSettings();
    await loadSnippets();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') location.reload();
    else alert(err.message || 'Failed to load editor settings');
  }
}

requireAdminSession('login-root', initMainApp);
