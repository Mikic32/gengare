import { toMonthKey } from './budget-engine';
import type { BudgetSnapshot, CanonicalTransaction, MonthlyReport } from './types';

export function deriveMonthlyReport(snapshot: BudgetSnapshot, monthKey: string): MonthlyReport {
  const spendingByCategoryId = new Map<string, number>();
  let inflowCents = 0;
  let outflowCents = 0;

  for (const transaction of snapshot.transactions) {
    if (!isApprovedMonthTransaction(transaction, monthKey)) {
      continue;
    }

    if (transaction.kind === 'inflow') {
      inflowCents += transaction.amountCents;
      continue;
    }

    const spentCents = Math.abs(transaction.amountCents);
    outflowCents += spentCents;

    if (!transaction.categoryId) {
      continue;
    }

    const current = spendingByCategoryId.get(transaction.categoryId) ?? 0;
    spendingByCategoryId.set(transaction.categoryId, current + spentCents);
  }

  const spendingByCategory = [...snapshot.categoryGroups]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((group) =>
      snapshot.categories
        .filter((category) => category.groupId === group.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .flatMap((category) => {
          const spentCents = spendingByCategoryId.get(category.id) ?? 0;
          if (spentCents <= 0) {
            return [];
          }

          return [
            {
              categoryId: category.id,
              categoryName: category.name,
              spentCents,
            },
          ];
        })
    );

  return {
    monthKey,
    spendingByCategory,
    cashflow: {
      inflowCents,
      outflowCents,
      netCents: inflowCents - outflowCents,
    },
  };
}

function isApprovedMonthTransaction(transaction: CanonicalTransaction, monthKey: string) {
  return transaction.status === 'approved' && toMonthKey(transaction.occurredAt) === monthKey;
}
