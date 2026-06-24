import { describe, expect, it } from 'vitest';

import { assertValidCurrencyCode, formatCurrency, parseDecimalMoneyToCents } from '../money';

describe('parseDecimalMoneyToCents', () => {
  it('treats commas as thousands separators when no decimal part is intended', () => {
    expect(parseDecimalMoneyToCents('10,000')).toBe(1_000_000);
    expect(parseDecimalMoneyToCents('1,234,567')).toBe(123_456_700);
  });

  it('accepts either comma or dot decimal separators', () => {
    expect(parseDecimalMoneyToCents('1250.50')).toBe(125_050);
    expect(parseDecimalMoneyToCents('1250,50')).toBe(125_050);
    expect(parseDecimalMoneyToCents('1.250,50')).toBe(125_050);
    expect(parseDecimalMoneyToCents('1,250.50')).toBe(125_050);
  });

  it('rejects negative and malformed values', () => {
    expect(() => parseDecimalMoneyToCents('-1')).toThrow(/non-negative/);
    expect(() => parseDecimalMoneyToCents('abc')).toThrow(/valid non-negative/);
  });
});

describe('currency validation', () => {
  it('accepts real ISO currency codes and normalizes case', () => {
    expect(assertValidCurrencyCode('rsd')).toBe('RSD');
  });

  it('rejects invalid currency codes before render time', () => {
    expect(() => assertValidCurrencyCode('TEST')).toThrow(/valid 3-letter ISO code/);
    expect(() => formatCurrency(1_000, 'TEST')).toThrow(/valid 3-letter ISO code/);
  });
});
