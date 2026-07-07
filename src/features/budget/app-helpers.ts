import { parseDecimalMoneyToCents } from './money';
import type { ImportOutcome } from './types';

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export function parseRequiredPositiveAmountToCents(
  value: string,
  label: string
) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }

  let amountCents = 0;

  try {
    amountCents = parseDecimalMoneyToCents(value);
  } catch {
    throw new Error(`${label} must be a valid amount.`);
  }

  if (amountCents <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return amountCents;
}

export function parseDateInputToIso(value: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Transaction date must use YYYY-MM-DD.');
  }

  const parsed = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error('Transaction date must be valid.');
  }

  return parsed.toISOString();
}

export function centsToDecimalString(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export function createSampleDebugSmsBody() {
  return [
    'Datum: 30.06.2026, Vreme: 03:24:04',
    'Tekuci racun: 93005***84',
    'Odliv: 1.568,80 RSD',
    'Raspoloziva sredstva: 4.527,55 RSD',
    'Vasa OTP banka',
  ].join('\n');
}

export function formatImportOutcomeReason(reason: ImportOutcome['reason']) {
  switch (reason) {
    case 'unparseable':
      return 'Parser could not understand the SMS';
    case 'sender_not_allowed':
      return 'Sender is not on the allowlist';
    case 'before_tracking_cutover':
      return 'Transaction happened before tracking started';
    case 'possible_duplicate':
      return 'Matched a duplicate heuristic';
    case 'parsed_ok':
      return 'Parsed successfully';
    default:
      return reason;
  }
}
