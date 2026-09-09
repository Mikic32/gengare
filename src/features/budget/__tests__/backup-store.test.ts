import { describe, expect, it } from 'vitest';

import { createBudgetStore, createMemoryBudgetStorage } from '../store';

describe('budget store backup', () => {
  it('restores an exported snapshot into the same derived budget state', async () => {
    const source = createBudgetStore(createMemoryBudgetStorage());
    const now = new Date('2026-06-24T10:00:00.000Z');
    const originalView = await source.completeOnboarding(
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
      now
    );
    const assignedView = await source.assignMoneyToCategory(
      {
        categoryId: originalView.categoryGroups[0].categories[0].id,
        amountCents: 40_000,
      },
      now
    );

    const backup = await source.exportBackup(new Date('2026-06-26T12:00:00.000Z'));
    const destination = createBudgetStore(createMemoryBudgetStorage());
    const restoredView = await destination.restoreBackup(backup, { confirmed: true }, now);

    expect(restoredView).toEqual(assignedView);
  });

  it('replaces later local data instead of merging it with the backup', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const now = new Date('2026-06-24T10:00:00.000Z');
    const originalView = await store.completeOnboarding(
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
      now
    );
    const groceriesId = originalView.categoryGroups[0].categories[0].id;
    const exportedView = await store.assignMoneyToCategory(
      {
        categoryId: groceriesId,
        amountCents: 40_000,
      },
      now
    );
    const backup = await store.exportBackup(now);

    await store.assignMoneyToCategory(
      {
        categoryId: groceriesId,
        amountCents: 10_000,
      },
      now
    );
    await store.createManualTransaction(
      {
        kind: 'outflow',
        amountCents: 2_500,
        occurredAt: '2026-06-25T12:00:00.000Z',
        categoryId: groceriesId,
        payee: 'Cafe',
        memo: null,
      },
      new Date('2026-06-25T12:00:00.000Z')
    );

    const restoredView = await store.restoreBackup(
      backup,
      { confirmed: true },
      new Date('2026-06-25T12:00:00.000Z')
    );

    expect(restoredView).toEqual(exportedView);
    await expect(store.getTransactions()).resolves.toEqual([
      expect.objectContaining({
        source: 'starting_balance',
        amountCents: 125_500,
      }),
    ]);
  });

  it('refuses to replace local data without explicit confirmation', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const now = new Date('2026-06-24T10:00:00.000Z');
    await store.completeOnboarding(
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
      now
    );
    const backup = await store.exportBackup(now);

    await expect(store.restoreBackup(backup, { confirmed: false }, now)).rejects.toThrow(
      'Restore requires explicit confirmation.'
    );
    await expect(store.getCurrentBudgetView(now)).resolves.toMatchObject({
      accountName: 'Main account',
    });
  });
});
