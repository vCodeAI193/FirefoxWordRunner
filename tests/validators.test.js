const { SETTINGS_VALIDATORS: V } = require('../lib/validators');

describe('SETTINGS_VALIDATORS', () => {
  describe('wpm', () => {
    test('accepts minimum 100',  () => expect(V.wpm(100)).toBe(true));
    test('accepts maximum 1000', () => expect(V.wpm(1000)).toBe(true));
    test('accepts mid value',    () => expect(V.wpm(300)).toBe(true));
    test('rejects 99',           () => expect(V.wpm(99)).toBe(false));
    test('rejects 1001',         () => expect(V.wpm(1001)).toBe(false));
    test('rejects float',        () => expect(V.wpm(300.5)).toBe(false));
    test('rejects string',       () => expect(V.wpm('300')).toBe(false));
    test('rejects null',         () => expect(V.wpm(null)).toBe(false));
    test('rejects NaN',          () => expect(V.wpm(NaN)).toBe(false));
    test('rejects Infinity',     () => expect(V.wpm(Infinity)).toBe(false));
  });

  describe('wordsPerChunk', () => {
    test('accepts 1',    () => expect(V.wordsPerChunk(1)).toBe(true));
    test('accepts 2',    () => expect(V.wordsPerChunk(2)).toBe(true));
    test('rejects 0',    () => expect(V.wordsPerChunk(0)).toBe(false));
    test('rejects 3',    () => expect(V.wordsPerChunk(3)).toBe(false));
    test('rejects "1"',  () => expect(V.wordsPerChunk('1')).toBe(false));
    test('rejects NaN',  () => expect(V.wordsPerChunk(NaN)).toBe(false));
  });

  describe('displayMode', () => {
    test('accepts overlay',   () => expect(V.displayMode('overlay')).toBe(true));
    test('accepts highlight', () => expect(V.displayMode('highlight')).toBe(true));
    test('rejects other',     () => expect(V.displayMode('fullscreen')).toBe(false));
    test('rejects empty',     () => expect(V.displayMode('')).toBe(false));
  });

  describe('fontSize', () => {
    test('accepts minimum 24', () => expect(V.fontSize(24)).toBe(true));
    test('accepts maximum 96', () => expect(V.fontSize(96)).toBe(true));
    test('accepts mid 48',     () => expect(V.fontSize(48)).toBe(true));
    test('rejects 23',         () => expect(V.fontSize(23)).toBe(false));
    test('rejects 97',         () => expect(V.fontSize(97)).toBe(false));
    test('rejects float',      () => expect(V.fontSize(48.5)).toBe(false));
    test('rejects string',     () => expect(V.fontSize('48')).toBe(false));
    test('rejects NaN',        () => expect(V.fontSize(NaN)).toBe(false));
  });

  describe('fontFamily', () => {
    test('accepts serif',  () => expect(V.fontFamily('serif')).toBe(true));
    test('accepts mono',   () => expect(V.fontFamily('mono')).toBe(true));
    test('accepts system', () => expect(V.fontFamily('system')).toBe(true));
    test('rejects other',  () => expect(V.fontFamily('Arial')).toBe(false));
    test('rejects empty',  () => expect(V.fontFamily('')).toBe(false));
  });

  describe('theme', () => {
    test('accepts dark',  () => expect(V.theme('dark')).toBe(true));
    test('accepts light', () => expect(V.theme('light')).toBe(true));
    test('accepts auto',  () => expect(V.theme('auto')).toBe(true));
    test('rejects other', () => expect(V.theme('solarized')).toBe(false));
    test('rejects empty', () => expect(V.theme('')).toBe(false));
  });

  describe('orpColor', () => {
    test('accepts lowercase hex', () => expect(V.orpColor('#ef5350')).toBe(true));
    test('accepts uppercase hex', () => expect(V.orpColor('#EF5350')).toBe(true));
    test('accepts black',         () => expect(V.orpColor('#000000')).toBe(true));
    test('accepts white',         () => expect(V.orpColor('#ffffff')).toBe(true));
    test('rejects short hex',     () => expect(V.orpColor('#ef535')).toBe(false));
    test('rejects named color',   () => expect(V.orpColor('red')).toBe(false));
    test('rejects invalid chars', () => expect(V.orpColor('#gggggg')).toBe(false));
    test('rejects no hash',       () => expect(V.orpColor('ef5350')).toBe(false));
    test('rejects number',        () => expect(V.orpColor(0xff0000)).toBe(false));
    test('rejects 7-hex-digit string (too long)', () => expect(V.orpColor('#ffffff0')).toBe(false));
  });

  describe('skipShortWords', () => {
    test('accepts true',   () => expect(V.skipShortWords(true)).toBe(true));
    test('accepts false',  () => expect(V.skipShortWords(false)).toBe(true));
    test('rejects "true"', () => expect(V.skipShortWords('true')).toBe(false));
    test('rejects 1',      () => expect(V.skipShortWords(1)).toBe(false));
    test('rejects null',   () => expect(V.skipShortWords(null)).toBe(false));
    test('rejects 0',      () => expect(V.skipShortWords(0)).toBe(false));
  });
});
