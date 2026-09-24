import type { BudgetSnapshot } from './types';

export function createTransactionId(snapshot: BudgetSnapshot): string {
  const existingIds = new Set(snapshot.transactions.map((transaction) => transaction.id));
  let sequence = snapshot.transactions.length + 1;

  while (existingIds.has(`transaction-${sequence}`)) {
    sequence += 1;
  }

  return `transaction-${sequence}`;
}
