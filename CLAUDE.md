# Word Runner – Architecture Overview

## Entry Points

| File | Role |
|------|------|
| `manifest.json` | Extension manifest (MV2). Declares content scripts, background, popup, permissions. |
| `background.js` | Service worker. Handles context-menu clicks and `Alt+W` keyboard command → sends `start` message to content script. |
| `popup.js` | Popup UI. Reads/writes settings via `browser.storage.local`, sends `start`/`stop`/`pause`/`resume` messages to content script. |
| `content.js` | Main logic injected into every page. Owns the session lifecycle and all DOM work. |

## Content Script Architecture

`content.js` is a single-file module. Key globals:

- **`WR`** — all session state (active, paused, words, index, display mode, DOM refs, etc.)
- **`_posCache` / `_posCacheKey`** — TreeWalker result cache for highlight mode (invalidated by URL change)

Session lifecycle: `startSession()` → `tick()` loop → `finishSession()` or `stopSession()`

Two display modes:
- **`overlay`** — Shadow DOM overlay (`WR.shadowHost/shadowRoot`). Word rendered with ORP split.
- **`highlight`** — No overlay. Floating `<div>` boxes positioned over each word in the page DOM using `Range.getBoundingClientRect()`.

## lib/ Modules (pure, testable, loaded before content.js)

| File | Exports |
|------|---------|
| `lib/wordprocessor.js` | `processWords`, `splitAtOrp`, `getOrpOffset`, `getWordDuration`, `estimateReadingMs` |
| `lib/utils.js` | `hexToRgba` |
| `lib/validators.js` | `SETTINGS_VALIDATORS` (also used by popup.js via `<script>` tag in popup.html) |

## Tests

```bash
npm test          # 106 tests, 3 suites
npm run coverage  # statement coverage report
npm run check     # lint + tests
npm run build     # create word-runner.zip for AMO submission
```

Test files mirror lib/ structure: `tests/wordprocessor.test.js`, `tests/utils.test.js`, `tests/validators.test.js`.

## Storage Keys

| Key | Type | Default |
|-----|------|---------|
| `wpm` | number | 300 |
| `wordsPerChunk` | 1\|2 | 1 |
| `displayMode` | `'overlay'\|'highlight'` | `'overlay'` |
| `fontSize` | number (px) | 48 |
| `fontFamily` | `'serif'\|'mono'\|'system'` | `'system'` |
| `theme` | `'dark'\|'light'` | `'dark'` |
| `orpColor` | `#rrggbb` | `'#ef5350'` |
| `skipShortWords` | boolean | false |
| `readPositions` | `{ [url]: { wordIndex, ts } }` | `{}` |
| `stats` | `{ totalWords, sessions, totalMs }` | `{}` |
| `readingList` | `Array<{ url, title, addedAt, wordCount }>` | `[]` |

## Branch

Development branch: `claude/word-runner-firefox-extension-q8WJf`
