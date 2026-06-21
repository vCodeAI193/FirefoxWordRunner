// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------

function t(key) {
  return browser.i18n.getMessage(key) || key;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
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
  const clearBtn = document.getElementById('clear-stats-btn');
  if (!stats || !stats.sessions) {
    el.textContent = t('statsEmpty');
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }
  if (clearBtn) clearBtn.style.display = '';
  const avgWpm = stats.totalMs > 0
    ? Math.round(stats.totalWords / (stats.totalMs / 60000))
    : 0;

  el.innerHTML = '';

  const summary = document.createElement('p');
  summary.className = 'stats-summary';
  summary.textContent =
    `${stats.totalWords.toLocaleString()} ${t('wordsReadLabel')} · ` +
    `${stats.sessions} ${t('sessionsLabel')} · ` +
    `Ø ${avgWpm} WPM`;
  el.appendChild(summary);

  const history = stats.history;
  if (!history || history.length === 0) return;

  const heading = document.createElement('p');
  heading.className = 'stats-history-heading';
  heading.textContent = t('historyLabel');
  el.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'stats-history-list';
  [...history].reverse().forEach(entry => {
    const li = document.createElement('li');
    li.className = 'stats-history-item';

    const dateStr = new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = new Date(entry.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const meta = document.createElement('span');
    meta.className = 'stats-history-meta';
    meta.textContent = `${dateStr} ${timeStr} · ${entry.wordsRead.toLocaleString()} ${t('wordsLabel')} · ${entry.wpm} WPM`;

    const title = document.createElement('span');
    title.className = 'stats-history-title';
    title.textContent = entry.title || entry.url;
    title.title = entry.url;

    li.appendChild(meta);
    li.appendChild(title);
    list.appendChild(li);
  });
  el.appendChild(list);
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

  list.forEach(item => {
    const row = document.createElement('li');
    row.className = 'reading-list-item';

    const info = document.createElement('div');
    info.className = 'rl-info';

    const title = document.createElement('span');
    title.className = 'rl-title';
    title.textContent = item.title || item.url;
    title.title = item.url;
    info.appendChild(title);

    if (item.wordCount > 0) {
      const meta = document.createElement('span');
      meta.className = 'rl-meta';
      const minEst = Math.ceil(item.wordCount / 250);
      meta.textContent = `~${item.wordCount.toLocaleString()} ${t('wordsLabel')} · ~${minEst} min`;
      info.appendChild(meta);
    }

    if (item.addedAt) {
      const date = document.createElement('span');
      date.className = 'rl-date';
      date.textContent = new Date(item.addedAt).toLocaleDateString();
      info.appendChild(date);
    }

    row.appendChild(info);

    const openBtn = document.createElement('button');
    openBtn.className = 'rl-btn rl-open';
    openBtn.type = 'button';
    openBtn.textContent = t('openLabel');
    openBtn.addEventListener('click', () => {
      browser.tabs.create({ url: item.url });
    });
    row.appendChild(openBtn);

    const openReadBtn = document.createElement('button');
    openReadBtn.className = 'rl-btn rl-open-read';
    openReadBtn.type = 'button';
    openReadBtn.textContent = t('openAndReadLabel');
    openReadBtn.title = t('openAndReadTitle');
    openReadBtn.addEventListener('click', async () => {
      const { wpm = 300 } = await browser.storage.local.get('wpm');
      browser.runtime.sendMessage({ action: 'openAndRead', url: item.url, wpm });
      window.close();
    });
    row.appendChild(openReadBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'rl-btn';
    removeBtn.type = 'button';
    removeBtn.textContent = t('removeFromList');
    removeBtn.addEventListener('click', async () => {
      const d = await browser.storage.local.get('readingList');
      const updated = (d.readingList || []).filter(
        it => !(it.url === item.url && it.addedAt === item.addedAt)
      );
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

  let wordCount = 0;
  try {
    const resp = await browser.tabs.sendMessage(tab.id, { action: 'countWords' });
    wordCount = resp?.count || 0;
  } catch { /* content script not available on this page */ }

  list.push({ url: tab.url, title: tab.title || tab.url, addedAt: Date.now(), wordCount });
  await browser.storage.local.set({ readingList: list });
  renderReadingList();
}

// ---------------------------------------------------------------------------
// Settings export / import
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = [
  'wpm', 'wordsPerChunk', 'displayMode', 'fontSize', 'fontFamily',
  'theme', 'orpColor', 'skipShortWords',
];

function exportSettings() {
  browser.storage.local.get(SETTINGS_KEYS).then(saved => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'word-runner-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// SETTINGS_VALIDATORS is defined in lib/validators.js (loaded before this script)

function importSettings(file) {
  const allowed = new Set(SETTINGS_KEYS);
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const filtered = Object.fromEntries(
        Object.entries(parsed).filter(([k, v]) => allowed.has(k) && SETTINGS_VALIDATORS[k]?.(v))
      );
      await browser.storage.local.set(filtered);
      showStatus(t('importSuccess'));
      setTimeout(() => window.location.reload(), 800);
    } catch {
      showStatus(t('importError'), 'error');
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Settings UI helpers
// ---------------------------------------------------------------------------

function restoreSettingsUI(data, els) {
  const savedWpm = data.wpm || 300;
  els.slider.value = savedWpm;
  els.wpmDisplay.textContent = savedWpm;
  els.slider.setAttribute('aria-valuenow', savedWpm);

  if (data.wordsPerChunk === 2) document.getElementById('radio-two-words').checked = true;
  if (data.displayMode === 'highlight') document.getElementById('radio-highlight').checked = true;

  if (data.fontSize) {
    els.fontSlider.value = data.fontSize;
    els.fontSlider.setAttribute('aria-valuenow', data.fontSize);
    els.fontDisplay.textContent = data.fontSize;
  }
  if (data.fontFamily)    els.fontFamilySelect.value  = data.fontFamily;
  if (data.theme)         els.themeSelect.value       = data.theme;
  if (data.orpColor)      els.orpColor.value          = data.orpColor;
  if (data.skipShortWords) els.skipShortWords.checked = true;
}

function updatePresetActive(wpm) {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.wpm, 10) === wpm);
  });
}

function attachPersistListeners(els) {
  const saveWpm = debounce(val => browser.storage.local.set({ wpm: val }), 300);
  els.slider.addEventListener('input', () => {
    const val = parseInt(els.slider.value, 10);
    els.wpmDisplay.textContent = val;
    els.slider.setAttribute('aria-valuenow', val);
    updatePresetActive(val);
    saveWpm(val);
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.wpm, 10);
      els.slider.value = val;
      els.wpmDisplay.textContent = val;
      els.slider.setAttribute('aria-valuenow', val);
      updatePresetActive(val);
      browser.storage.local.set({ wpm: val });
    });
  });

  els.fontSlider.addEventListener('input', () => {
    const val = parseInt(els.fontSlider.value, 10);
    els.fontDisplay.textContent = val;
    els.fontSlider.setAttribute('aria-valuenow', val);
    browser.storage.local.set({ fontSize: val });
  });

  els.fontFamilySelect.addEventListener('change', () =>
    browser.storage.local.set({ fontFamily: els.fontFamilySelect.value }));

  els.themeSelect.addEventListener('change', () =>
    browser.storage.local.set({ theme: els.themeSelect.value }));

  els.orpColor.addEventListener('input', () =>
    browser.storage.local.set({ orpColor: els.orpColor.value }));

  els.skipShortWords.addEventListener('change', () =>
    browser.storage.local.set({ skipShortWords: els.skipShortWords.checked }));

  document.querySelectorAll('input[name="displayMode"]').forEach(r =>
    r.addEventListener('change', () => browser.storage.local.set({ displayMode: r.value })));

  document.querySelectorAll('input[name="wordsPerChunk"]').forEach(r =>
    r.addEventListener('change', () =>
      browser.storage.local.set({ wordsPerChunk: parseInt(r.value, 10) })));

  document.querySelectorAll('input[name="source"]').forEach(r =>
    r.addEventListener('change', () =>
      els.customSection.classList.toggle('hidden', !els.radioCustom.checked)));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.lang = browser.i18n.getUILanguage().split('-')[0];
  applyI18n();

  const els = {
    slider:          document.getElementById('wpm-slider'),
    wpmDisplay:      document.getElementById('wpm-display'),
    startBtn:        document.getElementById('start-btn'),
    radioCustom:     document.getElementById('radio-custom'),
    customSection:   document.getElementById('custom-text-section'),
    customText:      document.getElementById('custom-text'),
    fontSlider:      document.getElementById('font-size-slider'),
    fontDisplay:     document.getElementById('font-size-display'),
    fontFamilySelect: document.getElementById('font-family-select'),
    themeSelect:     document.getElementById('theme-select'),
    orpColor:        document.getElementById('orp-color'),
    skipShortWords:  document.getElementById('skip-short-words'),
    addToListBtn:    document.getElementById('add-to-list-btn'),
  };

  const data = await browser.storage.local.get([
    'wpm', 'wordsPerChunk', 'displayMode', 'fontSize', 'fontFamily',
    'theme', 'orpColor', 'skipShortWords', 'stats',
  ]);

  restoreSettingsUI(data, els);
  updatePresetActive(data.wpm || 300);
  displayStats(data.stats);

  document.getElementById('clear-stats-btn').addEventListener('click', async () => {
    await browser.storage.local.remove('stats');
    displayStats(null);
    showStatus(t('statsCleared'));
  });

  attachPersistListeners(els);

  // ── Ping content script ──
  let currentState = null;
  let activeTab = null;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'ping' });
  } catch {
    showStatus(t('errorPage'), 'error');
    els.startBtn.disabled = true;
  }

  updateUI(currentState);

  // ── Word count preview ──
  if (activeTab) {
    try {
      const resp = await browser.tabs.sendMessage(activeTab.id, { action: 'countWords' });
      const count = resp?.count || 0;
      if (count > 0) {
        const wpm = data.wpm || 300;
        const minEst = Math.ceil(count / wpm);
        const preview = document.getElementById('word-count-preview');
        if (preview) {
          preview.textContent = t('wordCountPreview')
            .replace('{count}', count.toLocaleString())
            .replace('{min}', minEst);
          preview.classList.remove('hidden');
        }
      }
    } catch { /* page without content script */ }
  }

  renderReadingList();
  if (els.addToListBtn) {
    els.addToListBtn.addEventListener('click', () => addCurrentPageToList(activeTab));
  }

  const exportBtn  = document.getElementById('export-settings-btn');
  const importBtn  = document.getElementById('import-settings-btn');
  const importFile = document.getElementById('import-settings-file');
  if (exportBtn) exportBtn.addEventListener('click', exportSettings);
  if (importBtn) importBtn.addEventListener('click', () => importFile?.click());
  if (importFile) importFile.addEventListener('change', () => {
    if (importFile.files[0]) importSettings(importFile.files[0]);
  });

  if (els.startBtn.disabled) return;

  // ── Start / pause / resume ──
  els.startBtn.addEventListener('click', async () => {
    if (!activeTab) return;

    const wpm    = parseInt(els.slider.value, 10);
    const source = document.querySelector('input[name="source"]:checked').value;

    try {
      if (currentState && currentState.active) {
        currentState = await browser.tabs.sendMessage(activeTab.id,
          { action: currentState.paused ? 'resume' : 'pause' });
        updateUI(currentState);
      } else {
        const payload = { action: 'start', wpm, source };
        if (source === 'custom') {
          payload.text = els.customText.value.trim();
          if (!payload.text) { showStatus(t('customTextEmpty'), 'error'); return; }
        }
        await browser.tabs.sendMessage(activeTab.id, payload);
        window.close();
      }
    } catch {
      showStatus(t('errorPage'), 'error');
    }
  });
});
