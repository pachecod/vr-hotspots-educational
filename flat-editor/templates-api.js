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
