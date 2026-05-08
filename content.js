/* global browser, processWords, getOrpOffset, splitAtOrp, getWordDuration */
// Pure functions loaded from lib/wordprocessor.js (injected before this script).

// ---------------------------------------------------------------------------
// i18n shorthand
// ---------------------------------------------------------------------------

function t(key) {
  return browser.i18n.getMessage(key) || key;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const WR = {
  // Session
  active: false,
  paused: false,
  words: [],
  wordIndex: 0,
  wpm: 300,
  wordsPerChunk: 1,
  displayMode: 'overlay',   // 'overlay' | 'highlight'
  intervalMs: 200,
  timeoutId: null,
  lastTickTime: null,
  lastScheduledDuration: 200,
  sessionStartTime: null,

  // Overlay (Shadow DOM)
  shadowHost: null,
  shadowRoot: null,

  // Highlight mode
  wordPositions: null,      // Array<{ node, start, end }> | null
  highlightBox: null,
  highlightControls: null,
};

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
      startSession(message.wpm, message.source, message.text).then(() => {
        sendResponse({ ok: true });
      });
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

function createContentWalker(root) {
  return document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    { acceptNode: contentNodeFilter }
  );
}

function getContentRoot() {
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

function extractText(source, customText) {
  if (source === 'custom') return customText || '';
  if (source === 'selection') {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return sel.toString().trim();
  }
  const walker = createContentWalker(getContentRoot());
  const chunks = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) chunks.push(node.textContent.trim());
  }
  return chunks.join(' ');
}

// Builds words + DOM position map in one pass (for highlight mode).
function extractWordsWithPositions(root) {
  const words = [];
  const positions = [];
  const walker = createContentWalker(root);
  const wordRegex = /\S+/g;

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
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

async function savePosition() {
  if (WR.wordIndex <= 0 || WR.words.length === 0) return;
  try {
    const data = await browser.storage.local.get('readPositions');
    const map = data.readPositions || {};
    map[location.href] = { wordIndex: WR.wordIndex, ts: Date.now() };
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
    const saved = (data.readPositions || {})[location.href];
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
    delete map[location.href];
    await browser.storage.local.set({ readPositions: map });
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

async function saveStats(wordsRead) {
  if (wordsRead <= 0 || !WR.sessionStartTime) return;
  const elapsed = Date.now() - WR.sessionStartTime;
  try {
    const data = await browser.storage.local.get('stats');
    const s = data.stats || {};
    await browser.storage.local.set({
      stats: {
        totalWords: (s.totalWords || 0) + wordsRead,
        sessions:   (s.sessions   || 0) + 1,
        totalMs:    (s.totalMs    || 0) + elapsed,
      },
    });
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Time estimation
// ---------------------------------------------------------------------------

function formatTimeRemaining(wordsLeft, wpm) {
  if (wordsLeft <= 0 || wpm <= 0) return '';
  const ms = (wordsLeft / wpm) * 60000 * 1.12; // 1.12 = avg variable-timing multiplier
  if (ms < 60000) return t('timeRemainingShort') || '< 1 min';
  return `~${Math.ceil(ms / 60000)} min`;
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

.wr-done-msg {
  font-size: 18px;
  color: #4fc3f7;
  font-weight: 600;
  text-align: center;
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
        <span class="wr-progress-text">0 / 0</span>
        <span class="wr-time-remaining"></span>
      </div>
    </div>
  </div>

  <div class="wr-center">
    <div class="wr-guide wr-guide-top"></div>
    <div class="wr-word-display" role="status" aria-live="off" aria-atomic="true">
      <span class="wr-word-left"></span><span class="wr-word-focus"></span><span class="wr-word-right"></span><span class="wr-word-two"></span>
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

  shadow.querySelector('.wr-wpm-slider').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    shadow.querySelector('.wr-wpm-val').textContent = val;
    WR.wpm = val;
    WR.intervalMs = Math.round(60000 / val);
    browser.storage.local.set({ wpm: val });
  });
}

function applyTheme(theme, orpColor, fontSize) {
  const h = WR.shadowHost;
  if (!h) return;
  h.style.setProperty('--wr-font-size', `${fontSize}px`);
  h.style.setProperty('--wr-orp', orpColor);
  if (theme === 'light') {
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

  const controls = document.createElement('div');
  controls.id = 'wr-mini-controls';
  controls.innerHTML = `
    <span class="wr-mini-progress">0 / 0</span>
    <button class="wr-mini-btn wr-mini-play-pause">${t('miniPauseLabel')}</button>
    <button class="wr-mini-btn wr-mini-stop">${t('miniStopLabel')}</button>
    <span class="wr-mini-time"></span>
  `;
  document.body.appendChild(controls);

  controls.querySelector('.wr-mini-play-pause').addEventListener('click', () => {
    if (WR.paused) resumeSession(); else pauseSession();
  });
  controls.querySelector('.wr-mini-stop').addEventListener('click', stopSession);

  WR.highlightBox     = box;
  WR.highlightControls = controls;
}

function removeHighlightUI() {
  WR.highlightBox?.remove();
  WR.highlightControls?.remove();
  WR.highlightBox      = null;
  WR.highlightControls = null;
}

function highlightWordAt(index) {
  if (!WR.wordPositions || index >= WR.wordPositions.length) return;
  const pos = WR.wordPositions[index];
  if (!pos || !WR.highlightBox) return;

  try {
    const range = document.createRange();
    range.setStart(pos.node, pos.start);
    range.setEnd(pos.node, Math.min(pos.end, pos.node.textContent.length));
    const rect = range.getBoundingClientRect();

    WR.highlightBox.style.display = 'block';
    WR.highlightBox.style.top    = `${rect.top  + window.scrollY}px`;
    WR.highlightBox.style.left   = `${rect.left + window.scrollX}px`;
    WR.highlightBox.style.width  = `${rect.width}px`;
    WR.highlightBox.style.height = `${rect.height}px`;

    if (rect.top < 120 || rect.bottom > window.innerHeight - 120) {
      pos.node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch { /* DOM may have changed */ }
}

function updateHighlightControls() {
  if (!WR.highlightControls) return;
  const prog = WR.highlightControls.querySelector('.wr-mini-progress');
  const time = WR.highlightControls.querySelector('.wr-mini-time');
  const btn  = WR.highlightControls.querySelector('.wr-mini-play-pause');
  if (prog) prog.textContent = `${WR.wordIndex} / ${WR.words.length}`;
  if (time) time.textContent = formatTimeRemaining(WR.words.length - WR.wordIndex, WR.wpm);
  if (btn)  btn.textContent  = WR.paused ? t('miniResumeLabel') : t('miniPauseLabel');
}

// ---------------------------------------------------------------------------
// Word / chunk display
// ---------------------------------------------------------------------------

function renderChunkInOverlay(chunk) {
  if (!WR.shadowRoot || !chunk.length) return;
  const { before, focus, after } = splitAtOrp(chunk[0]);
  WR.shadowRoot.querySelector('.wr-word-left').textContent  = before;
  WR.shadowRoot.querySelector('.wr-word-focus').textContent = focus;
  WR.shadowRoot.querySelector('.wr-word-right').textContent = after;
  WR.shadowRoot.querySelector('.wr-word-two').textContent   = chunk[1] ? ' ' + chunk[1] : '';

  const el = WR.shadowRoot.querySelector('.wr-word-display');
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
    highlightWordAt(chunkStart);
  } else {
    renderChunkInOverlay(chunk);
  }

  WR.wordIndex += chunk.length;
  updateProgress();

  const now          = Date.now();
  const wordDuration = getWordDuration(chunk[0], WR.intervalMs);
  let nextDelay      = wordDuration;

  if (WR.lastTickTime !== null) {
    const drift = (now - WR.lastTickTime) - WR.lastScheduledDuration;
    nextDelay = Math.max(0, wordDuration - drift);
  }

  WR.lastTickTime           = now;
  WR.lastScheduledDuration  = wordDuration;
  scheduleNext(nextDelay);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function startSession(wpm, source, customText) {
  if (WR.active) stopSession();

  // Load display settings from storage
  const settings = await browser.storage.local.get([
    'wordsPerChunk', 'displayMode', 'fontSize', 'theme', 'orpColor',
  ]);
  const wordsPerChunk = settings.wordsPerChunk || 1;
  const displayMode   = settings.displayMode   || 'overlay';
  const fontSize      = settings.fontSize      || 48;
  const theme         = settings.theme         || 'dark';
  const orpColor      = settings.orpColor      || '#ef5350';

  // Extract words (+ position map for highlight mode on page content)
  let words, positions;
  if (displayMode === 'highlight' && source === 'page') {
    const result = extractWordsWithPositions(getContentRoot());
    words     = result.words;
    positions = result.positions;
  } else {
    words     = processWords(extractText(source, customText));
    positions = null;
  }

  if (words.length === 0) return;

  WR.words            = words;
  WR.wordPositions    = positions;
  WR.wpm              = wpm;
  WR.wordsPerChunk    = wordsPerChunk;
  WR.displayMode      = displayMode;
  WR.intervalMs       = Math.round(60000 / wpm);
  WR.active           = true;
  WR.paused           = false;
  WR.lastTickTime     = null;
  WR.lastScheduledDuration = WR.intervalMs;
  WR.sessionStartTime = Date.now();

  WR.wordIndex = source === 'page' ? await restorePosition(words) : 0;

  if (displayMode === 'highlight') {
    buildHighlightUI();
  } else {
    buildOverlay();
    applyTheme(theme, orpColor, fontSize);
    showOverlay();
    if (WR.shadowRoot) {
      WR.shadowRoot.querySelector('.wr-wpm-val').textContent   = wpm;
      WR.shadowRoot.querySelector('.wr-wpm-slider').value      = wpm;
    }
    updatePlayPauseIcon();
  }

  attachKeyboard();

  // Display first chunk immediately
  const firstChunk = words.slice(WR.wordIndex, WR.wordIndex + wordsPerChunk);
  if (displayMode === 'highlight') {
    highlightWordAt(WR.wordIndex);
  } else {
    renderChunkInOverlay(firstChunk);
  }
  WR.wordIndex += firstChunk.length;
  updateProgress();

  const firstDuration = getWordDuration(firstChunk[0], WR.intervalMs);
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
}

function resumeSession() {
  if (!WR.active || !WR.paused) return;
  WR.paused = false;
  updatePlayPauseIcon();
  updateHighlightControls();
  WR.lastTickTime = null;
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
  WR.wordIndex        = 0;
  WR.wordPositions    = null;
  WR.sessionStartTime = null;

  if (WR.displayMode === 'highlight') {
    removeHighlightUI();
  } else {
    hideOverlay();
  }
  detachKeyboard();
}

function finishSession() {
  const wordsRead = WR.wordIndex;
  saveStats(wordsRead);
  clearSavedPosition();

  WR.active   = false;
  WR.paused   = false;
  clearTimeout(WR.timeoutId);
  WR.timeoutId        = null;
  WR.sessionStartTime = null;
  detachKeyboard();

  if (WR.displayMode === 'highlight') {
    WR.highlightBox?.remove();
    WR.highlightBox = null;
    if (WR.highlightControls) {
      WR.highlightControls.querySelector('.wr-mini-progress').textContent =
        `${wordsRead} / ${wordsRead}`;
      WR.highlightControls.querySelector('.wr-mini-time').textContent = '';
      WR.highlightControls.querySelector('.wr-mini-play-pause').style.display = 'none';
    }
  } else if (WR.shadowRoot) {
    const center = WR.shadowRoot.querySelector('.wr-center');
    center.innerHTML = `<p class="wr-done-msg">${t('doneMsg')}</p>`;
    WR.shadowRoot.querySelector('.wr-progress-fill').style.width = '100%';
    WR.shadowRoot.querySelector('.wr-progress-text').textContent =
      `${wordsRead} / ${wordsRead}`;
    WR.shadowRoot.querySelector('.wr-time-remaining').textContent = '';
  }

  attachKeyboard(); // keep Escape active to close overlay/controls
}

// ---------------------------------------------------------------------------
// Keyboard handler
// ---------------------------------------------------------------------------

function handleKeyDown(e) {
  const overlayOpen = WR.shadowHost?.classList.contains('active') ||
                      document.getElementById('wr-mini-controls');
  if (!WR.active && !overlayOpen) return;

  if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    if (WR.active) { if (WR.paused) resumeSession(); else pauseSession(); }
  } else if (e.code === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    stopSession();
  } else if (e.code === 'ArrowRight' && WR.active) {
    e.preventDefault();
    WR.wordIndex = Math.min(WR.wordIndex + 9, WR.words.length - 1);
  } else if (e.code === 'ArrowLeft' && WR.active) {
    e.preventDefault();
    WR.wordIndex = Math.max(0, WR.wordIndex - 11);
  }
}

function attachKeyboard() {
  document.addEventListener('keydown', handleKeyDown, { capture: true });
}

function detachKeyboard() {
  document.removeEventListener('keydown', handleKeyDown, { capture: true });
}
