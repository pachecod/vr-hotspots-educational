export const STORAGE_KEY = 'vr-flat-pages-data';
export const PROJECT_VERSION = '2.5';
export const DEFAULT_PAGE_ID = 'main';
export const EXPORT_FOLDER = 'flat-pages';

export const FILE_DEFS = [
  { id: 'index.html', name: 'index.html', type: 'html', label: 'HTML' },
  { id: 'style.css', name: 'style.css', type: 'css', label: 'CSS' },
  { id: 'script.js', name: 'script.js', type: 'javascript', label: 'JS' },
];

export const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Flat Web Page</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>My Flat Web Page</h1>
    <p>Edit the HTML, CSS, and JavaScript tabs and watch the preview update live.</p>
    <button id="hello">Click me</button>
  </main>
  <script src="script.js"></script>
</body>
</html>`;

export const DEFAULT_CSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8fafc;
  color: #1f2933;
  margin: 0;
}
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
  text-align: center;
}
h1 { color: #2563eb; }
button {
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
button:hover { background: #1d4ed8; }`;

export const DEFAULT_JS = `document.getElementById('hello')?.addEventListener('click', function () {
  alert('Hello from your flat web page!');
});`;

export function defaultFilesContent() {
  return {
    'index.html': DEFAULT_HTML,
    'style.css': DEFAULT_CSS,
    'script.js': DEFAULT_JS,
  };
}

export function createDefaultPage(name) {
  const content = defaultFilesContent();
  return {
    id: DEFAULT_PAGE_ID,
    name: name || 'Flat Web Page',
    framework: 'html',
    files: FILE_DEFS.map((def) => ({
      id: def.id,
      name: def.name,
      type: def.type,
      content: content[def.id] || '',
    })),
  };
}

export function createDefaultProject() {
  return {
    version: PROJECT_VERSION,
    activePageId: DEFAULT_PAGE_ID,
    pages: { [DEFAULT_PAGE_ID]: createDefaultPage() },
  };
}
