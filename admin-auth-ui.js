async function checkAdminSession() {
  try {
    const res = await fetch('/admin/session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.authenticated;
  } catch (_) {
    return false;
  }
}

async function checkBackendAvailable() {
  try {
    const res = await fetch('/admin/session', { credentials: 'include' });
    return res.ok || res.status === 401;
  } catch (_) {
    return false;
  }
}

async function adminLogin(password) {
  let res;
  try {
    res = await fetch('/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ password }),
    });
  } catch (_) {
    throw new Error(
      'Cannot reach the API server. Run "npm run dev" to start both Vite (5173) and Express (3000).'
    );
  }
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error('Invalid response from server. Is the Express API running on port 3000?');
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Login failed');
  }
  return true;
}

async function adminLogout() {
  await fetch('/admin/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

async function adminFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {}),
      },
    });
  } catch (_) {
    const err = new Error(
      'Cannot reach the API server. Run "npm run dev" to start both Vite and Express.'
    );
    err.code = 'BACKEND_UNAVAILABLE';
    throw err;
  }
  if (res.status === 401) {
    const err = new Error('Admin authentication required');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  return res;
}

function renderBackendWarning(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="max-width:520px;margin:80px auto;padding:30px;border:2px solid #dc3545;border-radius:8px;background:#fff5f5;">
      <h2 style="margin-top:0;color:#dc3545;">API Server Not Running</h2>
      <p style="color:#333;">Vite is serving the frontend, but the Express backend on port <strong>3000</strong> is not reachable.</p>
      <p style="color:#666;font-size:14px;">From the project folder, run:</p>
      <pre style="background:#222;color:#0f0;padding:12px;border-radius:4px;overflow:auto;">npm run dev</pre>
      <p style="color:#666;font-size:13px;">This starts both the API (3000) and Vite (5173). Then reload this page.</p>
      <p style="color:#666;font-size:13px;">Or run the API alone: <code>npm run dev:api</code></p>
    </div>
  `;
}

function renderAdminLoginGate(containerId, onAuthenticated) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:420px;margin:80px auto;padding:30px;border:1px solid #dee2e6;border-radius:8px;background:#f8f9fa;">
      <h2 style="margin-top:0;">Admin Login</h2>
      <p style="color:#666;">Enter the admin password to continue.</p>
      <p style="color:#888;font-size:12px;">Default dev password: <code>admin123</code> (set ADMIN_PASSWORD in .env)</p>
      <form id="admin-login-form">
        <input type="password" id="admin-login-password" placeholder="Admin password"
          style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" />
        <button type="submit" style="width:100%;padding:12px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Sign In</button>
      </form>
      <div id="admin-login-error" style="color:#dc3545;margin-top:10px;display:none;"></div>
    </div>
  `;

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-login-password').value;
    const errorEl = document.getElementById('admin-login-error');
    errorEl.style.display = 'none';
    try {
      await adminLogin(password);
      onAuthenticated();
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed';
      errorEl.style.display = 'block';
    }
  });
}

async function requireAdminSession(containerId, onAuthenticated) {
  const backendOk = await checkBackendAvailable();
  if (!backendOk) {
    renderBackendWarning(containerId);
    return;
  }
  const authed = await checkAdminSession();
  if (authed) {
    onAuthenticated();
    return;
  }
  renderAdminLoginGate(containerId, onAuthenticated);
}
