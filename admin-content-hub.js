/**
 * Content Hub UI — embedded in Assets page (admin-common-assets.html).
 */
const ADMIN_CONTENT_CLASS_ID = '__admin__';

const ContentHub = {
  root: null,
  pendingDelete: null,
  expandedProjects: new Set(),
  contentItems: [],
  bound: false,
  filtersLoaded: false,

  escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  $(id) {
    return this.root ? this.root.querySelector(`#${id}`) : null;
  },

  typeLabel(type) {
    const labels = {
      project: 'VR Project',
      flat_page: 'Flat Page',
      vr_tour: 'VR Tour',
      asset: 'Student Asset',
      orphan_asset: 'Orphaned Asset',
      legacy_submission: 'Legacy B2',
      hosted_submission: 'Hosted',
      common_asset: 'Shared Online Asset',
    };
    return labels[type] || type;
  },

  formatLinks(links) {
    if (!links) return '—';
    const parts = [];
    if (links.tourUrl) parts.push(`<a href="${this.escapeHtml(links.tourUrl)}" target="_blank" rel="noopener">Tour</a>`);
    if (links.flatUrl) parts.push(`<a href="${this.escapeHtml(links.flatUrl)}" target="_blank" rel="noopener">Flat</a>`);
    if (links.previewUrl) parts.push(`<a href="${this.escapeHtml(links.previewUrl)}" target="_blank" rel="noopener">Preview</a>`);
    if (links.downloadUrl) parts.push(`<a href="${this.escapeHtml(links.downloadUrl)}" target="_blank" rel="noopener">Download</a>`);
    if (links.qrUrl) parts.push(`<a href="${this.escapeHtml(links.qrUrl)}" target="_blank" rel="noopener">QR</a>`);
    return parts.length ? `<div class="links">${parts.join(' ')}</div>` : '—';
  },

  buildQueryParams() {
    const params = new URLSearchParams();
    const classId = this.$('ch-filter-class')?.value;
    const studentId = this.$('ch-filter-student')?.value;
    const type = this.$('ch-filter-type')?.value;
    const orphaned = this.$('ch-filter-orphaned')?.checked;
    const q = this.$('ch-filter-q')?.value?.trim();
    if (classId) params.set('classId', classId);
    if (studentId && classId !== ADMIN_CONTENT_CLASS_ID) params.set('studentId', studentId);
    if (type) params.set('type', type);
    if (orphaned && classId !== ADMIN_CONTENT_CLASS_ID) params.set('orphaned', '1');
    if (q) params.set('q', q);
    return params;
  },

  onClassFilterChange() {
    const classSel = this.$('ch-filter-class');
    const studentSel = this.$('ch-filter-student');
    const orphanCb = this.$('ch-filter-orphaned');
    if (!classSel || !studentSel) return;

    const isAdmin = classSel.value === ADMIN_CONTENT_CLASS_ID;
    studentSel.innerHTML = '<option value="">All students</option>';
    studentSel.disabled = isAdmin;
    if (isAdmin) {
      studentSel.innerHTML = '<option value="">—</option>';
      if (orphanCb) {
        orphanCb.checked = false;
        orphanCb.disabled = true;
      }
      return;
    }
    if (orphanCb) orphanCb.disabled = false;
  },

  async loadSummary() {
    const params = this.buildQueryParams();
    const res = await adminFetch('/admin/content/summary?' + params.toString());
    const data = await res.json();
    if (!data.success) return;
    const chips = this.$('ch-summary-chips');
    if (!chips) return;
    const s = data.summary || {};
    chips.innerHTML = [
      `<span class="chip"><strong>${s.total || 0}</strong> total</span>`,
      `<span class="chip">${s.project || 0} projects</span>`,
      `<span class="chip">${s.flat_page || 0} flat pages</span>`,
      `<span class="chip">${s.vr_tour || 0} VR tours</span>`,
      `<span class="chip">${s.asset || 0} student assets</span>`,
      `<span class="chip">${s.common_asset || 0} shared assets</span>`,
      `<span class="chip">${s.orphan_asset || 0} orphaned</span>`,
      `<span class="chip">${s.legacy_submission || 0} legacy B2</span>`,
    ].join('');
  },

  async loadContent() {
    const container = this.$('ch-content-list');
    if (!container) return;
    container.textContent = 'Loading…';
    try {
      const params = this.buildQueryParams();
      params.set('limit', '100');
      const res = await adminFetch('/admin/content?' + params.toString());
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Load failed');

      await this.loadSummary();

      if (!data.items?.length) {
        container.innerHTML = '<p>No content found.</p>';
        this.contentItems = [];
        return;
      }

      this.contentItems = data.items;

      const rows = data.items
        .map((item, idx) => {
          const expandBtn =
            item.type === 'project'
              ? `<button type="button" class="btn-secondary btn-sm" onclick="ContentHub.toggleVersions('${item.id}')">${this.expandedProjects.has(item.id) ? '▼' : '▶'} ${item.versionCount || 0} versions</button>`
              : '';
          const deleteBtn = `<button type="button" class="btn-danger btn-sm" onclick="ContentHub.confirmDeleteByIndex(${idx})">Delete</button>`;
          const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
          return `<tr>
          <td>${this.escapeHtml(item.studentName || '—')}<br><small>${this.escapeHtml(item.className || '')}</small></td>
          <td><span class="type-badge type-${this.escapeHtml(item.type)}">${this.typeLabel(item.type)}</span></td>
          <td>${this.escapeHtml(item.title)}</td>
          <td>${this.formatLinks(item.links)}</td>
          <td>${this.escapeHtml(updated)}</td>
          <td>${expandBtn} ${deleteBtn}</td>
        </tr>
        ${item.type === 'project' && this.expandedProjects.has(item.id) ? `<tr class="version-row" id="ch-versions-${this.escapeHtml(item.id)}"><td colspan="6">Loading versions…</td></tr>` : ''}`;
        })
        .join('');

      container.innerHTML = `<table class="content-table">
      <thead><tr><th>Owner</th><th>Type</th><th>Title</th><th>Links</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="color:#666;font-size:13px;">Showing ${data.items.length} of ${data.total} items</p>`;

      for (const item of data.items) {
        if (item.type === 'project' && this.expandedProjects.has(item.id)) {
          this.loadVersions(item.id);
        }
      }
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        location.reload();
        return;
      }
      container.innerHTML = `<p style="color:#c00;">Error: ${this.escapeHtml(err.message)}</p>`;
    }
  },

  async loadVersions(threadId) {
    const row = document.getElementById('ch-versions-' + threadId);
    if (!row) return;
    try {
      const res = await adminFetch('/admin/content/project/' + encodeURIComponent(threadId) + '/versions');
      const data = await res.json();
      if (!data.success || !data.versions?.length) {
        row.innerHTML = '<td colspan="6">No versions.</td>';
        return;
      }
      row.innerHTML = `<td colspan="6"><table style="width:100%;font-size:13px;">
      <thead><tr><th>#</th><th>Kind</th><th>Date</th><th>Notes</th><th>Actions</th></tr></thead>
      <tbody>${data.versions
        .map(
          (v) => `<tr>
            <td>v${v.versionNumber}</td>
            <td>${this.escapeHtml(v.kind)}</td>
            <td>${this.escapeHtml(new Date(v.submittedAt || v.createdAt).toLocaleString())}</td>
            <td>${this.escapeHtml(v.studentNote || v.adminNote || '')}</td>
            <td>
              <a href="/admin/versions/${encodeURIComponent(v.id)}/download">Download</a>
              <a href="/index.html?adminReview=1&versionId=${encodeURIComponent(v.id)}">Review</a>
            </td>
          </tr>`
        )
        .join('')}</tbody></table></td>`;
    } catch (err) {
      row.innerHTML = `<td colspan="6">Error loading versions: ${this.escapeHtml(err.message)}</td>`;
    }
  },

  toggleVersions(threadId) {
    if (this.expandedProjects.has(threadId)) this.expandedProjects.delete(threadId);
    else this.expandedProjects.add(threadId);
    this.loadContent();
  },

  async confirmDelete(item) {
    if (!item) return;
    this.pendingDelete = item;
    const params = new URLSearchParams();
    params.set('dryRun', '1');
    if (item.studentId) params.set('studentId', item.studentId);
    if (item.slug) params.set('slug', item.slug);
    if (item.category) params.set('category', item.category);
    if (item.filename) params.set('filename', item.filename);
    if (item.type === 'legacy_submission') params.set('fileName', item.id);

    const res = await adminFetch(
      `/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}?` + params.toString(),
      { method: 'DELETE' }
    );
    const data = await res.json();
    const manifest = data.manifest || {};
    const modal = document.getElementById('ch-delete-modal');
    document.getElementById('ch-delete-modal-title').textContent = `Delete ${this.typeLabel(item.type)}?`;
    document.getElementById('ch-delete-modal-note').textContent =
      item.type === 'project'
        ? 'This removes all versions, cloud ZIPs, and hosted copies. My Assets uploads will be kept.'
        : 'This permanently removes the selected content and related storage.';
    document.getElementById('ch-delete-modal-manifest').textContent = JSON.stringify(
      manifest.willRemove || manifest,
      null,
      2
    );
    if (modal) modal.style.display = 'flex';
  },

  confirmDeleteByIndex(idx) {
    this.confirmDelete(this.contentItems[idx]);
  },

  async executeDelete() {
    if (!this.pendingDelete) return;
    const item = this.pendingDelete;
    const body = {};
    if (item.studentId) body.studentId = item.studentId;
    if (item.slug) body.slug = item.slug;
    if (item.category) body.category = item.category;
    if (item.filename) body.filename = item.filename;
    if (item.type === 'legacy_submission') body.fileName = item.id;

    const res = await adminFetch(
      `/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await res.json();
    const modal = document.getElementById('ch-delete-modal');
    if (modal) modal.style.display = 'none';
    this.pendingDelete = null;
    if (!data.success) {
      alert(data.message || 'Delete failed');
      return;
    }
    this.loadContent();
    if (typeof window.refreshAssetsAfterContentDelete === 'function') {
      window.refreshAssetsAfterContentDelete(item);
    }
  },

  async loadClassesAndStudents() {
    if (this.filtersLoaded) return;
    try {
      const res = await adminFetch('/api/classes');
      const classes = await res.json();
      const classSel = this.$('ch-filter-class');
      const studentSel = this.$('ch-filter-student');
      if (!classSel || !studentSel) return;

      const adminOpt = document.createElement('option');
      adminOpt.value = ADMIN_CONTENT_CLASS_ID;
      adminOpt.textContent = 'Admin Content';
      classSel.appendChild(adminOpt);

      classes.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        classSel.appendChild(opt);
      });

      classSel.addEventListener('change', async () => {
        this.onClassFilterChange();
        const classId = classSel.value;
        if (classId === ADMIN_CONTENT_CLASS_ID) {
          await this.loadContent();
          return;
        }
        if (!classId) return;
        const sRes = await adminFetch(`/api/classes/${classId}/students`);
        const students = await sRes.json();
        students.forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.displayName || s.display_name;
          studentSel.appendChild(opt);
        });
      });
      this.filtersLoaded = true;
    } catch (err) {
      console.warn('Could not load content hub filters:', err);
    }
  },

  applyUrlPresets() {
    const urlParams = new URLSearchParams(window.location.search);
    const presetStudent = urlParams.get('studentId');
    const presetClass = urlParams.get('classId');
    const presetOrphaned = urlParams.get('orphaned');
    const classSel = this.$('ch-filter-class');
    const studentSel = this.$('ch-filter-student');
    if (presetClass && classSel) {
      classSel.value = presetClass;
      this.onClassFilterChange();
      if (presetClass !== ADMIN_CONTENT_CLASS_ID) {
        classSel.dispatchEvent(new Event('change'));
      }
    }
    if (presetStudent && studentSel) {
      setTimeout(() => {
        studentSel.value = presetStudent;
      }, 300);
    }
    if (presetOrphaned === '1') {
      const orphanCb = this.$('ch-filter-orphaned');
      if (orphanCb) orphanCb.checked = true;
    }
  },

  bindEvents() {
    if (this.bound) return;
    this.bound = true;
    this.$('ch-apply-filters')?.addEventListener('click', () => this.loadContent());
    document.getElementById('ch-delete-confirm-btn')?.addEventListener('click', () => this.executeDelete());
    document.getElementById('ch-delete-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('ch-delete-modal').style.display = 'none';
      this.pendingDelete = null;
    });
    document.getElementById('content-hub-back-btn')?.addEventListener('click', () => this.close());
  },

  async open(options = {}) {
    this.root = document.getElementById('content-hub-view');
    const library = document.getElementById('assets-library-view');
    if (!this.root || !library) return;

    library.style.display = 'none';
    this.root.style.display = 'block';

    this.bindEvents();
    if (!this.filtersLoaded) {
      await this.loadClassesAndStudents();
    }
    if (options.studentId || options.classId || options.orphaned) {
      const url = new URL(window.location.href);
      if (options.studentId) url.searchParams.set('studentId', options.studentId);
      if (options.classId) url.searchParams.set('classId', options.classId);
      if (options.orphaned) url.searchParams.set('orphaned', '1');
      window.history.replaceState({}, '', url.pathname + url.search);
      this.applyUrlPresets();
    } else {
      this.applyUrlPresets();
    }
    await this.loadContent();
  },

  close() {
    const library = document.getElementById('assets-library-view');
    const hub = document.getElementById('content-hub-view');
    if (library) library.style.display = 'block';
    if (hub) hub.style.display = 'none';
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    url.searchParams.delete('studentId');
    url.searchParams.delete('classId');
    url.searchParams.delete('orphaned');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  },

  async init() {
    this.root = document.getElementById('content-hub-view');
    this.bindEvents();
    await this.loadClassesAndStudents();
    if (new URLSearchParams(window.location.search).get('view') === 'content') {
      await this.open();
    }
  },
};

window.ContentHub = ContentHub;
