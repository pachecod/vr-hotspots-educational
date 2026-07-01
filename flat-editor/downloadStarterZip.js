/** Build a starter-templates-ready ZIP (one folder with all template files). */

function loadJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return Promise.resolve(window.JSZip);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(script);
  });
}

export function slugifyStarterFolderName(name) {
  return (
    String(name || 'starter-template')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'starter-template'
  );
}

function safeZipFilename(name) {
  const base = String(name || '').replace(/[/\\]/g, '').trim();
  if (!base || base.includes('..')) return null;
  return base;
}

/**
 * @param {{ name: string, content?: string }[]} files
 * @param {string} folderName — becomes the root folder inside the ZIP (e.g. immersive-museum)
 */
export async function downloadStarterTemplateZip(files, folderName) {
  const manifest = Array.isArray(files) ? files : [];
  if (!manifest.some((f) => f && f.name === 'index.html')) {
    throw new Error('Starter must include index.html');
  }

  const folder = slugifyStarterFolderName(folderName);
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder(folder);

  manifest.forEach((file) => {
    const safeName = safeZipFilename(file?.name);
    if (!safeName) return;
    root.file(safeName, file.content ?? '');
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folder}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }

  return folder;
}
