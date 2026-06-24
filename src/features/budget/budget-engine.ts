import type {
  AssignmentEvent,
  BudgetCategoryGroupView,
  BudgetSnapshot,
  BudgetView,
  CanonicalTransaction,
  Category,
  CategoryGroup,
} from './types';

type CategoryMonthTotals = {
  assignedCents: number;
  activityCents: number;
  availableCents: number;
};

type MonthLedger = {
  readyToAssignCents: number;
  positiveCarryByCategory: Map<string, number>;
  overspendingCents: number;
};

export function deriveBudgetView(snapshot: BudgetSnapshot, now: Date = new Date()): BudgetView {
  if (!snapshot.account) {
    throw new Error('Cannot derive budget view before onboarding is complete.');
  }

  const monthKey = toMonthKey(now);
  const monthKeys = collectRelevantMonthKeys(snapshot, monthKey);
  const monthLedgers = new Map<string, MonthLedger>();

  let previousMonthLedger: MonthLedger = {
    readyToAssignCents: 0,
    positiveCarryByCategory: new Map<string, number>(),
    overspendingCents: 0,
  };

  for (const key of monthKeys) {
    const categoryTotals = buildCategoryMonthTotals(
      snapshot.categories,
      snapshot.transactions,
      snapshot.assignmentEvents,
      key,
      previousMonthLedger.positiveCarryByCategory
    );

    const inflowThisMonth = sumMonthInflows(snapshot.transactions, key);
    const assignedThisMonth = sumMonthAssignments(snapshot.assignmentEvents, key);
    const readyToAssignCents =
      previousMonthLedger.readyToAssignCents + inflowThisMonth - assignedThisMonth - previousMonthLedger.overspendingCents;
    const overspendingCents = sumOverspending(categoryTotals);
    const positiveCarryByCategory = new Map<string, number>();

    for (const [categoryId, totals] of categoryTotals.entries()) {
      positiveCarryByCategory.set(categoryId, Math.max(0, totals.availableCents));
    }

    const currentLedger: MonthLedger = {
      readyToAssignCents,
      positiveCarryByCategory,
      overspendingCents,
    };

    monthLedgers.set(key, currentLedger);
    previousMonthLedger = currentLedger;
  }

  const currentMonthCategoryTotals = buildCategoryMonthTotals(
    snapshot.categories,
    snapshot.transactions,
    snapshot.assignmentEvents,
    monthKey,
    getPreviousCarry(monthLedgers, monthKey)
  );

  return {
    accountName: snapshot.account.name,
    currencyCode: snapshot.account.currencyCode,
    monthKey,
    authoritativeBalanceCents: deriveAuthoritativeBalance(snapshot.transactions),
    readyToAssignCents: monthLedgers.get(monthKey)?.readyToAssignCents ?? 0,
    categoryGroups: buildGroupViews(snapshot.categoryGroups, snapshot.categories, currentMonthCategoryTotals),
  };
}

export function toMonthKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 7);
}

function collectRelevantMonthKeys(snapshot: BudgetSnapshot, currentMonthKey: string): string[] {
  const monthKeys = new Set<string>([currentMonthKey]);

  for (const transaction of snapshot.transactions) {
    if (transaction.status === 'approved') {
      monthKeys.add(toMonthKey(transaction.occurredAt));
    }
  }

  for (const assignmentEvent of snapshot.assignmentEvents) {
    monthKeys.add(assignmentEvent.monthKey);
  }

  return Array.from(monthKeys).sort();
}

function getPreviousCarry(monthLedgers: Map<string, MonthLedger>, monthKey: string) {
  const orderedKeys = Array.from(monthLedgers.keys()).sort();
  const monthIndex = orderedKeys.indexOf(monthKey);

  if (monthIndex <= 0) {
    return new Map<string, number>();
  }

  return monthLedgers.get(orderedKeys[monthIndex - 1])?.positiveCarryByCategory ?? new Map<string, number>();
}

function buildCategoryMonthTotals(
  categories: Category[],
  transactions: CanonicalTransaction[],
  assignmentEvents: AssignmentEvent[],
  monthKey: string,
  carryByCategory: Map<string, number>
): Map<string, CategoryMonthTotals> {
  const totals = new Map<string, CategoryMonthTotals>();

  for (const category of categories) {
    const carry = carryByCategory.get(category.id) ?? 0;
    totals.set(category.id, {
      assignedCents: 0,
      activityCents: 0,
      availableCents: carry,
    });
  }

  for (const assignmentEvent of assignmentEvents) {
    if (assignmentEvent.monthKey !== monthKey) {
      continue;
    }

    const current = totals.get(assignmentEvent.categoryId);
    if (!current) {
      continue;
    }

    current.assignedCents += assignmentEvent.amountCents;
    current.availableCents += assignmentEvent.amountCents;
  }

  for (const transaction of transactions) {
    if (transaction.status !== 'approved' || !transaction.categoryId || toMonthKey(transaction.occurredAt) !== monthKey) {
      continue;
    }

    const current = totals.get(transaction.categoryId);
    if (!current) {
      continue;
    }

    current.activityCents += transaction.amountCents;
    current.availableCents += transaction.amountCents;
  }

  return totals;
}

function sumMonthInflows(transactions: CanonicalTransaction[], monthKey: string): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.status !== 'approved' || transaction.kind !== 'inflow' || transaction.categoryId) {
      return total;
    }

    if (toMonthKey(transaction.occurredAt) !== monthKey) {
      return total;
    }

    return total + transaction.amountCents;
  }, 0);
}

function sumMonthAssignments(assignmentEvents: AssignmentEvent[], monthKey: string): number {
  return assignmentEvents.reduce((total, assignmentEvent) => {
    if (assignmentEvent.monthKey !== monthKey) {
      return total;
    }

    return total + assignmentEvent.amountCents;
  }, 0);
}

function sumOverspending(categoryTotals: Map<string, CategoryMonthTotals>): number {
  let total = 0;

  for (const totals of categoryTotals.values()) {
    if (totals.availableCents < 0) {
      total += Math.abs(totals.availableCents);
    }
  }

  return total;
}

function deriveAuthoritativeBalance(transactions: CanonicalTransaction[]): number {
  const latestWithBalance = [...transactions]
    .filter((transaction) => transaction.status === 'approved' && transaction.balanceAfterCents !== null)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .at(-1);

  return latestWithBalance?.balanceAfterCents ?? 0;
}

function buildGroupViews(
  groups: CategoryGroup[],
  categories: Category[],
  categoryTotals: Map<string, CategoryMonthTotals>
): BudgetCategoryGroupView[] {
  return [...groups]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: categories
        .filter((category) => category.groupId === group.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((category) => {
          const totals = categoryTotals.get(category.id);

          return {
            id: category.id,
            name: category.name,
            assignedCents: totals?.assignedCents ?? 0,
            activityCents: totals?.activityCents ?? 0,
            availableCents: totals?.availableCents ?? 0,
          };
        }),
    }));
}
