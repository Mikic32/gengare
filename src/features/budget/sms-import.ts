import { parseDecimalMoneyToCents } from './money';
import type { TransactionKind } from './types';

export const DEBUG_BANK_SMS_PARSER_ID = 'debug-bank-sms';
export const DEBUG_BANK_SMS_PARSER_VERSION = 1;

export type ParsedDebugSms = {
  kind: TransactionKind;
  amountCents: number;
  occurredAt: string;
  balanceAfterCents: number;
  payee: string | null;
  memo: string | null;
};

export function parseDebugBankSms(body: string): ParsedDebugSms | null {
  const trimmed = body.trim();

  const outflowMatch = trimmed.match(
    /^BANK:\s*Card purchase\s+([0-9][\d.,]*)\s+([A-Z]{3})\s+at\s+(.+?)\.\s+Balance\s+([0-9][\d.,]*)\s+\2\.\s+Date\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\.$/i
  );

  if (outflowMatch) {
    const [, amountText, , payeeText, balanceText, dateText, timeText] = outflowMatch;

    return {
      kind: 'outflow',
      amountCents: parseDecimalMoneyToCents(amountText),
      occurredAt: normalizeSmsOccurredAt(dateText, timeText),
      balanceAfterCents: parseDecimalMoneyToCents(balanceText),
      payee: normalizeOptionalText(payeeText),
      memo: 'Imported from debug SMS',
    };
  }

  const inflowMatch = trimmed.match(
    /^BANK:\s*Incoming transfer\s+([0-9][\d.,]*)\s+([A-Z]{3})\s+from\s+(.+?)\.\s+Balance\s+([0-9][\d.,]*)\s+\2\.\s+Date\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\.$/i
  );

  if (inflowMatch) {
    const [, amountText, , payeeText, balanceText, dateText, timeText] = inflowMatch;

    return {
      kind: 'inflow',
      amountCents: parseDecimalMoneyToCents(amountText),
      occurredAt: normalizeSmsOccurredAt(dateText, timeText),
      balanceAfterCents: parseDecimalMoneyToCents(balanceText),
      payee: normalizeOptionalText(payeeText),
      memo: 'Imported from debug SMS',
    };
  }

  return null;
}

function normalizeSmsOccurredAt(dateText: string, timeText: string) {
  const occurredAt = new Date(`${dateText}T${timeText}:00.000Z`);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Debug SMS contains an invalid occurred-at timestamp.');
  }

  return occurredAt.toISOString();
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
