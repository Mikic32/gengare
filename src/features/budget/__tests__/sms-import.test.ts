import { describe, expect, it } from 'vitest';

import { parseDebugBankSms } from '../sms-import';
import { toLocalDateKey, toMonthKey } from '../budget-engine';

describe('debug SMS parser', () => {
  it('parses OTP outflow SMS in local device time', () => {
    const parsed = parseDebugBankSms(
      [
        'Datum: 30.06.2026, Vreme: 03:24:04',
        'Tekuci racun: 93005***84',
        'Odliv: 1.568,80 RSD',
        'Raspoloziva sredstva: 4.527,55 RSD',
        'Vasa OTP banka',
      ].join('\n')
    );

    expect(parsed).toMatchObject({
      kind: 'outflow',
      amountCents: 156_880,
      balanceAfterCents: 452_755,
      payee: null,
    });
    expect(parsed?.occurredAt).toBe(new Date(2026, 5, 30, 3, 24, 4, 0).toISOString());
  });

  it('parses OTP inflow SMS', () => {
    const parsed = parseDebugBankSms(
      [
        'Datum: 30.06.2026, Vreme: 03:24:04',
        'Tekuci racun: 93005***84',
        'Priliv: 5.825,00 RSD',
        'Raspoloziva sredstva: 4.527,55 RSD',
        'Vasa OTP banka',
      ].join('\n')
    );

    expect(parsed).toMatchObject({
      kind: 'inflow',
      amountCents: 582_500,
      balanceAfterCents: 452_755,
      payee: null,
    });
  });

  it('rejects impossible local dates', () => {
    expect(() =>
      parseDebugBankSms(
        [
          'Datum: 31.02.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n')
      )
    ).toThrow(/invalid occurred-at timestamp/);
  });

  it('keeps local calendar month and date for month-boundary SMS', () => {
    const occurredAt = new Date(2026, 6, 1, 0, 30, 0, 0).toISOString();

    expect(toMonthKey(occurredAt)).toBe('2026-07');
    expect(toLocalDateKey(occurredAt)).toBe('2026-07-01');
  });
});
