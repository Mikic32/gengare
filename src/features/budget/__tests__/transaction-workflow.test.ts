import { describe, expect, it } from 'vitest';

import { applyCompleteOnboarding } from '../onboarding';
import { applyTransactionWorkflow } from '../transaction-workflow';
import type { BudgetSnapshot, ReviewableImportOutcomeKind } from '../types';

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

describe('transaction workflow Module', () => {
  it('approves outflow candidates only when a real category is chosen', () => {
    const snapshot = createImportedCandidateSnapshot('needs_review', 'outflow');
    const categoryId = snapshot.categories[0].id;

    const nextSnapshot = applyTransactionWorkflow(snapshot, {
      kind: 'approve_imported_transaction',
      transactionId: 'transaction-2',
      categoryId,
    });

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'approved',
      kind: 'outflow',
      categoryId,
      amountCents: -15_000,
    });

    expect(() =>
      applyTransactionWorkflow(snapshot, {
        kind: 'approve_imported_transaction',
        transactionId: 'transaction-2',
        categoryId: null,
      })
    ).toThrow(/require a category/);
  });

  it('approves inflow candidates only as categoryless ready-to-assign cash', () => {
    const snapshot = createImportedCandidateSnapshot('possible_duplicate', 'inflow');
    const categoryId = snapshot.categories[0].id;

    const nextSnapshot = applyTransactionWorkflow(snapshot, {
      kind: 'approve_imported_transaction',
      transactionId: 'transaction-2',
      categoryId: null,
    });

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'approved',
      kind: 'inflow',
      categoryId: null,
      amountCents: 15_000,
    });

    expect(() =>
      applyTransactionWorkflow(snapshot, {
        kind: 'approve_imported_transaction',
        transactionId: 'transaction-2',
        categoryId,
      })
    ).toThrow(/must not have a category/);
  });

  it('ignores review candidates through the same workflow seam', () => {
    const snapshot = createImportedCandidateSnapshot('possible_duplicate', 'outflow');

    const nextSnapshot = applyTransactionWorkflow(snapshot, {
      kind: 'ignore_imported_transaction',
      transactionId: 'transaction-2',
    });

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'ignored',
      categoryId: null,
    });
  });

  it('rejects transactions that are not active SMS review candidates', () => {
    const snapshot = createImportedCandidateSnapshot('needs_review', 'outflow');
    const approvedSnapshot = {
      ...snapshot,
      transactions: snapshot.transactions.map((transaction) =>
        transaction.id === 'transaction-2'
          ? { ...transaction, status: 'approved' as const }
          : transaction
      ),
    };

    expect(() =>
      applyTransactionWorkflow(approvedSnapshot, {
        kind: 'ignore_imported_transaction',
        transactionId: 'transaction-2',
      })
    ).toThrow(/waiting for review/);
  });

  it('blocks approving a duplicate when the matching SMS transaction is already approved', () => {
    const snapshot = createDuplicateImportedCandidateSnapshot('outflow');
    const categoryId = snapshot.categories[0].id;

    expect(() =>
      applyTransactionWorkflow(snapshot, {
        kind: 'approve_imported_transaction',
        transactionId: 'transaction-3',
        categoryId,
      })
    ).toThrow(/already approved SMS import/);
  });

  it('recovers an unparseable SMS into an approved canonical transaction without rewriting evidence', () => {
    const snapshot = createUnparseableSmsSnapshot();
    const categoryId = snapshot.categories[0].id;
    const originalRawSms = snapshot.rawSmsMessages[0];
    const originalParseResult = snapshot.smsParseResults[0];

    const nextSnapshot = applyTransactionWorkflow(
      snapshot,
      {
        kind: 'recover_unparseable_sms',
        importOutcomeId: 'import-outcome-1',
        transaction: {
          kind: 'outflow',
          amountCents: 15_000,
          occurredAt: '2026-06-25T10:30:00.000Z',
          categoryId,
          payee: 'Market',
          memo: 'Recovered from garbled SMS',
          balanceAfterCents: 110_500,
        },
      },
      new Date('2026-06-25T11:00:00.000Z')
    );

    expect(nextSnapshot.rawSmsMessages[0]).toEqual(originalRawSms);
    expect(nextSnapshot.smsParseResults[0]).toEqual(originalParseResult);
    expect(nextSnapshot.importOutcomes[0]).toMatchObject({
      id: 'import-outcome-1',
      kind: 'manual_import',
      reason: 'unparseable',
      candidateTransactionId: 'transaction-2',
    });
    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      id: 'transaction-2',
      source: 'sms',
      status: 'approved',
      kind: 'outflow',
      amountCents: -15_000,
      occurredAt: '2026-06-25T10:30:00.000Z',
      categoryId,
      payee: 'Market',
      memo: 'Recovered from garbled SMS',
      balanceAfterCents: 110_500,
    });
  });

  it('recovers an unparseable SMS inflow as categoryless ready-to-assign cash', () => {
    const snapshot = createUnparseableSmsSnapshot();

    const nextSnapshot = applyTransactionWorkflow(snapshot, {
      kind: 'recover_unparseable_sms',
      importOutcomeId: 'import-outcome-1',
      transaction: {
        kind: 'inflow',
        amountCents: 20_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        categoryId: null,
        payee: 'Employer',
        memo: null,
        balanceAfterCents: null,
      },
    });

    expect(nextSnapshot.transactions.at(-1)).toMatchObject({
      source: 'sms',
      status: 'approved',
      kind: 'inflow',
      amountCents: 20_000,
      categoryId: null,
      balanceAfterCents: null,
    });
  });

  it('ignores an unparseable SMS without creating a transaction or deleting evidence', () => {
    const snapshot = createUnparseableSmsSnapshot();
    const originalRawSms = snapshot.rawSmsMessages[0];
    const originalParseResult = snapshot.smsParseResults[0];

    const nextSnapshot = applyTransactionWorkflow(snapshot, {
      kind: 'ignore_unparseable_sms',
      importOutcomeId: 'import-outcome-1',
    });

    expect(nextSnapshot.transactions).toEqual(snapshot.transactions);
    expect(nextSnapshot.rawSmsMessages[0]).toEqual(originalRawSms);
    expect(nextSnapshot.smsParseResults[0]).toEqual(originalParseResult);
    expect(nextSnapshot.importOutcomes[0]).toMatchObject({
      id: 'import-outcome-1',
      kind: 'ignored',
      reason: 'unparseable',
      candidateTransactionId: null,
      parseResultId: 'sms-parse-1',
      rawSmsMessageId: 'raw-sms-1',
    });
  });
});

function createImportedCandidateSnapshot(
  outcomeKind: ReviewableImportOutcomeKind,
  transactionKind: 'inflow' | 'outflow'
) {
  const onboardedSnapshot = applyCompleteOnboarding(
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
  const accountId = onboardedSnapshot.account?.id;

  if (!accountId) {
    throw new Error('Onboarded snapshot is missing an account.');
  }

  return {
    ...onboardedSnapshot,
    rawSmsMessages: [
      {
        id: 'raw-sms-1',
        sender: 'BANK',
        body: 'Debug SMS body',
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
        status: 'parsed' as const,
        transactionId: 'transaction-2',
        kind: transactionKind,
        amountCents: transactionKind === 'outflow' ? -15_000 : 15_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        balanceAfterCents: 110_500,
        payee: transactionKind === 'inflow' ? 'Employer' : 'Market',
        memo: null,
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    transactions: [
      ...onboardedSnapshot.transactions,
      {
        id: 'transaction-2',
        accountId,
        source: 'sms' as const,
        kind: transactionKind,
        status: 'needs_review' as const,
        amountCents: transactionKind === 'outflow' ? -15_000 : 15_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        categoryId: null,
        balanceAfterCents: 110_500,
        payee: transactionKind === 'inflow' ? 'Employer' : 'Market',
        memo: null,
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
    importOutcomes: [
      {
        id: 'import-outcome-1',
        rawSmsMessageId: 'raw-sms-1',
        parseResultId: 'sms-parse-1',
        kind: outcomeKind,
        candidateTransactionId: 'transaction-2',
        reason:
          outcomeKind === 'possible_duplicate'
            ? ('possible_duplicate' as const)
            : ('parsed_ok' as const),
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
  };
}

function createDuplicateImportedCandidateSnapshot(transactionKind: 'inflow' | 'outflow') {
  const snapshot = createImportedCandidateSnapshot('possible_duplicate', transactionKind);
  const accountId = snapshot.account?.id;

  if (!accountId) {
    throw new Error('Onboarded snapshot is missing an account.');
  }

  return {
    ...snapshot,
    transactions: [
      ...snapshot.transactions.map((transaction) =>
        transaction.id === 'transaction-2'
          ? { ...transaction, status: 'approved' as const }
          : transaction
      ),
      {
        id: 'transaction-3',
        accountId,
        source: 'sms' as const,
        kind: transactionKind,
        status: 'needs_review' as const,
        amountCents: transactionKind === 'outflow' ? -15_000 : 15_000,
        occurredAt: '2026-06-25T10:30:00.000Z',
        categoryId: null,
        balanceAfterCents: 110_500,
        payee: transactionKind === 'inflow' ? 'Employer' : 'Market',
        memo: null,
        createdAt: '2026-06-25T10:32:00.000Z',
      },
    ],
    importOutcomes: [
      ...snapshot.importOutcomes,
      {
        id: 'import-outcome-2',
        rawSmsMessageId: 'raw-sms-2',
        parseResultId: 'sms-parse-2',
        kind: 'possible_duplicate' as const,
        candidateTransactionId: 'transaction-3',
        reason: 'possible_duplicate' as const,
        createdAt: '2026-06-25T10:32:00.000Z',
      },
    ],
  };
}

function createUnparseableSmsSnapshot() {
  const onboardedSnapshot = applyCompleteOnboarding(
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
