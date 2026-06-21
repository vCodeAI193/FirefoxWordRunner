const DEFAULT_WPM = 300;

// Tab IDs pending an auto-start after navigation completes.
// Maps tabId → { wpm, source }
const pendingAutoRead = new Map();

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'wr-read-selection',
    title: browser.i18n.getMessage('contextMenuLabel'),
    contexts: ['selection'],
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'wr-read-selection') return;
  const { wpm = DEFAULT_WPM } = await browser.storage.local.get('wpm');
  try {
    await browser.tabs.sendMessage(tab.id, { action: 'start', wpm, source: 'selection' });
  } catch {
    // Content script unavailable on this page type
  }
});

// Keyboard shortcut Alt+W → start reading the current page
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'start-reading') return;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;
  const { wpm = DEFAULT_WPM } = await browser.storage.local.get('wpm');
  try {
    await browser.tabs.sendMessage(tab.id, { action: 'start', wpm, source: 'page' });
  } catch {
    // Content script unavailable on this page type
  }
});

// Badge updates from content script (can't call browserAction API from content scripts directly)
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'setBadge') return;
  const tabId = sender.tab?.id;
  if (tabId == null) { sendResponse({ ok: false }); return; }
  browser.browserAction.setBadgeText({ text: msg.text, tabId });
  browser.browserAction.setBadgeBackgroundColor({ color: msg.color || '#4fc3f7', tabId });
  sendResponse({ ok: true });
});

// "Open & Read" — called from popup when user clicks the reading-list open+start button.
// We can't inject immediately because the tab is still loading, so we store the intent
// and fire once the page is fully loaded.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'openAndRead') return;
  const { url, wpm, source = 'page' } = msg;
  browser.tabs.create({ url }).then(tab => {
    pendingAutoRead.set(tab.id, { wpm, source });
    sendResponse({ ok: true });
  }).catch(() => sendResponse({ ok: false }));
  return true; // keep channel open for async sendResponse
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const pending = pendingAutoRead.get(tabId);
  if (!pending) return;
  pendingAutoRead.delete(tabId);
  // Small delay so the content script has time to initialise
  setTimeout(async () => {
    try {
      await browser.tabs.sendMessage(tabId, {
        action: 'start',
        wpm: pending.wpm,
        source: pending.source,
      });
    } catch {
      // Content script unavailable (e.g. PDF, restricted page)
    }
  }, 400);
});
