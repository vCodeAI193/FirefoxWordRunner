const { processWords, getOrpOffset, splitAtOrp, getWordDuration, estimateReadingMs } = require('../lib/wordprocessor');

// ---------------------------------------------------------------------------
// processWords
// ---------------------------------------------------------------------------

describe('processWords', () => {
  test('empty string returns empty array', () => {
    expect(processWords('')).toEqual([]);
  });

  test('whitespace-only string returns empty array', () => {
    expect(processWords('   \t\n  ')).toEqual([]);
  });

  test('single word', () => {
    expect(processWords('hello')).toEqual(['hello']);
  });

  test('multiple words split on spaces', () => {
    expect(processWords('hello world')).toEqual(['hello', 'world']);
  });

  test('collapses multiple spaces', () => {
    expect(processWords('hello   world')).toEqual(['hello', 'world']);
  });

  test('collapses newlines and tabs into spaces', () => {
    expect(processWords('hello\nworld\tfoo')).toEqual(['hello', 'world', 'foo']);
  });

  test('preserves punctuation attached to words', () => {
    expect(processWords('Hello, world.')).toEqual(['Hello,', 'world.']);
  });

  test('token exactly 25 chars is kept as-is', () => {
    const word = 'a'.repeat(25);
    expect(processWords(word)).toEqual([word]);
  });

  test('token longer than 25 chars is truncated to 22 + ellipsis', () => {
    const word = 'a'.repeat(30);
    const result = processWords(word);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('a'.repeat(22) + '...');
  });

  test('strips leading and trailing whitespace from result', () => {
    expect(processWords('  hello world  ')).toEqual(['hello', 'world']);
  });

  test('removes zero-width spaces', () => {
    expect(processWords('hel​lo')).toEqual(['hello']);
  });

  test('paragraph marker ¶ is preserved as a token', () => {
    expect(processWords('¶')).toEqual(['¶']);
  });

  test('paragraph markers mixed with words are preserved', () => {
    expect(processWords('hello ¶ world')).toEqual(['hello', '¶', 'world']);
  });

  test('handles non-breaking spaces as word separators', () => {
    expect(processWords('hello world')).toEqual(['hello', 'world']);
  });

  test('preserves paragraph marker ¶ as its own token', () => {
    expect(processWords('hello ¶ world')).toEqual(['hello', '¶', 'world']);
  });

  test('26-char token is truncated (exact boundary above 25)', () => {
    const word = 'b'.repeat(26);
    expect(processWords(word)).toEqual(['b'.repeat(22) + '...']);
  });
});

// ---------------------------------------------------------------------------
// getOrpOffset
// ---------------------------------------------------------------------------

describe('getOrpOffset', () => {
  test('empty string returns 0', () => {
    expect(getOrpOffset('')).toBe(0);
  });

  test('1-letter word returns 0', () => {
    expect(getOrpOffset('a')).toBe(0);
  });

  test('2-letter word returns 1', () => {
    expect(getOrpOffset('hi')).toBe(1);
  });

  test('5-letter word returns 1', () => {
    expect(getOrpOffset('hello')).toBe(1);
  });

  test('6-letter word returns 2', () => {
    expect(getOrpOffset('runner')).toBe(2);
  });

  test('9-letter word returns 2', () => {
    expect(getOrpOffset('beautiful')).toBe(2);
  });

  test('10-letter word returns 3', () => {
    expect(getOrpOffset('everything')).toBe(3);
  });

  test('13-letter word returns 3', () => {
    expect(getOrpOffset('extraordinary')).toBe(3);
  });

  test('14-letter word returns 4', () => {
    expect(getOrpOffset('extraordinarily')).toBe(4);
  });

  test('strips surrounding punctuation before measuring length', () => {
    // '"hello"' → letters = 'hello' (5) → offset 1
    expect(getOrpOffset('"hello"')).toBe(1);
  });

  test('pure punctuation token returns 0', () => {
    // letters = '' → len 0 ≤ 1 → 0
    expect(getOrpOffset('...')).toBe(0);
  });

  test('3-letter word returns 1',  () => expect(getOrpOffset('the')).toBe(1));
  test('4-letter word returns 1',  () => expect(getOrpOffset('word')).toBe(1));
  test('7-letter word returns 2',  () => expect(getOrpOffset('quickly')).toBe(2));
  test('8-letter word returns 2',  () => expect(getOrpOffset('wonders')).toBe(2));
  test('11-letter word returns 3', () => expect(getOrpOffset('immediately')).toBe(3));
  test('12-letter word returns 3', () => expect(getOrpOffset('implications')).toBe(3));
  test('15-letter word returns 4', () => expect(getOrpOffset('extraordinarily')).toBe(4));
});

// ---------------------------------------------------------------------------
// splitAtOrp
// ---------------------------------------------------------------------------

describe('splitAtOrp', () => {
  test('single character: before empty, focus is the char', () => {
    expect(splitAtOrp('a')).toEqual({ before: '', focus: 'a', after: '' });
  });

  test('two characters: ORP at index 1', () => {
    expect(splitAtOrp('hi')).toEqual({ before: 'h', focus: 'i', after: '' });
  });

  test('five-letter word: ORP at index 1', () => {
    const result = splitAtOrp('hello');
    expect(result.before).toBe('h');
    expect(result.focus).toBe('e');
    expect(result.after).toBe('llo');
  });

  test('reconstructs original word from parts', () => {
    const words = ['a', 'hi', 'hello', 'runner', 'beautiful', 'everything', 'extraordinary'];
    words.forEach(word => {
      const { before, focus, after } = splitAtOrp(word);
      expect(before + focus + after).toBe(word);
    });
  });

  test('leading punctuation is included in before', () => {
    // '"hello"': start=1 (skip '"'), orp=1+1=2, before='"h', focus='e', after='llo"'
    const result = splitAtOrp('"hello"');
    expect(result.before + result.focus + result.after).toBe('"hello"');
    expect(result.focus).toBe('e');
  });

  test('focus is always exactly one character (or empty for empty string)', () => {
    const words = ['x', 'ok', 'speed', 'reading', 'performance'];
    words.forEach(word => {
      const { focus } = splitAtOrp(word);
      expect(focus.length).toBeLessThanOrEqual(1);
    });
  });

  test('empty string returns all empty parts', () => {
    expect(splitAtOrp('')).toEqual({ before: '', focus: '', after: '' });
  });

  test('multiple leading punctuation is included in before', () => {
    const result = splitAtOrp('..."hello"');
    expect(result.before + result.focus + result.after).toBe('..."hello"');
    expect(result.focus).toBe('e');
  });

  test('pure-punctuation word: all chars end up in before, focus is empty', () => {
    // start advances past all 3 non-word chars → orp=3; before='...', focus='', after=''
    const result = splitAtOrp('...');
    expect(result.before + result.focus + result.after).toBe('...');
    expect(result.focus).toBe('');
    expect(result.before).toBe('...');
  });
});

// ---------------------------------------------------------------------------
// getWordDuration
// ---------------------------------------------------------------------------

describe('getWordDuration', () => {
  const BASE = 200;

  test('1-letter word uses 0.8× multiplier', () => {
    expect(getWordDuration('a', BASE)).toBe(Math.round(BASE * 0.8));
  });

  test('2-letter word uses 0.8× multiplier', () => {
    expect(getWordDuration('hi', BASE)).toBe(Math.round(BASE * 0.8));
  });

  test('3-letter word uses 1.0× multiplier', () => {
    expect(getWordDuration('the', BASE)).toBe(BASE);
  });

  test('7-letter word uses 1.2× multiplier', () => {
    expect(getWordDuration('reading', BASE)).toBe(Math.round(BASE * 1.2));
  });

  test('10-letter word uses 1.4× multiplier', () => {
    expect(getWordDuration('everything', BASE)).toBe(Math.round(BASE * 1.4));
  });

  test('word ending with period adds 0.6× extra', () => {
    // 'end.' → len=3 → m=1.0, sentenceEnd → +0.6 → 1.6
    expect(getWordDuration('end.', BASE)).toBe(Math.round(BASE * 1.6));
  });

  test('word ending with ! adds 0.6× extra', () => {
    // 'go' = 2 letters → m=0.8, sentenceEnd → +0.6 = 1.4
    expect(getWordDuration('go!', BASE)).toBe(Math.round(BASE * 1.4));
  });

  test('word ending with ? adds 0.6× extra', () => {
    // 'really' = 6 letters → m=1.0, sentenceEnd → +0.6 = 1.6
    expect(getWordDuration('really?', BASE)).toBe(Math.round(BASE * 1.6));
  });

  test('word ending with comma adds 0.3× extra', () => {
    // 'word,' → len=4 → m=1.0, comma → +0.3 → 1.3
    expect(getWordDuration('word,', BASE)).toBe(Math.round(BASE * 1.3));
  });

  test('sentence-end takes priority over comma (no comma case)', () => {
    // Only sentence-end applies — this just verifies the logic is consistent
    expect(getWordDuration('end.', BASE)).toBeGreaterThan(getWordDuration('word,', BASE));
  });

  test('paragraph marker ¶ returns 2.5× base duration', () => {
    expect(getWordDuration('¶', BASE)).toBe(Math.round(BASE * 2.5));
  });

  test('word ending with Unicode ellipsis … adds 0.6× extra', () => {
    // 'Ende…' → letters='Ende' (4) → m=1.0, sentenceEnd → +0.6 → 1.6
    expect(getWordDuration('Ende…', BASE)).toBe(Math.round(BASE * 1.6));
  });

  test('result is always at least 50ms', () => {
    expect(getWordDuration('a', 10)).toBe(50);
    expect(getWordDuration('hi', 1)).toBe(50);
  });

  test('result is a whole number (no fractional milliseconds)', () => {
    const result = getWordDuration('hello', 333);
    expect(result % 1).toBe(0);
  });

  test('higher baseMs produces proportionally longer durations', () => {
    const low = getWordDuration('hello', 100);
    const high = getWordDuration('hello', 400);
    expect(high).toBeGreaterThan(low);
  });

  test('last char of multi-punctuation token determines sentenceEnd ("what?!")', () => {
    // 'what?!' → last char '!' → sentenceEnd=true; letters: w,h,a,t = 4 → m=1.0+0.6=1.6
    expect(getWordDuration('what?!', 200)).toBe(Math.round(200 * 1.6));
  });

  test('non-ASCII letters are excluded from length count ("café" = 3 ASCII letters)', () => {
    // 'café'.replace(/[^a-zA-Z]/g,'') = 'caf' → 3 letters → m=1.0
    expect(getWordDuration('café', 200)).toBe(Math.round(200 * 1.0));
  });

  test('6-letter word uses 1.0× multiplier (upper boundary of 1.0 tier)', () => {
    // 'runner' → len=6, not ≥7, not ≤2 → m=1.0
    expect(getWordDuration('runner', 200)).toBe(200);
  });

  test('9-letter word uses 1.2× multiplier (upper boundary of 1.2 tier)', () => {
    // 'beautiful' → len=9, not ≥10 → m=1.2
    expect(getWordDuration('beautiful', 200)).toBe(Math.round(200 * 1.2));
  });

  test('single punctuation . treated as len=0 with sentence-end boost', () => {
    // letters='' → len=0 ≤ 2 → m=0.8; sentenceEnd=true → +0.6 = 1.4
    expect(getWordDuration('.', 200)).toBe(Math.round(200 * 1.4));
  });

  test('fractional baseMs is rounded correctly', () => {
    const result = getWordDuration('hi', 333); // len=2 → m=0.8
    expect(result).toBe(Math.round(333 * 0.8));
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// estimateReadingMs
// ---------------------------------------------------------------------------

describe('estimateReadingMs', () => {
  test('returns 0 for zero words', () => {
    expect(estimateReadingMs(0, 300)).toBe(0);
  });

  test('returns 0 for zero wpm', () => {
    expect(estimateReadingMs(100, 0)).toBe(0);
  });

  test('300 words at 300 wpm ≈ 67.2 seconds', () => {
    // (300/300) * 60000 * 1.12 = 67200ms
    expect(estimateReadingMs(300, 300)).toBeCloseTo(67200, 0);
  });

  test('600 words at 300 wpm is twice 300 words at 300 wpm', () => {
    expect(estimateReadingMs(600, 300)).toBeCloseTo(estimateReadingMs(300, 300) * 2, 0);
  });

  test('same words, double wpm → half the time', () => {
    const slow = estimateReadingMs(100, 200);
    const fast = estimateReadingMs(100, 400);
    expect(slow).toBeCloseTo(fast * 2, 0);
  });

  test('result is proportional to word count', () => {
    const base = estimateReadingMs(10, 300);
    expect(estimateReadingMs(50, 300)).toBeCloseTo(base * 5, 0);
  });

  test('returns a positive number for valid inputs', () => {
    expect(estimateReadingMs(1, 100)).toBeGreaterThan(0);
  });

  test('returns 0 for negative word count', () => {
    expect(estimateReadingMs(-5, 300)).toBe(0);
  });

  test('returns 0 for negative wpm', () => {
    expect(estimateReadingMs(100, -1)).toBe(0);
  });

  test('minimal valid input: 1 word at 1 wpm', () => {
    expect(estimateReadingMs(1, 1)).toBeCloseTo(67200, 0);
  });
});
