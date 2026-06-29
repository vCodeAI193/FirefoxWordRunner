// Pure functions (processWords, splitAtOrp, getWordDuration, estimateReadingMs) loaded
// from lib/wordprocessor.js, which is injected before this script.

// ---------------------------------------------------------------------------
// i18n shorthand
// ---------------------------------------------------------------------------

function t(key) {
  return browser.i18n.getMessage(key) || key;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_KEYMAP = {
  pause:   'Space',
  stop:    'Escape',
  skipFwd: 'ArrowRight',
  skipBwd: 'ArrowLeft',
  speedUp: 'Equal',
  speedDn: 'Minus',
};

const WR = {
  // Session
  active: false,
  paused: false,
  words: [],
  wordIndex: 0,
  wpm: 300,
  wordsPerChunk: 1,
  displayMode: 'overlay',   // 'overlay' | 'highlight'
  theme: 'auto',            // cached from settings so scheme-change handler needs no storage read
  intervalMs: 200,
  timeoutId: null,
  lastTickTime: null,
  lastScheduledDuration: 200,
  sessionStartTime: null,
  lastStartParams: null,

  // Feature settings
  pauseAtSentence: false,
  pauseOpts: { sentencePause: 0.6, commaPause: 0.3, paragraphPause: 2.5 },
  contentMode: 'smart',
  keymap: { ...DEFAULT_KEYMAP },
  dimPage: false,
  bionicReading: false,

  // Overlay (Shadow DOM)
  shadowHost: null,
  shadowRoot: null,

  // Highlight mode
  wordPositions: null,      // Array<{ node, start, end }> | null
  highlightBox: null,
  highlightBox2: null,
  highlightControls: null,
  lastHighlightedIndex: -1,

  // Accessibility
  previousFocus: null,
};

// Paragraph-break token inserted between block-level elements
const PARA_MARKER = '¶';

// Position map cache (highlight mode) — reuse across sessions on the same page
let _posCache = null;
let _posCacheKey = null;

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ---------------------------------------------------------------------------
// Settings storage: try sync first, fall back to local
// ---------------------------------------------------------------------------

async function getSettings(keys) {
  try {
    const syncData = await browser.storage.sync.get(keys);
    const missing = keys.filter(k => syncData[k] === undefined);
    if (missing.length === 0) return syncData;
    const localData = await browser.storage.local.get(missing);
    return { ...localData, ...syncData };
  } catch {
    return browser.storage.local.get(keys);
  }
}

function bionicBoldLength(word) {
  const alpha = word.replace(/\W/g, '').length || 1;
  if (alpha <= 1) return 1;
  if (alpha <= 4) return Math.ceil(alpha / 2);
  if (alpha <= 7) return 3;
  return Math.ceil(alpha * 0.45);
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'ping':
      sendResponse({
        active: WR.active,
        paused: WR.paused,
        wordIndex: WR.wordIndex,
        totalWords: WR.words.length,
      });
      break;

    case 'start':
      startSession(message.wpm, message.source, message.text)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      break;

    case 'pause':
      pauseSession();
      sendResponse({ ok: true, active: true, paused: true, wordIndex: WR.wordIndex, totalWords: WR.words.length });
      break;

    case 'resume':
      resumeSession();
      sendResponse({ ok: true, active: true, paused: false, wordIndex: WR.wordIndex, totalWords: WR.words.length });
      break;

    case 'stop':
      stopSession();
      sendResponse({ ok: true, active: false, paused: false });
      break;

    case 'countWords': {
      const raw = extractText('page', '');
      const count = processWords(raw).filter(w => w !== PARA_MARKER).length;
      sendResponse({ count });
      break;
    }
    default:
      sendResponse({ error: 'unknown action' });
      break;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'NAV', 'HEADER', 'FOOTER', 'ASIDE',
  'BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'FORM',
  'MENU', 'MENUITEM', 'FIGURE', 'FIGCAPTION',
]);

function contentNodeFilter(node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.id === 'word-runner-host') return NodeFilter.FILTER_REJECT;
    if (node.id === 'wr-mini-controls') return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
    const style = window.getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    ) {
      return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_SKIP;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }
  return NodeFilter.FILTER_REJECT;
}

const BLOCK_ELEMENTS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE',
  'ARTICLE', 'SECTION', 'MAIN',
  'UL', 'OL', 'DL', 'DT', 'DD', 'ADDRESS',
]);

function getBlockAncestor(node) {
  let el = node.parentElement;
  while (el) {
    if (BLOCK_ELEMENTS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return document.body;
}

function createContentWalker(root) {
  return document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    { acceptNode: contentNodeFilter }
  );
}

const MINIMAL_ANCESTORS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'PRE']);

function getContentRoot(mode) {
  if (mode === 'article') {
    return (
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body
    );
  }
  // 'smart' and 'minimal' use full heuristic root
  return (
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    document.querySelector('.post-body') ||
    document.querySelector('.article-body') ||
    document.body
  );
}

function extractText(source, customText, contentMode = 'smart') {
  if (source === 'custom') return customText || '';
  if (source === 'selection') {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return sel.toString().trim();
    showPageToast(t('noSelectionFound'));
    return '';
  }
  const walker = createContentWalker(getContentRoot(contentMode));
  const chunks = [];
  let lastBlockParent = null;
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!text) continue;
      const blockParent = getBlockAncestor(node);
      if (contentMode === 'minimal' && !MINIMAL_ANCESTORS.has(blockParent?.tagName)) continue;
      if (lastBlockParent !== null && blockParent !== lastBlockParent) chunks.push(PARA_MARKER);
      chunks.push(text);
      lastBlockParent = blockParent;
    }
  }
  return chunks.join(' ');
}

// Builds words + DOM position map in one pass (for highlight mode).
function extractWordsWithPositions(root, contentMode = 'smart') {
  const words = [];
  const positions = [];
  const walker = createContentWalker(root);
  const wordRegex = /\S+/g;
  let lastBlockParent = null;

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const blockParent = getBlockAncestor(node);
    if (contentMode === 'minimal' && !MINIMAL_ANCESTORS.has(blockParent?.tagName)) continue;
    if (lastBlockParent !== null && blockParent !== lastBlockParent) {
      words.push(PARA_MARKER);
      positions.push({ node: null, start: 0, end: 0, marker: true });
    }
    lastBlockParent = blockParent;

    const raw = node.textContent;
    wordRegex.lastIndex = 0;
    let match;
    while ((match = wordRegex.exec(raw)) !== null) {
      const token = match[0];
      const word = token.length > 25 ? token.slice(0, 22) + '...' : token;
      words.push(word);
      positions.push({ node, start: match.index, end: match.index + token.length });
    }
  }
  return { words, positions };
}

// ---------------------------------------------------------------------------
// Position persistence (per-URL map)
// ---------------------------------------------------------------------------

function pageKey() {
  return location.origin + location.pathname;
}

async function savePosition() {
  if (WR.wordIndex <= 0 || WR.words.length === 0) return;
  try {
    const data = await browser.storage.local.get('readPositions');
    const map = data.readPositions || {};
    map[pageKey()] = { wordIndex: WR.wordIndex, ts: Date.now() };
    // Keep at most 50 entries — evict oldest
    const keys = Object.keys(map);
    if (keys.length > 50) {
      keys.sort((a, b) => map[a].ts - map[b].ts);
      keys.slice(0, keys.length - 50).forEach(k => delete map[k]);
    }
    await browser.storage.local.set({ readPositions: map });
  } catch { /* storage unavailable */ }
}

async function restorePosition(words) {
  try {
    const data = await browser.storage.local.get('readPositions');
    const saved = (data.readPositions || {})[pageKey()];
    if (saved && saved.wordIndex > 0 && saved.wordIndex < words.length) {
      return saved.wordIndex;
    }
  } catch { /* storage unavailable */ }
  return 0;
}

async function clearSavedPosition() {
  try {
    const data = await browser.storage.local.get('readPositions');
    const map = data.readPositions || {};
    delete map[pageKey()];
    await browser.storage.local.set({ readPositions: map });
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

async function saveStats(wordsRead) {
  if (wordsRead <= 0 || !WR.sessionStartTime) return;
  const elapsed = Date.now() - WR.sessionStartTime;
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  try {
    const data = await browser.storage.local.get('stats');
    const s = data.stats || {};
    const history = s.history || [];
    history.push({
      date:       Date.now(),
      url:        location.href,
      title:      document.title || location.hostname,
      wordsRead,
      wpm:        WR.wpm,
      durationMs: elapsed,
    });
    if (history.length > 30) history.splice(0, history.length - 30);

    // Streak and daily word tracking
    const lastDate = s.lastReadDate;
    let streakDays = s.streakDays || 0;
    let todayWords = s.todayWords || 0;

    if (lastDate === todayStr) {
      todayWords += wordsRead;
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      streakDays = lastDate === yesterdayStr ? streakDays + 1 : 1;
      todayWords = wordsRead;
    }

    await browser.storage.local.set({
      stats: {
        totalWords:   (s.totalWords || 0) + wordsRead,
        sessions:     (s.sessions   || 0) + 1,
        totalMs:      (s.totalMs    || 0) + elapsed,
        history,
        lastReadDate: todayStr,
        streakDays,
        todayWords,
      },
    });
  } catch { /* storage unavailable */ }
}

async function saveBookmark() {
  const key = pageKey();
  const idx = WR.wordIndex;
  try {
    const data = await browser.storage.local.get('readBookmarks');
    const map = data.readBookmarks || {};
    const list = map[key] || [];
    list.push({ wordIndex: idx, ts: Date.now() });
    if (list.length > 10) list.splice(0, list.length - 10);
    map[key] = list;
    await browser.storage.local.set({ readBookmarks: map });
    showPageToast(tParam('toastBookmarkSaved', { index: idx }));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Time estimation
// ---------------------------------------------------------------------------

function formatTimeRemaining(wordsLeft, wpm) {
  if (wordsLeft <= 0 || wpm <= 0) return '';
  const ms = estimateReadingMs(wordsLeft, wpm);
  if (ms < 60000) return t('timeRemainingShort') || '< 1 min';
  return `~${Math.ceil(ms / 60000)} min`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// hexToRgba is defined in lib/utils.js (loaded before this script)

function setBadge(text, color = '#4fc3f7') {
  browser.runtime.sendMessage({ action: 'setBadge', text, color }).catch(() => {});
}

function tParam(key, params) {
  let msg = browser.i18n.getMessage(key) || key;
  Object.entries(params).forEach(([k, v]) => { msg = msg.replace(`{${k}}`, v); });
  return msg;
}

function showPageToast(message, durationMs = 2500) {
  const existing = document.getElementById('wr-page-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'wr-page-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

// ---------------------------------------------------------------------------
// Overlay CSS (injected into shadow root)
// ---------------------------------------------------------------------------

const OVERLAY_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.wr-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: var(--wr-bg, rgba(10, 10, 25, 0.93));
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  font-family: var(--wr-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  color: var(--wr-text, #e8eaf6);
  user-select: none;
}

.wr-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--wr-border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.wr-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  color: var(--wr-text, #e8eaf6);
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
  padding: 0;
}
.wr-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.4); }
.wr-btn:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 2px; }
.wr-btn svg { width: 15px; height: 15px; fill: currentColor; }

.wr-progress { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.wr-progress-bar {
  height: 4px;
  background: var(--wr-progress-bg, rgba(255,255,255,0.12));
  border-radius: 2px;
  overflow: hidden;
}
.wr-progress-fill {
  height: 100%;
  background: #4fc3f7;
  border-radius: 2px;
  transition: width 0.12s linear;
  width: 0%;
}
.wr-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.wr-progress-text {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  border-radius: 3px;
  padding: 0 2px;
}
.wr-progress-text:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.06); }
.wr-jump-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.4);
  color: rgba(255,255,255,0.7);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-family: inherit;
  width: 70px;
  padding: 0;
  outline: none;
}
.wr-time-remaining {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
}

.wr-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
}

.wr-guide {
  width: 2px;
  height: 18px;
  background: var(--wr-guide-color, rgba(79,195,247,0.35));
  border-radius: 1px;
}

.wr-word-display {
  display: flex;
  align-items: center;
  font-size: var(--wr-font-size, 48px);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  min-height: 80px;
  gap: 0.3ch;
}

.wr-word-left  { color: var(--wr-text, #e8eaf6); min-width: 3ch; text-align: right; display: inline-block; }
.wr-word-focus { color: var(--wr-orp, #ef5350); font-weight: 700; }
.wr-word-right { color: var(--wr-text, #e8eaf6); min-width: 8ch; text-align: left; display: inline-block; }
.wr-word-two   { color: var(--wr-text, #e8eaf6); opacity: 0.75; }
.wr-preview-word { display: block; font-size: 60%; opacity: 0.4; margin-top: 6px; color: var(--wr-text, #e8eaf6); }

@keyframes wr-flash {
  0%   { opacity: 0.35; transform: scale(0.96); }
  25%  { opacity: 1;    transform: scale(1); }
  100% { opacity: 1;    transform: scale(1); }
}
.wr-word-display.animating {
  animation: wr-flash 0.12s ease-out forwards;
}

.wr-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid var(--wr-border, rgba(255,255,255,0.08));
  justify-content: center;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.wr-speed-control { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.wr-wpm-slider {
  -webkit-appearance: none; appearance: none;
  width: 110px; height: 4px;
  background: rgba(255,255,255,0.15);
  border-radius: 2px; outline: none; cursor: pointer;
}
.wr-wpm-slider::-moz-range-thumb {
  width: 13px; height: 13px;
  background: #4fc3f7;
  border: none; border-radius: 50%; cursor: pointer;
  transition: transform 0.1s;
}
.wr-wpm-slider:hover::-moz-range-thumb { transform: scale(1.2); }
.wr-wpm-slider:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 3px; }
.wr-wpm-label { font-size: 11px; color: rgba(255,255,255,0.4); font-variant-numeric: tabular-nums; }

.wr-hint { font-size: 11px; color: rgba(255,255,255,0.28); }

.wr-word-display.bionic .wr-word-focus {
  color: var(--wr-text, #e8eaf6);
  font-weight: 800;
}

.wr-done-msg {
  font-size: 18px;
  color: #4fc3f7;
  font-weight: 600;
  text-align: center;
}

.wr-restart-btn {
  margin-top: 10px;
  font-size: 13px;
  padding: 6px 16px;
}

@media (prefers-reduced-motion: reduce) {
  .wr-word-display.animating { animation: none; }
  .wr-progress-fill { transition: none; }
  .wr-btn { transition: none; }
}

@media (forced-colors: active) {
  .wr-overlay { background: Canvas; color: CanvasText; }
  .wr-btn { border-color: ButtonText; color: ButtonText; }
  .wr-btn:hover { background: Highlight; color: HighlightText; }
  .wr-word-focus { color: Highlight; }
  .wr-progress-fill { background: Highlight; }
  .wr-done-msg { color: Highlight; }
}
`;

// ---------------------------------------------------------------------------
// Overlay HTML
// ---------------------------------------------------------------------------

const OVERLAY_HTML = `
<div class="wr-overlay">
  <div class="wr-toolbar">
    <button class="wr-btn wr-stop-btn" aria-label="${t('stopAriaLabel')}">
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
      </svg>
    </button>
    <div class="wr-progress">
      <div class="wr-progress-bar"><div class="wr-progress-fill"></div></div>
      <div class="wr-progress-meta">
        <span class="wr-progress-text" tabindex="0" role="button" title="${t('jumpToWordTitle')}">0 / 0</span>
        <span class="wr-time-remaining"></span>
      </div>
    </div>
  </div>

  <div class="wr-center">
    <div class="wr-guide wr-guide-top"></div>
    <div class="wr-word-display" role="status" aria-live="off" aria-atomic="true">
      <span class="wr-word-left"></span><span class="wr-word-focus"></span><span class="wr-word-right"></span><span class="wr-word-two"></span>
      <div class="wr-preview-word" aria-label="Next word preview"></div>
    </div>
    <div class="wr-guide wr-guide-bottom"></div>
  </div>

  <div class="wr-controls">
    <button class="wr-btn wr-play-pause-btn" aria-label="${t('pauseAriaLabel')}">
      <svg class="icon-pause" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5m5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5"/>
      </svg>
      <svg class="icon-play" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="display:none">
        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/>
      </svg>
    </button>
    <div class="wr-speed-control">
      <input type="range" class="wr-wpm-slider" min="100" max="1000" step="25" value="300" aria-label="Reading speed">
      <span class="wr-wpm-label"><span class="wr-wpm-val">300</span> WPM</span>
    </div>
    <span class="wr-hint">${t('hintText')}</span>
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Overlay management (Shadow DOM)
// ---------------------------------------------------------------------------

function buildOverlay() {
  if (WR.shadowHost) return;

  const host = document.createElement('div');
  host.id = 'word-runner-host';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', t('overlayAriaLabel'));
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = OVERLAY_HTML;
  shadow.appendChild(wrapper.firstElementChild);

  WR.shadowHost = host;
  WR.shadowRoot = shadow;

  shadow.querySelector('.wr-play-pause-btn').addEventListener('click', () => {
    if (WR.paused) resumeSession(); else pauseSession();
  });
  shadow.querySelector('.wr-stop-btn').addEventListener('click', stopSession);

  const saveWpm = debounce(val => browser.storage.local.set({ wpm: val }), 300);
  shadow.querySelector('.wr-wpm-slider').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    shadow.querySelector('.wr-wpm-val').textContent = val;
    WR.wpm = val;
    WR.intervalMs = Math.round(60000 / val);
    saveWpm(val);
  });

  const progressText = shadow.querySelector('.wr-progress-text');

  function activateJumpInput() {
    if (!WR.active) return;
    const savedIndex = WR.wordIndex;
    const total = WR.words.length;
    const wasPaused = WR.paused;
    if (!wasPaused) pauseSession();

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'wr-jump-input';
    input.min = '0';
    input.max = String(total - 1);
    input.value = String(savedIndex);
    progressText.textContent = '';
    progressText.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      const val = parseInt(input.value, 10);
      let idx = isNaN(val) ? savedIndex : Math.max(0, Math.min(val, total - 1));
      while (idx < total - 1 && WR.words[idx] === PARA_MARKER) idx++;
      WR.wordIndex = idx;
      progressText.textContent = `${WR.wordIndex} / ${total}`;
      if (!wasPaused) resumeSession(); else updateProgress();
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.removeEventListener('blur', commit); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); input.removeEventListener('blur', commit); WR.wordIndex = savedIndex; progressText.textContent = `${savedIndex} / ${total}`; if (!wasPaused) resumeSession(); }
    });
    input.addEventListener('blur', commit);
  }

  progressText.addEventListener('click', activateJumpInput);
  progressText.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateJumpInput(); }
  });
}

const FONT_FAMILY_MAP = {
  serif:  '"Georgia", "Times New Roman", serif',
  mono:   '"Courier New", "Courier", monospace',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

function resolveTheme(theme) {
  if (theme !== 'auto') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyColorScheme(resolvedTheme) {
  const h = WR.shadowHost;
  if (!h) return;
  if (resolvedTheme === 'light') {
    h.style.setProperty('--wr-bg',          'rgba(255, 255, 248, 0.97)');
    h.style.setProperty('--wr-text',         '#1a1a2e');
    h.style.setProperty('--wr-guide-color',  'rgba(0, 100, 160, 0.35)');
    h.style.setProperty('--wr-border',       'rgba(0, 0, 0, 0.1)');
    h.style.setProperty('--wr-progress-bg',  'rgba(0, 0, 0, 0.1)');
  } else {
    h.style.setProperty('--wr-bg',          'rgba(10, 10, 25, 0.93)');
    h.style.setProperty('--wr-text',         '#e8eaf6');
    h.style.setProperty('--wr-guide-color',  'rgba(79,195,247,0.35)');
    h.style.setProperty('--wr-border',       'rgba(255,255,255,0.08)');
    h.style.setProperty('--wr-progress-bg',  'rgba(255,255,255,0.12)');
  }
}

function applyTheme(theme, orpColor, fontSize, fontFamily) {
  const h = WR.shadowHost;
  if (!h) return;
  h.style.setProperty('--wr-font-size', `${fontSize}px`);
  h.style.setProperty('--wr-orp', orpColor);
  h.style.setProperty('--wr-font-family', FONT_FAMILY_MAP[fontFamily] || FONT_FAMILY_MAP.system);
  applyColorScheme(resolveTheme(theme));
}

function reapplyThemeOnSchemeChange() {
  if (!WR.active) return;
  const resolved = resolveTheme(WR.theme);
  if (WR.displayMode === 'overlay' && WR.shadowHost) {
    applyColorScheme(resolved);
  } else if (WR.displayMode === 'highlight' && WR.highlightControls) {
    WR.highlightControls.dataset.theme = resolved;
  }
}

function showOverlay() { WR.shadowHost.classList.add('active'); }
function hideOverlay()  { if (WR.shadowHost) WR.shadowHost.classList.remove('active'); }

function updatePlayPauseIcon() {
  if (!WR.shadowRoot) return;
  const btn       = WR.shadowRoot.querySelector('.wr-play-pause-btn');
  const pauseIcon = WR.shadowRoot.querySelector('.icon-pause');
  const playIcon  = WR.shadowRoot.querySelector('.icon-play');
  if (WR.paused) {
    pauseIcon.style.display = 'none';
    playIcon.style.display  = '';
    btn.setAttribute('aria-label', t('resumeAriaLabel'));
  } else {
    pauseIcon.style.display = '';
    playIcon.style.display  = 'none';
    btn.setAttribute('aria-label', t('pauseAriaLabel'));
  }
}

// ---------------------------------------------------------------------------
// Highlight mode
// ---------------------------------------------------------------------------

function buildHighlightUI() {
  if (document.getElementById('wr-highlight-box')) return;

  const box = document.createElement('div');
  box.id = 'wr-highlight-box';
  document.body.appendChild(box);

  const box2 = document.createElement('div');
  box2.id = 'wr-highlight-box-2';
  document.body.appendChild(box2);

  const controls = document.createElement('div');
  controls.id = 'wr-mini-controls';
  controls.innerHTML = `
    <span class="wr-mini-progress">0 / 0</span>
    <button class="wr-mini-btn wr-mini-play-pause" aria-label="${t('pauseAriaLabel')}">${t('miniPauseLabel')}</button>
    <button class="wr-mini-btn wr-mini-stop" aria-label="${t('stopAriaLabel')}">${t('miniStopLabel')}</button>
    <span class="wr-mini-time"></span>
  `;
  document.body.appendChild(controls);

  controls.querySelector('.wr-mini-play-pause').addEventListener('click', () => {
    if (WR.paused) resumeSession(); else pauseSession();
  });
  controls.querySelector('.wr-mini-stop').addEventListener('click', stopSession);

  // Drag support for the mini-controls bar
  let dragState = null;
  function onDragMove(e) {
    if (!dragState) return;
    controls.style.left = `${dragState.origLeft + e.clientX - dragState.startX}px`;
    controls.style.top  = `${Math.max(0, dragState.origTop + e.clientY - dragState.startY)}px`;
  }
  function onDragUp() {
    if (!dragState) return;
    dragState = null;
    controls.style.cursor = '';
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    browser.storage.local.set({
      miniControlsPosition: { top: controls.style.top, left: controls.style.left },
    }).catch(() => {});
  }
  controls.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.wr-mini-btn')) return;
    const bcr = controls.getBoundingClientRect();
    controls.style.transform = 'none';
    controls.style.right = 'auto';
    controls.style.left  = `${bcr.left}px`;
    controls.style.top   = `${bcr.top}px`;
    dragState = { startX: e.clientX, startY: e.clientY, origLeft: bcr.left, origTop: bcr.top };
    controls.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
    e.preventDefault();
  });
  WR._cleanupDrag = () => {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
  };

  WR.highlightBox      = box;
  WR.highlightBox2     = box2;
  WR.highlightControls = controls;
}

function removeHighlightUI() {
  WR._cleanupDrag?.();
  WR._cleanupDrag = null;
  WR.highlightBox?.remove();
  WR.highlightBox2?.remove();
  WR.highlightControls?.remove();
  WR.highlightBox      = null;
  WR.highlightBox2     = null;
  WR.highlightControls = null;
}

function positionHighlightBox(box, pos) {
  if (!pos || pos.marker || !box) { box && (box.style.display = 'none'); return false; }
  try {
    const range = document.createRange();
    range.setStart(pos.node, pos.start);
    range.setEnd(pos.node, Math.min(pos.end, pos.node.textContent.length));
    const rect = range.getBoundingClientRect();
    box.style.display = 'block';
    box.style.top    = `${rect.top  + window.scrollY}px`;
    box.style.left   = `${rect.left + window.scrollX}px`;
    box.style.width  = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    return rect;
  } catch { box.style.display = 'none'; return false; }
}

function highlightWordAt(index) {
  if (!WR.wordPositions || index >= WR.wordPositions.length) return;
  const pos = WR.wordPositions[index];

  // ¶ marker — hide boxes during paragraph pause
  if (!pos || pos.marker) {
    if (WR.highlightBox)  WR.highlightBox.style.display  = 'none';
    if (WR.highlightBox2) WR.highlightBox2.style.display = 'none';
    return;
  }

  if (!WR.highlightBox) return;

  const rect = positionHighlightBox(WR.highlightBox, pos);
  if (rect) {
    WR.highlightBox.style.boxShadow = WR.dimPage ? '0 0 0 9999px rgba(0,0,0,0.65)' : '';
    if (rect.top < 120 || rect.bottom > window.innerHeight - 120) {
      pos.node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Second word box (2-word mode)
  if (WR.highlightBox2) {
    const pos2 = WR.wordsPerChunk >= 2 ? WR.wordPositions[index + 1] : null;
    positionHighlightBox(WR.highlightBox2, pos2);
  }
}

function updateHighlightControls() {
  if (!WR.highlightControls) return;
  const prog = WR.highlightControls.querySelector('.wr-mini-progress');
  const time = WR.highlightControls.querySelector('.wr-mini-time');
  const btn  = WR.highlightControls.querySelector('.wr-mini-play-pause');
  if (prog) prog.textContent = `${WR.wordIndex} / ${WR.words.length}`;
  if (time) time.textContent = formatTimeRemaining(WR.words.length - WR.wordIndex, WR.wpm);
  if (btn) {
    btn.textContent = WR.paused ? t('miniResumeLabel') : t('miniPauseLabel');
    btn.setAttribute('aria-label', WR.paused ? t('resumeAriaLabel') : t('pauseAriaLabel'));
  }
}

// ---------------------------------------------------------------------------
// Word / chunk display
// ---------------------------------------------------------------------------

function renderChunkInOverlay(chunk) {
  if (!WR.shadowRoot || !chunk.length) return;
  const el = WR.shadowRoot.querySelector('.wr-word-display');

  // Paragraph break — clear display and skip animation
  if (chunk[0] === PARA_MARKER) {
    WR.shadowRoot.querySelector('.wr-word-left').textContent  = '';
    WR.shadowRoot.querySelector('.wr-word-focus').textContent = '';
    WR.shadowRoot.querySelector('.wr-word-right').textContent = '';
    WR.shadowRoot.querySelector('.wr-word-two').textContent   = '';
    WR.shadowRoot.querySelector('.wr-preview-word').textContent = '';
    return;
  }

  if (WR.bionicReading) {
    const boldLen = bionicBoldLength(chunk[0]);
    WR.shadowRoot.querySelector('.wr-word-left').textContent  = '';
    WR.shadowRoot.querySelector('.wr-word-focus').textContent = chunk[0].slice(0, boldLen);
    WR.shadowRoot.querySelector('.wr-word-right').textContent = chunk[0].slice(boldLen);
    el.classList.add('bionic');
  } else {
    const { before, focus, after } = splitAtOrp(chunk[0]);
    WR.shadowRoot.querySelector('.wr-word-left').textContent  = before;
    WR.shadowRoot.querySelector('.wr-word-focus').textContent = focus;
    WR.shadowRoot.querySelector('.wr-word-right').textContent = after;
    el.classList.remove('bionic');
  }

  const second = chunk[1] && chunk[1] !== PARA_MARKER ? chunk[1] : '';
  WR.shadowRoot.querySelector('.wr-word-two').textContent = second ? ' ' + second : '';

  const third = chunk[2] && chunk[2] !== PARA_MARKER ? chunk[2] : (WR.words[WR.wordIndex + 2] || '');
  WR.shadowRoot.querySelector('.wr-preview-word').textContent = third ? `${third}` : '';

  el.classList.remove('animating');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('animating');
}

function updateProgress() {
  const total   = WR.words.length;
  const current = WR.wordIndex;
  const pct     = total > 0 ? (current / total) * 100 : 0;
  const timeStr = formatTimeRemaining(total - current, WR.wpm);

  if (WR.displayMode === 'highlight') {
    updateHighlightControls();
    return;
  }
  if (!WR.shadowRoot) return;
  WR.shadowRoot.querySelector('.wr-progress-fill').style.width = `${pct.toFixed(1)}%`;
  WR.shadowRoot.querySelector('.wr-progress-text').textContent = `${current} / ${total}`;
  WR.shadowRoot.querySelector('.wr-time-remaining').textContent = timeStr;
}

// ---------------------------------------------------------------------------
// Timing loop
// ---------------------------------------------------------------------------

function scheduleNext(delay) {
  WR.timeoutId = setTimeout(tick, delay);
}

function tick() {
  if (!WR.active || WR.paused) return;

  if (WR.wordIndex >= WR.words.length) {
    finishSession();
    return;
  }

  const chunkStart = WR.wordIndex;
  const chunk = WR.words.slice(chunkStart, chunkStart + WR.wordsPerChunk);

  if (WR.displayMode === 'highlight') {
    if (chunkStart !== WR.lastHighlightedIndex) {
      highlightWordAt(chunkStart);
      WR.lastHighlightedIndex = chunkStart;
    }
  } else {
    renderChunkInOverlay(chunk);
  }

  WR.wordIndex += chunk.length;
  updateProgress();

  const now          = Date.now();
  const wordDuration = getWordDuration(chunk[0], WR.intervalMs, WR.pauseOpts);
  let nextDelay      = wordDuration;

  if (WR.lastTickTime !== null) {
    const drift = (now - WR.lastTickTime) - WR.lastScheduledDuration;
    nextDelay = Math.max(16, wordDuration - drift);
  }

  WR.lastTickTime          = now;
  WR.lastScheduledDuration = wordDuration;

  // Auto-pause at sentence end
  if (WR.pauseAtSentence && chunk[0] !== PARA_MARKER && /[.!?…]$/.test(chunk[0])) {
    WR.timeoutId = setTimeout(() => { if (WR.active && !WR.paused) pauseSession(); }, wordDuration);
    return;
  }

  scheduleNext(nextDelay);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function loadSessionSettings() {
  const s = await getSettings([
    'wordsPerChunk', 'displayMode', 'fontSize', 'fontFamily', 'theme', 'orpColor', 'skipShortWords',
    'pauseAtSentence', 'sentencePause', 'commaPause', 'paragraphPause', 'contentMode', 'keymap',
    'dimPage', 'bionicReading',
  ]);
  return {
    wordsPerChunk:   s.wordsPerChunk || 1,
    displayMode:     s.displayMode   || 'overlay',
    fontSize:        s.fontSize      || 48,
    fontFamily:      s.fontFamily    || 'system',
    theme:           s.theme         || 'dark',
    orpColor:        s.orpColor      || '#ef5350',
    skipShort:       !!s.skipShortWords,
    pauseAtSentence: !!s.pauseAtSentence,
    pauseOpts: {
      sentencePause:  typeof s.sentencePause  === 'number' ? s.sentencePause  : 0.6,
      commaPause:     typeof s.commaPause     === 'number' ? s.commaPause     : 0.3,
      paragraphPause: typeof s.paragraphPause === 'number' ? s.paragraphPause : 2.5,
    },
    contentMode:   s.contentMode || 'smart',
    keymap:        { ...DEFAULT_KEYMAP, ...(s.keymap || {}) },
    dimPage:       !!s.dimPage,
    bionicReading: !!s.bionicReading,
  };
}

function buildSessionWords(displayMode, source, customText, skipShort, contentMode) {
  let words, positions;

  if (displayMode === 'highlight' && source === 'page') {
    const key = pageKey();
    if (!_posCache || _posCacheKey !== key) {
      _posCache    = extractWordsWithPositions(getContentRoot(contentMode), contentMode);
      _posCacheKey = key;
    }
    words     = _posCache.words;
    positions = _posCache.positions;
    if (skipShort) {
      const filtered = words.reduce((acc, w, i) => {
        if (w === PARA_MARKER || w.replace(/\W/g, '').length > 2) acc.push({ w, pos: positions[i] });
        return acc;
      }, []);
      words     = filtered.map(x => x.w);
      positions = filtered.map(x => x.pos);
    }
  } else {
    const raw = processWords(extractText(source, customText, contentMode));
    words     = skipShort ? raw.filter(w => w === PARA_MARKER || w.replace(/\W/g, '').length > 2) : raw;
    positions = null;
  }

  return { words, positions };
}

async function startSession(wpm, source, customText) {
  if (WR.active) stopSession();

  WR.lastStartParams = { wpm, source, customText };
  WR.previousFocus   = document.activeElement;

  const cfg = await loadSessionSettings();

  // Highlight mode needs DOM word positions — only available for 'page' source.
  // For selection/custom sources fall back to overlay silently.
  const displayMode = (cfg.displayMode === 'highlight' && source !== 'page')
    ? 'overlay'
    : cfg.displayMode;

  const { words, positions } = buildSessionWords(displayMode, source, customText, cfg.skipShort, cfg.contentMode);

  if (words.length === 0) {
    showPageToast(t('noWordsFound'));
    return;
  }

  WR.words                 = words;
  WR.wordPositions         = positions;
  WR.wpm                   = wpm;
  WR.wordsPerChunk         = cfg.wordsPerChunk;
  WR.displayMode           = displayMode;
  WR.theme                 = cfg.theme;
  WR.intervalMs            = Math.round(60000 / wpm);
  WR.active                = true;
  WR.paused                = false;
  WR.lastTickTime          = null;
  WR.lastScheduledDuration = WR.intervalMs;
  WR.sessionStartTime      = Date.now();
  WR.pauseAtSentence       = cfg.pauseAtSentence;
  WR.pauseOpts             = cfg.pauseOpts;
  WR.contentMode           = cfg.contentMode;
  WR.keymap                = cfg.keymap;
  WR.dimPage               = cfg.dimPage;
  WR.bionicReading         = cfg.bionicReading;

  WR.wordIndex = source === 'page' ? await restorePosition(words) : 0;
  if (WR.wordIndex > 0) {
    showPageToast(tParam('toastResuming', { current: WR.wordIndex, total: words.length }));
  }

  if (displayMode === 'highlight') {
    buildHighlightUI();
    // Restore previously saved position for the mini-controls bar
    try {
      const posData = await browser.storage.local.get('miniControlsPosition');
      if (posData.miniControlsPosition && WR.highlightControls) {
        const { top, left } = posData.miniControlsPosition;
        WR.highlightControls.style.transform = 'none';
        WR.highlightControls.style.right = 'auto';
        WR.highlightControls.style.left  = left;
        WR.highlightControls.style.top   = top;
      }
    } catch { /* no saved position */ }
    if (WR.highlightBox) {
      WR.highlightBox.style.background  = hexToRgba(cfg.orpColor, 0.28);
      WR.highlightBox.style.borderColor = hexToRgba(cfg.orpColor, 0.65);
    }
    if (WR.highlightBox2) {
      WR.highlightBox2.style.background  = hexToRgba(cfg.orpColor, 0.18);
      WR.highlightBox2.style.borderColor = hexToRgba(cfg.orpColor, 0.45);
    }
    if (WR.highlightControls) {
      WR.highlightControls.dataset.theme = resolveTheme(cfg.theme);
    }
  } else {
    buildOverlay();
    WR.shadowRoot?.querySelector('.wr-done-msg')?.remove();
    const prevRestart = WR.shadowRoot?.querySelector('.wr-restart-btn');
    if (prevRestart) prevRestart.style.display = 'none';
    applyTheme(cfg.theme, cfg.orpColor, cfg.fontSize, cfg.fontFamily);
    showOverlay();
    if (WR.shadowRoot) {
      WR.shadowRoot.querySelector('.wr-wpm-val').textContent = wpm;
      WR.shadowRoot.querySelector('.wr-wpm-slider').value    = wpm;
      WR.shadowRoot.querySelector('.wr-play-pause-btn')?.focus();
    }
    updatePlayPauseIcon();
  }

  setBadge('▶');
  attachKeyboard();

  const firstChunk = words.slice(WR.wordIndex, WR.wordIndex + cfg.wordsPerChunk);
  if (displayMode === 'highlight') highlightWordAt(WR.wordIndex);
  else renderChunkInOverlay(firstChunk);
  WR.wordIndex += firstChunk.length;
  updateProgress();

  const firstDuration      = getWordDuration(firstChunk[0], WR.intervalMs, WR.pauseOpts);
  WR.lastTickTime          = Date.now();
  WR.lastScheduledDuration = firstDuration;
  scheduleNext(firstDuration);
}

function pauseSession() {
  if (!WR.active || WR.paused) return;
  WR.paused = true;
  clearTimeout(WR.timeoutId);
  WR.timeoutId    = null;
  WR.lastTickTime = null;
  updatePlayPauseIcon();
  updateHighlightControls();
  savePosition();
  setBadge('⏸', '#ff9800');
  showPageToast(t('toastPositionSaved'));
}

function resumeSession() {
  if (!WR.active || !WR.paused) return;
  WR.paused = false;
  updatePlayPauseIcon();
  updateHighlightControls();
  WR.lastTickTime = null;
  setBadge('▶');
  scheduleNext(WR.intervalMs);
}

function stopSession() {
  const wordsRead = WR.wordIndex;
  saveStats(wordsRead);
  savePosition();

  WR.active       = false;
  WR.paused       = false;
  clearTimeout(WR.timeoutId);
  WR.timeoutId        = null;
  WR.lastTickTime     = null;
  WR.words            = [];
  WR.wordIndex             = 0;
  WR.wordPositions         = null;
  WR.sessionStartTime      = null;
  WR.lastHighlightedIndex  = -1;

  setBadge('');
  if (WR.displayMode === 'highlight') {
    removeHighlightUI();
  } else {
    hideOverlay();
  }
  detachKeyboard();

  // Restore focus to the element that was active before the overlay opened
  WR.previousFocus?.focus();
  WR.previousFocus = null;
}

function finishSession() {
  const wordsRead = WR.wordIndex;
  saveStats(wordsRead);
  clearSavedPosition();

  WR.active   = false;
  WR.paused   = false;
  clearTimeout(WR.timeoutId);
  WR.timeoutId             = null;
  WR.sessionStartTime      = null;
  WR.lastHighlightedIndex  = -1;
  detachKeyboard();

  if (WR.displayMode === 'highlight') {
    WR.highlightBox?.remove();
    WR.highlightBox2?.remove();
    WR.highlightBox  = null;
    WR.highlightBox2 = null;
    if (WR.highlightControls) {
      WR.highlightControls.querySelector('.wr-mini-progress').textContent =
        `${wordsRead} / ${wordsRead}`;
      WR.highlightControls.querySelector('.wr-mini-time').textContent = '';
      WR.highlightControls.querySelector('.wr-mini-play-pause').style.display = 'none';
    }
    showPageToast(t('doneMsg'));
  } else if (WR.shadowRoot) {
    WR.shadowRoot.querySelector('.wr-word-left').textContent  = '';
    WR.shadowRoot.querySelector('.wr-word-focus').textContent = '';
    WR.shadowRoot.querySelector('.wr-word-right').textContent = '';
    WR.shadowRoot.querySelector('.wr-word-two').textContent   = '';
    const center = WR.shadowRoot.querySelector('.wr-center');
    let doneMsg = center.querySelector('.wr-done-msg');
    if (!doneMsg) {
      doneMsg = document.createElement('p');
      doneMsg.className = 'wr-done-msg';
      center.appendChild(doneMsg);
    }
    doneMsg.textContent = t('doneMsg');
    let restartBtn = center.querySelector('.wr-restart-btn');
    if (!restartBtn) {
      restartBtn = document.createElement('button');
      restartBtn.className = 'wr-restart-btn wr-btn';
      restartBtn.addEventListener('click', () => {
        const p = WR.lastStartParams;
        if (p) startSession(p.wpm, p.source, p.customText);
      });
      center.appendChild(restartBtn);
    }
    restartBtn.textContent  = t('restartReading');
    restartBtn.style.display = '';
    WR.shadowRoot.querySelector('.wr-progress-fill').style.width = '100%';
    WR.shadowRoot.querySelector('.wr-progress-text').textContent =
      `${wordsRead} / ${wordsRead}`;
    WR.shadowRoot.querySelector('.wr-time-remaining').textContent = '';
  }

  // Clear word data — session is over. Restart button uses WR.lastStartParams, not WR.words.
  // Clearing prevents stopSession() (triggered by Escape on the done-screen) from
  // saving a stale end-of-array position via savePosition().
  WR.words         = [];
  WR.wordPositions = null;
  WR.wordIndex     = 0;

  setBadge('');
  WR.previousFocus?.focus();
  WR.previousFocus = null;
  attachKeyboard(); // keep Escape active to close overlay/controls
}

// ---------------------------------------------------------------------------
// Keyboard handler
// ---------------------------------------------------------------------------

function handleKeyDown(e) {
  const actualTarget = e.composedPath()[0];
  if (actualTarget?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(actualTarget?.tagName)) return;

  const overlayOpen = WR.shadowHost?.classList.contains('active') ||
                      document.getElementById('wr-mini-controls');
  if (!WR.active && !overlayOpen) return;

  const km = WR.keymap;

  if (e.code === km.pause && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    if (WR.active) { if (WR.paused) resumeSession(); else pauseSession(); }
  } else if (e.code === km.stop) {
    e.preventDefault();
    e.stopPropagation();
    stopSession();
  } else if ((e.code === km.skipFwd || e.code === km.skipBwd) && WR.active) {
    e.preventDefault();
    WR.wordIndex = e.code === km.skipFwd
      ? Math.min(WR.wordIndex + 10, WR.words.length - 1)
      : Math.max(0, WR.wordIndex - 10);
    if (WR.paused) {
      const chunk = WR.words.slice(WR.wordIndex, WR.wordIndex + WR.wordsPerChunk);
      if (WR.displayMode === 'highlight') highlightWordAt(WR.wordIndex);
      else renderChunkInOverlay(chunk);
      updateProgress();
    }
  } else if (e.code === km.speedUp && WR.active) {
    e.preventDefault();
    const val = Math.min(1000, WR.wpm + 25);
    WR.wpm = val;
    WR.intervalMs = Math.round(60000 / val);
    if (WR.shadowRoot) {
      const sl = WR.shadowRoot.querySelector('.wr-wpm-slider');
      if (sl) { sl.value = val; WR.shadowRoot.querySelector('.wr-wpm-val').textContent = val; }
    }
    browser.storage.local.set({ wpm: val });
  } else if (e.code === km.speedDn && WR.active) {
    e.preventDefault();
    const val = Math.max(100, WR.wpm - 25);
    WR.wpm = val;
    WR.intervalMs = Math.round(60000 / val);
    if (WR.shadowRoot) {
      const sl = WR.shadowRoot.querySelector('.wr-wpm-slider');
      if (sl) { sl.value = val; WR.shadowRoot.querySelector('.wr-wpm-val').textContent = val; }
    }
    browser.storage.local.set({ wpm: val });
  } else if ((e.key === 'b' || e.key === 'B') && WR.active) {
    e.preventDefault();
    saveBookmark();
  } else if (e.code === 'Tab' && WR.shadowRoot && WR.active) {
    e.preventDefault();
    const focusables = Array.from(
      WR.shadowRoot.querySelectorAll('.wr-btn, .wr-wpm-slider')
    );
    const idx = focusables.indexOf(WR.shadowRoot.activeElement);
    const next = e.shiftKey
      ? focusables[idx - 1] ?? focusables[focusables.length - 1]
      : focusables[idx + 1] ?? focusables[0];
    next?.focus();
  }
}

function attachKeyboard() {
  document.addEventListener('keydown', handleKeyDown, { capture: true });
}

function detachKeyboard() {
  document.removeEventListener('keydown', handleKeyDown, { capture: true });
}

// ---------------------------------------------------------------------------
// Auto-pause on tab hide / re-apply theme on system scheme change
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.hidden && WR.active && !WR.paused) pauseSession();
});

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', reapplyThemeOnSchemeChange);
