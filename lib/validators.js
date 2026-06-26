const SETTINGS_VALIDATORS = {
  wpm:             v => Number.isInteger(v) && v >= 100 && v <= 1000,
  wordsPerChunk:   v => v === 1 || v === 2,
  displayMode:     v => v === 'overlay' || v === 'highlight',
  fontSize:        v => Number.isInteger(v) && v >= 24 && v <= 96,
  fontFamily:      v => ['serif', 'mono', 'system'].includes(v),
  theme:           v => ['dark', 'light', 'auto'].includes(v),
  orpColor:        v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  skipShortWords:  v => typeof v === 'boolean',
  pauseAtSentence: v => typeof v === 'boolean',
  sentencePause:   v => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1.5,
  commaPause:      v => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 0.8,
  paragraphPause:  v => typeof v === 'number' && isFinite(v) && v >= 1.0 && v <= 5.0,
  dailyGoal:       v => Number.isInteger(v) && v >= 0 && v <= 50000,
  contentMode:     v => ['smart', 'article', 'minimal'].includes(v),
  keymap:          v => typeof v === 'object' && v !== null && !Array.isArray(v),
};

// Accepts only http and https URLs; rejects javascript:, data:, file:, etc.
function validateUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS_VALIDATORS, validateUrl };
}
