/* global browser */

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'wr-read-selection',
    title: browser.i18n.getMessage('contextMenuLabel'),
    contexts: ['selection'],
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'wr-read-selection') return;
  const { wpm = 300 } = await browser.storage.local.get('wpm');
  try {
    await browser.tabs.sendMessage(tab.id, { action: 'start', wpm, source: 'selection' });
  } catch {
    // Content script unavailable on this page type
  }
});
