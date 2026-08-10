(function () {
var escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
  ? window.escapeHtml
  : function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

  

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function featuredHostedPagesTitle(className) {
    const name = String(className || '').trim() || 'Your Class';
    return `Featured Hosted Pages for Class ${name}`;
  }

  const HOSTED_GALLERY_PRIVACY_NOTE =
    'Anyone who can open this page with the classroom password can view the featured hosted projects listed here.';

  const PAGE_SIZE = 12;

  let galleryState = null;

  function getPaginationView(state) {
    const total = state.projects.length;
    if (state.viewAll || total <= PAGE_SIZE) {
      return {
        items: state.projects,
        page: 1,
        totalPages: 1,
        startIndex: 0,
        showControls: total > PAGE_SIZE,
      };
    }
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const page = Math.min(Math.max(1, state.currentPage), totalPages);
    const startIndex = (page - 1) * PAGE_SIZE;
    return {
      items: state.projects.slice(startIndex, startIndex + PAGE_SIZE),
      page,
      totalPages,
      startIndex,
      showControls: true,
    };
  }

  function renderProjectCard(project, projectIndex) {
    const metaParts = [];
    if (project.studentName) metaParts.push(project.studentName);
    const date = formatDate(project.updatedAt);
    if (date) metaParts.push(`Updated ${date}`);
    const tourUrl =
      project.tourUrl || (project.hostedPath ? `/hosted/${project.hostedPath}/index.html` : '#');
    const qrUrl =
      project.qrUrl ||
      (project.hostedPath
        ? `/hosted/${project.hostedPath}/qr.png`
        : tourUrl.replace(/index\.html(\?.*)?$/i, 'qr.png'));
    return `
      <article class="hosted-project-card">
        <h2>${escapeHtml(project.title || 'Untitled project')}</h2>
        ${
          metaParts.length
            ? `<p class="hosted-project-meta">${escapeHtml(metaParts.join(' · '))}</p>`
            : ''
        }
        ${
          qrUrl
            ? `<div class="hosted-project-qr">
            <img
              src="${escapeHtml(qrUrl)}"
              alt="QR code to open ${escapeHtml(project.title || 'this project')} on your phone"
              width="120"
              height="120"
              loading="lazy"
            />
            <p class="hosted-project-qr-hint">Scan to open on your phone</p>
            <button
              type="button"
              class="hosted-projects-btn hosted-projects-btn-secondary hosted-project-qr-fullscreen-btn"
              data-project-index="${projectIndex}"
            >Open QR full screen</button>
          </div>`
            : ''
        }
        <a
          class="hosted-projects-btn hosted-projects-btn-primary"
          href="${escapeHtml(tourUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >View project</a>
      </article>`;
  }

  function renderPaginationControls(view) {
    if (!view.showControls) return '';

    const { page, totalPages } = view;
    const total = galleryState.projects.length;

    if (galleryState.viewAll) {
      return `
        <div class="hosted-projects-pagination" aria-label="Gallery pagination">
          <p class="hosted-projects-page-info">Showing all ${total} featured projects</p>
          <button
            type="button"
            class="hosted-projects-btn hosted-projects-btn-secondary"
            id="hosted-projects-show-pages-btn"
          >Show pages</button>
        </div>`;
    }

    const rangeStart = view.startIndex + 1;
    const rangeEnd = view.startIndex + view.items.length;

    return `
      <div class="hosted-projects-pagination" aria-label="Gallery pagination">
        <button
          type="button"
          class="hosted-projects-btn hosted-projects-btn-secondary"
          id="hosted-projects-prev-btn"
          ${page <= 1 ? 'disabled' : ''}
        >Previous</button>
        <p class="hosted-projects-page-info">
          Showing ${rangeStart}–${rangeEnd} of ${total}
          <span class="hosted-projects-page-divider">·</span>
          Page ${page} of ${totalPages}
        </p>
        <button
          type="button"
          class="hosted-projects-btn hosted-projects-btn-secondary"
          id="hosted-projects-next-btn"
          ${page >= totalPages ? 'disabled' : ''}
        >Next</button>
        <button
          type="button"
          class="hosted-projects-btn hosted-projects-btn-secondary"
          id="hosted-projects-view-all-btn"
        >View All</button>
      </div>`;
  }

  function bindProjectListInteractions(root) {
    const { classSlug, projects } = galleryState;

    document.getElementById('hosted-projects-lock-btn')?.addEventListener('click', async () => {
      try {
        await lockGallery(classSlug);
      } catch (_) {}
      window.location.reload();
    });

    document.getElementById('hosted-projects-prev-btn')?.addEventListener('click', () => {
      requestGalleryPageChange(() => {
        galleryState.currentPage = Math.max(1, galleryState.currentPage - 1);
        galleryState.viewAll = false;
      });
    });

    document.getElementById('hosted-projects-next-btn')?.addEventListener('click', () => {
      requestGalleryPageChange(() => {
        const totalPages = Math.ceil(galleryState.projects.length / PAGE_SIZE);
        galleryState.currentPage = Math.min(totalPages, galleryState.currentPage + 1);
        galleryState.viewAll = false;
      });
    });

    document.getElementById('hosted-projects-view-all-btn')?.addEventListener('click', () => {
      requestGalleryPageChange(() => {
        galleryState.viewAll = true;
      });
    });

    document.getElementById('hosted-projects-show-pages-btn')?.addEventListener('click', () => {
      requestGalleryPageChange(() => {
        galleryState.viewAll = false;
        galleryState.currentPage = 1;
      });
    });

    root.querySelectorAll('.hosted-project-qr-fullscreen-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.projectIndex);
        const project = projects[idx];
        if (!project) return;
        const tourUrl =
          project.tourUrl ||
          (project.hostedPath ? `/hosted/${project.hostedPath}/index.html` : '');
        const qrUrl =
          project.qrUrl ||
          (project.hostedPath
            ? `/hosted/${project.hostedPath}/qr.png`
            : tourUrl.replace(/index\.html(\?.*)?$/i, 'qr.png'));
        if (!qrUrl) return;
        showQrFullscreen({
          title: project.title || 'Hosted project',
          qrUrl,
        });
      });
    });
  }

  function renderProjectListView() {
    const { root, classSlug, payload, projects } = galleryState;
    const pageTitle = payload.pageTitle || featuredHostedPagesTitle(payload.className);
    const view = getPaginationView(galleryState);
    const paginationHtml = renderPaginationControls(view);

    const cards =
      projects.length > 0
        ? view.items
            .map((project, index) => renderProjectCard(project, view.startIndex + index))
            .join('')
        : '<p class="hosted-projects-empty">No featured hosted projects are available for this class yet.</p>';

    root.innerHTML = `
      <div class="hosted-projects-list-wrap">
        <div class="hosted-projects-list-header">
          <div>
            <div class="hosted-projects-brand">WebXRIDE</div>
            <h1>${escapeHtml(pageTitle)}</h1>
            <p>${escapeHtml(HOSTED_GALLERY_PRIVACY_NOTE)}</p>
          </div>
          <button type="button" class="hosted-projects-btn hosted-projects-btn-secondary" id="hosted-projects-lock-btn">
            Lock gallery
          </button>
        </div>
        <div class="hosted-projects-grid" id="hosted-projects-grid">${cards}</div>
        ${paginationHtml}
        <p class="hosted-projects-footer">
          <a href="/index.html">Back to WebXRIDE editor</a>
        </p>
      </div>`;

    bindProjectListInteractions(root);

    if (galleryState._scrollOnRender) {
      galleryState._scrollOnRender = false;
      document.getElementById('hosted-projects-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderProjectList(root, classSlug, payload) {
    galleryState = {
      root,
      classSlug,
      payload,
      projects: payload.projects || [],
      viewAll: false,
      currentPage: 1,
      _scrollOnRender: false,
    };
    renderProjectListView();
  }

  function requestGalleryPageChange(updateFn) {
    updateFn();
    galleryState._scrollOnRender = true;
    renderProjectListView();
  }

  function getClassSlugFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] === 'hosted-projects.html') {
      return decodeURIComponent(parts[parts.length - 2]);
    }
    return null;
  }

  function apiBase(classSlug) {
    return `/api/classes/${encodeURIComponent(classSlug)}/hosted-projects`;
  }

  async function fetchGate(classSlug) {
    const res = await fetch(`${apiBase(classSlug)}/gate`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Could not load gallery (${res.status})`);
    }
    return data;
  }

  async function verifyPassword(classSlug, password) {
    const res = await fetch(`${apiBase(classSlug)}/verify-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Incorrect password');
    }
    return data;
  }

  async function lockGallery(classSlug) {
    await fetch(`${apiBase(classSlug)}/lock`, {
      method: 'POST',
      credentials: 'include',
    });
  }

  async function fetchProjects(classSlug) {
    const res = await fetch(`${apiBase(classSlug)}/list`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return { needsPassword: true };
    }
    if (!res.ok) {
      throw new Error(data.message || `Could not load projects (${res.status})`);
    }
    return { needsPassword: false, data };
  }

  function renderMissingClassUrl(root) {
    root.innerHTML = `
      <div class="hosted-projects-shell">
        <div class="hosted-projects-card">
          <div class="hosted-projects-brand">WebXRIDE</div>
          <h1>Featured Hosted Pages</h1>
          <p class="hosted-projects-lead">
            Open your class gallery at
            <code>/{class-slug}/hosted-projects.html</code>
            — ask your teacher for the link and classroom password.
          </p>
          <p class="hosted-projects-footer" style="margin-top:20px;">
            <a href="/index.html">Back to editor</a>
          </p>
        </div>
      </div>`;
  }

  function renderPasswordGate(root, gate, onSubmit) {
    const cls = gate.class || {};
    const pageTitle = gate.pageTitle || featuredHostedPagesTitle(cls.name);
    root.innerHTML = `
      <div class="hosted-projects-shell">
        <div class="hosted-projects-card">
          <div class="hosted-projects-brand">WebXRIDE</div>
          <h1>${escapeHtml(pageTitle)}</h1>
          <p class="hosted-projects-lead">
            Enter the classroom password to view featured hosted immersive projects for this class.
            This page is for viewing only — open a project to explore it in your browser.
          </p>
          <p class="hosted-projects-lead hosted-projects-privacy-note">
            ${escapeHtml(HOSTED_GALLERY_PRIVACY_NOTE)}
          </p>
          ${
            cls.description
              ? `<p class="hosted-projects-lead">${escapeHtml(cls.description)}</p>`
              : ''
          }
          <form id="hosted-projects-password-form">
            <div class="hosted-projects-field">
              <label for="hosted-projects-password">Classroom password</label>
              <input
                id="hosted-projects-password"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <div class="hosted-projects-actions">
              <button type="submit" class="hosted-projects-btn hosted-projects-btn-primary" id="hosted-projects-enter-btn">
                View projects
              </button>
              <a href="/index.html" class="hosted-projects-btn hosted-projects-btn-secondary">Back to editor</a>
            </div>
            <div id="hosted-projects-status" class="hosted-projects-status" style="display:none;"></div>
          </form>
        </div>
      </div>`;

    const form = document.getElementById('hosted-projects-password-form');
    const status = document.getElementById('hosted-projects-status');
    const input = document.getElementById('hosted-projects-password');
    const btn = document.getElementById('hosted-projects-enter-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.style.display = 'none';
      btn.disabled = true;
      try {
        await onSubmit(input.value);
      } catch (err) {
        status.textContent = err.message || 'Could not verify password';
        status.className = 'hosted-projects-status error';
        status.style.display = 'block';
        btn.disabled = false;
      }
    });
  }

  function showQrFullscreen({ title, qrUrl }) {
    let overlay = document.getElementById('hosted-project-qr-fullscreen');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hosted-project-qr-fullscreen';
      overlay.className = 'hosted-project-qr-fullscreen';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="hosted-project-qr-fullscreen-panel" role="dialog" aria-modal="true" aria-labelledby="hosted-qr-fullscreen-title">
        <div class="hosted-projects-brand">WebXRIDE</div>
        <h2 id="hosted-qr-fullscreen-title">${escapeHtml(title || 'Hosted project')}</h2>
        <p class="hosted-project-qr-fullscreen-lead">Scan this code to open the tour on your phone.</p>
        <img
          class="hosted-project-qr-fullscreen-image"
          src="${escapeHtml(qrUrl)}"
          alt="QR code to open ${escapeHtml(title || 'this project')} on your phone"
        />
        <button type="button" class="hosted-projects-btn hosted-projects-btn-secondary" id="hosted-qr-fullscreen-back">
          Back to List
        </button>
      </div>`;

    overlay.classList.add('visible');
    document.body.classList.add('hosted-qr-fullscreen-open');

    const close = () => {
      overlay.classList.remove('visible');
      document.body.classList.remove('hosted-qr-fullscreen-open');
    };

    overlay.querySelector('#hosted-qr-fullscreen-back')?.addEventListener('click', close, { once: true });
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  async function boot() {
    const root = document.getElementById('hosted-projects-app');
    if (!root) return;

    const classSlug = getClassSlugFromPath();
    if (!classSlug) {
      renderMissingClassUrl(root);
      return;
    }

    try {
      const gate = await fetchGate(classSlug);
      document.title = `${gate.pageTitle || featuredHostedPagesTitle(gate.class?.name)} — WebXRIDE`;
      const listResult = await fetchProjects(classSlug);

      if (!listResult.needsPassword) {
        renderProjectList(root, classSlug, listResult.data);
        return;
      }

      if (gate.authenticated) {
        const retry = await fetchProjects(classSlug);
        if (!retry.needsPassword) {
          renderProjectList(root, classSlug, retry.data);
          return;
        }
      }

      renderPasswordGate(root, gate, async (password) => {
        await verifyPassword(classSlug, password);
        const loaded = await fetchProjects(classSlug);
        if (loaded.needsPassword) {
          throw new Error('Password accepted but access was not granted. Try again.');
        }
        renderProjectList(root, classSlug, loaded.data);
      });
    } catch (err) {
      root.innerHTML = `
        <div class="hosted-projects-shell">
          <div class="hosted-projects-card">
            <div class="hosted-projects-brand">WebXRIDE</div>
            <h1>Featured Hosted Pages</h1>
            <p class="hosted-projects-status error">${escapeHtml(err.message || 'Something went wrong')}</p>
            <p class="hosted-projects-footer" style="margin-top:20px;">
              <a href="/index.html">Back to editor</a>
            </p>
          </div>
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
