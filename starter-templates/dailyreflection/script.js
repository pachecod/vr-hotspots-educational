/* Daily Reflection Journal — loads prompts/responses from config.json */

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'P',
  'BR',
  'UL',
  'OL',
  'LI',
  'DIV',
  'SPAN',
]);

function loadJournalConfig() {
  if (window.__FLAT_PAGE_CONFIG__ && typeof window.__FLAT_PAGE_CONFIG__ === 'object') {
    return Promise.resolve(window.__FLAT_PAGE_CONFIG__);
  }
  return fetch('config.json')
    .then((res) => {
      if (!res.ok) throw new Error('Could not load config.json');
      return res.json();
    });
}

function isBlankHtml(html) {
  if (html == null) return true;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return !text;
}

/** Allowlist sanitizer for student richtext HTML (Visual form). Plain text is escaped. */
function sanitizeResponseHtml(raw) {
  if (raw == null || raw === '') return '';
  const str = String(raw);
  // Plain text (no tags): escape and preserve newlines
  if (!/<[a-z][\s\S]*>/i.test(str)) {
    return escapeHtml(str).replace(/\n/g, '<br>');
  }

  const template = document.createElement('template');
  template.innerHTML = str;
  const walk = (node) => {
    const children = Array.from(node.childNodes);
    children.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }
      const tag = child.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        const text = document.createTextNode(child.textContent || '');
        child.replaceWith(text);
        return;
      }
      // Strip all attributes (no onclick/href/style)
      Array.from(child.attributes || []).forEach((attr) => child.removeAttribute(attr.name));
      walk(child);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderJournal(config) {
  const titleEl = document.getElementById('journal-title');
  const subtitleEl = document.getElementById('journal-subtitle');
  const listEl = document.getElementById('journal-entries');
  const errorEl = document.getElementById('journal-error');

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  const title = (config && config.title) || 'Daily Reflection Journal';
  const subtitle = (config && config.subtitle) || '';
  document.title = title;
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;

  if (!listEl) return;
  listEl.innerHTML = '';

  const entries = Array.isArray(config && config.entries) ? config.entries : [];
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'journal-response is-empty';
    empty.textContent = 'No journal entries yet. Add entries in Visual mode.';
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((entry, index) => {
    const article = document.createElement('article');
    article.className = 'journal-entry';

    const h2 = document.createElement('h2');
    h2.className = 'journal-entry-title';
    h2.textContent = entry.title || `Entry ${index + 1}`;
    article.appendChild(h2);

    const prompt = document.createElement('p');
    prompt.className = 'journal-prompt';
    prompt.textContent = entry.prompt || '';
    article.appendChild(prompt);

    const label = document.createElement('div');
    label.className = 'journal-response-label';
    label.textContent = 'Response';
    article.appendChild(label);

    const response = document.createElement('div');
    response.className = 'journal-response';
    if (isBlankHtml(entry.response)) {
      response.classList.add('is-empty');
      response.textContent = 'No response yet — write in Visual mode (config.json → Your response).';
    } else {
      response.innerHTML = sanitizeResponseHtml(entry.response);
    }
    article.appendChild(response);
    listEl.appendChild(article);
  });
}

function showError(message) {
  const errorEl = document.getElementById('journal-error');
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function boot() {
  loadJournalConfig()
    .then((config) => {
      if (!config || typeof config !== 'object') {
        throw new Error('config.json must be an object');
      }
      renderJournal(config);
    })
    .catch((err) => {
      console.error(err);
      showError(err.message || 'Failed to load journal config');
    });
}

window.addEventListener('flat-page-config-live', () => {
  if (window.__FLAT_PAGE_CONFIG__) renderJournal(window.__FLAT_PAGE_CONFIG__);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
