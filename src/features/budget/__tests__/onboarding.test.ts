import { describe, expect, it } from 'vitest';

import { applyCompleteOnboarding, normalizeOnboardingInput } from '../onboarding';
import type { BudgetSnapshot, CompleteOnboardingInput } from '../types';

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

describe('onboarding Module', () => {
  it('builds the initial budget snapshot from normalized onboarding input', () => {
    const nextSnapshot = applyCompleteOnboarding(
      EMPTY_SNAPSHOT,
      {
        accountName: ' Main account ',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: ' Essentials ',
            categories: [' Rent ', ' ', 'Groceries'],
          },
          {
            name: 'Savings',
            categories: ['Emergency fund'],
          },
          {
            name: 'Ignored empty group',
            categories: ['   '],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(nextSnapshot).toEqual({
      account: {
        id: 'account-1',
        name: 'Main account',
        currencyCode: 'RSD',
        createdAt: '2026-06-24T10:00:00.000Z',
      },
      categoryGroups: [
        {
          id: 'group-2',
          name: 'Essentials',
          sortOrder: 0,
          createdAt: '2026-06-24T10:00:00.000Z',
        },
        {
          id: 'group-3',
          name: 'Savings',
          sortOrder: 1,
          createdAt: '2026-06-24T10:00:00.000Z',
        },
      ],
      categories: [
        {
          id: 'category-4',
          groupId: 'group-2',
          name: 'Rent',
          sortOrder: 0,
          createdAt: '2026-06-24T10:00:00.000Z',
        },
        {
          id: 'category-5',
          groupId: 'group-2',
          name: 'Groceries',
          sortOrder: 1,
          createdAt: '2026-06-24T10:00:00.000Z',
        },
        {
          id: 'category-6',
          groupId: 'group-3',
          name: 'Emergency fund',
          sortOrder: 0,
          createdAt: '2026-06-24T10:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'transaction-7',
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
    });
  });

  it('rejects running onboarding twice against an existing snapshot', () => {
    const existingSnapshot = applyCompleteOnboarding(
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

    expect(() =>
      applyCompleteOnboarding(
        existingSnapshot,
        {
          accountName: 'Another account',
          currencyCode: 'RSD',
          startingBalanceCents: 1,
          categoryGroups: [
            {
              name: 'Essentials',
              categories: ['Groceries'],
            },
          ],
        },
        new Date('2026-06-25T10:00:00.000Z')
      )
    ).toThrow(/already been completed/i);
  });

  it('rejects invalid onboarding facts before building the snapshot', () => {
    const invalidCases: CompleteOnboardingInput[] = [
      {
        accountName: '   ',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [{ name: 'Essentials', categories: ['Rent'] }],
      },
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: -1,
        categoryGroups: [{ name: 'Essentials', categories: ['Rent'] }],
      },
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [{ name: 'Essentials', categories: ['   '] }],
      },
    ];

    for (const input of invalidCases) {
      expect(() => applyCompleteOnboarding(EMPTY_SNAPSHOT, input)).toThrow();
    }

    expect(() =>
      normalizeOnboardingInput({
        accountName: 'Main account',
        currencyCode: 'TEST',
        startingBalanceCents: 125_500,
        categoryGroups: [{ name: 'Essentials', categories: ['Rent'] }],
      })
    ).toThrow(/valid 3-letter ISO code/);
  });
});
