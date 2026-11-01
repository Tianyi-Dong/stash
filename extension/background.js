// Background service worker
// Handles context menus and saving

importScripts('config.js', 'localApi.js');

let localApi = null;

// Initialize on startup
chrome.runtime.onInstalled.addListener(() => {
  initApi();
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  initApi();
});

function initApi() {
  localApi = new LocalApiClient(CONFIG.SERVER_URL, CONFIG.TOKEN);
}

// Context menu for "Save highlight to Stash"
function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-highlight',
      title: 'Save highlight to Stash',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: 'save-page',
      title: 'Save page to Stash',
      contexts: ['page'],
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!localApi) initApi();

  if (info.menuItemId === 'save-highlight') {
    await saveHighlight(tab, info.selectionText);
  } else if (info.menuItemId === 'save-page') {
    await savePage(tab);
  }
});

// Save highlighted text
async function saveHighlight(tab, selectionText) {
  try {
    await localApi.createSave({
      url: tab.url,
      title: tab.title,
      highlight: selectionText,
      site_name: new URL(tab.url).hostname.replace('www.', ''),
      source: 'extension',
    });

    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: 'Highlight saved!',
    });
  } catch (err) {
    console.error('Save highlight failed:', err);
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: 'Failed to save: ' + err.message,
      isError: true,
    });
  }
}

// Save full page
async function savePage(tab) {
  try {
    console.log('savePage called for:', tab.url);
    let article;

    // Extract from current page - inject content script first if needed
    console.log('Extracting article...');

    try {
      article = await chrome.tabs.sendMessage(tab.id, { action: 'extractArticle' });
    } catch (e) {
      // Content script not loaded, inject it first
      console.log('Content script not loaded, injecting...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['Readability.js', 'content.js']
      });
      // Wait a moment for script to initialize
      await new Promise(r => setTimeout(r, 100));
      article = await chrome.tabs.sendMessage(tab.id, { action: 'extractArticle' });
    }

    console.log('Article extracted:', article?.title, 'content length:', article?.content?.length);

    if (!article) {
      throw new Error('Failed to extract article content');
    }

    console.log('Saving to Stash...');
    const result = await localApi.createSave({
      url: tab.url,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      site_name: article.siteName,
      author: article.author,
      published_at: article.publishedTime,
      image_url: article.imageUrl,
      source: 'extension',
    });
    console.log('Save result:', result);

    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: 'Page saved!',
    });
  } catch (err) {
    console.error('Save page failed:', err);
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: 'Failed to save: ' + err.message,
      isError: true,
    });
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePage') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        await savePage(tabs[0]);
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === 'getRecentSaves') {
    (async () => {
      if (!localApi) initApi();
      try {
        const saves = await localApi.getRecentSaves(10);
        sendResponse({ success: true, saves });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
