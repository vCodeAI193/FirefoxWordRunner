const SETTINGS_VALIDATORS = {
  wpm:            v => Number.isInteger(v) && v >= 100 && v <= 1000,
  wordsPerChunk:  v => v === 1 || v === 2,
  displayMode:    v => v === 'overlay' || v === 'highlight',
  fontSize:       v => Number.isInteger(v) && v >= 24 && v <= 96,
  fontFamily:     v => ['serif', 'mono', 'system'].includes(v),
  theme:          v => ['dark', 'light', 'auto'].includes(v),
  orpColor:       v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  skipShortWords: v => typeof v === 'boolean',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS_VALIDATORS };
}
