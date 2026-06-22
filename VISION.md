# Word Runner — Vision & Design Principles

## The Problem

Reading on the web is slow — not because we think slowly, but because our eyes do unnecessary work. Every line requires a saccade: the eye jumps from one fixation point to the next, losing time and focus with each hop. For long articles, newsletters, or documentation, this friction accumulates into fatigue and abandonment.

Dedicated speed-reading apps solve this, but they ask the reader to export content, log in, or leave the browser. The best tool is the one you actually use.

## What Word Runner Is

Word Runner is a Firefox extension that brings RSVP (Rapid Serial Visual Presentation) directly to any web page — no copy-paste, no account, no external service. Text flows to the eye at a fixed point rather than the eye chasing text across a page.

A single keyboard shortcut (`Alt+W`) or toolbar click is all that stands between a reader and full-speed reading of whatever page they are already on.

## Who It Is For

- Readers who consume a lot of long-form content (news, articles, documentation, blogs) and want to go faster without losing comprehension
- People who find themselves re-reading lines due to distraction or eye fatigue
- Anyone already in the browser who does not want to leave it to use a reading tool

Word Runner is **not** aimed at academic researchers doing close reading, developers skimming code, or users who need TTS or synchronized audio.

## Core Design Principles

### 1. Zero friction
The extension must start in at most two interactions from any page. No onboarding screen, no required account, no required configuration. Sensible defaults should serve a first-time user without any setup.

### 2. Privacy by default
All state — settings, reading positions, statistics, reading list — lives in `browser.storage.local`. Nothing leaves the device. No analytics, no telemetry, no external requests.

### 3. Respect the page
The extension is a guest on every page it runs on. Shadow DOM isolation keeps overlay styles from leaking into the host page. The highlight mode positions boxes without modifying page DOM. When a session ends, the page should look exactly as it did before.

### 4. Accessibility is not optional
Every interactive element must be keyboard-reachable. ARIA roles and live regions ensure screen reader compatibility. Reduced-motion preferences are respected. The overlay must be dismissible at any time with `Escape`.

### 5. Configurable but opinionated
Power users should be able to tune font, size, theme, ORP color, speed, and word-chunk size. Casual users should never need to open Advanced settings. When in doubt, pick a default that works for the median reader (300 WPM, dark theme following the OS, 1 word, 48 px, system font).

### 6. Pure, testable core logic
Word processing (splitting, ORP calculation, timing) lives in `lib/` — pure functions with no browser API dependencies. This boundary keeps the logic fast to test, easy to reason about, and safe to refactor without touching the DOM layer.

## What Success Looks Like

- A user opens an article, presses `Alt+W`, and reads it 1.5–2× faster than usual without feeling lost
- The reading position is saved if they stop mid-article and automatically resumed next time
- The popup shows them how long a page will take to read before they start
- After a week, the Statistics panel gives them a clear picture of how much they have read

## Deliberate Non-Goals

| Out of scope | Reason |
|---|---|
| Cloud sync across devices | Adds complexity, requires an account, and breaks the privacy-first model |
| Text-to-speech / audio | Different problem; TTS extensions already exist |
| PDF reading | Firefox's PDF viewer is a separate context; integration is disproportionately complex |
| Social / sharing features | Word Runner is a personal productivity tool, not a social platform |
| Chromium / Chrome port | A separate codebase; Firefox is the initial target |
| AI-powered summarisation | Out of scope for a reading-speed tool; would require external API calls |

## Architectural Invariants

These must remain true regardless of future features:

1. The extension works fully offline after install
2. `lib/` functions have no side effects and no browser API calls — they stay testable in plain Node.js
3. Shadow DOM is used for the overlay so host-page styles cannot break the UI
4. Saved positions, history, and settings are evicted automatically to prevent unbounded storage growth
5. The background script remains thin — it only routes messages and handles tab lifecycle events; no business logic lives there
