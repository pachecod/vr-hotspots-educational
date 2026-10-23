function setAdminAuthenticated(active = true) {
  window.adminAuthenticated = !!active;
  if (typeof window.applyEditorCapabilities === 'function') {
    window.applyEditorCapabilities();
  }
  if (window.flatPageEditor && typeof window.flatPageEditor.onCapabilitiesChange === 'function') {
    window.flatPageEditor.onCapabilitiesChange();
  }
}

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

function isViteDevFrontend() {
  const host = window.location.hostname;
  const port = window.location.port;
  return (host === 'localhost' || host === '127.0.0.1') && (port === '5173' || port === '5174');
}

async function checkBackendAvailable(retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('/admin/session', { credentials: 'include' });
      if (res.ok || res.status === 401) return true;
      if ([502, 503, 504].includes(res.status) && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      return false;
    } catch (_) {
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      return false;
    }
  }
  return false;
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
  setAdminAuthenticated(true);
  return true;
}

async function adminLogout() {
  await fetch('/admin/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  setAdminAuthenticated(false);
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
  const viteDev = isViteDevFrontend();
  container.innerHTML = viteDev
    ? `
    <div style="max-width:520px;margin:80px auto;padding:30px;border:2px solid #dc3545;border-radius:8px;background:#fff5f5;">
      <h2 style="margin-top:0;color:#dc3545;">API Server Not Running</h2>
      <p style="color:#333;">Vite is serving the frontend, but the Express backend on port <strong>3000</strong> is not reachable.</p>
      <p style="color:#666;font-size:14px;">From the project folder, run:</p>
      <pre style="background:#222;color:#0f0;padding:12px;border-radius:4px;overflow:auto;">npm run dev</pre>
      <p style="color:#666;font-size:13px;">This starts both the API (3000) and Vite (5173). Then reload this page.</p>
      <p style="color:#666;font-size:13px;">Or run the API alone: <code>npm run dev:api</code></p>
    </div>
  `
    : `
    <div style="max-width:520px;margin:80px auto;padding:30px;border:2px solid #dc3545;border-radius:8px;background:#fff5f5;">
      <h2 style="margin-top:0;color:#dc3545;">Cannot Reach Server API</h2>
      <p style="color:#333;">This page could not contact <code>/admin/session</code> on your deployed server.</p>
      <p style="color:#666;font-size:14px;">On Render free tier, the service may be waking up — wait 30–60 seconds and reload.</p>
      <p style="color:#666;font-size:14px;">If it persists, open Render → your web service → <strong>Logs</strong> and check for startup errors (missing env vars, B2, or database).</p>
      <p style="color:#666;font-size:13px;">Quick test: open <a href="/admin/session" target="_blank" rel="noopener">/admin/session</a> — you should see JSON like <code>{"authenticated":false}</code>.</p>
    </div>
  `;
}

/** Admin → Home: confirm before leaving admin, saying what is lost and how to get back. */
function confirmAdminGoHome(signedIn) {
  const lose = signedIn
    ? 'Anything you have typed on this admin page but not saved will be lost. You stay signed in as admin.'
    : 'Nothing — you are not signed in to admin yet.';
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:Arial,sans-serif;';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="admin-home-title" style="background:#fff;color:#222;border-radius:10px;padding:24px;max-width:460px;width:100%;line-height:1.5;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
      <h2 id="admin-home-title" style="margin:0 0 12px;font-size:20px;">Go to the home page?</h2>
      <p style="margin:0 0 10px;"><strong>What you will lose:</strong> ${lose}</p>
      <p style="margin:0;"><strong>How to get back:</strong> use the small <strong>Admin</strong> link at the very bottom of the home page, or go to <code>/admin</code>.</p>
      <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" data-home-stay style="padding:10px 18px;background:#0056B3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Stay here</button>
        <button type="button" data-home-leave style="padding:10px 18px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;">Go Home</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-home-stay]').addEventListener('click', close);
  overlay.querySelector('[data-home-leave]').addEventListener('click', () => {
    window.location.href = '/';
  });
  overlay.querySelector('[data-home-stay]').focus();
}

window.confirmAdminGoHome = confirmAdminGoHome;

function renderAdminLoginGate(containerId, onAuthenticated) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <a href="/" id="admin-login-home" style="position:fixed;top:16px;left:16px;padding:8px 14px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#0056B3;font-weight:bold;text-decoration:none;font-family:Arial,sans-serif;">Home</a>
    <div style="max-width:420px;margin:80px auto;padding:30px;border:1px solid #dee2e6;border-radius:8px;background:#f8f9fa;">
      <h2 style="margin-top:0;">Admin Login</h2>
      <p style="color:#666;">Enter the admin password to continue.</p>
      <p style="color:#888;font-size:12px;">Default dev password: <code>admin123</code> (set ADMIN_PASSWORD in .env)</p>
      <form id="admin-login-form">
        <input type="password" id="admin-login-password" placeholder="Admin password"
          style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" />
        <button type="submit" style="width:100%;padding:12px;background:#0056B3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Sign In</button>
      </form>
      <div id="admin-login-error" style="color:#dc3545;margin-top:10px;display:none;"></div>
    </div>
  `;

  document.getElementById('admin-login-home').addEventListener('click', (e) => {
    e.preventDefault();
    confirmAdminGoHome(false);
  });

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-login-password').value;
    const errorEl = document.getElementById('admin-login-error');
    errorEl.style.display = 'none';
    try {
      await adminLogin(password);
      await Promise.resolve(onAuthenticated());
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
    setAdminAuthenticated(true);
    await Promise.resolve(onAuthenticated());
    return;
  }
  renderAdminLoginGate(containerId, onAuthenticated);
}

(async function initAdminEditorRideyAccess() {
  try {
    if (window.adminAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('adminReview') !== '1' && !params.get('adminTemplate') && params.get('adminAssign') !== '1') return;
    if (!(await checkAdminSession())) return;
    setAdminAuthenticated(true);
  } catch (_) {}
})();
