import { afterEach, describe, expect, it, vi } from 'vitest';

import { createActionableNotifications } from '../actionable-notifications';
import type { BudgetView } from '../types';

describe('actionable notifications', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not notify when Inbox and budget have nothing actionable', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([]);
  });

  it('summarizes Inbox review items after a debounce instead of notifying immediately', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 2,
      budgetView: createBudgetView(),
    });

    expect(presenter.presented).toEqual([]);

    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '2 items to review',
      },
    ]);
  });

  it('collapses a burst of Inbox updates into one notification of the latest state', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 1,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(400);
    notifications.sync({
      inboxItemCount: 3,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '3 items to review',
      },
    ]);
  });

  it('uses singular copy for one Inbox review item', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 1,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '1 item to review',
      },
    ]);
  });

  it('notifies when there is money to assign', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView({
        moneyState: {
          accountBalance: {
            amountCents: 120_000,
            derivedFrom: 'latest_non_ignored_balance_evidence',
          },
          assignableCash: {
            amountCents: 45_000,
            derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending',
          },
        },
      }),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '450.00 RSD to assign',
      },
    ]);
  });

  it('notifies when a category is overspent', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView({
        categoryGroups: [
          {
            id: 'group-1',
            name: 'Essentials',
            categories: [
              {
                id: 'category-1',
                name: 'Groceries',
                assignedCents: 10_000,
                activityCents: -15_000,
                availableCents: -5_000,
              },
            ],
          },
        ],
      }),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: 'Groceries is overspent',
      },
    ]);
  });

  it('notifies when Ready to Assign is negative', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView({
        moneyState: {
          accountBalance: {
            amountCents: 120_000,
            derivedFrom: 'latest_non_ignored_balance_evidence',
          },
          assignableCash: {
            amountCents: -12_500,
            derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending',
          },
        },
      }),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: 'Ready to Assign is negative',
      },
    ]);
  });

  it('joins review, money to assign, and overspent categories into one summary', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 2,
      budgetView: createBudgetView({
        moneyState: {
          accountBalance: {
            amountCents: 80_000,
            derivedFrom: 'latest_non_ignored_balance_evidence',
          },
          assignableCash: {
            amountCents: 45_000,
            derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending',
          },
        },
        categoryGroups: [
          {
            id: 'group-1',
            name: 'Essentials',
            categories: [
              {
                id: 'category-1',
                name: 'Groceries',
                assignedCents: 10_000,
                activityCents: -15_000,
                availableCents: -5_000,
              },
              {
                id: 'category-2',
                name: 'Rent',
                assignedCents: 20_000,
                activityCents: -25_000,
                availableCents: -5_000,
              },
            ],
          },
        ],
      }),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '2 items to review · 450.00 RSD to assign · Groceries and Rent are overspent',
      },
    ]);
  });

  it('cancels a pending notification when the actionable state is cleared', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 2,
      budgetView: createBudgetView(),
    });
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([]);
    expect(presenter.clearCount).toBe(0);
  });

  it('clears an already shown notification once nothing is actionable', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 1,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);
    notifications.sync({
      inboxItemCount: 0,
      budgetView: createBudgetView(),
    });

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '1 item to review',
      },
    ]);
    expect(presenter.clearCount).toBe(1);
  });

  it('does not re-notify when the derived summary has not changed', () => {
    const presenter = createMemoryPresenter();
    const notifications = createActionableNotifications({
      presenter,
      debounceMs: 1_000,
    });

    vi.useFakeTimers();
    notifications.sync({
      inboxItemCount: 1,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);
    notifications.sync({
      inboxItemCount: 1,
      budgetView: createBudgetView(),
    });
    vi.advanceTimersByTime(1_000);

    expect(presenter.presented).toEqual([
      {
        title: 'Budget needs attention',
        body: '1 item to review',
      },
    ]);
  });
});

function createMemoryPresenter() {
  const presented: { title: string; body: string }[] = [];
  let clearCount = 0;

  return {
    presented,
    get clearCount() {
      return clearCount;
    },
    present(notification: { title: string; body: string }) {
      presented.push(notification);
    },
    clear() {
      clearCount += 1;
    },
  };
}

function createBudgetView(overrides: {
  moneyState?: {
    accountBalance: {
      amountCents: number;
      derivedFrom: 'latest_non_ignored_balance_evidence';
    };
    assignableCash: {
      amountCents: number;
      derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending';
    };
  };
  categoryGroups?: BudgetView['categoryGroups'];
} = {}): BudgetView {
  return {
    accountName: 'Main account',
    currencyCode: 'RSD',
    monthKey: '2026-07',
    moneyState: {
      accountBalance: {
        amountCents: 120_000,
        derivedFrom: 'latest_non_ignored_balance_evidence',
      },
      assignableCash: {
        amountCents: 0,
        derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending',
      },
    },
    categoryGroups: [
      {
        id: 'group-1',
        name: 'Essentials',
        categories: [
          {
            id: 'category-1',
            name: 'Groceries',
            assignedCents: 30_000,
            activityCents: 0,
            availableCents: 30_000,
          },
        ],
      },
    ],
    ...overrides,
  } as unknown as BudgetView;
}
