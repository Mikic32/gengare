import { describe, expect, it } from 'vitest';

import { parseBackup, serializeBackup } from '../backup';
import { applyCompleteOnboarding } from '../onboarding';
import type { BudgetSnapshot, CanonicalTransaction } from '../types';

const EMPTY_SNAPSHOT: BudgetSnapshot = {
  account: null,
  categoryGroups: [],
  categories: [],
  transactions: [],
  assignmentEvents: [],
  rawSmsMessages: [],
  smsParseResults: [],
  importOutcomes: [],
};

describe('backup Module', () => {
  it('exports a complete snapshot that round-trips into the same budget facts', () => {
    const snapshot = createCompleteSnapshot();

    const serialized = serializeBackup(snapshot, new Date('2026-06-26T12:00:00.000Z'));
    const restored = parseBackup(serialized);

    expect(JSON.parse(serialized)).toEqual({
      format: 'gengare-backup',
      version: 1,
      exportedAt: '2026-06-26T12:00:00.000Z',
      snapshot,
    });
    expect(restored).toEqual(snapshot);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('{not json')).toThrow('Backup is not valid JSON.');
  });

  it('rejects a document that is not a gengare backup', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'other-backup',
          version: 1,
          exportedAt: '2026-06-26T12:00:00.000Z',
          snapshot: createCompleteSnapshot(),
        })
      )
    ).toThrow('Backup is not a gengare backup.');
  });

  it('rejects an unsupported backup version', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'gengare-backup',
          version: 2,
          exportedAt: '2026-06-26T12:00:00.000Z',
          snapshot: createCompleteSnapshot(),
        })
      )
    ).toThrow('Backup version is not supported.');
  });

  it('rejects an incomplete snapshot instead of treating missing collections as empty', () => {
    const snapshot = createCompleteSnapshot();
    const { importOutcomes: _ignored, ...incompleteSnapshot } = snapshot;

    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'gengare-backup',
          version: 1,
          exportedAt: '2026-06-26T12:00:00.000Z',
          snapshot: incompleteSnapshot,
        })
      )
    ).toThrow('Backup snapshot is incomplete.');
  });
});

function createCompleteSnapshot(): BudgetSnapshot {
  const onboarded = applyCompleteOnboarding(
    EMPTY_SNAPSHOT,
    {
      accountName: 'Main account',
      currencyCode: 'RSD',
      startingBalanceCents: 125_500,
      categoryGroups: [
        {
          name: 'Essentials',
          categories: ['Groceries'],
        },
      ],
    },
    new Date('2026-06-24T10:00:00.000Z')
  );

  const outflow: CanonicalTransaction = {
    id: 'transaction-2',
    accountId: onboarded.account?.id ?? 'missing-account',
    source: 'sms',
    kind: 'outflow',
    status: 'approved',
    amountCents: -15_000,
    occurredAt: '2026-06-25T10:30:00.000Z',
    categoryId: onboarded.categories[0].id,
    balanceAfterCents: 110_500,
    payee: 'Market',
    memo: null,
    createdAt: '2026-06-25T10:31:00.000Z',
  };

  return {
    ...onboarded,
    transactions: [...onboarded.transactions, outflow],
    assignmentEvents: [
      {
        id: 'assignment-1',
        categoryId: onboarded.categories[0].id,
        monthKey: '2026-06',
        amountCents: 40_000,
        createdAt: '2026-06-24T11:00:00.000Z',
      },
    ],
    rawSmsMessages: [
      {
        id: 'raw-sms-1',
        sender: 'BANK',
        body: 'DEBUG 150.00 RSD Market 2026-06-25T10:30:00.000Z 1105.00',
        receivedAt: '2026-06-25T10:31:00.000Z',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    smsParseResults: [
      {
        id: 'sms-parse-1',
        rawSmsMessageId: 'raw-sms-1',
        parserId: 'debug-bank-sms',
        parserVersion: 1,
        status: 'parsed',
        transactionId: outflow.id,
        kind: 'outflow',
        amountCents: -15_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        balanceAfterCents: 110_500,
        payee: 'Market',
        memo: null,
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    importOutcomes: [
      {
        id: 'import-outcome-1',
        rawSmsMessageId: 'raw-sms-1',
        parseResultId: 'sms-parse-1',
        kind: 'needs_review',
        candidateTransactionId: outflow.id,
        reason: 'parsed_ok',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
  };
}
