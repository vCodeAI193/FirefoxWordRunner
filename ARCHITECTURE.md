# Word Runner — Architecture

## 1. Overview

Word Runner is a Firefox WebExtension (Manifest V2). It consists of four distinct execution contexts that communicate via the browser's message-passing API:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│                                                                     │
│  ┌───────────────┐   tabs.sendMessage   ┌──────────────────────┐   │
│  │  popup.js     │ ──────────────────▶  │  content.js          │   │
│  │  (Toolbar UI) │ ◀──────────────────  │  (injected per tab)  │   │
│  └───────────────┘   sendResponse       └──────────────────────┘   │
│         │                                         ▲                │
│         │ runtime.sendMessage                     │ tabs.sendMessage│
│         ▼                                         │                │
│  ┌───────────────┐                                │                │
│  │ background.js │ ──────────────────────────────▶│                │
│  │ (Service Wkr) │                                                  │
│  └───────────────┘                                                  │
│         ▲                                                           │
│         │ runtime.sendMessage (setBadge)                           │
│         └─────────────────────────────── content.js                │
└─────────────────────────────────────────────────────────────────────┘
```

Each context has a clearly bounded role:

| Context | File | Role |
|---|---|---|
| Background | `background.js` | Routes keyboard shortcut and context-menu commands; manages tab badge; handles "Open & Read" tab creation |
| Popup | `popup.html` + `popup.js` | Settings UI; sends commands to the active tab's content script |
| Content script | `content.js` | All reading logic, DOM manipulation, timing loop |
| Pure library | `lib/*.js` | Stateless helper functions with no browser API dependency |

---

## 2. Message Protocol

All messages are plain objects with an `action` field.

### Popup → Content script (`browser.tabs.sendMessage`)

| `action` | Payload | Response |
|---|---|---|
| `ping` | — | `{ active, paused, wordIndex, totalWords }` |
| `start` | `{ wpm, source, text? }` | `{ ok }` |
| `pause` | — | `{ ok, active, paused, wordIndex, totalWords }` |
| `resume` | — | `{ ok, active, paused, wordIndex, totalWords }` |
| `stop` | — | `{ ok, active, paused }` |
| `countWords` | — | `{ count }` |

### Background → Content script (`browser.tabs.sendMessage`)

| `action` | Payload | Trigger |
|---|---|---|
| `start` | `{ wpm, source }` | `Alt+W` keyboard shortcut or context-menu click |

### Content script → Background (`browser.runtime.sendMessage`)

| `action` | Payload | Purpose |
|---|---|---|
| `setBadge` | `{ text, color }` | Update the toolbar icon badge per-tab |

### Popup → Background (`browser.runtime.sendMessage`)

| `action` | Payload | Purpose |
|---|---|---|
| `openAndRead` | `{ url, wpm, source }` | Open a URL in a new tab and auto-start reading when loaded |

---

## 3. Content Script

`content.js` contains all reading logic. It is injected at `document_idle` into every page. The lib files (`lib/wordprocessor.js`, `lib/utils.js`) are injected before it so their globals are available.

### 3.1 Global State Object (`WR`)

A single mutable object holds the complete session state:

```
WR = {
  // Session control
  active, paused, wpm, wordsPerChunk, displayMode, intervalMs,
  timeoutId, lastTickTime, lastScheduledDuration, sessionStartTime,
  lastStartParams,

  // Word data
  words[],          // processed word tokens + PARA_MARKER sentinels
  wordIndex,        // current position in words[]
  wordPositions[],  // DOM positions for highlight mode (null in overlay mode)

  // Overlay (Shadow DOM)
  shadowHost, shadowRoot,

  // Highlight mode
  highlightBox, highlightBox2, highlightControls,
  lastHighlightedIndex,

  // Accessibility
  previousFocus,
}
```

### 3.2 Session Lifecycle

```
startSession(wpm, source, text?)
  │
  ├─ loadSessionSettings()      reads 7 settings from browser.storage.local
  ├─ buildSessionWords()        text extraction + word processing
  ├─ restorePosition()          resume from saved wordIndex (page source only)
  ├─ build overlay OR highlight UI
  ├─ setBadge('▶')
  └─ scheduleNext(firstDuration)
         │
         ▼
      tick()  ◀──────────────────────────────────┐
         │                                        │
         ├─ render current chunk                  │
         ├─ advance wordIndex                     │
         ├─ updateProgress()                      │
         ├─ drift-correct next delay              │
         └─ scheduleNext(nextDelay) ──────────────┘
         │
         └─ (wordIndex ≥ words.length)
              └─ finishSession()
                   ├─ saveStats(), clearSavedPosition()
                   ├─ show "Done" message + Restart button
                   └─ setBadge('')

  pauseSession()   → savePosition(), setBadge('⏸')
  resumeSession()  → setBadge('▶'), scheduleNext()
  stopSession()    → saveStats(), savePosition(), setBadge('')
```

### 3.3 Drift-Correcting Timer

`setTimeout` drift accumulates over hundreds of words. The timer compensates:

```js
const drift  = (now - WR.lastTickTime) - WR.lastScheduledDuration;
const nextDelay = Math.max(16, wordDuration - drift);
```

Each tick measures how much later than expected it fired and subtracts that from the next delay. Over a session the average interval stays close to the target WPM.

### 3.4 Text Extraction Pipeline

```
source = 'page'       getContentRoot()  →  createContentWalker(root)
                      TreeWalker visits TEXT_NODEs, skips NAV/HEADER/FOOTER/SCRIPT/…
                      Paragraph breaks (PARA_MARKER '¶') inserted between block elements

source = 'selection'  window.getSelection().toString()

source = 'custom'     raw textarea value
          │
          ▼
      processWords()   (lib/wordprocessor.js)
        normalise whitespace, split on spaces, truncate tokens > 25 chars
          │
          ▼
      skipShortWords filter (optional)
          │
          ▼
      WR.words[]   — array of string tokens + '¶' paragraph markers
```

For highlight mode (`source === 'page'`) a parallel path uses `extractWordsWithPositions()` which builds `wordPositions[]` alongside `words[]` in a single TreeWalker pass. The result is cached in `_posCache` keyed on `origin + pathname`.

### 3.5 Content Root Heuristic

`getContentRoot()` returns the most specific content container it can find:

```
article  →  main  →  [role="main"]  →  .content  →  #content
        →  .post-body  →  .article-body  →  document.body
```

This means `source: 'page'` skips navigation, sidebars, and footers on most sites without any per-site configuration.

---

## 4. Display Modes

### 4.1 Overlay Mode (default)

```
document.body
  └─ #word-runner-host  (div, content.css styles it)
       └─ ShadowRoot  (closed)
            ├─ <style>  OVERLAY_CSS injected inline
            └─ .wr-overlay
                 ├─ .wr-toolbar     stop button, progress bar, time remaining
                 ├─ .wr-center      word display with ORP split
                 └─ .wr-controls    play/pause button, WPM slider, hint text
```

**Style isolation:** `#word-runner-host` starts at `width:0; height:0; pointer-events:none` and expands to full-viewport when `.active` is added. All visual styles live inside the Shadow Root and cannot be overridden by the host page. Host-page styles equally cannot bleed into the overlay.

**ORP rendering:** `splitAtOrp(word)` returns `{ before, focus, after }`. Three `<span>` elements are positioned using `min-width` in `ch` units so the focus letter always sits on the same horizontal baseline, regardless of word length.

### 4.2 Highlight Mode

```
document.body  (original page, unmodified)
  ├─ #wr-highlight-box    (content.css, position:absolute, moves each tick)
  ├─ #wr-highlight-box-2  (second word in 2-word mode)
  └─ #wr-mini-controls    (content.css, fixed top-center strip)
```

`highlightWordAt(index)` creates a `Range` for the word's text node, calls `getBoundingClientRect()`, then sets the box's `top/left/width/height`. If the word is outside the visible viewport (120 px margin), it calls `scrollIntoView({ behavior: 'smooth', block: 'center' })`.

The page DOM is **never modified** — only floating layers are added and removed.

---

## 5. Style Architecture

Three separate style sources, each with a distinct scope:

| File | Scope | Mechanism |
|---|---|---|
| `popup.css` | Popup window only | Loaded via `<link>` in `popup.html` |
| `content.css` | Injected into page document | Declared as `css` in `manifest.json` content scripts |
| `OVERLAY_CSS` (string in `content.js`) | Inside Shadow Root only | Injected as `<style>` into `shadowRoot` |

`content.css` only styles elements with known IDs (`#word-runner-host`, `#wr-highlight-box`, etc.) so it cannot accidentally affect page elements. `OVERLAY_CSS` is fully isolated by Shadow DOM — no inheritance from the page, no leaking out.

---

## 6. lib/ — Pure Function Layer

```
lib/
  wordprocessor.js   processWords, splitAtOrp, getOrpOffset,
                     getWordDuration, estimateReadingMs
  utils.js           hexToRgba
  validators.js      SETTINGS_VALIDATORS
```

**Invariant:** No file in `lib/` may call any browser API or read from the DOM. Every function is a pure transformation of its arguments.

This boundary means all business logic is testable in plain Node.js without a browser environment. The test suite runs in Jest without any browser polyfill.

**`getWordDuration(word, baseMs)`** applies adaptive timing:

| Condition | Multiplier |
|---|---|
| Word ≤ 2 letters | × 0.8 |
| Word 7–9 letters | × 1.2 |
| Word ≥ 10 letters | × 1.4 |
| Ends in `.!?…` | + 0.6 |
| Ends in `,` | + 0.3 |
| `PARA_MARKER` | × 2.5 |

---

## 7. Storage Schema

All persistence goes through `browser.storage.local`. No remote storage is used.

| Key | Type | Eviction |
|---|---|---|
| `wpm` | `number` (100–1000) | Manual |
| `wordsPerChunk` | `1 \| 2` | Manual |
| `displayMode` | `'overlay' \| 'highlight'` | Manual |
| `fontSize` | `number` (24–96 px) | Manual |
| `fontFamily` | `'serif' \| 'mono' \| 'system'` | Manual |
| `theme` | `'dark' \| 'light' \| 'auto'` | Manual |
| `orpColor` | `#rrggbb` | Manual |
| `skipShortWords` | `boolean` | Manual |
| `readPositions` | `{ [origin+path]: { wordIndex, ts } }` | Auto — max 50 entries, oldest evicted |
| `stats` | `{ totalWords, sessions, totalMs, history[] }` | `history` capped at 30 entries |
| `readingList` | `Array<{ url, title, addedAt, wordCount }>` | Manual (user removes) |

`readPositions` is keyed on `location.origin + location.pathname` (query parameters and fragments are ignored), so the same article URL with different UTM parameters shares one saved position.

The `SETTINGS_VALIDATORS` map in `lib/validators.js` is the single source of truth for valid setting values. It is used both in the popup's import flow and can be used in tests to verify any imported JSON.

---

## 8. Background Script

`background.js` is intentionally thin — it contains no business logic.

**Responsibilities:**
1. Register the context-menu item on install
2. Forward context-menu clicks → `browser.tabs.sendMessage(start, source:'selection')`
3. Forward `Alt+W` command → `browser.tabs.sendMessage(start, source:'page')`
4. Handle `setBadge` messages from content scripts → `browser.browserAction.setBadgeText/Color`
5. Handle `openAndRead` from popup → `browser.tabs.create()` + store intent in `pendingAutoRead` Map → fire on `tabs.onUpdated` status=`'complete'`

The `pendingAutoRead` Map stores `tabId → { wpm, source }`. When a tab finishes loading, a 400 ms delay gives the content script time to initialise before the `start` message is sent.

---

## 9. Popup

`popup.js` has three concerns:

1. **Settings** — read from `browser.storage.local` on load (`restoreSettingsUI`), write back on each change (`attachPersistListeners`). WPM saves are debounced 300 ms to avoid thrashing storage on fast slider movement.

2. **Session control** — ping the active tab's content script on load to get current state (`ping`), then send `start`/`pause`/`resume` based on the response.

3. **Reading list & stats** — render data from storage; reading list mutations write back immediately; stats are read-only from the popup (written only by content script).

`lib/validators.js` is loaded as a `<script>` tag in `popup.html` so the import validator can reuse the same rules without duplication.

---

## 10. Internationalisation

All user-visible strings go through `browser.i18n.getMessage(key)`. The helper `t(key)` falls back to the key itself if no translation is found, so untranslated strings degrade gracefully rather than showing blank.

Locale files live in `_locales/en/messages.json` (primary) and `_locales/de/messages.json`. The manifest sets `"default_locale": "en"`.

Parameterised strings (e.g. `"Resuming from word {current} of {total}"`) use a `tParam(key, params)` helper in content.js that replaces `{placeholder}` tokens manually, since `browser.i18n` substitution syntax differs between engines.

---

## 11. File Map

```
word-runner/
├── manifest.json              Extension manifest (MV2)
│
├── background.js              Service worker: commands, badge, openAndRead
│
├── content.js                 All reading logic (1 200+ lines)
├── content.css                Page-injected styles (host element, highlight boxes, toast)
│
├── popup.html                 Toolbar popup markup
├── popup.js                   Popup logic (settings, session control, reading list)
├── popup.css                  Popup styles
│
├── lib/
│   ├── wordprocessor.js       Pure: text processing, ORP, timing
│   ├── utils.js               Pure: hexToRgba
│   └── validators.js          Pure: SETTINGS_VALIDATORS
│
├── tests/
│   ├── wordprocessor.test.js  Jest tests for lib/wordprocessor.js
│   ├── utils.test.js          Jest tests for lib/utils.js
│   └── validators.test.js     Jest tests for lib/validators.js
│
├── _locales/
│   ├── en/messages.json       English strings (primary)
│   └── de/messages.json       German strings
│
├── icons/
│   ├── icon-48.svg
│   └── icon-96.svg
│
├── VISION.md                  Why this project exists and what it is not
├── ARCHITECTURE.md            This file
├── CLAUDE.md                  Quick reference for AI-assisted development
└── README.md                  User-facing installation and usage guide
```
