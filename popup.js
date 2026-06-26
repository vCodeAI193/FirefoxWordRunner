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
// Keymap default (must match content.js DEFAULT_KEYMAP)
// ---------------------------------------------------------------------------

const DEFAULT_KEYMAP = {
  pause:   'Space',
  stop:    'Escape',
  skipFwd: 'ArrowRight',
  skipBwd: 'ArrowLeft',
  speedUp: 'Equal',
  speedDn: 'Minus',
};

// ---------------------------------------------------------------------------
// Settings storage: write to both sync and local; read from sync with fallback
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = [
  'wpm', 'wordsPerChunk', 'displayMode', 'fontSize', 'fontFamily',
  'theme', 'orpColor', 'skipShortWords',
  'pauseAtSentence', 'sentencePause', 'commaPause', 'paragraphPause',
  'dailyGoal', 'contentMode', 'keymap',
  'dimPage', 'bionicReading',
];

function saveSetting(obj) {
  browser.storage.local.set(obj).catch(() => {});
  browser.storage.sync.set(obj).catch(() => {});
}

async function loadSettings(extraKeys) {
  const keys = extraKeys ? [...SETTINGS_KEYS, ...extraKeys] : SETTINGS_KEYS;
  try {
    const syncData = await browser.storage.sync.get(keys);
    const missing = keys.filter(k => !(k in syncData));
    if (missing.length === 0) return syncData;
    const localData = await browser.storage.local.get(missing);
    return { ...localData, ...syncData };
  } catch {
    return browser.storage.local.get(keys);
  }
}

// One-time migration: copy existing local settings to sync storage.
async function migrateToSync() {
  try {
    const check = await browser.storage.sync.get('_synced');
    if (check._synced) return;
    const localData = await browser.storage.local.get(SETTINGS_KEYS);
    const toSync = Object.keys(localData).length > 0
      ? { ...localData, _synced: true }
      : { _synced: true };
    await browser.storage.sync.set(toSync);
  } catch { /* sync unavailable or quota exceeded */ }
}

// ---------------------------------------------------------------------------
// Stats display
// ---------------------------------------------------------------------------

function renderSparkline(history) {
  if (!history || history.length < 2) return null;
  const W = 268, H = 40, pad = 4;
  const wpmVals = history.map(e => e.wpm || 0);
  const min = Math.min(...wpmVals);
  const max = Math.max(...wpmVals);
  const range = max - min || 1;
  const step = (W - pad * 2) / (wpmVals.length - 1);

  const points = wpmVals.map((v, i) => {
    const x = pad + i * step;
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('stats-sparkline');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#4fc3f7');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  const lastX = pad + (wpmVals.length - 1) * step;
  const lastY = H - pad - ((wpmVals[wpmVals.length - 1] - min) / range) * (H - pad * 2);
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', lastX.toFixed(1));
  dot.setAttribute('cy', lastY.toFixed(1));
  dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#4fc3f7');
  svg.appendChild(dot);

  const wrap = document.createElement('div');
  wrap.className = 'stats-sparkline-wrap';
  wrap.appendChild(svg);

  const labels = document.createElement('div');
  labels.className = 'stats-sparkline-labels';
  const minLabel = document.createElement('span');
  minLabel.textContent = `${min} WPM`;
  const maxLabel = document.createElement('span');
  maxLabel.textContent = `${max} WPM`;
  labels.appendChild(minLabel);
  labels.appendChild(maxLabel);
  wrap.appendChild(labels);

  return wrap;
}

function displayStats(stats, dailyGoal) {
  const el = document.getElementById('stats-content');
  const clearBtn = document.getElementById('clear-stats-btn');
  const exportBtn = document.getElementById('export-stats-btn');
  if (!stats || !stats.sessions) {
    el.textContent = t('statsEmpty');
    if (clearBtn) clearBtn.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
    return;
  }
  if (clearBtn) clearBtn.style.display = '';
  if (exportBtn) exportBtn.style.display = '';

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

  // Streak + today's words
  const streakDays = stats.streakDays || 0;
  const todayWords = stats.todayWords || 0;
  if (streakDays > 0 || todayWords > 0) {
    const streak = document.createElement('div');
    streak.className = 'stats-streak';
    const goalNum = dailyGoal || 0;
    const parts = [];
    if (streakDays > 0) parts.push(`🔥 ${streakDays} ${t('streakDaysLabel')}`);
    parts.push(goalNum > 0
      ? `${todayWords.toLocaleString()} / ${goalNum.toLocaleString()} ${t('todayWordsLabel')}`
      : `${todayWords.toLocaleString()} ${t('todayWordsLabel')}`);
    streak.textContent = parts.join(' · ');
    el.appendChild(streak);

    if (goalNum > 0) {
      const progressBar = document.createElement('div');
      progressBar.className = 'stats-goal-bar';
      const fill = document.createElement('div');
      fill.className = 'stats-goal-fill';
      fill.style.width = `${Math.min(100, Math.round((todayWords / goalNum) * 100))}%`;
      progressBar.appendChild(fill);
      el.appendChild(progressBar);
    }
  }

  // WPM sparkline
  const history = stats.history;
  if (history && history.length >= 2) {
    const sparkline = renderSparkline(history.slice(-20));
    if (sparkline) el.appendChild(sparkline);
  }

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
      if (!validateUrl(item.url)) return;
      browser.tabs.create({ url: item.url });
    });
    row.appendChild(openBtn);

    const openReadBtn = document.createElement('button');
    openReadBtn.className = 'rl-btn rl-open-read';
    openReadBtn.type = 'button';
    openReadBtn.textContent = t('openAndReadLabel');
    openReadBtn.title = t('openAndReadTitle');
    openReadBtn.addEventListener('click', async () => {
      if (!validateUrl(item.url)) return;
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
// Tab bookmarks
// ---------------------------------------------------------------------------

async function renderTabBookmarks(tab) {
  const container = document.getElementById('tab-bookmarks');
  if (!container || !tab) return;

  const pageKey = tab.url;
  const data = await browser.storage.local.get('readBookmarks');
  const bookmarksMap = data.readBookmarks || {};
  const bookmarks = bookmarksMap[pageKey] || [];

  if (bookmarks.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = '';

  const heading = document.createElement('p');
  heading.className = 'stats-history-heading';
  heading.textContent = t('bookmarksLabel');
  container.appendChild(heading);

  bookmarks.forEach(bm => {
    const btn = document.createElement('button');
    btn.className = 'tab-bookmark-btn';
    btn.type = 'button';
    btn.textContent = `${t('resumeFromWord')} ${bm.wordIndex}`;
    btn.addEventListener('click', async () => {
      try {
        const { readPositions = {} } = await browser.storage.local.get('readPositions');
        readPositions[pageKey] = { wordIndex: bm.wordIndex, ts: Date.now() };
        await browser.storage.local.set({ readPositions });
        const { wpm = 300 } = await browser.storage.local.get('wpm');
        await browser.tabs.sendMessage(tab.id, { action: 'start', source: 'page', wpm });
        window.close();
      } catch { /* tab unavailable */ }
    });
    container.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// Stats CSV export
// ---------------------------------------------------------------------------

function exportStatsCsv(stats) {
  if (!stats || !stats.history || stats.history.length === 0) return;
  const rows = [['date', 'title', 'url', 'wordsRead', 'wpm', 'durationMs']];
  stats.history.forEach(e => {
    rows.push([
      new Date(e.date).toISOString(),
      `"${(e.title || '').replace(/"/g, '""')}"`,
      `"${(e.url || '').replace(/"/g, '""')}"`,
      e.wordsRead,
      e.wpm,
      e.durationMs || '',
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'word-runner-stats.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Settings export / import
// ---------------------------------------------------------------------------

function exportSettings() {
  loadSettings().then(saved => {
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
      saveSetting(filtered);
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
  if (data.fontFamily)    els.fontFamilySelect.value = data.fontFamily;
  if (data.theme)         els.themeSelect.value      = data.theme;
  if (data.orpColor)      els.orpColor.value         = data.orpColor;
  if (data.skipShortWords)  els.skipShortWords.checked  = true;
  if (data.pauseAtSentence) els.pauseAtSentence?.checked && (els.pauseAtSentence.checked = true);
  if (data.dimPage)         els.dimPage      && (els.dimPage.checked      = true);
  if (data.bionicReading)   els.bionicReading && (els.bionicReading.checked = true);

  if (els.sentencePauseSlider && data.sentencePause != null) {
    els.sentencePauseSlider.value = data.sentencePause;
    document.getElementById('sentence-pause-display').textContent = parseFloat(data.sentencePause).toFixed(1);
  }
  if (els.commaPauseSlider && data.commaPause != null) {
    els.commaPauseSlider.value = data.commaPause;
    document.getElementById('comma-pause-display').textContent = parseFloat(data.commaPause).toFixed(1);
  }
  if (els.paragraphPauseSlider && data.paragraphPause != null) {
    els.paragraphPauseSlider.value = data.paragraphPause;
    document.getElementById('paragraph-pause-display').textContent = parseFloat(data.paragraphPause).toFixed(1);
  }
  if (els.contentModeSelect && data.contentMode) els.contentModeSelect.value = data.contentMode;
  if (els.dailyGoalInput && data.dailyGoal != null) els.dailyGoalInput.value = data.dailyGoal;
}

function updatePresetActive(wpm) {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.wpm, 10) === wpm);
  });
}

function attachPersistListeners(els) {
  const saveWpm = debounce(val => saveSetting({ wpm: val }), 300);
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
      saveSetting({ wpm: val });
    });
  });

  els.fontSlider.addEventListener('input', () => {
    const val = parseInt(els.fontSlider.value, 10);
    els.fontDisplay.textContent = val;
    els.fontSlider.setAttribute('aria-valuenow', val);
    saveSetting({ fontSize: val });
  });

  els.fontFamilySelect.addEventListener('change', () =>
    saveSetting({ fontFamily: els.fontFamilySelect.value }));

  els.themeSelect.addEventListener('change', () =>
    saveSetting({ theme: els.themeSelect.value }));

  els.orpColor.addEventListener('input', () =>
    saveSetting({ orpColor: els.orpColor.value }));

  els.skipShortWords.addEventListener('change', () =>
    saveSetting({ skipShortWords: els.skipShortWords.checked }));

  document.querySelectorAll('input[name="displayMode"]').forEach(r =>
    r.addEventListener('change', () => saveSetting({ displayMode: r.value })));

  document.querySelectorAll('input[name="wordsPerChunk"]').forEach(r =>
    r.addEventListener('change', () =>
      saveSetting({ wordsPerChunk: parseInt(r.value, 10) })));

  document.querySelectorAll('input[name="source"]').forEach(r =>
    r.addEventListener('change', () =>
      els.customSection.classList.toggle('hidden', !els.radioCustom.checked)));

  if (els.pauseAtSentence) {
    els.pauseAtSentence.addEventListener('change', () =>
      saveSetting({ pauseAtSentence: els.pauseAtSentence.checked }));
  }
  if (els.dimPage) {
    els.dimPage.addEventListener('change', () =>
      saveSetting({ dimPage: els.dimPage.checked }));
  }
  if (els.bionicReading) {
    els.bionicReading.addEventListener('change', () =>
      saveSetting({ bionicReading: els.bionicReading.checked }));
  }

  const makePauseSliderListener = (slider, displayId, storageKey) => {
    if (!slider) return;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      const display = document.getElementById(displayId);
      if (display) display.textContent = val.toFixed(1);
      saveSetting({ [storageKey]: val });
    });
  };
  makePauseSliderListener(els.sentencePauseSlider,  'sentence-pause-display',  'sentencePause');
  makePauseSliderListener(els.commaPauseSlider,     'comma-pause-display',     'commaPause');
  makePauseSliderListener(els.paragraphPauseSlider, 'paragraph-pause-display', 'paragraphPause');

  if (els.contentModeSelect) {
    els.contentModeSelect.addEventListener('change', () =>
      saveSetting({ contentMode: els.contentModeSelect.value }));
  }

  if (els.dailyGoalInput) {
    const saveDailyGoal = debounce(val => saveSetting({ dailyGoal: val }), 500);
    els.dailyGoalInput.addEventListener('input', () => {
      const val = parseInt(els.dailyGoalInput.value, 10) || 0;
      saveDailyGoal(val);
    });
  }
}

// ---------------------------------------------------------------------------
// Keymap UI
// ---------------------------------------------------------------------------

function setupKeymapUI(savedKeymap) {
  const km = { ...DEFAULT_KEYMAP, ...savedKeymap };

  document.querySelectorAll('.keymap-btn').forEach(btn => {
    const action = btn.dataset.action;
    if (action && km[action]) btn.textContent = km[action];
  });

  document.querySelectorAll('.keymap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.keymap-btn.recording').forEach(b => {
        b.classList.remove('recording');
        b.textContent = km[b.dataset.action] || DEFAULT_KEYMAP[b.dataset.action] || '';
      });

      btn.classList.add('recording');
      btn.textContent = t('keymapRecording');

      const onKey = async e => {
        e.preventDefault();
        e.stopPropagation();
        const code = e.code;
        if (['ShiftLeft','ShiftRight','ControlLeft','ControlRight',
             'AltLeft','AltRight','MetaLeft','MetaRight'].includes(code)) return;

        btn.classList.remove('recording');
        km[btn.dataset.action] = code;
        btn.textContent = code;
        document.removeEventListener('keydown', onKey, true);
        saveSetting({ keymap: { ...km } });
      };

      document.addEventListener('keydown', onKey, true);

      const onClickOut = e => {
        if (!btn.contains(e.target)) {
          btn.classList.remove('recording');
          btn.textContent = km[btn.dataset.action] || DEFAULT_KEYMAP[btn.dataset.action] || '';
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('click', onClickOut, true);
        }
      };
      setTimeout(() => document.addEventListener('click', onClickOut, true), 0);
    });
  });

  const resetBtn = document.getElementById('keymap-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.assign(km, DEFAULT_KEYMAP);
      document.querySelectorAll('.keymap-btn').forEach(btn => {
        const action = btn.dataset.action;
        btn.classList.remove('recording');
        if (action) btn.textContent = DEFAULT_KEYMAP[action] || '';
      });
      saveSetting({ keymap: { ...DEFAULT_KEYMAP } });
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.lang = browser.i18n.getUILanguage().split('-')[0];
  applyI18n();

  // Migrate local settings to sync storage (once, silently)
  migrateToSync();

  const els = {
    slider:               document.getElementById('wpm-slider'),
    wpmDisplay:           document.getElementById('wpm-display'),
    startBtn:             document.getElementById('start-btn'),
    radioCustom:          document.getElementById('radio-custom'),
    customSection:        document.getElementById('custom-text-section'),
    customText:           document.getElementById('custom-text'),
    fontSlider:           document.getElementById('font-size-slider'),
    fontDisplay:          document.getElementById('font-size-display'),
    fontFamilySelect:     document.getElementById('font-family-select'),
    themeSelect:          document.getElementById('theme-select'),
    orpColor:             document.getElementById('orp-color'),
    skipShortWords:       document.getElementById('skip-short-words'),
    addToListBtn:         document.getElementById('add-to-list-btn'),
    pauseAtSentence:      document.getElementById('pause-at-sentence'),
    dimPage:              document.getElementById('dim-page'),
    bionicReading:        document.getElementById('bionic-reading'),
    sentencePauseSlider:  document.getElementById('sentence-pause-slider'),
    commaPauseSlider:     document.getElementById('comma-pause-slider'),
    paragraphPauseSlider: document.getElementById('paragraph-pause-slider'),
    contentModeSelect:    document.getElementById('content-mode-select'),
    dailyGoalInput:       document.getElementById('daily-goal-input'),
  };

  // Load settings from sync (with local fallback) + stats from local
  const [data, localData] = await Promise.all([
    loadSettings(),
    browser.storage.local.get('stats'),
  ]);
  const stats = localData.stats;

  restoreSettingsUI(data, els);
  updatePresetActive(data.wpm || 300);
  displayStats(stats, data.dailyGoal || 0);
  setupKeymapUI(data.keymap || {});

  document.getElementById('clear-stats-btn').addEventListener('click', async () => {
    await browser.storage.local.remove('stats');
    displayStats(null, 0);
    showStatus(t('statsCleared'));
  });

  const exportStatsBtn = document.getElementById('export-stats-btn');
  if (exportStatsBtn) {
    exportStatsBtn.addEventListener('click', () => exportStatsCsv(stats));
  }

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
  renderTabBookmarks(activeTab);

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
