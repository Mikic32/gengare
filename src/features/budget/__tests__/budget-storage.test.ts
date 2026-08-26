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

  it('appends a recovered unparseable SMS transaction without rewriting raw evidence', async () => {
    const initialSnapshot = createUnparseableSmsSnapshot();
    const storage = createMemoryBudgetStorage(initialSnapshot);
    const originalRawSms = initialSnapshot.rawSmsMessages[0];
    const recoveredTransaction: CanonicalTransaction = {
      id: 'transaction-2',
      accountId: initialSnapshot.account?.id ?? 'missing-account',
      source: 'sms',
      kind: 'outflow',
      status: 'approved',
      amountCents: -15_000,
      occurredAt: '2026-06-25T10:30:00.000Z',
      categoryId: initialSnapshot.categories[0].id,
      balanceAfterCents: 110_500,
      payee: 'Market',
      memo: 'Recovered from garbled SMS',
      createdAt: '2026-06-25T11:00:00.000Z',
    };

    await storage.appendRecoveredUnparseableSmsFacts({
      transaction: recoveredTransaction,
      importOutcome: {
        ...initialSnapshot.importOutcomes[0],
        candidateTransactionId: recoveredTransaction.id,
      },
    });

    const snapshot = await storage.readSnapshot();
    expect(snapshot.rawSmsMessages[0]).toEqual(originalRawSms);
    expect(snapshot.smsParseResults[0]).toEqual(initialSnapshot.smsParseResults[0]);
    expect(snapshot.importOutcomes[0]).toMatchObject({
      kind: 'manual_import',
      candidateTransactionId: 'transaction-2',
    });
    expect(snapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'approved',
    });
  });

  it('updates an import outcome in place without deleting SMS evidence', async () => {
    const initialSnapshot = createUnparseableSmsSnapshot();
    const storage = createMemoryBudgetStorage(initialSnapshot);

    await storage.updateImportOutcome({
      ...initialSnapshot.importOutcomes[0],
      kind: 'ignored',
    });

    const snapshot = await storage.readSnapshot();
    expect(snapshot.rawSmsMessages).toEqual(initialSnapshot.rawSmsMessages);
    expect(snapshot.smsParseResults).toEqual(initialSnapshot.smsParseResults);
    expect(snapshot.transactions).toEqual(initialSnapshot.transactions);
    expect(snapshot.importOutcomes[0]).toMatchObject({
      kind: 'ignored',
      reason: 'unparseable',
      candidateTransactionId: null,
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

function createUnparseableSmsSnapshot() {
  const onboardedSnapshot = createOnboardedSnapshot();

  return {
    ...onboardedSnapshot,
    rawSmsMessages: [
      {
        id: 'raw-sms-1',
        sender: 'BANK',
        body: 'Garbled OTP banka SMS',
        receivedAt: '2026-06-25T10:31:00.000Z',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    smsParseResults: [
      {
        id: 'sms-parse-1',
        rawSmsMessageId: 'raw-sms-1',
        parserId: 'debug-bank-sms',
        parserVersion: 1,
        status: 'unparseable' as const,
        transactionId: null,
        kind: null,
        amountCents: null,
        occurredAt: null,
        balanceAfterCents: null,
        payee: null,
        memo: 'invalid occurred-at timestamp',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    importOutcomes: [
      {
        id: 'import-outcome-1',
        rawSmsMessageId: 'raw-sms-1',
        parseResultId: 'sms-parse-1',
        kind: 'manual_import' as const,
        candidateTransactionId: null,
        reason: 'unparseable' as const,
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
  };
}
