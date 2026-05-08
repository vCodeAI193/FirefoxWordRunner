// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------

function t(key) {
  return browser.i18n.getMessage(key) || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = t(el.getAttribute('data-i18n'));
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const msg = t(el.getAttribute('data-i18n-placeholder'));
    if (msg) el.placeholder = msg;
  });
  document.querySelectorAll('option[data-i18n]').forEach(el => {
    const msg = t(el.getAttribute('data-i18n'));
    if (msg) el.textContent = msg;
  });
}

// ---------------------------------------------------------------------------
// Stats display
// ---------------------------------------------------------------------------

function displayStats(stats) {
  const el = document.getElementById('stats-content');
  if (!stats || !stats.sessions) {
    el.textContent = t('statsEmpty');
    return;
  }
  const avgWpm = stats.totalMs > 0
    ? Math.round(stats.totalWords / (stats.totalMs / 60000))
    : 0;
  el.textContent =
    `${stats.totalWords.toLocaleString()} ${t('wordsReadLabel')} · ` +
    `${stats.sessions} ${t('sessionsLabel')} · ` +
    `Ø ${avgWpm} WPM`;
}

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

function showStatus(msg, type = 'info') {
  const bar = document.getElementById('status-bar');
  bar.textContent = msg;
  bar.classList.remove('hidden', 'error');
  if (type === 'error') bar.classList.add('error');
}

function hideStatus() {
  document.getElementById('status-bar').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// UI sync from session state
// ---------------------------------------------------------------------------

function updateUI(state) {
  const btn = document.getElementById('start-btn');
  if (!state || !state.active) {
    btn.textContent = t('startReading');
    btn.classList.remove('running');
    hideStatus();
  } else if (state.paused) {
    btn.textContent = t('resumeReading');
    btn.classList.add('running');
    showStatus(`${t('pauseReading')}: ${state.wordIndex} / ${state.totalWords}`);
  } else {
    btn.textContent = t('pauseReading');
    btn.classList.add('running');
    showStatus(`${state.wordIndex} / ${state.totalWords}`);
  }
}

// ---------------------------------------------------------------------------
// Reading list
// ---------------------------------------------------------------------------

async function renderReadingList() {
  const container = document.getElementById('reading-list-items');
  const data = await browser.storage.local.get('readingList');
  const list = data.readingList || [];

  container.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats-content';
    empty.textContent = t('readingListEmpty');
    container.appendChild(empty);
    return;
  }

  list.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'reading-list-item';

    const title = document.createElement('span');
    title.className = 'rl-title';
    title.textContent = item.title || item.url;
    title.title = item.url;
    row.appendChild(title);

    const openBtn = document.createElement('button');
    openBtn.className = 'rl-btn rl-open';
    openBtn.type = 'button';
    openBtn.textContent = t('openLabel');
    openBtn.addEventListener('click', () => {
      browser.tabs.create({ url: item.url });
    });
    row.appendChild(openBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'rl-btn';
    removeBtn.type = 'button';
    removeBtn.textContent = t('removeFromList');
    removeBtn.addEventListener('click', async () => {
      const d = await browser.storage.local.get('readingList');
      const updated = (d.readingList || []).filter((_, i) => i !== index);
      await browser.storage.local.set({ readingList: updated });
      renderReadingList();
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  });
}

async function addCurrentPageToList(tab) {
  if (!tab) return;
  const data = await browser.storage.local.get('readingList');
  const list = data.readingList || [];

  // Don't add duplicates
  if (list.some(item => item.url === tab.url)) return;

  list.push({ url: tab.url, title: tab.title || tab.url, addedAt: Date.now() });
  await browser.storage.local.set({ readingList: list });
  renderReadingList();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();

  // Element refs
  const slider          = document.getElementById('wpm-slider');
  const wpmDisplay      = document.getElementById('wpm-display');
  const startBtn        = document.getElementById('start-btn');
  const radioCustom     = document.getElementById('radio-custom');
  const customSection   = document.getElementById('custom-text-section');
  const customText      = document.getElementById('custom-text');
  const fontSlider      = document.getElementById('font-size-slider');
  const fontDisplay     = document.getElementById('font-size-display');
  const fontFamilySelect = document.getElementById('font-family-select');
  const themeSelect     = document.getElementById('theme-select');
  const orpColor        = document.getElementById('orp-color');
  const skipShortWords  = document.getElementById('skip-short-words');
  const addToListBtn    = document.getElementById('add-to-list-btn');

  // ── Load saved settings ──
  const data = await browser.storage.local.get([
    'wpm', 'wordsPerChunk', 'displayMode', 'fontSize', 'fontFamily',
    'theme', 'orpColor', 'skipShortWords', 'stats',
  ]);

  const savedWpm = data.wpm || 300;
  slider.value = savedWpm;
  wpmDisplay.textContent = savedWpm;
  slider.setAttribute('aria-valuenow', savedWpm);

  if (data.wordsPerChunk === 2) {
    document.getElementById('radio-two-words').checked = true;
  }
  if (data.displayMode === 'highlight') {
    document.getElementById('radio-highlight').checked = true;
  }
  if (data.fontSize) {
    fontSlider.value = data.fontSize;
    fontDisplay.textContent = data.fontSize;
  }
  if (data.fontFamily) fontFamilySelect.value = data.fontFamily;
  if (data.theme) themeSelect.value = data.theme;
  if (data.orpColor) orpColor.value = data.orpColor;
  if (data.skipShortWords) skipShortWords.checked = true;

  displayStats(data.stats);

  // ── Persist settings on change ──
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value, 10);
    wpmDisplay.textContent = val;
    slider.setAttribute('aria-valuenow', val);
    browser.storage.local.set({ wpm: val });
  });

  fontSlider.addEventListener('input', () => {
    const val = parseInt(fontSlider.value, 10);
    fontDisplay.textContent = val;
    browser.storage.local.set({ fontSize: val });
  });

  fontFamilySelect.addEventListener('change', () => {
    browser.storage.local.set({ fontFamily: fontFamilySelect.value });
  });

  themeSelect.addEventListener('change', () => {
    browser.storage.local.set({ theme: themeSelect.value });
  });

  orpColor.addEventListener('input', () => {
    browser.storage.local.set({ orpColor: orpColor.value });
  });

  skipShortWords.addEventListener('change', () => {
    browser.storage.local.set({ skipShortWords: skipShortWords.checked });
  });

  document.querySelectorAll('input[name="displayMode"]').forEach(r => {
    r.addEventListener('change', () => browser.storage.local.set({ displayMode: r.value }));
  });

  document.querySelectorAll('input[name="wordsPerChunk"]').forEach(r => {
    r.addEventListener('change', () =>
      browser.storage.local.set({ wordsPerChunk: parseInt(r.value, 10) })
    );
  });

  // ── Custom text textarea visibility ──
  document.querySelectorAll('input[name="source"]').forEach(r => {
    r.addEventListener('change', () => {
      customSection.classList.toggle('hidden', !radioCustom.checked);
    });
  });

  // ── Ping content script ──
  let currentState = null;
  let activeTab = null;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'ping' });
  } catch {
    showStatus(t('errorPage'), 'error');
    startBtn.disabled = true;
  }

  updateUI(currentState);

  // ── Reading list ──
  renderReadingList();

  if (addToListBtn) {
    addToListBtn.addEventListener('click', () => addCurrentPageToList(activeTab));
  }

  if (startBtn.disabled) return;

  // ── Start / pause / resume ──
  startBtn.addEventListener('click', async () => {
    if (!activeTab) return;

    const wpm = parseInt(slider.value, 10);
    const source = document.querySelector('input[name="source"]:checked').value;

    try {
      if (currentState && currentState.active) {
        if (currentState.paused) {
          currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'resume' });
        } else {
          currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'pause' });
        }
        updateUI(currentState);
      } else {
        const payload = { action: 'start', wpm, source };
        if (source === 'custom') {
          payload.text = customText.value.trim();
          if (!payload.text) {
            showStatus(t('customTextEmpty'), 'error');
            return;
          }
        }
        await browser.tabs.sendMessage(activeTab.id, payload);
        window.close();
      }
    } catch {
      showStatus(t('errorPage'), 'error');
    }
  });
});
