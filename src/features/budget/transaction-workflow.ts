import { hasPossibleDuplicate } from './import-orchestration';
import type {
  BudgetSnapshot,
  ReviewableImportOutcomeKind,
  TransactionWorkflowCommand,
} from './types';

export function applyTransactionWorkflow(
  snapshot: BudgetSnapshot,
  command: TransactionWorkflowCommand
): BudgetSnapshot {
  const transactionIndex = snapshot.transactions.findIndex(
    (transaction) => transaction.id === command.transactionId
  );

  if (transactionIndex < 0) {
    throw new Error('Transaction does not exist.');
  }

  const existingTransaction = snapshot.transactions[transactionIndex];
  assertReviewableImportedTransaction(snapshot, existingTransaction.id, transactionIndex);

  if (command.kind === 'ignore_imported_transaction') {
    return {
      ...snapshot,
      transactions: snapshot.transactions.map((transaction, index) =>
        index === transactionIndex
          ? {
              ...transaction,
              status: 'ignored',
              categoryId: null,
            }
          : transaction
      ),
    };
  }

  const approvedCategoryId = normalizeApprovedCategoryId(
    snapshot,
    existingTransaction.kind,
    command.categoryId
  );
  assertNoApprovedSmsDuplicate(snapshot, existingTransaction.id, transactionIndex);

  return {
    ...snapshot,
    transactions: snapshot.transactions.map((transaction, index) =>
      index === transactionIndex
        ? {
            ...transaction,
            status: 'approved',
            categoryId: approvedCategoryId,
          }
        : transaction
    ),
  };
}

function assertReviewableImportedTransaction(
  snapshot: BudgetSnapshot,
  transactionId: string,
  transactionIndex: number
) {
  const transaction = snapshot.transactions[transactionIndex];

  if (transaction.source !== 'sms' || transaction.status !== 'needs_review') {
    throw new Error('Only SMS candidates waiting for review can use this workflow.');
  }

  const reviewOutcome = snapshot.importOutcomes.find(
    (outcome) =>
      outcome.candidateTransactionId === transactionId &&
      isReviewableImportOutcomeKind(outcome.kind)
  );

  if (!reviewOutcome) {
    throw new Error('Transaction is not linked to a reviewable import outcome.');
  }
}

function normalizeApprovedCategoryId(
  snapshot: BudgetSnapshot,
  transactionKind: BudgetSnapshot['transactions'][number]['kind'],
  categoryId: string | null
) {
  if (transactionKind === 'outflow') {
    if (!categoryId) {
      throw new Error('Approved outflows require a category.');
    }

    assertCategoryExists(snapshot, categoryId);
    return categoryId;
  }

  if (categoryId) {
    throw new Error('Approved inflows must not have a category.');
  }

  return null;
}

function assertNoApprovedSmsDuplicate(
  snapshot: BudgetSnapshot,
  transactionId: string,
  transactionIndex: number
) {
  const candidateTransaction = snapshot.transactions[transactionIndex];
  const approvedSmsTransactions = snapshot.transactions.filter(
    (transaction) =>
      transaction.id !== transactionId && transaction.source === 'sms' && transaction.status === 'approved'
  );

  if (hasPossibleDuplicate(approvedSmsTransactions, candidateTransaction)) {
    throw new Error('Cannot approve an SMS transaction that duplicates an already approved SMS import.');
  }
}

function assertCategoryExists(snapshot: BudgetSnapshot, categoryId: string) {
  const categoryExists = snapshot.categories.some((category) => category.id === categoryId);

  if (!categoryExists) {
    throw new Error('Category does not exist.');
  }
}

function isReviewableImportOutcomeKind(kind: string): kind is ReviewableImportOutcomeKind {
  return kind === 'needs_review' || kind === 'possible_duplicate';
}
