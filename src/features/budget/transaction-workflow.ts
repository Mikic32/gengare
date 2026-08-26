import { hasPossibleDuplicate } from './import-orchestration';
import { normalizeManualTransactionInput } from './manual-transactions';
import type {
  BudgetSnapshot,
  ReviewableImportOutcomeKind,
  TransactionWorkflowCommand,
} from './types';

export function applyTransactionWorkflow(
  snapshot: BudgetSnapshot,
  command: TransactionWorkflowCommand,
  now: Date = new Date()
): BudgetSnapshot {
  if (command.kind === 'recover_unparseable_sms') {
    return recoverUnparseableSms(snapshot, command, now);
  }

  if (command.kind === 'ignore_unparseable_sms') {
    return ignoreUnparseableSms(snapshot, command);
  }

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
      transaction.id !== transactionId &&
      transaction.source === 'sms' &&
      transaction.status === 'approved'
  );

  if (hasPossibleDuplicate(approvedSmsTransactions, candidateTransaction)) {
    throw new Error(
      'Cannot approve an SMS transaction that duplicates an already approved SMS import.'
    );
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

function ignoreUnparseableSms(
  snapshot: BudgetSnapshot,
  command: Extract<TransactionWorkflowCommand, { kind: 'ignore_unparseable_sms' }>
): BudgetSnapshot {
  const outcome = getUnresolvedUnparseableImport(snapshot, command.importOutcomeId);

  return {
    ...snapshot,
    importOutcomes: snapshot.importOutcomes.map((entry) =>
      entry.id === outcome.id
        ? {
            ...entry,
            kind: 'ignored',
          }
        : entry
    ),
  };
}

function recoverUnparseableSms(
  snapshot: BudgetSnapshot,
  command: Extract<TransactionWorkflowCommand, { kind: 'recover_unparseable_sms' }>,
  now: Date
): BudgetSnapshot {
  assertBudgetExists(snapshot);

  const outcome = getUnresolvedUnparseableImport(snapshot, command.importOutcomeId);

  const parseResult = snapshot.smsParseResults.find((entry) => entry.id === outcome.parseResultId);
  if (!parseResult || parseResult.status !== 'unparseable') {
    throw new Error('Import outcome is not linked to an unparseable SMS parse result.');
  }

  const rawSmsMessage = snapshot.rawSmsMessages.find(
    (entry) => entry.id === outcome.rawSmsMessageId
  );
  if (!rawSmsMessage) {
    throw new Error('Raw SMS evidence is missing.');
  }

  const normalized = normalizeManualTransactionInput(snapshot, command.transaction);
  const nextTransaction = {
    id: createTransactionId(snapshot),
    accountId: snapshot.account.id,
    source: 'sms' as const,
    kind: normalized.kind,
    status: 'approved' as const,
    amountCents: normalized.kind === 'outflow' ? -normalized.amountCents : normalized.amountCents,
    occurredAt: normalized.occurredAt,
    categoryId: normalized.categoryId,
    balanceAfterCents: normalizeBalanceAfterCents(command.transaction.balanceAfterCents),
    payee: normalized.payee,
    memo: normalized.memo,
    createdAt: now.toISOString(),
  };

  return {
    ...snapshot,
    transactions: [...snapshot.transactions, nextTransaction],
    importOutcomes: snapshot.importOutcomes.map((entry) =>
      entry.id === outcome.id ? { ...entry, candidateTransactionId: nextTransaction.id } : entry
    ),
  };
}

function normalizeBalanceAfterCents(balanceAfterCents: number | null) {
  if (balanceAfterCents === null) {
    return null;
  }

  if (!Number.isInteger(balanceAfterCents)) {
    throw new Error('Balance after must be a whole number of cents.');
  }

  return balanceAfterCents;
}

function createTransactionId(snapshot: BudgetSnapshot) {
  return `transaction-${snapshot.transactions.length + 1}`;
}

function getUnresolvedUnparseableImport(snapshot: BudgetSnapshot, importOutcomeId: string) {
  const outcome = snapshot.importOutcomes.find((entry) => entry.id === importOutcomeId);
  if (!outcome) {
    throw new Error('Import outcome does not exist.');
  }

  if (outcome.kind !== 'manual_import' || outcome.candidateTransactionId !== null) {
    throw new Error('Only unresolved unparseable SMS imports can use this workflow.');
  }

  return outcome;
}

function assertBudgetExists(
  snapshot: BudgetSnapshot
): asserts snapshot is BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> } {
  if (!snapshot.account) {
    throw new Error('Complete onboarding before assigning money.');
  }
}
