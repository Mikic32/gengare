import { toLocalDateKey } from './budget-engine';
import { parseDecimalMoneyToCents } from './money';
import type { CanonicalTransaction, ImportOutcome, TransactionSource } from './types';

export { createSampleDebugSmsBody } from './sms-import';

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export function parseOptionalBalanceAfterToCents(value: string) {
  if (!value.trim()) {
    return null;
  }

  try {
    return parseDecimalMoneyToCents(value);
  } catch {
    throw new Error('Balance after must be a valid amount.');
  }
}

export function parseRequiredPositiveAmountToCents(value: string, label: string) {
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

export function formatImportOutcomeReason(reason: ImportOutcome['reason']) {
  switch (reason) {
    case 'unparseable':
      return "Couldn't read this SMS";
    case 'sender_not_allowed':
      return 'Sender is not your bank';
    case 'before_tracking_cutover':
      return 'This is from before you started tracking';
    case 'possible_duplicate':
      return 'Looks like a duplicate';
    case 'parsed_ok':
      return 'Parsed successfully';
    default:
      return reason;
  }
}

export function formatMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month) {
    return monthKey;
  }

  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function getLocalDateKey(value: Date = new Date()) {
  return toLocalDateKey(value);
}

export function addDaysToLocalDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days));
}

export function formatShortDate(value: Date | string) {
  const dateKey =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toDateKey(value);
  const [yearText, monthText, dayText] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return dateKey;
  }

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function countInboxItems(data: {
  needsReview: unknown[];
  possibleDuplicates: unknown[];
  manualImportTasks: unknown[];
}) {
  return data.needsReview.length + data.possibleDuplicates.length + data.manualImportTasks.length;
}

export function transactionTitle(transaction: CanonicalTransaction) {
  if (transaction.payee) {
    return transaction.payee;
  }

  if (transaction.source === 'starting_balance') {
    return 'Starting balance';
  }

  if (transaction.source === 'reconciliation') {
    return 'Balance adjustment';
  }

  return transaction.kind === 'inflow' ? 'Income' : 'Spending';
}

export function transactionSourceLabel(source: TransactionSource) {
  switch (source) {
    case 'sms':
      return 'Bank SMS';
    case 'manual':
      return 'Manual';
    case 'starting_balance':
      return 'Starting balance';
    case 'reconciliation':
      return 'Adjustment';
    default:
      return source;
  }
}

function toDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
