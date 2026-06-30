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
  const fields = extractOtpSmsFields(body);
  if (!fields) {
    return null;
  }

  return {
    kind: fields.kind,
    amountCents: parseDecimalMoneyToCents(fields.amountText),
    occurredAt: normalizeSmsOccurredAt(fields.dateText, fields.timeText),
    balanceAfterCents: parseDecimalMoneyToCents(fields.balanceText),
    payee: null,
    memo: 'Imported from OTP banka SMS',
  };
}

function extractOtpSmsFields(body: string) {
  const normalizedLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dateTimeLine = normalizedLines.find((line) => line.startsWith('Datum:'));
  const amountLine = normalizedLines.find((line) => line.startsWith('Priliv:') || line.startsWith('Odliv:'));
  const balanceLine = normalizedLines.find((line) => line.startsWith('Raspoloziva sredstva:'));

  if (!dateTimeLine || !amountLine || !balanceLine) {
    return null;
  }

  const dateTimeMatch = dateTimeLine.match(/^Datum:\s*(\d{2}\.\d{2}\.\d{4}),\s*Vreme:\s*(\d{2}:\d{2}:\d{2})$/i);
  const amountMatch = amountLine.match(/^(Priliv|Odliv):\s*([0-9][\d.,]*)\s+RSD$/i);
  const balanceMatch = balanceLine.match(/^Raspoloziva sredstva:\s*([0-9][\d.,]*)\s+RSD$/i);

  if (!dateTimeMatch || !amountMatch || !balanceMatch) {
    return null;
  }

  return {
    dateText: dateTimeMatch[1],
    timeText: dateTimeMatch[2],
    kind: amountMatch[1].toLowerCase() === 'priliv' ? ('inflow' as const) : ('outflow' as const),
    amountText: amountMatch[2],
    balanceText: balanceMatch[1],
  };
}

function normalizeSmsOccurredAt(dateText: string, timeText: string) {
  const [dayText, monthText, yearText] = dateText.split('.');
  const [hourText, minuteText, secondText] = timeText.split(':');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  const occurredAt = new Date(year, month - 1, day, hour, minute, second, 0);

  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.getFullYear() !== year ||
    occurredAt.getMonth() !== month - 1 ||
    occurredAt.getDate() !== day ||
    occurredAt.getHours() !== hour ||
    occurredAt.getMinutes() !== minute ||
    occurredAt.getSeconds() !== second
  ) {
    throw new Error('Debug SMS contains an invalid occurred-at timestamp.');
  }

  return occurredAt.toISOString();
}

