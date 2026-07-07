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
        transaction.id === 'transaction-2' ? { ...transaction, status: 'approved' as const } : transaction
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
        accountId: onboardedSnapshot.account.id,
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
        reason: outcomeKind === 'possible_duplicate' ? 'possible_duplicate' : 'parsed_ok',
        createdAt: '2026-06-25T10:31:00.000Z',
      },
    ],
  };
}

function createDuplicateImportedCandidateSnapshot(transactionKind: 'inflow' | 'outflow') {
  const snapshot = createImportedCandidateSnapshot('possible_duplicate', transactionKind);

  return {
    ...snapshot,
    transactions: [
      ...snapshot.transactions.map((transaction) =>
        transaction.id === 'transaction-2' ? { ...transaction, status: 'approved' as const } : transaction
      ),
      {
        id: 'transaction-3',
        accountId: snapshot.account.id,
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
