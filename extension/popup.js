// Popup script
document.addEventListener('DOMContentLoaded', async () => {
  const savePageBtn = document.getElementById('save-page-btn');
  const savesList = document.getElementById('saves-list');

  loadRecentSaves();

  // Save page
  savePageBtn.addEventListener('click', async () => {
    savePageBtn.disabled = true;
    savePageBtn.innerHTML = `
      <svg class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      Saving...
    `;

    await chrome.runtime.sendMessage({ action: 'savePage' });

    savePageBtn.disabled = false;
    savePageBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Saved!
    `;

    setTimeout(() => {
      savePageBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        Save This Page
      `;
      loadRecentSaves();
    }, 1500);
  });

  // Load recent saves
  async function loadRecentSaves() {
    const response = await chrome.runtime.sendMessage({ action: 'getRecentSaves' });

    if (!response.success || !response.saves?.length) {
      savesList.innerHTML = '<p class="empty">No saves yet. Save your first page!</p>';
      return;
    }

    savesList.innerHTML = response.saves.map(save => {
      const isHighlight = !!save.highlight;
      const title = save.title || save.highlight?.substring(0, 50) || 'Untitled';
      const date = new Date(save.created_at).toLocaleDateString();

      return `
        <div class="save-item" data-url="${save.url}">
          <div class="icon ${isHighlight ? 'highlight' : ''}">
            ${isHighlight ? '✨' : '📄'}
          </div>
          <div class="content">
            <div class="title">${escapeHtml(title)}</div>
            <div class="meta">${save.site_name || ''} · ${date}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    savesList.querySelectorAll('.save-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  }

  // Helper
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

});

// Add spinning animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
`;
document.head.appendChild(style);
