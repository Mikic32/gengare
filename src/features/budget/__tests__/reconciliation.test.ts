import { describe, expect, it } from 'vitest';

import { deriveBudgetView } from '../budget-engine';
import { applyCompleteOnboarding } from '../onboarding';
import { applyCreateReconciliationAdjustment } from '../reconciliation';
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

describe('reconciliation Module', () => {
  it('persists an approved inflow adjustment that closes a positive gap', () => {
    const snapshot = createSnapshotWithPositiveGap();
    const now = new Date('2026-06-26T10:00:00.000Z');

    const nextSnapshot = applyCreateReconciliationAdjustment(snapshot, now);
    const adjustment = nextSnapshot.transactions.at(-1);

    expect(adjustment).toMatchObject({
      id: 'transaction-3',
      accountId: snapshot.account?.id,
      source: 'reconciliation',
      kind: 'inflow',
      status: 'approved',
      amountCents: 10_000,
      occurredAt: now.toISOString(),
      categoryId: null,
      balanceAfterCents: null,
      payee: null,
      memo: 'Balance adjustment',
      createdAt: now.toISOString(),
    } satisfies Partial<CanonicalTransaction>);
    expect(deriveBudgetView(nextSnapshot, now).moneyState.reconciliationGap.amountCents).toBe(0);
  });

  it('rejects an adjustment when the ledger already matches the bank', () => {
    const snapshot = applyCompleteOnboarding(
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

    expect(() =>
      applyCreateReconciliationAdjustment(snapshot, new Date('2026-06-24T12:00:00.000Z'))
    ).toThrow(/already matches the bank/);
  });

  it('persists a categoryless outflow adjustment without mutating SMS evidence', () => {
    const snapshot = createSnapshotWithUnreviewedSmsGap();
    const now = new Date('2026-06-26T10:00:00.000Z');
    const rawSmsMessages = snapshot.rawSmsMessages;
    const smsParseResults = snapshot.smsParseResults;
    const importOutcomes = snapshot.importOutcomes;

    const nextSnapshot = applyCreateReconciliationAdjustment(snapshot, now);
    const adjustment = nextSnapshot.transactions.at(-1);
    const nextView = deriveBudgetView(nextSnapshot, now);

    expect(adjustment).toMatchObject({
      source: 'reconciliation',
      kind: 'inflow',
      status: 'approved',
      amountCents: -10_000,
      categoryId: null,
      balanceAfterCents: null,
    });
    expect(nextSnapshot.rawSmsMessages).toBe(rawSmsMessages);
    expect(nextSnapshot.smsParseResults).toBe(smsParseResults);
    expect(nextSnapshot.importOutcomes).toBe(importOutcomes);
    expect(nextView.moneyState.reconciliationGap.amountCents).toBe(0);
    expect(nextView.moneyState.assignableCash.amountCents).toBe(115_500);
  });
});

function createSnapshotWithPositiveGap() {
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

  return {
    ...onboarded,
    transactions: [
      ...onboarded.transactions,
      {
        id: 'transaction-2',
        accountId: onboarded.account?.id ?? 'account-1',
        source: 'manual' as const,
        kind: 'outflow' as const,
        status: 'approved' as const,
        amountCents: -10_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId: onboarded.categories[0].id,
        balanceAfterCents: null,
        payee: 'Market',
        memo: null,
        createdAt: '2026-06-25T09:00:00.000Z',
      },
    ],
  };
}

function createSnapshotWithUnreviewedSmsGap() {
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

  return {
    ...onboarded,
    transactions: [
      ...onboarded.transactions,
      {
        id: 'transaction-2',
        accountId: onboarded.account?.id ?? 'account-1',
        source: 'sms' as const,
        kind: 'outflow' as const,
        status: 'needs_review' as const,
        amountCents: -10_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId: null,
        balanceAfterCents: 115_500,
        payee: 'Market',
        memo: null,
        createdAt: '2026-06-25T09:01:00.000Z',
      },
    ],
    rawSmsMessages: [
      {
        id: 'raw-sms-1',
        sender: 'BANK',
        body: 'Iznos: 100.00 RSD',
        receivedAt: '2026-06-25T09:00:00.000Z',
        createdAt: '2026-06-25T09:01:00.000Z',
      },
    ],
    smsParseResults: [
      {
        id: 'sms-parse-1',
        rawSmsMessageId: 'raw-sms-1',
        parserId: 'debug-bank-sms',
        parserVersion: 1,
        status: 'parsed' as const,
        transactionId: 'transaction-2',
        kind: 'outflow' as const,
        amountCents: -10_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        balanceAfterCents: 115_500,
        payee: 'Market',
        memo: null,
        createdAt: '2026-06-25T09:01:00.000Z',
      },
    ],
    importOutcomes: [
      {
        id: 'import-outcome-1',
        rawSmsMessageId: 'raw-sms-1',
        parseResultId: 'sms-parse-1',
        kind: 'needs_review' as const,
        candidateTransactionId: 'transaction-2',
        reason: 'parsed_ok' as const,
        createdAt: '2026-06-25T09:01:00.000Z',
      },
    ],
  };
}
