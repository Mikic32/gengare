import { describe, expect, it } from 'vitest';

import { deriveBudgetView } from '../budget-engine';
import { applyEnvelopeCommand } from '../envelopes';
import { applyCompleteOnboarding } from '../onboarding';
import { deriveMonthlyReport } from '../reports';
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

describe('envelopes Module', () => {
  it('renames an envelope and its group without touching money', () => {
    const snapshot = createOnboardedSnapshot();
    const groupId = snapshot.categoryGroups[0].id;
    const categoryId = snapshot.categories[0].id;

    const renamed = applyEnvelopeCommand(
      snapshot,
      { kind: 'rename_group', groupId, name: '  Bills  ' },
      new Date('2026-06-24T12:00:00.000Z')
    );
    const nextSnapshot = applyEnvelopeCommand(
      renamed,
      { kind: 'rename_category', categoryId, name: '  Housing  ' },
      new Date('2026-06-24T12:00:00.000Z')
    );

    expect(nextSnapshot.categoryGroups[0].name).toBe('Bills');
    expect(nextSnapshot.categories[0].name).toBe('Housing');
    expect(nextSnapshot.assignmentEvents).toEqual([]);
  });

  it('adds an envelope to an existing group and a new group', () => {
    const snapshot = createOnboardedSnapshot();
    const groupId = snapshot.categoryGroups[0].id;

    const withCategory = applyEnvelopeCommand(
      snapshot,
      { kind: 'create_category', groupId, name: '  Phone  ' },
      new Date('2026-06-24T12:00:00.000Z')
    );
    const nextSnapshot = applyEnvelopeCommand(
      withCategory,
      { kind: 'create_group', name: '  Fun  ', categoryName: '  Eating out  ' },
      new Date('2026-06-24T12:00:00.000Z')
    );

    const view = deriveBudgetView(nextSnapshot, new Date('2026-06-24T12:00:00.000Z'));
    expect(view.categoryGroups.map((group) => group.name)).toEqual([
      'Essentials',
      'Savings',
      'Fun',
    ]);
    expect(view.categoryGroups[0].categories.map((category) => category.name)).toEqual([
      'Rent',
      'Groceries',
      'Phone',
    ]);
    expect(view.categoryGroups[2].categories.map((category) => category.name)).toEqual([
      'Eating out',
    ]);
  });

  it('hard-deletes an unused envelope and drops an emptied group', () => {
    const snapshot = createOnboardedSnapshot();
    const groceriesId = snapshot.categories[1].id;
    const savingsGroupId = snapshot.categoryGroups[1].id;
    const emergencyId = snapshot.categories[2].id;

    const withoutGroceries = applyEnvelopeCommand(
      snapshot,
      { kind: 'remove_category', categoryId: groceriesId },
      new Date('2026-06-24T12:00:00.000Z')
    );
    const nextSnapshot = applyEnvelopeCommand(
      withoutGroceries,
      { kind: 'remove_group', groupId: savingsGroupId },
      new Date('2026-06-24T12:00:00.000Z')
    );

    expect(nextSnapshot.categories.map((category) => category.id)).toEqual([
      snapshot.categories[0].id,
    ]);
    expect(nextSnapshot.categories.some((category) => category.id === emergencyId)).toBe(false);
    expect(nextSnapshot.categoryGroups.map((group) => group.id)).toEqual([
      snapshot.categoryGroups[0].id,
    ]);
  });

  it('returns leftover assigned cash to Ready to Assign and hides the archived envelope', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories[1].id;
    const snapshot: BudgetSnapshot = {
      ...onboarded,
      assignmentEvents: [
        {
          id: 'assignment-1',
          categoryId: groceriesId,
          monthKey: '2026-06',
          amountCents: 40_000,
          createdAt: '2026-06-24T11:00:00.000Z',
        },
      ],
    };

    const nextSnapshot = applyEnvelopeCommand(
      snapshot,
      { kind: 'remove_category', categoryId: groceriesId },
      new Date('2026-06-24T12:00:00.000Z')
    );
    const view = deriveBudgetView(nextSnapshot, new Date('2026-06-24T12:00:00.000Z'));

    expect(view.moneyState.assignableCash.amountCents).toBe(125_500);
    expect(view.categoryGroups[0].categories.map((category) => category.name)).toEqual(['Rent']);
    expect(
      nextSnapshot.categories.find((category) => category.id === groceriesId)?.archivedAt
    ).toBe('2026-06-24T12:00:00.000Z');
    expect(nextSnapshot.assignmentEvents).toEqual([
      {
        id: 'assignment-1',
        categoryId: groceriesId,
        monthKey: '2026-06',
        amountCents: 40_000,
        createdAt: '2026-06-24T11:00:00.000Z',
      },
      {
        id: 'assignment-2',
        categoryId: groceriesId,
        monthKey: '2026-06',
        amountCents: -40_000,
        createdAt: '2026-06-24T12:00:00.000Z',
      },
    ]);
  });

  it('returns carried-over envelope cash in a later month without rewriting prior-month assignments', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories[1].id;
    const snapshot: BudgetSnapshot = {
      ...onboarded,
      assignmentEvents: [
        {
          id: 'assignment-1',
          categoryId: groceriesId,
          monthKey: '2026-06',
          amountCents: 40_000,
          createdAt: '2026-06-24T11:00:00.000Z',
        },
      ],
    };

    const nextSnapshot = applyEnvelopeCommand(
      snapshot,
      { kind: 'remove_category', categoryId: groceriesId },
      new Date('2026-07-02T12:00:00.000Z')
    );
    const juneView = deriveBudgetView(nextSnapshot, new Date('2026-06-24T12:00:00.000Z'));
    const julyView = deriveBudgetView(nextSnapshot, new Date('2026-07-02T12:00:00.000Z'));

    expect(juneView.moneyState.assignableCash.amountCents).toBe(85_500);
    expect(julyView.moneyState.assignableCash.amountCents).toBe(125_500);
    expect(nextSnapshot.assignmentEvents.map((event) => event.monthKey)).toEqual([
      '2026-06',
      '2026-07',
    ]);
  });

  it('refuses to remove an envelope that still has live transactions', () => {
    const snapshot = createOnboardedSnapshot();
    const groceriesId = snapshot.categories[1].id;
    const withSpend: BudgetSnapshot = {
      ...snapshot,
      transactions: [
        ...snapshot.transactions,
        {
          id: 'transaction-2',
          accountId: snapshot.account?.id ?? 'account-1',
          source: 'manual',
          kind: 'outflow',
          status: 'approved',
          amountCents: -8_000,
          occurredAt: '2026-06-20T12:00:00.000Z',
          categoryId: groceriesId,
          balanceAfterCents: null,
          payee: 'Market',
          memo: null,
          createdAt: '2026-06-20T12:00:00.000Z',
        },
      ],
    };

    expect(() =>
      applyEnvelopeCommand(
        withSpend,
        { kind: 'remove_category', categoryId: groceriesId },
        new Date('2026-06-24T12:00:00.000Z')
      )
    ).toThrow(/recategorize/i);
  });

  it('archives an envelope that only has ignored transactions', () => {
    const onboarded = createOnboardedSnapshot();
    const groceriesId = onboarded.categories[1].id;
    const snapshot: BudgetSnapshot = {
      ...onboarded,
      transactions: [
        ...onboarded.transactions,
        {
          id: 'transaction-ignored',
          accountId: onboarded.account?.id ?? 'account-1',
          source: 'manual',
          kind: 'outflow',
          status: 'ignored',
          amountCents: -8_000,
          occurredAt: '2026-06-20T12:00:00.000Z',
          categoryId: groceriesId,
          balanceAfterCents: null,
          payee: 'Market',
          memo: null,
          createdAt: '2026-06-20T12:00:00.000Z',
        },
      ],
    };

    const nextSnapshot = applyEnvelopeCommand(
      snapshot,
      { kind: 'remove_category', categoryId: groceriesId },
      new Date('2026-06-24T12:00:00.000Z')
    );

    expect(
      nextSnapshot.categories.find((category) => category.id === groceriesId)?.archivedAt
    ).toBe('2026-06-24T12:00:00.000Z');
  });

  it('refuses to remove the last envelope', () => {
    const snapshot = applyCompleteOnboarding(
      EMPTY_SNAPSHOT,
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [{ name: 'Essentials', categories: ['Rent'] }],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(() =>
      applyEnvelopeCommand(
        snapshot,
        { kind: 'remove_category', categoryId: snapshot.categories[0].id },
        new Date('2026-06-24T12:00:00.000Z')
      )
    ).toThrow(/at least one envelope/i);
  });

  it('rejects blank names and missing targets', () => {
    const snapshot = createOnboardedSnapshot();

    expect(() =>
      applyEnvelopeCommand(snapshot, {
        kind: 'rename_category',
        categoryId: snapshot.categories[0].id,
        name: '   ',
      })
    ).toThrow(/envelope name is required/i);
    expect(() =>
      applyEnvelopeCommand(snapshot, {
        kind: 'rename_group',
        groupId: snapshot.categoryGroups[0].id,
        name: '   ',
      })
    ).toThrow(/group name is required/i);
    expect(() =>
      applyEnvelopeCommand(snapshot, {
        kind: 'rename_category',
        categoryId: 'missing',
        name: 'Rent',
      })
    ).toThrow(/does not exist/i);
    expect(() =>
      applyEnvelopeCommand(EMPTY_SNAPSHOT, {
        kind: 'create_group',
        name: 'Fun',
        categoryName: 'Eating out',
      })
    ).toThrow(/onboarding/i);
  });
});

describe('archived envelopes in derived views', () => {
  it('keeps archived category spending in monthly reports', () => {
    const snapshot = createOnboardedSnapshot();
    const groceriesId = snapshot.categories[1].id;
    const withSpend: BudgetSnapshot = {
      ...snapshot,
      transactions: [
        ...snapshot.transactions,
        {
          id: 'transaction-2',
          accountId: snapshot.account?.id ?? 'account-1',
          source: 'manual',
          kind: 'outflow',
          status: 'ignored',
          amountCents: -12_000,
          occurredAt: '2026-06-20T12:00:00.000Z',
          categoryId: groceriesId,
          balanceAfterCents: null,
          payee: 'Market',
          memo: null,
          createdAt: '2026-06-20T12:00:00.000Z',
        },
      ],
      assignmentEvents: [
        {
          id: 'assignment-1',
          categoryId: groceriesId,
          monthKey: '2026-06',
          amountCents: 12_000,
          createdAt: '2026-06-20T11:00:00.000Z',
        },
      ],
    };
    const archived = applyEnvelopeCommand(
      withSpend,
      { kind: 'remove_category', categoryId: groceriesId },
      new Date('2026-06-24T12:00:00.000Z')
    );
    const withApprovedHistory: BudgetSnapshot = {
      ...archived,
      transactions: archived.transactions.map((transaction) =>
        transaction.id === 'transaction-2'
          ? { ...transaction, status: 'approved' as const }
          : transaction
      ),
    };

    const report = deriveMonthlyReport(withApprovedHistory, '2026-06');
    expect(report.spendingByCategory).toEqual([
      { categoryId: groceriesId, categoryName: 'Groceries', spentCents: 12_000 },
    ]);
  });
});

function createOnboardedSnapshot(): BudgetSnapshot {
  return applyCompleteOnboarding(
    EMPTY_SNAPSHOT,
    {
      accountName: 'Main account',
      currencyCode: 'RSD',
      startingBalanceCents: 125_500,
      categoryGroups: [
        { name: 'Essentials', categories: ['Rent', 'Groceries'] },
        { name: 'Savings', categories: ['Emergency fund'] },
      ],
    },
    new Date('2026-06-24T10:00:00.000Z')
  );
}
