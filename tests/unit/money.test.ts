import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error.js';
import {
  addMinor,
  assertPositiveMinor,
  formatMinorUnits,
  isCurrencyCode,
  subtractMinor,
  toMinorUnits,
} from '../../src/common/utils/money.js';

describe('toMinorUnits', () => {
  it.each([
    ['10.23', 1023],
    ['10.2', 1020],
    ['10', 1000],
    ['0.01', 1],
    ['0', 0],
    [' 7.50 ', 750],
  ])('converts %s to %i paise without floating-point math', (input, expected) => {
    expect(toMinorUnits(input, 'INR')).toBe(expected);
  });

  it('handles values that are inexact in binary floating point', () => {
    expect(toMinorUnits('0.29', 'INR')).toBe(29);
    expect(toMinorUnits('1.15', 'INR')).toBe(115);
    expect(toMinorUnits('4.35', 'INR')).toBe(435);
  });

  it.each(['10.234', '-1', '+1', '1e3', 'abc', '', '1.', '.5', '1,000', 'NaN', 'Infinity'])('rejects %j', (input) => {
    expect(() => toMinorUnits(input, 'INR')).toThrow(AppError);
  });

  it('rejects values beyond the safe integer range', () => {
    expect(() => toMinorUnits('9999999999999.99', 'INR')).not.toThrow();
    expect(() => toMinorUnits('99999999999999', 'INR')).toThrow(AppError);
  });
});

describe('formatMinorUnits', () => {
  it.each([
    [1023, '10.23'],
    [1, '0.01'],
    [0, '0.00'],
    [100000, '1000.00'],
    [-250, '-2.50'],
  ])('formats %i as %s', (minor, expected) => {
    expect(formatMinorUnits(minor, 'INR')).toBe(expected);
  });

  it('rejects non-integers', () => {
    expect(() => formatMinorUnits(10.5, 'INR')).toThrow(AppError);
  });

  it('round-trips with toMinorUnits', () => {
    for (const value of ['0.01', '12.34', '999.99', '100000.00']) {
      expect(formatMinorUnits(toMinorUnits(value, 'INR'), 'INR')).toBe(value);
    }
  });
});

describe('minor unit arithmetic', () => {
  it('adds and subtracts integers exactly', () => {
    expect(addMinor(10, 20)).toBe(30);
    expect(subtractMinor(1023, 23)).toBe(1000);
  });

  it('refuses to overflow the safe integer range', () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(AppError);
    expect(() => addMinor(0.1, 0.2)).toThrow(AppError);
  });

  it('requires positive payment amounts', () => {
    expect(assertPositiveMinor(1)).toBe(1);
    expect(() => assertPositiveMinor(0)).toThrow(AppError);
    expect(() => assertPositiveMinor(-5)).toThrow(AppError);
  });

  it('recognises supported currencies only', () => {
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('USD')).toBe(false);
    expect(isCurrencyCode('toString')).toBe(false);
  });
});
