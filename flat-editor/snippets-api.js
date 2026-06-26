export async function fetchSnippets() {
  const res = await fetch('/api/snippets');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load snippets');
  return data.snippets || [];
}
