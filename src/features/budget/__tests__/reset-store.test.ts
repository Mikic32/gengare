import { describe, expect, it } from 'vitest';

import { createMemoryNativeSmsQueue } from '../native-sms-queue';
import { createBudgetStore, createMemoryBudgetStorage } from '../store';
import type { CompleteOnboardingInput } from '../types';

const ONBOARDING_INPUT: CompleteOnboardingInput = {
  accountName: 'Main account',
  currencyCode: 'RSD',
  startingBalanceCents: 125_500,
  categoryGroups: [
    {
      name: 'Essentials',
      categories: ['Groceries'],
    },
  ],
};

describe('budget store reset', () => {
  it('wipes persisted facts and discards queued SMS', async () => {
    const queue = createMemoryNativeSmsQueue();
    const store = createBudgetStore(createMemoryBudgetStorage(), queue);
    const now = new Date('2026-06-24T10:00:00.000Z');
    const view = await store.completeOnboarding(ONBOARDING_INPUT, now);
    await store.assignMoneyToCategory(
      {
        categoryId: view.categoryGroups[0].categories[0].id,
        amountCents: 40_000,
      },
      now
    );
    queue.receive({
      sender: 'BANK',
      body: 'Odliv: 1.568,80 RSD',
      receivedAt: '2026-06-25T10:31:00.000Z',
    });

    await store.resetLocalData({ confirmed: true });

    await expect(store.getCurrentBudgetView(now)).resolves.toBeNull();
    await expect(store.getTransactions()).resolves.toEqual([]);
    await expect(store.getRawSmsMessages()).resolves.toEqual([]);
    await expect(store.getImportOutcomes()).resolves.toEqual([]);
    expect(await queue.drain()).toEqual([]);
  });

  it('refuses to wipe local data without explicit confirmation', async () => {
    const queue = createMemoryNativeSmsQueue();
    const store = createBudgetStore(createMemoryBudgetStorage(), queue);
    const now = new Date('2026-06-24T10:00:00.000Z');
    await store.completeOnboarding(ONBOARDING_INPUT, now);
    queue.receive({
      sender: 'BANK',
      body: 'Odliv: 1.568,80 RSD',
      receivedAt: '2026-06-25T10:31:00.000Z',
    });

    await expect(store.resetLocalData({ confirmed: false })).rejects.toThrow(
      'Reset requires explicit confirmation.'
    );
    await expect(store.getCurrentBudgetView(now)).resolves.toMatchObject({
      accountName: 'Main account',
    });
    expect(await queue.drain()).toEqual([
      {
        sender: 'BANK',
        body: 'Odliv: 1.568,80 RSD',
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
    ]);
  });
});
