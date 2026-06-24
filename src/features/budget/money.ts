export function parseDecimalMoneyToCents(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Starting balance is required.');
  }

  const sanitized = trimmed.replace(/[^\d,.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === ',') {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  const isNegative = sanitized.startsWith('-');
  if (isNegative) {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  if (usesOnlyThousandsSeparators(sanitized, ',')) {
    return parseWholeUnitsToCents(sanitized.replace(/,/g, ''));
  }

  if (usesOnlyThousandsSeparators(sanitized, '.')) {
    return parseWholeUnitsToCents(sanitized.replace(/\./g, ''));
  }

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const decimalSeparatorIndex = Math.max(lastComma, lastDot);

  let normalized = sanitized;

  if (decimalSeparatorIndex >= 0) {
    const integerPart = sanitized.slice(0, decimalSeparatorIndex).replace(/[.,]/g, '');
    const fractionPart = sanitized.slice(decimalSeparatorIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart || '0'}.${fractionPart}`;
  } else {
    normalized = sanitized.replace(/[.,]/g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  return Math.round(amount * 100);
}

function usesOnlyThousandsSeparators(value: string, separator: ',' | '.') {
  const otherSeparator = separator === ',' ? '.' : ',';
  if (value.includes(otherSeparator) || !value.includes(separator)) {
    return false;
  }

  const groups = value.split(separator);
  if (groups.length < 2) {
    return false;
  }

  if (!/^\d+$/.test(groups[0]) || groups[0].length > 3) {
    return false;
  }

  return groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

function parseWholeUnitsToCents(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Starting balance must be a valid non-negative amount.');
  }

  return Math.round(amount * 100);
}

export function assertValidCurrencyCode(currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error('Currency code must be a valid 3-letter ISO code.');
  }

  try {
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalized,
    }).format(0);
  } catch {
    throw new Error('Currency code must be a valid 3-letter ISO code.');
  }

  return normalized;
}

export function formatCurrency(amountCents: number, currencyCode: string) {
  const normalized = assertValidCurrencyCode(currencyCode);

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalized,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
