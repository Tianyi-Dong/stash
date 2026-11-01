// Stash Web App (local-first, backed by the Tauri Rust commands in src-tauri/)
const invoke = window.__TAURI__.core.invoke;

// window.prompt() is not reliably supported in the Tauri/WebKit webview (it
// returns immediately with no dialog shown). This in-app modal replaces
// prompt/confirm/alert everywhere in this file so those flows actually work.
// mode: 'alert' (message, OK only), 'confirm' (message, OK/Cancel),
// 'prompt' (text input, OK/Cancel).
function showDialog({ title, message, mode = 'alert', defaultValue = '', placeholder = '', confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('dialog-modal');
    const titleEl = document.getElementById('dialog-title');
    const messageEl = document.getElementById('dialog-message');
    const inputEl = document.getElementById('dialog-input');
    const confirmBtn = document.getElementById('dialog-confirm');
    const cancelBtn = document.getElementById('dialog-cancel');
    const overlay = document.getElementById('dialog-overlay');

    titleEl.textContent = title;

    if (message) {
      messageEl.textContent = message;
      messageEl.classList.remove('hidden');
    } else {
      messageEl.classList.add('hidden');
    }

    if (mode === 'prompt') {
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
      inputEl.classList.remove('hidden');
    } else {
      inputEl.classList.add('hidden');
    }

    cancelBtn.classList.toggle('hidden', mode === 'alert');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle('danger', danger);

    modal.classList.remove('hidden');
    if (mode === 'prompt') {
      requestAnimationFrame(() => inputEl.focus());
    } else {
      confirmBtn.focus();
    }

    function cleanup(result) {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm() {
      cleanup(mode === 'prompt' ? (inputEl.value.trim() || null) : true);
    }
    function onCancel() {
      cleanup(mode === 'prompt' ? null : false);
    }
    function onKeydown(e) {
      if (e.key === 'Enter' && document.activeElement !== cancelBtn) onConfirm();
      if (e.key === 'Escape') onCancel();
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeydown);
  });
}

class StashApp {
  constructor() {
    this.currentView = 'all';
    this.currentFolderId = null;
    this.currentTagId = null;
    this.currentSave = null;
    this.saves = [];
    this.tags = [];
    this.folders = [];
    this.unreadOnly = false;
    this.init();
  }

  async init() {
    this.loadTheme();
    this.bindEvents();
    this.loadData();
  }

  // Theme Management
  loadTheme() {
    const savedTheme = localStorage.getItem('stash-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeToggle(savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('stash-theme', newTheme);
    this.updateThemeToggle(newTheme);
  }

  updateThemeToggle(theme) {
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    const label = document.querySelector('.theme-label');

    if (theme === 'dark') {
      sunIcon?.classList.add('hidden');
      moonIcon?.classList.remove('hidden');
      if (label) label.textContent = 'Light Mode';
    } else {
      sunIcon?.classList.remove('hidden');
      moonIcon?.classList.add('hidden');
      if (label) label.textContent = 'Dark Mode';
    }
  }

  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        this.setView(view);
      });
    });

    // Folder navigation (event delegation: folders list is re-rendered)
    document.getElementById('folders-list').addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item[data-folder]');
      if (item) {
        e.preventDefault();
        this.setFolderView(item.dataset.folder);
      }
    });

    // Search
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.search(e.target.value);
      }, 300);
    });

    // Sort
    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.loadSaves();
    });

    // Unread-only filter
    document.getElementById('unread-only-toggle').addEventListener('change', (e) => {
      this.unreadOnly = e.target.checked;
      this.loadSaves();
    });

    // Reading pane
    document.getElementById('close-reading-btn').addEventListener('click', () => {
      this.closeReadingPane();
    });

    document.getElementById('archive-btn').addEventListener('click', () => {
      this.toggleArchive();
    });

    document.getElementById('favorite-btn').addEventListener('click', () => {
      this.toggleFavorite();
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
      this.deleteSave();
    });

    document.getElementById('add-tag-btn').addEventListener('click', () => {
      this.addTagToSave();
    });

    document.getElementById('reading-folder-select').addEventListener('change', (e) => {
      this.moveSaveToFolder(e.target.value || null);
    });

    // Mobile menu
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('open');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });

    // Close sidebar when nav item clicked on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          overlay.classList.remove('open');
        }
      });
    });

    // Add folder
    document.getElementById('add-folder-btn').addEventListener('click', () => {
      this.addFolder();
    });

    // Save article by pasting a URL
    document.getElementById('save-article-btn').addEventListener('click', () => {
      this.saveArticleFromUrl();
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Extension setup: show the local server token to paste into extension/config.js
    document.getElementById('extension-token-link').addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const token = await invoke('get_extension_token');
        showDialog({
          title: 'Connect Extension',
          message: `Paste this into extension/config.js as TOKEN:\n\n${token}\n\n` +
            `(SERVER_URL is already set to http://127.0.0.1:47615)`,
        });
      } catch (err) {
        console.error('Error fetching extension token:', err);
        showDialog({ title: 'Error', message: 'Could not read the extension token. Check the app logs.' });
      }
    });

    // Reading progress bar
    const readingContent = document.getElementById('reading-content');
    if (readingContent) {
      readingContent.addEventListener('scroll', () => {
        this.updateReadingProgress();
      });
    }

    // Maximize/restore the reading pane within the app window
    document.getElementById('maximize-btn').addEventListener('click', () => {
      document.getElementById('reading-pane').classList.toggle('maximized');
    });

    // Highlight tooltip: show on text selection inside reading-body
    const readingBody = document.getElementById('reading-body');
    const highlightTooltip = document.getElementById('highlight-tooltip');
    const highlightInitial = document.getElementById('highlight-save-btn');
    const highlightForm = document.getElementById('highlight-tooltip-form');

    const hideHighlightTooltip = () => {
      highlightTooltip?.classList.add('hidden');
      highlightForm?.classList.add('hidden');
      highlightInitial?.classList.remove('hidden');
      this.pendingHighlightText = null;
    };

    document.addEventListener('mouseup', (e) => {
      if (highlightTooltip && highlightTooltip.contains(e.target)) {
        // A click inside the tooltip (buttons, form fields) manages its own
        // state - don't let this handler re-evaluate the selection and
        // stomp on it mid-click.
        return;
      }
      if (!readingBody || !this.currentSave || this.currentSave.highlight) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 3) {
        hideHighlightTooltip();
        return;
      }
      if (!readingBody.contains(sel.anchorNode)) {
        hideHighlightTooltip();
        return;
      }
      this.pendingHighlightText = text;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      highlightTooltip.style.top = `${rect.top - 40}px`;
      highlightTooltip.style.left = `${rect.left + rect.width / 2}px`;
      highlightTooltip.classList.remove('hidden');
    });

    document.addEventListener('mousedown', (e) => {
      if (highlightTooltip && !highlightTooltip.contains(e.target)) {
        hideHighlightTooltip();
      }
    });

    // Click "Highlight" -> switch the tooltip into a note/tag form
    highlightInitial.addEventListener('click', () => {
      highlightInitial.classList.add('hidden');
      highlightForm.classList.remove('hidden');
      document.getElementById('highlight-note-input').focus();
    });

    document.getElementById('highlight-form-cancel').addEventListener('click', () => {
      window.getSelection()?.removeAllRanges();
      hideHighlightTooltip();
    });

    document.getElementById('highlight-form-save').addEventListener('click', () => {
      this.saveHighlightFromSelection();
    });

    // Notes save button
    document.getElementById('save-notes-btn').addEventListener('click', () => {
      this.saveHighlightNotes();
    });

  }

  async loadData() {
    await Promise.all([
      this.loadSaves(),
      this.loadTags(),
      this.loadFolders(),
    ]);
  }

  async loadSaves() {
    const container = document.getElementById('saves-container');
    const loading = document.getElementById('loading');
    const empty = document.getElementById('empty-state');

    loading.classList.remove('hidden');
    container.innerHTML = '';

    const sortValue = document.getElementById('sort-select').value;
    const [sortCol, direction] = sortValue.split('.');

    try {
      this.saves = await invoke('list_saves', {
        view: this.currentView,
        folderId: this.currentFolderId,
        tagId: this.currentTagId,
        sortCol,
        ascending: direction === 'asc',
        unreadOnly: this.unreadOnly,
      });
    } catch (err) {
      console.error('Error loading saves:', err);
      loading.classList.add('hidden');
      return;
    }

    loading.classList.add('hidden');

    if (this.saves.length === 0) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      this.renderSaves();
    }
  }

  renderSaves() {
    const container = document.getElementById('saves-container');

    container.innerHTML = this.saves.map(save => {
      const isHighlight = !!save.highlight;
      const date = new Date(save.created_at).toLocaleDateString();
      const tagList = save.tags || [];
      const tagsHtml = tagList.length > 0
        ? `<div class="save-card-tags">${tagList.map(t => `<span class="tag-pill tag-pill-small" data-tag-id="${t.id}">${this.escapeHtml(t.name)}</span>`).join('')}</div>`
        : '';

      if (isHighlight) {
        const parentLink = save.parent_save_id
          ? `<div class="save-card-parent" data-parent-id="${save.parent_save_id}">From article ↗</div>`
          : '';
        const notesHtml = save.notes
          ? `<div class="save-card-notes">${this.escapeHtml(save.notes)}</div>`
          : '';
        return `
          <div class="save-card highlight" data-id="${save.id}">
            <div class="save-card-content">
              <div class="save-card-site">${this.escapeHtml(save.site_name || '')}</div>
              ${parentLink}
              <div class="save-card-highlight">"${this.escapeHtml(save.highlight)}"</div>
              <div class="save-card-title">${this.escapeHtml(save.title || 'Untitled')}</div>
              ${notesHtml}
              ${tagsHtml}
              <div class="save-card-meta">
                <span class="save-card-date">${date}</span>
              </div>
            </div>
          </div>
        `;
      }

      const unreadBadge = !save.read_at ? '<span class="save-card-unread-badge">Unread</span>' : '';

      return `
        <div class="save-card" data-id="${save.id}">
          ${save.image_url ? `<img class="save-card-image" src="${save.image_url}" alt="" onerror="this.style.display='none'">` : ''}
          <div class="save-card-content">
            <div class="save-card-site">${this.escapeHtml(save.site_name || '')}</div>
            <div class="save-card-title">${this.escapeHtml(save.title || 'Untitled')}</div>
            <div class="save-card-excerpt">${this.escapeHtml(save.excerpt || '')}</div>
            ${tagsHtml}
            <div class="save-card-meta">
              <span class="save-card-date">${date}</span>
              ${unreadBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.save-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.tag-pill')) return;
        const id = card.dataset.id;
        const save = this.saves.find(s => s.id === id);
        if (save) this.openReadingPane(save);
      });
    });
    container.querySelectorAll('.tag-pill-small').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagId = el.dataset.tagId;
        if (tagId) this.setTagView(tagId);
      });
    });
    container.querySelectorAll('.save-card-parent').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openParentArticle(el.dataset.parentId);
      });
    });
  }

  async loadTags() {
    try {
      this.tags = await invoke('list_tags');
    } catch (err) {
      console.error('Error loading tags:', err);
      this.tags = [];
    }
    this.renderTags();
  }

  renderTags() {
    const container = document.getElementById('tags-list');
    container.innerHTML = this.tags.map(tag => `
      <span class="tag" data-id="${tag.id}">${this.escapeHtml(tag.name)}</span>
    `).join('');

    container.querySelectorAll('.tag').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const tagId = el.dataset.id;
        if (tagId) this.setTagView(tagId);
      });
    });
  }

  async loadFolders() {
    try {
      this.folders = await invoke('list_folders');
    } catch (err) {
      console.error('Error loading folders:', err);
      this.folders = [];
    }
    this.renderFolders();
  }

  renderFolders() {
    const container = document.getElementById('folders-list');
    container.innerHTML = this.folders.map(folder => `
      <a href="#" class="nav-item" data-folder="${folder.id}">
        <span style="color: ${folder.color}">📁</span>
        ${this.escapeHtml(folder.name)}
      </a>
    `).join('');
  }

  setView(view) {
    this.currentView = view;
    this.currentFolderId = null;
    this.currentTagId = null;

    // Update nav
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    document.querySelectorAll('.nav-item[data-folder]').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.tag[data-id]').forEach(el => {
      el.classList.remove('active');
    });

    // Update title
    const titles = {
      all: 'All Saves',
      highlights: 'Highlights',
      articles: 'Articles',
      favorites: 'Favorites',
      archived: 'Archived',
      stats: 'Stats',
    };
    document.getElementById('view-title').textContent = titles[view] || 'Saves';

    if (view === 'stats') {
      this.showStats();
    } else {
      this.loadSaves();
    }
  }

  setFolderView(folderId) {
    this.currentView = 'folder';
    this.currentFolderId = folderId;
    this.currentTagId = null;

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.nav-item[data-folder]').forEach(item => {
      item.classList.toggle('active', item.dataset.folder === folderId);
    });
    document.querySelectorAll('.tag[data-id]').forEach(el => {
      el.classList.remove('active');
    });

    const folder = this.folders.find(f => f.id === folderId);
    document.getElementById('view-title').textContent = folder ? folder.name : 'Folder';
    this.loadSaves();
  }

  setTagView(tagId) {
    this.currentView = 'tag';
    this.currentTagId = tagId;
    this.currentFolderId = null;

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.nav-item[data-folder]').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.tag[data-id]').forEach(el => {
      el.classList.toggle('active', el.dataset.id === tagId);
    });

    const tag = this.tags.find(t => t.id === tagId);
    document.getElementById('view-title').textContent = tag ? `Tag: ${tag.name}` : 'Tag';
    this.loadSaves();
  }

  async search(query) {
    if (!query.trim()) {
      this.loadSaves();
      return;
    }

    try {
      this.saves = await invoke('search_saves', { query });
    } catch (err) {
      console.error('Error searching saves:', err);
      this.saves = [];
    }
    this.renderSaves();
  }

  openReadingPane(save) {
    this.currentSave = save;
    const pane = document.getElementById('reading-pane');

    document.getElementById('highlight-tooltip')?.classList.add('hidden');
    document.getElementById('highlight-tooltip-form')?.classList.add('hidden');
    document.getElementById('highlight-save-btn')?.classList.remove('hidden');
    this.pendingHighlightText = null;

    document.getElementById('reading-title').textContent = save.title || 'Untitled';
    document.getElementById('reading-meta').innerHTML = `
      ${save.site_name || ''} ${save.author ? `· ${save.author}` : ''} · ${new Date(save.created_at).toLocaleDateString()}
    `;

    // Parent article link (for highlights created from within an article)
    const parentLinkEl = document.getElementById('reading-parent-link');
    if (save.highlight && save.parent_save_id) {
      parentLinkEl.innerHTML = `From: <a href="#" id="goto-parent-article">View original article</a>`;
      parentLinkEl.classList.remove('hidden');
      document.getElementById('goto-parent-article').addEventListener('click', (e) => {
        e.preventDefault();
        this.openParentArticle(save.parent_save_id);
      });
    } else {
      parentLinkEl.classList.add('hidden');
      parentLinkEl.innerHTML = '';
    }

    if (save.highlight) {
      document.getElementById('reading-body').innerHTML = `
        <blockquote style="font-style: italic; background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          "${this.escapeHtml(save.highlight)}"
        </blockquote>
        <p><a href="${save.url}" target="_blank" style="color: var(--primary);">View original →</a></p>
      `;
    } else {
      const content = save.content || save.excerpt || 'No content available.';
      document.getElementById('reading-body').innerHTML = this.renderMarkdown(content);

      // Short articles that fit without scrolling would never fire a
      // 'scroll' event, so they'd never get auto-marked as read - check
      // once layout has settled.
      requestAnimationFrame(() => {
        const readingContent = document.getElementById('reading-content');
        if (readingContent && readingContent.scrollHeight <= readingContent.clientHeight) {
          this.markCurrentSaveRead();
        }
      });
    }

    document.getElementById('open-original-btn').href = save.url || '#';

    this.renderReadingPaneTags(save.tags || []);

    // Notes section (only for highlights)
    const notesSection = document.getElementById('reading-notes');
    if (save.highlight) {
      notesSection.classList.remove('hidden');
      document.getElementById('reading-notes-input').value = save.notes || '';
    } else {
      notesSection.classList.add('hidden');
    }

    // Highlights list (only for articles, not for highlight saves)
    const highlightsSection = document.getElementById('reading-highlights-section');
    if (!save.highlight) {
      this.loadArticleHighlights(save.id);
    } else {
      highlightsSection.classList.add('hidden');
    }

    const folderSelect = document.getElementById('reading-folder-select');
    folderSelect.innerHTML = '<option value="">No folder</option>' + this.folders.map(f =>
      `<option value="${f.id}" ${save.folder_id === f.id ? 'selected' : ''}>${this.escapeHtml(f.name)}</option>`
    ).join('');
    folderSelect.value = save.folder_id || '';

    document.getElementById('archive-btn').classList.toggle('active', save.is_archived);
    document.getElementById('favorite-btn').classList.toggle('active', save.is_favorite);

    pane.classList.remove('hidden');
    requestAnimationFrame(() => {
      pane.classList.add('open');
    });
  }

  closeReadingPane() {
    const pane = document.getElementById('reading-pane');
    pane.classList.remove('open');
    pane.classList.remove('maximized');
    const progressFill = document.getElementById('reading-progress-fill');
    if (progressFill) progressFill.style.width = '0%';
    document.getElementById('highlight-tooltip')?.classList.add('hidden');
    document.getElementById('highlight-tooltip-form')?.classList.add('hidden');
    document.getElementById('highlight-save-btn')?.classList.remove('hidden');
    this.pendingHighlightText = null;
    setTimeout(() => {
      if (!pane.classList.contains('open')) {
        pane.classList.add('hidden');
      }
    }, 300);
    this.currentSave = null;
  }

  // Reading Progress Bar
  updateReadingProgress() {
    const readingContent = document.getElementById('reading-content');
    const progressFill = document.getElementById('reading-progress-fill');

    if (!readingContent || !progressFill) return;

    const scrollTop = readingContent.scrollTop;
    const scrollHeight = readingContent.scrollHeight - readingContent.clientHeight;

    if (scrollHeight > 0) {
      const progress = (scrollTop / scrollHeight) * 100;
      progressFill.style.width = `${Math.min(progress, 100)}%`;
      if (progress >= 97) {
        this.markCurrentSaveRead();
      }
    }
  }

  // Marks the currently-open article as read (idempotent - a no-op once
  // already read, so repeated scroll events don't spam the backend).
  async markCurrentSaveRead() {
    if (!this.currentSave || this.currentSave.highlight || this.currentSave.read_at) return;

    const readAt = new Date().toISOString();
    this.currentSave.read_at = readAt;

    try {
      await invoke('set_read', { id: this.currentSave.id, value: true });
    } catch (err) {
      console.error('Error marking save as read:', err);
      this.currentSave.read_at = null;
      return;
    }

    const cached = this.saves.find(s => s.id === this.currentSave.id);
    if (cached) cached.read_at = readAt;

    if (this.unreadOnly) {
      this.loadSaves();
    } else {
      this.renderSaves();
    }
  }

  async toggleArchive() {
    if (!this.currentSave) return;

    const newValue = !this.currentSave.is_archived;
    try {
      await invoke('set_archived', { id: this.currentSave.id, value: newValue });
    } catch (err) {
      console.error('Error toggling archive:', err);
      return;
    }

    this.currentSave.is_archived = newValue;
    this.loadSaves();
    if (newValue) this.closeReadingPane();
  }

  async toggleFavorite() {
    if (!this.currentSave) return;

    const newValue = !this.currentSave.is_favorite;
    try {
      await invoke('set_favorite', { id: this.currentSave.id, value: newValue });
    } catch (err) {
      console.error('Error toggling favorite:', err);
      return;
    }

    this.currentSave.is_favorite = newValue;
    document.getElementById('favorite-btn').classList.toggle('active', newValue);
  }

  async deleteSave() {
    if (!this.currentSave) return;

    const ok = await showDialog({
      title: 'Delete this save?',
      message: 'This cannot be undone.',
      mode: 'confirm',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await invoke('delete_save', { id: this.currentSave.id });
    } catch (err) {
      console.error('Error deleting save:', err);
      return;
    }

    this.closeReadingPane();
    this.loadSaves();
  }

  async moveSaveToFolder(folderId) {
    if (!this.currentSave) return;

    const newFolderId = folderId || null;
    try {
      await invoke('set_folder', { id: this.currentSave.id, folderId: newFolderId });
    } catch (err) {
      console.error('Error moving save to folder:', err);
      return;
    }

    this.currentSave.folder_id = newFolderId;
    if (this.currentView === 'folder') {
      this.loadSaves();
    }
  }

  renderReadingPaneTags(tags) {
    const container = document.getElementById('reading-tags-list');
    if (!container) return;
    if (!tags || tags.length === 0) {
      container.innerHTML = '<span class="reading-tags-empty">No tags</span>';
      return;
    }
    container.innerHTML = tags.map(tag => `
      <span class="tag-pill" data-tag-id="${tag.id}">${this.escapeHtml(tag.name)}</span>
    `).join('');
    container.querySelectorAll('.tag-pill').forEach(el => {
      el.addEventListener('click', () => {
        const tagId = el.dataset.tagId;
        if (tagId) this.setTagView(tagId);
      });
    });
  }

  async addTagToSave() {
    if (!this.currentSave) return;

    const tagName = await showDialog({ title: 'Add Tag', mode: 'prompt', placeholder: 'Tag name' });
    if (!tagName) return;

    try {
      const tags = await invoke('add_tag_to_save', {
        saveId: this.currentSave.id,
        tagName,
      });
      this.currentSave.tags = tags;
      this.renderReadingPaneTags(tags);
      this.loadTags();
    } catch (err) {
      console.error('Error adding tag:', err);
    }
  }

  async addFolder() {
    const name = await showDialog({ title: 'New Folder', mode: 'prompt', placeholder: 'Folder name' });
    if (!name) return;

    try {
      await invoke('create_folder', { name });
    } catch (err) {
      console.error('Error creating folder:', err);
      return;
    }

    this.loadFolders();
  }

  async saveArticleFromUrl() {
    let url = await showDialog({ title: 'Save Article', mode: 'prompt', placeholder: 'Paste a URL to save' });
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const btn = document.getElementById('save-article-btn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const page = await invoke('fetch_html', { url });
      const parsed = extractArticleFromHtml(page.html, page.url);

      await invoke('create_save', {
        input: {
          url: page.url,
          title: parsed.title,
          excerpt: parsed.excerpt,
          content: parsed.content,
          site_name: parsed.siteName,
          author: parsed.author,
          published_at: parsed.publishedAt,
          image_url: parsed.imageUrl,
          source: 'app',
        },
      });

      if (this.currentView !== 'stats') {
        this.loadSaves();
      }
    } catch (err) {
      console.error('Error saving article:', err);
      showDialog({ title: 'Could not save that URL', message: String(err) });
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async showStats() {
    let stats;
    try {
      stats = await invoke('get_stats');
    } catch (err) {
      console.error('Error loading stats:', err);
      return;
    }

    const monthLabel = (ym) => {
      const [year, month] = ym.split('-').map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    };

    const content = document.querySelector('.content');
    content.innerHTML = `
      <div class="stats-container">
        <div class="stats-header">
          <h2>Your Stats</h2>
          <button class="btn secondary" onclick="app.setView('all')">← Back</button>
        </div>

        <div class="stats-cards">
          <div class="stat-card">
            <div class="stat-card-value">${stats.total}</div>
            <div class="stat-card-label">Total Saves</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-value">${stats.articles}</div>
            <div class="stat-card-label">Articles</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-value">${stats.highlights}</div>
            <div class="stat-card-label">Highlights</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-value">${stats.archived}</div>
            <div class="stat-card-label">Archived</div>
          </div>
        </div>

        <div class="stats-section">
          <h3>Saves by Month</h3>
          <div style="display: flex; gap: 24px; flex-wrap: wrap; margin-top: 16px;">
            ${stats.by_month.slice(-6).map(([month, count]) => `
              <div>
                <div style="font-size: 24px; font-weight: 600; color: var(--primary);">${count}</div>
                <div style="font-size: 13px; color: var(--text-muted);">${monthLabel(month)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  async saveHighlightFromSelection() {
    const text = this.pendingHighlightText;
    if (!text || !this.currentSave || this.currentSave.highlight) return;

    const noteInput = document.getElementById('highlight-note-input');
    const tagInput = document.getElementById('highlight-tag-input');
    const notes = noteInput.value.trim() || null;
    const tagName = tagInput.value.trim() || null;

    const saveBtn = document.getElementById('highlight-form-save');
    saveBtn.disabled = true;

    let created;
    try {
      created = await invoke('create_save', {
        input: {
          parent_save_id: this.currentSave.id,
          url: this.currentSave.url,
          title: this.currentSave.title,
          highlight: text,
          notes,
          site_name: this.currentSave.site_name,
          author: this.currentSave.author,
          source: 'web-highlight',
        },
      });

      if (tagName) {
        await invoke('add_tag_to_save', { saveId: created.id, tagName });
        this.loadTags();
      }
    } catch (err) {
      console.error('Error saving highlight:', err);
      saveBtn.disabled = false;
      return;
    }

    saveBtn.disabled = false;
    noteInput.value = '';
    tagInput.value = '';
    window.getSelection()?.removeAllRanges();
    document.getElementById('highlight-tooltip').classList.add('hidden');
    document.getElementById('highlight-tooltip-form').classList.add('hidden');
    document.getElementById('highlight-save-btn').classList.remove('hidden');
    this.pendingHighlightText = null;

    await this.loadArticleHighlights(this.currentSave.id);
  }

  // Wraps each saved highlight's text in <mark class="stash-highlight"> inside
  // the rendered article body, so highlights show a visible background mark
  // (not just a separate list entry) - uses mark.js to handle matches that
  // span multiple inline elements (e.g. a sentence with bold/italic runs).
  applyHighlightMarks() {
    const body = document.getElementById('reading-body');
    if (!body || typeof Mark === 'undefined') return;

    const marker = new Mark(body);
    marker.unmark({
      done: () => {
        this.currentArticleHighlights?.forEach((h) => {
          if (!h.highlight) return;
          marker.mark(h.highlight, {
            element: 'mark',
            className: 'stash-highlight',
            acrossElements: true,
            separateWordSearch: false,
            each: (el) => {
              el.dataset.highlightId = h.id;
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openReadingPane(h);
              });
            },
          });
        });
      },
    });
  }

  async loadArticleHighlights(articleId) {
    const section = document.getElementById('reading-highlights-section');
    const list = document.getElementById('reading-highlights-list');

    let data;
    try {
      data = await invoke('list_article_highlights', { articleId });
    } catch (err) {
      console.error('Error loading article highlights:', err);
      data = [];
    }

    this.currentArticleHighlights = data || [];
    this.applyHighlightMarks();

    if (!data || data.length === 0) {
      section.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = data.map(h => {
      const tagList = h.tags || [];
      const tagsHtml = tagList.length > 0
        ? `<div class="reading-highlight-item-tags">${tagList.map(t => `<span class="tag-pill tag-pill-small">${this.escapeHtml(t.name)}</span>`).join('')}</div>`
        : '';
      const notesHtml = h.notes
        ? `<div class="reading-highlight-item-note">📝 ${this.escapeHtml(h.notes)}</div>`
        : '';
      return `
        <div class="reading-highlight-item" data-id="${h.id}">
          <div class="reading-highlight-item-text">"${this.escapeHtml(h.highlight)}"</div>
          ${notesHtml}
          ${tagsHtml}
        </div>
      `;
    }).join('');

    list.querySelectorAll('.reading-highlight-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const highlight = data.find(h => h.id === id);
        if (highlight) this.openReadingPane(highlight);
      });
    });
  }

  async openParentArticle(parentId) {
    let data;
    try {
      data = await invoke('get_save', { id: parentId });
    } catch (err) {
      console.error('Could not load parent article:', err);
      return;
    }
    if (!data) return;
    this.openReadingPane(data);
  }

  async saveHighlightNotes() {
    if (!this.currentSave || !this.currentSave.highlight) return;

    const notes = document.getElementById('reading-notes-input').value.trim() || null;
    try {
      await invoke('set_notes', { id: this.currentSave.id, notes });
    } catch (err) {
      console.error('Error saving notes:', err);
      return;
    }
    this.currentSave.notes = notes;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderMarkdown(text) {
    if (!text) return '';

    // Configure marked for safe rendering
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,  // Convert \n to <br>
        gfm: true,     // GitHub Flavored Markdown
      });

      try {
        return marked.parse(text);
      } catch (e) {
        console.error('Markdown parse error:', e);
        // Fallback to escaped plain text
        return `<div style="white-space: pre-wrap;">${this.escapeHtml(text)}</div>`;
      }
    }

    // Fallback if marked isn't loaded
    return `<div style="white-space: pre-wrap;">${this.escapeHtml(text)}</div>`;
  }
}

// Initialize app
const app = new StashApp();
