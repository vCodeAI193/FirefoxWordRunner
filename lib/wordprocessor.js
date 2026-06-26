/* Pure word-processing functions — no browser APIs, testable in Node/Jest */

function processWords(text) {
  const raw = text
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .trim();

  return raw
    .split(' ')
    .filter(t => t.length > 0)
    .map(token => (token.length > 25 ? token.slice(0, 22) + '...' : token));
}

function getOrpOffset(word) {
  const letters = word.replace(/^\W+|\W+$/g, '');
  const len = letters.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

function splitAtOrp(word) {
  let start = 0;
  while (start < word.length && !/\w/.test(word[start])) start++;
  const orp = start + getOrpOffset(word.slice(start));
  return {
    before: word.slice(0, orp),
    focus: word.slice(orp, orp + 1),
    after: word.slice(orp + 1),
  };
}

function getWordDuration(word, baseMs, opts) {
  const sentencePause  = opts?.sentencePause  ?? 0.6;
  const commaPause     = opts?.commaPause     ?? 0.3;
  const paragraphPause = opts?.paragraphPause ?? 2.5;

  if (word === '¶') return Math.round(baseMs * paragraphPause);

  const len = word.replace(/[^a-zA-Z]/g, '').length;
  const sentenceEnd = /[.!?…]$/.test(word);
  const comma = /,$/.test(word);

  let m = 1.0;
  if (len <= 2) m = 0.8;
  else if (len >= 10) m = 1.4;
  else if (len >= 7) m = 1.2;

  if (sentenceEnd) m += sentencePause;
  else if (comma) m += commaPause;

  return Math.max(50, Math.round(baseMs * m));
}

// Estimates reading time in milliseconds. 1.12 = empirical average of
// variable-timing multipliers across typical word-length distribution.
function estimateReadingMs(wordsLeft, wpm) {
  if (wordsLeft <= 0 || wpm <= 0) return 0;
  return (wordsLeft / wpm) * 60000 * 1.12;
}

// CommonJS export for Node.js / Jest
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { processWords, getOrpOffset, splitAtOrp, getWordDuration, estimateReadingMs };
}
