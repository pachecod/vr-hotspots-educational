export async function fetchPublicTemplates() {
  const res = await fetch('/api/templates');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load templates');
  return data.templates || [];
}

export async function fetchTemplateBySlug(slug) {
  const res = await fetch(`/api/templates/${encodeURIComponent(slug)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Template not found');
  return data.template;
}

export async function fetchDefaultTemplate() {
  const res = await fetch('/api/templates/default');
  const data = await res.json();
  if (!data.success || !data.template) return null;
  return data.template;
}

const STARTER_TEMPLATE_FILES = ['index.html', 'style.css', 'script.js', 'config.json', 'config.ui.json'];

/** Load a template from starter-templates/ on disk (for local dev / testing). */
export async function fetchStarterTemplate(slug) {
  const safe = String(slug || '')
    .trim()
    .replace(/[^a-z0-9-]/gi, '');
  if (!safe) throw new Error('Invalid starter template slug');

  const files_manifest = [];
  for (const name of STARTER_TEMPLATE_FILES) {
    try {
      const res = await fetch(`/starter-templates/${safe}/${name}`);
      if (!res.ok) continue;
      files_manifest.push({ name, content: await res.text() });
    } catch (_) {}
  }

  if (!files_manifest.some((f) => f.name === 'index.html')) {
    throw new Error(`Starter template "${safe}" not found`);
  }

  const title = safe
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return { title, slug: safe, files_manifest, scope: 'flat' };
}

export async function listStarterTemplates() {
  return [{ slug: 'immersive-museum', title: 'Immersive Museum (local starter)' }];
}
