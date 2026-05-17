const DEFAULT_WPM = 300;

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
