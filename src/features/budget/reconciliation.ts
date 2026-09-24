import { deriveBudgetView } from './budget-engine';
import { createTransactionId } from './transaction-ids';
import type { BudgetSnapshot } from './types';

export function applyCreateReconciliationAdjustment(
  snapshot: BudgetSnapshot,
  now: Date = new Date()
): BudgetSnapshot {
  assertBudgetExists(snapshot);

  const gapCents = deriveBudgetView(snapshot, now).moneyState.reconciliationGap.amountCents;
  if (gapCents === 0) {
    throw new Error('Ledger already matches the bank balance.');
  }

  const createdAt = now.toISOString();
  const nextTransaction = {
    id: createTransactionId(snapshot),
    accountId: snapshot.account.id,
    source: 'reconciliation' as const,
    kind: 'inflow' as const,
    status: 'approved' as const,
    amountCents: gapCents,
    occurredAt: createdAt,
    categoryId: null,
    balanceAfterCents: null,
    payee: null,
    memo: 'Balance adjustment',
    createdAt,
  };

  return {
    ...snapshot,
    transactions: [...snapshot.transactions, nextTransaction],
  };
}

function assertBudgetExists(
  snapshot: BudgetSnapshot
): asserts snapshot is BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> } {
  if (!snapshot.account) {
    throw new Error('Complete onboarding before reconciling.');
  }
}
