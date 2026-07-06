import { describe, expect, it } from 'vitest';

import { orchestrateSmsImport } from '../import-orchestration';
import type { BudgetSnapshot } from '../types';

describe('import orchestration', () => {
  it('creates a needs-review outcome for a parsed in-scope SMS', () => {
    const result = orchestrateSmsImport({
      snapshot: createBudgetSnapshot(),
      sms: {
        sender: 'BANK',
        body: createOtpOutflowSms(),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      createdAt: '2026-06-25T10:31:00.000Z',
      ids: createIds(),
    });

    expect(result.rawSmsMessage).toMatchObject({
      sender: 'BANK',
      receivedAt: '2026-06-25T10:31:00.000Z',
    });
    expect(result.parseResult).toMatchObject({
      status: 'parsed',
      transactionId: 'transaction-2',
      kind: 'outflow',
      amountCents: -156_880,
      balanceAfterCents: 452_755,
    });
    expect(result.candidateTransaction).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'needs_review',
      amountCents: -156_880,
    });
    expect(result.importOutcome).toMatchObject({
      kind: 'needs_review',
      parseResultId: 'sms-parse-1',
      candidateTransactionId: 'transaction-2',
      reason: 'parsed_ok',
    });
  });

  it('ignores SMS from disallowed senders before parsing', () => {
    const result = orchestrateSmsImport({
      snapshot: createBudgetSnapshot(),
      sms: {
        sender: 'SPAMMER',
        body: createOtpOutflowSms(),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      createdAt: '2026-06-25T10:31:00.000Z',
      ids: createIds(),
    });

    expect(result.parseResult).toBeNull();
    expect(result.candidateTransaction).toBeNull();
    expect(result.importOutcome).toMatchObject({
      kind: 'ignored',
      parseResultId: null,
      candidateTransactionId: null,
      reason: 'sender_not_allowed',
    });
  });

  it('routes unparseable SMS into manual import', () => {
    const result = orchestrateSmsImport({
      snapshot: createBudgetSnapshot(),
      sms: {
        sender: 'BANK',
        body: [
          'Datum: 31.02.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      createdAt: '2026-06-25T10:31:00.000Z',
      ids: createIds(),
    });

    expect(result.parseResult).toMatchObject({
      status: 'unparseable',
      transactionId: null,
    });
    expect(result.candidateTransaction).toBeNull();
    expect(result.importOutcome).toMatchObject({
      kind: 'manual_import',
      reason: 'unparseable',
      parseResultId: 'sms-parse-1',
    });
  });

  it('ignores parsed SMS that happened before tracking cutover', () => {
    const result = orchestrateSmsImport({
      snapshot: createBudgetSnapshot(),
      sms: {
        sender: 'BANK',
        body: [
          'Datum: 20.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      createdAt: '2026-06-25T10:31:00.000Z',
      ids: createIds(),
    });

    expect(result.parseResult).toMatchObject({
      status: 'parsed',
      transactionId: null,
    });
    expect(result.candidateTransaction).toBeNull();
    expect(result.importOutcome).toMatchObject({
      kind: 'ignored',
      reason: 'before_tracking_cutover',
      parseResultId: 'sms-parse-1',
    });
  });

  it('flags duplicate-looking SMS as possible duplicates', () => {
    const result = orchestrateSmsImport({
      snapshot: createBudgetSnapshot({
        transactions: [
          ...createBudgetSnapshot().transactions,
          {
            id: 'transaction-existing-sms',
            accountId: 'account-1',
            source: 'sms',
            kind: 'outflow',
            status: 'needs_review',
            amountCents: -156_880,
            occurredAt: new Date(2026, 5, 30, 3, 24, 4, 0).toISOString(),
            categoryId: null,
            balanceAfterCents: 452_755,
            payee: null,
            memo: 'Imported from OTP banka SMS',
            createdAt: '2026-06-25T10:30:00.000Z',
          },
        ],
      }),
      sms: {
        sender: 'BANK',
        body: createOtpOutflowSms(),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      createdAt: '2026-06-25T10:31:00.000Z',
      ids: createIds(),
    });

    expect(result.candidateTransaction).toMatchObject({
      id: 'transaction-2',
      status: 'needs_review',
    });
    expect(result.importOutcome).toMatchObject({
      kind: 'possible_duplicate',
      reason: 'possible_duplicate',
      candidateTransactionId: 'transaction-2',
    });
  });
});

function createBudgetSnapshot(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot & {
  account: NonNullable<BudgetSnapshot['account']>;
} {
  const snapshot: BudgetSnapshot = {
    account: {
      id: 'account-1',
      name: 'Main account',
      currencyCode: 'RSD',
      createdAt: '2026-06-24T10:00:00.000Z',
    },
    categoryGroups: [],
    categories: [],
    transactions: [
      {
        id: 'transaction-1',
        accountId: 'account-1',
        source: 'starting_balance',
        kind: 'inflow',
        status: 'approved',
        amountCents: 125_500,
        occurredAt: '2026-06-24T10:00:00.000Z',
        categoryId: null,
        balanceAfterCents: 125_500,
        payee: null,
        memo: 'Starting balance',
        createdAt: '2026-06-24T10:00:00.000Z',
      },
    ],
    assignmentEvents: [],
    rawSmsMessages: [],
    smsParseResults: [],
    importOutcomes: [],
  };

  return {
    ...snapshot,
    ...overrides,
    account: overrides.account ?? snapshot.account,
  };
}

function createIds() {
  return {
    rawSmsMessageId: 'raw-sms-1',
    parseResultId: 'sms-parse-1',
    transactionId: 'transaction-2',
    importOutcomeId: 'import-outcome-1',
  };
}

function createOtpOutflowSms() {
  return [
    'Datum: 30.06.2026, Vreme: 03:24:04',
    'Tekuci racun: 93005***84',
    'Odliv: 1.568,80 RSD',
    'Raspoloziva sredstva: 4.527,55 RSD',
    'Vasa OTP banka',
  ].join('\n');
}
