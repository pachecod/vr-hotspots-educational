function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

const NEWS_SOURCE_URL = 'https://danpacheco.com/category/webxride/';
const NEWS_HEADING = 'Latest WebXRIDE Development News';

function renderWelcomeNewsItems(items) {
  if (!items.length) {
    return '<p class="welcome-news-empty">No posts available right now.</p>';
  }

  return `<ul class="welcome-news-list">${items
    .map(
      (item) => `
    <li class="welcome-news-item">
      <a class="welcome-news-link" href="${escapeAttr(item.link)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(item.title)}
      </a>
      ${item.excerpt ? `<p class="welcome-news-excerpt">${escapeHtml(item.excerpt)}</p>` : ''}
    </li>`
    )
    .join('')}</ul>`;
}

function renderNewsSourceLink() {
  return `<p class="welcome-news-source">
    <a href="${NEWS_SOURCE_URL}" target="_blank" rel="noopener noreferrer">More on DanPacheco.com</a>
  </p>`;
}

function renderNewsSectionContent(items, { headingTag = 'h2' } = {}) {
  return `
    <${headingTag} class="welcome-news-title">${NEWS_HEADING}</${headingTag}>
    ${renderWelcomeNewsItems(items)}
    ${renderNewsSourceLink()}
  `;
}

async function mountWelcomeNewsFeed(containerEl, options = {}) {
  if (!containerEl) return;

  const pageMode = options.pageMode === true;
  const headingTag = pageMode ? 'h2' : 'h2';

  containerEl.innerHTML = `
    <section class="welcome-news-section" aria-label="WebXRIDE news">
      <p class="welcome-news-loading">Loading updates…</p>
    </section>
  `;

  const section = containerEl.querySelector('.welcome-news-section');
  if (!section) return;

  try {
    const res = await fetch('/api/welcome/news');
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.items)) {
      throw new Error(data.message || 'Failed to load news');
    }

    if (!data.items.length && !pageMode) {
      containerEl.innerHTML = '';
      return;
    }

    section.innerHTML = renderNewsSectionContent(data.items, { headingTag });
  } catch (_) {
    if (!pageMode) {
      containerEl.innerHTML = '';
      return;
    }

    section.innerHTML = `
      <h2 class="welcome-news-title">${NEWS_HEADING}</h2>
      <p class="welcome-news-empty welcome-news-error">Could not load updates right now. Please try again later.</p>
      ${renderNewsSourceLink()}
    `;
  }
}

window.mountWelcomeNewsFeed = mountWelcomeNewsFeed;
