import { describe, expect, it } from 'vitest';

import { deriveBudgetView } from '../budget-engine';
import { createMemoryBudgetStorage, createBudgetStore } from '../store';

describe('budget store bootstrap', () => {
  it('returns null before onboarding exists', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'))).resolves.toBeNull();
  });

  it('persists onboarding data and derives the current month budget shell', async () => {
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
          {
            name: 'Savings',
            categories: ['Emergency fund'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(view.accountName).toBe('Main account');
    expect(view.currencyCode).toBe('RSD');
    expect(view.monthKey).toBe('2026-06');
    expect(view.authoritativeBalanceCents).toBe(125_500);
    expect(view.readyToAssignCents).toBe(125_500);
    expect(view.categoryGroups).toEqual([
      {
        id: expect.any(String),
        name: 'Essentials',
        categories: [
          {
            id: expect.any(String),
            name: 'Rent',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
          {
            id: expect.any(String),
            name: 'Groceries',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
        ],
      },
      {
        id: expect.any(String),
        name: 'Savings',
        categories: [
          {
            id: expect.any(String),
            name: 'Emergency fund',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
        ],
      },
    ]);

    const reloadedView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));
    expect(reloadedView).toEqual(view);
  });

  it('rejects invalid currency codes during onboarding', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(
      store.completeOnboarding({
        accountName: 'Main account',
        currencyCode: 'TEST',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      })
    ).rejects.toThrow(/valid 3-letter ISO code/);
  });
});

describe('budget engine month math', () => {
  it('carries unassigned cash into later months', () => {
    const view = deriveBudgetView(
      {
        account: {
          id: 'account-1',
          name: 'Main account',
          currencyCode: 'RSD',
          createdAt: '2026-05-31T09:00:00.000Z',
        },
        categoryGroups: [
          {
            id: 'group-1',
            name: 'Essentials',
            sortOrder: 0,
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        categories: [
          {
            id: 'category-1',
            groupId: 'group-1',
            name: 'Rent',
            sortOrder: 0,
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        transactions: [
          {
            id: 'txn-1',
            accountId: 'account-1',
            source: 'starting_balance',
            kind: 'inflow',
            status: 'approved',
            amountCents: 90_000,
            occurredAt: '2026-05-31T09:00:00.000Z',
            categoryId: null,
            balanceAfterCents: 90_000,
            payee: null,
            memo: 'Starting balance',
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        assignmentEvents: [],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(view.readyToAssignCents).toBe(90_000);
    expect(view.authoritativeBalanceCents).toBe(90_000);
    expect(view.monthKey).toBe('2026-06');
  });
});
