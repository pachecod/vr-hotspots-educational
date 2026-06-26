/** Browser API client for flat pages (Render Postgres + Backblaze — no Supabase). */

export async function listFlatPages() {
  const resp = await fetch('/api/student/flat-pages', { credentials: 'same-origin' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `List failed (${resp.status})`);
  return data.pages || [];
}

export async function loadFlatPage(slug) {
  const resp = await fetch(`/api/student/flat-pages/${encodeURIComponent(slug)}`, {
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `Load failed (${resp.status})`);
  return data.page;
}

export async function saveFlatPage(payload) {
  const resp = await fetch('/api/student/flat-pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `Save failed (${resp.status})`);
  return data;
}

export async function updateFlatPage(slug, payload) {
  const resp = await fetch(`/api/student/flat-pages/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `Update failed (${resp.status})`);
  return data;
}

export async function deleteFlatPage(slug) {
  const resp = await fetch(`/api/student/flat-pages/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `Delete failed (${resp.status})`);
  return data;
}

export async function publishFlatPage(slug, payload) {
  const path = slug
    ? `/api/student/flat-pages/${encodeURIComponent(slug)}/publish`
    : '/api/student/flat-pages/publish';
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.message || `Publish failed (${resp.status})`);
  return data;
}
