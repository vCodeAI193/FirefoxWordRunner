/* global browser, processWords, getOrpOffset, splitAtOrp, getWordDuration */
// Pure functions (processWords, getOrpOffset, splitAtOrp, getWordDuration)
// are loaded from lib/wordprocessor.js which is injected before this script.

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const WR = {
  active: false,
  paused: false,
  words: [],
  wordIndex: 0,
  wpm: 300,
  intervalMs: 200,
  timeoutId: null,
  lastTickTime: null,
  lastScheduledDuration: 200,
  shadowHost: null,
  shadowRoot: null,
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
      startSession(message.wpm, message.source).then(() => {
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

function extractText(source) {
  if (source === 'selection') {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      return sel.toString().trim();
    }
  }

  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.querySelector('.content'),
    document.querySelector('#content'),
    document.querySelector('.post-body'),
    document.querySelector('.article-body'),
    document.body,
  ];

  const root = candidates.find(el => el !== null);
  return extractFromElement(root);
}

function extractFromElement(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === 'word-runner-host') return NodeFilter.FILTER_REJECT;
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
      },
    }
  );

  const chunks = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent.trim());
    }
  }
  return chunks.join(' ');
}

// ---------------------------------------------------------------------------
// Position persistence
// ---------------------------------------------------------------------------

function savePosition() {
  if (WR.wordIndex > 0 && WR.words.length > 0) {
    browser.storage.local.set({
      lastPos: { url: location.href, wordIndex: WR.wordIndex },
    });
  }
}

function clearSavedPosition() {
  browser.storage.local.remove('lastPos');
}

async function restorePosition(words) {
  try {
    const { lastPos } = await browser.storage.local.get('lastPos');
    if (
      lastPos &&
      lastPos.url === location.href &&
      lastPos.wordIndex > 0 &&
      lastPos.wordIndex < words.length
    ) {
      return lastPos.wordIndex;
    }
  } catch {
    // storage unavailable
  }
  return 0;
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
  background: rgba(10, 10, 25, 0.93);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #e8eaf6;
  user-select: none;
}

.wr-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.wr-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  color: #e8eaf6;
  width: 36px;
  height: 36px;
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
.wr-btn svg { width: 16px; height: 16px; fill: currentColor; }

.wr-progress { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.wr-progress-bar {
  height: 4px;
  background: rgba(255,255,255,0.12);
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
.wr-progress-text {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  font-variant-numeric: tabular-nums;
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
  background: rgba(79,195,247,0.35);
  border-radius: 1px;
}

.wr-word-display {
  display: flex;
  align-items: center;
  font-size: clamp(32px, 5vw, 64px);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  min-height: 80px;
}

.wr-word-left {
  color: #e8eaf6;
  min-width: 3ch;
  text-align: right;
  display: inline-block;
}
.wr-word-focus {
  color: #ef5350;
  font-weight: 700;
}
.wr-word-right {
  color: #e8eaf6;
  min-width: 8ch;
  text-align: left;
  display: inline-block;
}

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
  gap: 16px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
  justify-content: center;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.wr-speed-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.wr-wpm-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 4px;
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.wr-wpm-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #4fc3f7;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}
.wr-wpm-slider:hover::-moz-range-thumb { transform: scale(1.2); }
.wr-wpm-slider:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 3px; }

.wr-wpm-label {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  font-variant-numeric: tabular-nums;
}

.wr-hint { font-size: 12px; color: rgba(255,255,255,0.3); }

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
    <button class="wr-btn wr-stop-btn" aria-label="Stop (Escape)">
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
      </svg>
    </button>
    <div class="wr-progress">
      <div class="wr-progress-bar"><div class="wr-progress-fill"></div></div>
      <span class="wr-progress-text">0 / 0</span>
    </div>
  </div>

  <div class="wr-center">
    <div class="wr-guide wr-guide-top"></div>
    <div class="wr-word-display" role="status" aria-live="off" aria-atomic="true">
      <span class="wr-word-left"></span><span class="wr-word-focus"></span><span class="wr-word-right"></span>
    </div>
    <div class="wr-guide wr-guide-bottom"></div>
  </div>

  <div class="wr-controls">
    <button class="wr-btn wr-play-pause-btn" aria-label="Pause (Space)">
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
    <span class="wr-hint">Space · Esc · ← →</span>
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Overlay management
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

function showOverlay() {
  WR.shadowHost.classList.add('active');
}

function hideOverlay() {
  if (WR.shadowHost) WR.shadowHost.classList.remove('active');
}

function updatePlayPauseIcon() {
  if (!WR.shadowRoot) return;
  const pauseIcon = WR.shadowRoot.querySelector('.icon-pause');
  const playIcon = WR.shadowRoot.querySelector('.icon-play');
  const btn = WR.shadowRoot.querySelector('.wr-play-pause-btn');
  if (WR.paused) {
    pauseIcon.style.display = 'none';
    playIcon.style.display = '';
    btn.setAttribute('aria-label', 'Resume (Space)');
  } else {
    pauseIcon.style.display = '';
    playIcon.style.display = 'none';
    btn.setAttribute('aria-label', 'Pause (Space)');
  }
}

// ---------------------------------------------------------------------------
// Word display
// ---------------------------------------------------------------------------

function displayWord(word) {
  if (!WR.shadowRoot) return;
  const { before, focus, after } = splitAtOrp(word);
  WR.shadowRoot.querySelector('.wr-word-left').textContent = before;
  WR.shadowRoot.querySelector('.wr-word-focus').textContent = focus;
  WR.shadowRoot.querySelector('.wr-word-right').textContent = after;

  const el = WR.shadowRoot.querySelector('.wr-word-display');
  el.classList.remove('animating');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('animating');
}

function updateProgress() {
  if (!WR.shadowRoot) return;
  const total = WR.words.length;
  const current = WR.wordIndex;
  const pct = total > 0 ? (current / total) * 100 : 0;
  WR.shadowRoot.querySelector('.wr-progress-fill').style.width = `${pct.toFixed(1)}%`;
  WR.shadowRoot.querySelector('.wr-progress-text').textContent = `${current} / ${total}`;
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

  const word = WR.words[WR.wordIndex];
  displayWord(word);
  WR.wordIndex++;
  updateProgress();

  const now = Date.now();
  const wordDuration = getWordDuration(word, WR.intervalMs);
  let nextDelay = wordDuration;

  if (WR.lastTickTime !== null) {
    const elapsed = now - WR.lastTickTime;
    const drift = elapsed - WR.lastScheduledDuration;
    nextDelay = Math.max(0, wordDuration - drift);
  }

  WR.lastTickTime = now;
  WR.lastScheduledDuration = wordDuration;
  scheduleNext(nextDelay);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function startSession(wpm, source) {
  if (WR.active) stopSession();

  const rawText = extractText(source);
  const words = processWords(rawText);
  if (words.length === 0) return;

  WR.words = words;
  WR.wpm = wpm;
  WR.intervalMs = Math.round(60000 / wpm);
  WR.active = true;
  WR.paused = false;
  WR.lastTickTime = null;
  WR.lastScheduledDuration = WR.intervalMs;

  // Restore reading position for full-page sessions
  WR.wordIndex = source === 'page' ? await restorePosition(words) : 0;

  buildOverlay();
  showOverlay();
  attachKeyboard();

  if (WR.shadowRoot) {
    WR.shadowRoot.querySelector('.wr-wpm-val').textContent = wpm;
    WR.shadowRoot.querySelector('.wr-wpm-slider').value = wpm;
  }
  updatePlayPauseIcon();

  displayWord(WR.words[WR.wordIndex]);
  const firstWord = WR.words[WR.wordIndex];
  WR.wordIndex++;
  updateProgress();
  WR.lastTickTime = Date.now();
  WR.lastScheduledDuration = getWordDuration(firstWord, WR.intervalMs);
  scheduleNext(WR.lastScheduledDuration);
}

function pauseSession() {
  if (!WR.active || WR.paused) return;
  WR.paused = true;
  clearTimeout(WR.timeoutId);
  WR.timeoutId = null;
  WR.lastTickTime = null;
  updatePlayPauseIcon();
  savePosition();
}

function resumeSession() {
  if (!WR.active || !WR.paused) return;
  WR.paused = false;
  updatePlayPauseIcon();
  WR.lastTickTime = null;
  scheduleNext(WR.intervalMs);
}

function stopSession() {
  savePosition();
  WR.active = false;
  WR.paused = false;
  clearTimeout(WR.timeoutId);
  WR.timeoutId = null;
  WR.lastTickTime = null;
  WR.words = [];
  WR.wordIndex = 0;
  hideOverlay();
  detachKeyboard();
}

function finishSession() {
  clearSavedPosition();
  WR.active = false;
  WR.paused = false;
  clearTimeout(WR.timeoutId);
  WR.timeoutId = null;
  detachKeyboard();

  if (WR.shadowRoot) {
    const center = WR.shadowRoot.querySelector('.wr-center');
    center.innerHTML = '<p class="wr-done-msg">Done! Press Esc to close.</p>';
    WR.shadowRoot.querySelector('.wr-progress-fill').style.width = '100%';
    WR.shadowRoot.querySelector('.wr-progress-text').textContent = `${WR.words.length} / ${WR.words.length}`;
  }

  attachKeyboard(); // keep Escape active to close overlay
}

// ---------------------------------------------------------------------------
// Keyboard handler
// ---------------------------------------------------------------------------

function handleKeyDown(e) {
  if (!WR.active && !WR.shadowHost?.classList.contains('active')) return;

  if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    if (WR.active) {
      if (WR.paused) resumeSession(); else pauseSession();
    }
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
