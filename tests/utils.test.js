const { hexToRgba } = require('../lib/utils');

describe('hexToRgba', () => {
  test('converts pure red', () => {
    expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
  });

  test('converts pure black with zero alpha', () => {
    expect(hexToRgba('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  test('converts default ORP color with highlight alpha', () => {
    expect(hexToRgba('#ef5350', 0.28)).toBe('rgba(239, 83, 80, 0.28)');
  });

  test('converts blue ORP color with border alpha', () => {
    expect(hexToRgba('#1565c0', 0.65)).toBe('rgba(21, 101, 192, 0.65)');
  });

  test('converts pure white', () => {
    expect(hexToRgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  });
});
