import type {
  BudgetSnapshot,
  ManualTransactionInput,
  UpdateManualTransactionInput,
} from './types';

export function applyCreateManualTransaction(
  snapshot: BudgetSnapshot,
  input: ManualTransactionInput,
  now: Date = new Date()
): BudgetSnapshot {
  assertBudgetExists(snapshot);

  const normalized = normalizeManualTransactionInput(snapshot, input);
  const nextTransaction = {
    id: createTransactionId(snapshot),
    accountId: snapshot.account.id,
    source: 'manual' as const,
    kind: normalized.kind,
    status: 'approved' as const,
    amountCents: normalized.kind === 'outflow' ? -normalized.amountCents : normalized.amountCents,
    occurredAt: normalized.occurredAt,
    categoryId: normalized.categoryId,
    balanceAfterCents: null,
    payee: normalized.payee,
    memo: normalized.memo,
    createdAt: now.toISOString(),
  };

  return {
    ...snapshot,
    transactions: [...snapshot.transactions, nextTransaction],
  };
}

export function applyUpdateManualTransaction(
  snapshot: BudgetSnapshot,
  input: UpdateManualTransactionInput
): BudgetSnapshot {
  assertBudgetExists(snapshot);

  const transactionIndex = snapshot.transactions.findIndex(
    (transaction) => transaction.id === input.transactionId
  );

  if (transactionIndex < 0) {
    throw new Error('Transaction does not exist.');
  }

  const existingTransaction = snapshot.transactions[transactionIndex];
  assertEditableManualTransaction(existingTransaction);

  const normalized = normalizeManualTransactionInput(snapshot, input);
  const nextTransaction = {
    ...existingTransaction,
    kind: normalized.kind,
    amountCents: normalized.kind === 'outflow' ? -normalized.amountCents : normalized.amountCents,
    occurredAt: normalized.occurredAt,
    categoryId: normalized.categoryId,
    payee: normalized.payee,
    memo: normalized.memo,
  };

  return {
    ...snapshot,
    transactions: snapshot.transactions.map((transaction, index) =>
      index === transactionIndex ? nextTransaction : transaction
    ),
  };
}

export function normalizeManualTransactionInput(
  snapshot: BudgetSnapshot,
  input: ManualTransactionInput
): ManualTransactionInput {
  assertPositiveWholeNumberOfCents(input.amountCents, 'Transaction amount');

  const occurredAt = normalizeOccurredAt(input.occurredAt);
  const payee = normalizeOptionalText(input.payee);
  const memo = normalizeOptionalText(input.memo);

  if (input.kind === 'outflow') {
    if (!input.categoryId) {
      throw new Error('Approved manual outflows require a category.');
    }

    assertCategoryExists(snapshot, input.categoryId);

    return {
      ...input,
      occurredAt,
      categoryId: input.categoryId,
      payee,
      memo,
    };
  }

  if (input.categoryId) {
    throw new Error('Approved manual inflows must not have a category.');
  }

  return {
    ...input,
    occurredAt,
    categoryId: null,
    payee,
    memo,
  };
}

function assertBudgetExists(
  snapshot: BudgetSnapshot
): asserts snapshot is BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> } {
  if (!snapshot.account) {
    throw new Error('Complete onboarding before assigning money.');
  }
}

function assertCategoryExists(snapshot: BudgetSnapshot, categoryId: string) {
  const categoryExists = snapshot.categories.some((category) => category.id === categoryId);

  if (!categoryExists) {
    throw new Error('Category does not exist.');
  }
}

function assertPositiveWholeNumberOfCents(amountCents: number, label: string) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`${label} must be a positive whole number of cents.`);
  }
}

function normalizeOccurredAt(value: string) {
  const occurredAt = new Date(value);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Occurred at must be a valid date.');
  }

  return occurredAt.toISOString();
}

function normalizeOptionalText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertEditableManualTransaction(transaction: BudgetSnapshot['transactions'][number]) {
  if (transaction.source !== 'manual' || transaction.status !== 'approved') {
    throw new Error('Only approved manual transactions can be edited.');
  }
}

function createTransactionId(snapshot: BudgetSnapshot) {
  return `transaction-${snapshot.transactions.length + 1}`;
}
