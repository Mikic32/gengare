import { describe, expect, it } from 'vitest';

import { applyCompleteOnboarding } from '../onboarding';
import { createMemoryBudgetStorage } from '../store';
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

describe('budget storage seam', () => {
  it('appends assignment events without rewriting existing facts', async () => {
    const initialSnapshot = createOnboardedSnapshot();
    const storage = createMemoryBudgetStorage(initialSnapshot);

    await storage.appendAssignmentEvents([
      {
        id: 'assignment-1',
        categoryId: initialSnapshot.categories[0].id,
        monthKey: '2026-06',
        amountCents: 25_000,
        createdAt: '2026-06-24T10:00:00.000Z',
      },
    ]);

    const snapshot = await storage.readSnapshot();
    expect(snapshot.transactions).toEqual(initialSnapshot.transactions);
    expect(snapshot.assignmentEvents).toEqual([
      {
        id: 'assignment-1',
        categoryId: initialSnapshot.categories[0].id,
        monthKey: '2026-06',
        amountCents: 25_000,
        createdAt: '2026-06-24T10:00:00.000Z',
      },
    ]);
  });

  it('appends imported SMS facts as one persistence bundle', async () => {
    const initialSnapshot = createOnboardedSnapshot();
    const storage = createMemoryBudgetStorage(initialSnapshot);
    const accountId = initialSnapshot.account?.id ?? 'missing-account';
    const candidateTransaction: CanonicalTransaction = {
      id: 'transaction-2',
      accountId,
      source: 'sms',
      kind: 'outflow',
      status: 'needs_review',
      amountCents: -15_000,
      occurredAt: '2026-06-25T10:30:00.000Z',
      categoryId: null,
      balanceAfterCents: 110_500,
      payee: 'Market',
      memo: null,
      createdAt: '2026-06-25T10:31:00.000Z',
    };

    await storage.appendImportedSmsFacts({
      rawSmsMessage: {
        id: 'raw-sms-1',
        sender: 'BANK',
        body: 'Debug SMS body',
        receivedAt: '2026-06-25T10:31:00.000Z',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
      parseResult: {
        id: 'sms-parse-1',
        rawSmsMessageId: 'raw-sms-1',
        parserId: 'debug-bank-sms',
        parserVersion: 1,
        status: 'parsed',
        transactionId: candidateTransaction.id,
        kind: 'outflow',
        amountCents: -15_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        balanceAfterCents: 110_500,
        payee: 'Market',
        memo: null,
        createdAt: '2026-06-25T10:31:00.000Z',
      },
      candidateTransaction,
      importOutcome: {
        id: 'import-outcome-1',
        rawSmsMessageId: 'raw-sms-1',
        parseResultId: 'sms-parse-1',
        kind: 'needs_review',
        candidateTransactionId: candidateTransaction.id,
        reason: 'parsed_ok',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    });

    const snapshot = await storage.readSnapshot();
    expect(snapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'needs_review',
    });
    expect(snapshot.rawSmsMessages).toHaveLength(1);
    expect(snapshot.smsParseResults).toHaveLength(1);
    expect(snapshot.importOutcomes).toHaveLength(1);
    expect(snapshot.importOutcomes[0]).toMatchObject({
      candidateTransactionId: 'transaction-2',
      reason: 'parsed_ok',
    });
  });

  it('updates a transaction in place without changing ledger cardinality', async () => {
    const initialSnapshot = createOnboardedSnapshot();
    const storage = createMemoryBudgetStorage(initialSnapshot);
    const originalTransaction = initialSnapshot.transactions[0];

    await storage.updateTransaction({
      ...originalTransaction,
      memo: 'Seed memo',
    });

    const snapshot = await storage.readSnapshot();
    expect(snapshot.transactions).toHaveLength(initialSnapshot.transactions.length);
    expect(snapshot.transactions[0]).toMatchObject({
      id: originalTransaction.id,
      memo: 'Seed memo',
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
          categories: ['Groceries'],
        },
      ],
    },
    new Date('2026-06-24T10:00:00.000Z')
  );
}
