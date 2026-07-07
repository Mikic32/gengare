import { describe, expect, it } from 'vitest';

import { applyCreateManualTransaction, applyUpdateManualTransaction } from '../manual-transactions';
import { applyCompleteOnboarding } from '../onboarding';
import type { BudgetSnapshot } from '../types';

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

describe('manual transactions Module', () => {
  it('creates approved outflows with normalized optional text', () => {
    const snapshot = createOnboardedSnapshot();
    const categoryId = snapshot.categories[0].id;

    const nextSnapshot = applyCreateManualTransaction(
      snapshot,
      {
        kind: 'outflow',
        amountCents: 25_000,
        occurredAt: '2026-06-25T12:00:00.000Z',
        categoryId,
        payee: ' Landlord ',
        memo: ' Late utility split ',
      },
      new Date('2026-06-26T10:00:00.000Z')
    );

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      accountId: snapshot.account?.id,
      source: 'manual',
      kind: 'outflow',
      status: 'approved',
      amountCents: -25_000,
      occurredAt: '2026-06-25T12:00:00.000Z',
      categoryId,
      balanceAfterCents: null,
      payee: 'Landlord',
      memo: 'Late utility split',
      createdAt: '2026-06-26T10:00:00.000Z',
    });
  });

  it('creates approved inflows as uncategorized cash', () => {
    const snapshot = createOnboardedSnapshot();

    const nextSnapshot = applyCreateManualTransaction(
      snapshot,
      {
        kind: 'inflow',
        amountCents: 20_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId: null,
        payee: 'Refund',
        memo: null,
      },
      new Date('2026-06-26T10:00:00.000Z')
    );

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      source: 'manual',
      kind: 'inflow',
      status: 'approved',
      amountCents: 20_000,
      categoryId: null,
      payee: 'Refund',
      memo: null,
    });
  });

  it('updates existing approved manual transactions in place', () => {
    const snapshot = createOnboardedSnapshot();
    const categoryId = snapshot.categories[0].id;
    const createdSnapshot = applyCreateManualTransaction(
      snapshot,
      {
        kind: 'outflow',
        amountCents: 20_000,
        occurredAt: '2026-06-20T09:00:00.000Z',
        categoryId,
        payee: 'Landlord',
        memo: null,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );
    const createdTransaction = createdSnapshot.transactions.at(-1);

    const updatedSnapshot = applyUpdateManualTransaction(createdSnapshot, {
      transactionId: createdTransaction?.id ?? 'missing',
      kind: 'outflow',
      amountCents: 20_000,
      occurredAt: '2026-05-20T09:00:00.000Z',
      categoryId,
      payee: 'Landlord',
      memo: 'Backdated correction',
    });

    expect(updatedSnapshot.transactions.at(-1)).toMatchObject({
      id: createdTransaction?.id,
      occurredAt: '2026-05-20T09:00:00.000Z',
      memo: 'Backdated correction',
    });
  });

  it('rejects invalid approved transaction category invariants', () => {
    const snapshot = createOnboardedSnapshot();
    const categoryId = snapshot.categories[0].id;

    expect(() =>
      applyCreateManualTransaction(snapshot, {
        kind: 'outflow',
        amountCents: 10_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId: null,
        payee: 'Landlord',
        memo: null,
      })
    ).toThrow(/require a category/);

    expect(() =>
      applyCreateManualTransaction(snapshot, {
        kind: 'inflow',
        amountCents: 10_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId,
        payee: 'Refund',
        memo: null,
      })
    ).toThrow(/must not have a category/);
  });
});

function createOnboardedSnapshot() {
  return applyCompleteOnboarding(
    EMPTY_SNAPSHOT,
    {
      accountName: 'Main account',
      currencyCode: 'RSD',
      startingBalanceCents: 125_500,
      categoryGroups: [
        {
          name: 'Essentials',
          categories: ['Rent'],
        },
      ],
    },
    new Date('2026-06-24T10:00:00.000Z')
  );
}
