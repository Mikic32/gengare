import { describe, expect, it } from 'vitest';

import { applyCreateManualTransaction } from '../manual-transactions';
import { applyCompleteOnboarding } from '../onboarding';
import { deriveMonthlyReport } from '../reports';
import { createBudgetStore, createMemoryBudgetStorage } from '../store';
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

describe('monthly reports Module', () => {
  it('reports approved outflow spending by category for the selected month', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories.find((category) => category.name === 'Groceries')?.id;
    const rentId = onboarded.categories.find((category) => category.name === 'Rent')?.id;

    expect(groceriesId).toBeDefined();
    expect(rentId).toBeDefined();

    const withGroceries = applyCreateManualTransaction(onboarded, {
      kind: 'outflow',
      amountCents: 7_500,
      occurredAt: '2026-06-25T12:00:00.000Z',
      categoryId: groceriesId!,
      payee: 'Market',
      memo: null,
    });
    const withMoreGroceries = applyCreateManualTransaction(withGroceries, {
      kind: 'outflow',
      amountCents: 2_500,
      occurredAt: '2026-06-28T09:00:00.000Z',
      categoryId: groceriesId!,
      payee: 'Bakery',
      memo: null,
    });
    const withRent = applyCreateManualTransaction(withMoreGroceries, {
      kind: 'outflow',
      amountCents: 50_000,
      occurredAt: '2026-06-01T08:00:00.000Z',
      categoryId: rentId!,
      payee: 'Landlord',
      memo: null,
    });
    const snapshot = applyCreateManualTransaction(withRent, {
      kind: 'outflow',
      amountCents: 4_000,
      occurredAt: '2026-07-02T10:00:00.000Z',
      categoryId: groceriesId!,
      payee: 'July market',
      memo: null,
    });

    expect(deriveMonthlyReport(snapshot, '2026-06')).toMatchObject({
      monthKey: '2026-06',
      spendingByCategory: [
        { categoryId: rentId, categoryName: 'Rent', spentCents: 50_000 },
        { categoryId: groceriesId, categoryName: 'Groceries', spentCents: 10_000 },
      ],
    });
  });

  it('summarizes approved inflow versus outflow for the selected month', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories.find((category) => category.name === 'Groceries')?.id;
    expect(groceriesId).toBeDefined();

    const withSpending = applyCreateManualTransaction(onboarded, {
      kind: 'outflow',
      amountCents: 10_000,
      occurredAt: '2026-06-25T12:00:00.000Z',
      categoryId: groceriesId!,
      payee: 'Market',
      memo: null,
    });
    const snapshot = applyCreateManualTransaction(withSpending, {
      kind: 'inflow',
      amountCents: 20_000,
      occurredAt: '2026-06-26T09:00:00.000Z',
      categoryId: null,
      payee: 'Refund',
      memo: null,
    });

    expect(deriveMonthlyReport(snapshot, '2026-06').cashflow).toEqual({
      inflowCents: 145_500,
      outflowCents: 10_000,
      netCents: 135_500,
    });
  });

  it('uses only approved transactions keyed by occurredAt month', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories.find((category) => category.name === 'Groceries')?.id;
    expect(groceriesId).toBeDefined();

    const snapshot: BudgetSnapshot = {
      ...onboarded,
      transactions: [
        ...onboarded.transactions,
        {
          id: 'transaction-review',
          accountId: onboarded.account!.id,
          source: 'sms',
          kind: 'outflow',
          status: 'needs_review',
          amountCents: -8_000,
          occurredAt: '2026-06-25T12:00:00.000Z',
          categoryId: groceriesId!,
          balanceAfterCents: 110_000,
          payee: 'Unreviewed shop',
          memo: null,
          createdAt: '2026-06-25T12:00:00.000Z',
        },
        {
          id: 'transaction-ignored',
          accountId: onboarded.account!.id,
          source: 'sms',
          kind: 'outflow',
          status: 'ignored',
          amountCents: -3_000,
          occurredAt: '2026-06-26T12:00:00.000Z',
          categoryId: groceriesId!,
          balanceAfterCents: null,
          payee: 'Ignored shop',
          memo: null,
          createdAt: '2026-06-26T12:00:00.000Z',
        },
        {
          id: 'transaction-late-review',
          accountId: onboarded.account!.id,
          source: 'manual',
          kind: 'outflow',
          status: 'approved',
          amountCents: -4_000,
          occurredAt: '2026-05-15T12:00:00.000Z',
          categoryId: groceriesId!,
          balanceAfterCents: null,
          payee: 'May market',
          memo: null,
          createdAt: '2026-06-26T18:00:00.000Z',
        },
      ],
    };

    const juneReport = deriveMonthlyReport(snapshot, '2026-06');
    expect(juneReport.spendingByCategory).toEqual([]);
    expect(juneReport.cashflow).toEqual({
      inflowCents: 125_500,
      outflowCents: 0,
      netCents: 125_500,
    });

    expect(deriveMonthlyReport(snapshot, '2026-05').spendingByCategory).toEqual([
      { categoryId: groceriesId, categoryName: 'Groceries', spentCents: 4_000 },
    ]);
  });

  it('returns an empty report for a month with no approved activity', () => {
    const snapshot = createOnboardedSnapshot();

    expect(deriveMonthlyReport(snapshot, '2026-08')).toEqual({
      monthKey: '2026-08',
      spendingByCategory: [],
      cashflow: {
        inflowCents: 0,
        outflowCents: 0,
        netCents: 0,
      },
    });
  });

  it('returns null for a monthly report before onboarding exists', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(store.getMonthlyReport('2026-06')).resolves.toBeNull();
  });

  it('loads a monthly report from persisted approved transactions', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const view = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );
    const groceriesId = view.categoryGroups[0].categories.find(
      (category) => category.name === 'Groceries'
    )?.id;
    expect(groceriesId).toBeDefined();

    await store.createManualTransaction(
      {
        kind: 'outflow',
        amountCents: 10_000,
        occurredAt: '2026-06-25T12:00:00.000Z',
        categoryId: groceriesId!,
        payee: 'Market',
        memo: null,
      },
      new Date('2026-06-25T12:00:00.000Z')
    );

    await expect(store.getMonthlyReport('2026-06')).resolves.toEqual({
      monthKey: '2026-06',
      spendingByCategory: [
        { categoryId: groceriesId, categoryName: 'Groceries', spentCents: 10_000 },
      ],
      cashflow: {
        inflowCents: 125_500,
        outflowCents: 10_000,
        netCents: 115_500,
      },
    });
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
          categories: ['Rent', 'Groceries'],
        },
      ],
    },
    new Date('2026-06-24T10:00:00.000Z')
  );
}
