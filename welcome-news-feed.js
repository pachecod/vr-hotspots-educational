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

async function mountWelcomeNewsFeed(containerEl) {
  if (!containerEl) return;

  containerEl.innerHTML = `
    <section class="welcome-news-section" aria-label="WebXRIDE news">
      <h2 class="welcome-news-title">Latest WebXRIDE Development News</h2>
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

    if (!data.items.length) {
      containerEl.innerHTML = '';
      return;
    }

    section.innerHTML = `
      <h1 class="welcome-news-title">Latest WebXRIDE Development News</h1>
      ${renderWelcomeNewsItems(data.items)}
      <p class="welcome-news-source">
        <a href="https://danpacheco.com/category/webxride/" target="_blank" rel="noopener noreferrer">More on DanPacheco.com</a>
      </p>
    `;
  } catch (_) {
    containerEl.innerHTML = '';
  }
}

window.mountWelcomeNewsFeed = mountWelcomeNewsFeed;
