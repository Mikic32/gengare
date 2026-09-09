import { deriveBudgetView } from './budget-engine';
import type {
  AssignmentEvent,
  BudgetSnapshot,
  Category,
  CategoryGroup,
  EnvelopeCommand,
} from './types';

export function applyEnvelopeCommand(
  snapshot: BudgetSnapshot,
  command: EnvelopeCommand,
  now: Date = new Date()
): BudgetSnapshot {
  assertBudgetExists(snapshot);

  switch (command.kind) {
    case 'rename_category':
      return renameCategory(snapshot, command.categoryId, command.name);
    case 'rename_group':
      return renameGroup(snapshot, command.groupId, command.name);
    case 'create_category':
      return createCategory(snapshot, command.groupId, command.name, now);
    case 'create_group':
      return createGroup(snapshot, command.name, command.categoryName, now);
    case 'remove_category':
      return removeCategory(snapshot, command.categoryId, now);
    case 'remove_group':
      return removeGroup(snapshot, command.groupId, now);
  }
}

export function isActiveCategory(category: Category) {
  return category.archivedAt == null;
}

export function isActiveCategoryGroup(group: CategoryGroup) {
  return group.archivedAt == null;
}

function renameCategory(
  snapshot: BudgetSnapshot,
  categoryId: string,
  name: string
): BudgetSnapshot {
  const category = getActiveCategory(snapshot, categoryId);
  const nextName = normalizeRequiredName(name, 'Envelope name');

  return {
    ...snapshot,
    categories: snapshot.categories.map((entry) =>
      entry.id === category.id ? { ...entry, name: nextName } : entry
    ),
  };
}

function renameGroup(snapshot: BudgetSnapshot, groupId: string, name: string): BudgetSnapshot {
  const group = getActiveGroup(snapshot, groupId);
  const nextName = normalizeRequiredName(name, 'Group name');

  return {
    ...snapshot,
    categoryGroups: snapshot.categoryGroups.map((entry) =>
      entry.id === group.id ? { ...entry, name: nextName } : entry
    ),
  };
}

function createCategory(
  snapshot: BudgetSnapshot,
  groupId: string,
  name: string,
  now: Date
): BudgetSnapshot {
  const group = getActiveGroup(snapshot, groupId);
  const nextName = normalizeRequiredName(name, 'Envelope name');
  const siblings = snapshot.categories.filter((category) => category.groupId === group.id);
  const createdAt = now.toISOString();

  return {
    ...snapshot,
    categories: [
      ...snapshot.categories,
      {
        id: nextPrefixedId(
          'category',
          snapshot.categories.map((category) => category.id)
        ),
        groupId: group.id,
        name: nextName,
        sortOrder: nextSortOrder(siblings),
        createdAt,
      },
    ],
  };
}

function createGroup(
  snapshot: BudgetSnapshot,
  name: string,
  categoryName: string,
  now: Date
): BudgetSnapshot {
  const nextName = normalizeRequiredName(name, 'Group name');
  const nextCategoryName = normalizeRequiredName(categoryName, 'Envelope name');
  const createdAt = now.toISOString();
  const groupId = nextPrefixedId(
    'group',
    snapshot.categoryGroups.map((group) => group.id)
  );

  return {
    ...snapshot,
    categoryGroups: [
      ...snapshot.categoryGroups,
      {
        id: groupId,
        name: nextName,
        sortOrder: nextSortOrder(snapshot.categoryGroups),
        createdAt,
      },
    ],
    categories: [
      ...snapshot.categories,
      {
        id: nextPrefixedId(
          'category',
          snapshot.categories.map((category) => category.id)
        ),
        groupId,
        name: nextCategoryName,
        sortOrder: 0,
        createdAt,
      },
    ],
  };
}

function removeCategory(
  snapshot: BudgetSnapshot,
  categoryId: string,
  now: Date,
  options?: { skipLastActiveCheck?: boolean }
): BudgetSnapshot {
  const category = getActiveCategory(snapshot, categoryId);
  assertCategoryHasNoLiveTransactions(snapshot, category.id);

  if (!options?.skipLastActiveCheck) {
    assertNotLastActiveCategory(snapshot, 1);
  }

  const nextSnapshot = returnAvailableCashToReady(snapshot, category.id, now);
  const stillReferenced = isCategoryReferenced(nextSnapshot, category.id);

  if (stillReferenced) {
    return archiveCategoryAndMaybeGroup(nextSnapshot, category.id, now);
  }

  return dropCategoryAndMaybeGroup(nextSnapshot, category.id);
}

function removeGroup(snapshot: BudgetSnapshot, groupId: string, now: Date): BudgetSnapshot {
  const group = getActiveGroup(snapshot, groupId);
  const activeCategories = snapshot.categories.filter(
    (category) => category.groupId === group.id && isActiveCategory(category)
  );

  if (activeCategories.length === 0) {
    throw new Error('Category group does not exist.');
  }

  for (const category of activeCategories) {
    assertCategoryHasNoLiveTransactions(snapshot, category.id);
  }

  assertNotLastActiveCategory(snapshot, activeCategories.length);

  return activeCategories.reduce(
    (current, category) => removeCategory(current, category.id, now, { skipLastActiveCheck: true }),
    snapshot
  );
}

function returnAvailableCashToReady(
  snapshot: BudgetSnapshot,
  categoryId: string,
  now: Date
): BudgetSnapshot {
  const budgetView = deriveBudgetView(snapshot, now);
  const categoryView = budgetView.categoryGroups
    .flatMap((group) => group.categories)
    .find((category) => category.id === categoryId);

  if (!categoryView || categoryView.availableCents === 0) {
    return snapshot;
  }

  const nextEvent: AssignmentEvent = {
    id: nextPrefixedId(
      'assignment',
      snapshot.assignmentEvents.map((event) => event.id)
    ),
    categoryId,
    monthKey: budgetView.monthKey,
    amountCents: -categoryView.availableCents,
    createdAt: now.toISOString(),
  };

  return {
    ...snapshot,
    assignmentEvents: [...snapshot.assignmentEvents, nextEvent],
  };
}

function archiveCategoryAndMaybeGroup(
  snapshot: BudgetSnapshot,
  categoryId: string,
  now: Date
): BudgetSnapshot {
  const archivedAt = now.toISOString();
  const category = getCategory(snapshot, categoryId);
  const categories = snapshot.categories.map((entry) =>
    entry.id === categoryId ? { ...entry, archivedAt } : entry
  );
  const groupHasActiveCategory = categories.some(
    (entry) => entry.groupId === category.groupId && isActiveCategory(entry)
  );

  return {
    ...snapshot,
    categories,
    categoryGroups: groupHasActiveCategory
      ? snapshot.categoryGroups
      : snapshot.categoryGroups.map((group) =>
          group.id === category.groupId ? { ...group, archivedAt } : group
        ),
  };
}

function dropCategoryAndMaybeGroup(snapshot: BudgetSnapshot, categoryId: string): BudgetSnapshot {
  const category = getCategory(snapshot, categoryId);
  const categories = snapshot.categories.filter((entry) => entry.id !== categoryId);
  const groupHasAnyCategory = categories.some((entry) => entry.groupId === category.groupId);

  return {
    ...snapshot,
    categories,
    categoryGroups: groupHasAnyCategory
      ? snapshot.categoryGroups
      : snapshot.categoryGroups.filter((group) => group.id !== category.groupId),
  };
}

function getActiveCategory(snapshot: BudgetSnapshot, categoryId: string): Category {
  const category = snapshot.categories.find((entry) => entry.id === categoryId);

  if (!category || !isActiveCategory(category)) {
    throw new Error('Category does not exist.');
  }

  return category;
}

function getActiveGroup(snapshot: BudgetSnapshot, groupId: string): CategoryGroup {
  const group = snapshot.categoryGroups.find((entry) => entry.id === groupId);

  if (!group || !isActiveCategoryGroup(group)) {
    throw new Error('Category group does not exist.');
  }

  return group;
}

function getCategory(snapshot: BudgetSnapshot, categoryId: string): Category {
  const category = snapshot.categories.find((entry) => entry.id === categoryId);

  if (!category) {
    throw new Error('Category does not exist.');
  }

  return category;
}

function assertCategoryHasNoLiveTransactions(snapshot: BudgetSnapshot, categoryId: string) {
  const hasLiveTransaction = snapshot.transactions.some(
    (transaction) => transaction.categoryId === categoryId && transaction.status !== 'ignored'
  );

  if (hasLiveTransaction) {
    throw new Error("Recategorize this envelope's transactions before removing it.");
  }
}

function assertNotLastActiveCategory(snapshot: BudgetSnapshot, removingCount: number) {
  const activeCount = snapshot.categories.filter(isActiveCategory).length;

  if (activeCount - removingCount < 1) {
    throw new Error('Keep at least one envelope.');
  }
}

function isCategoryReferenced(snapshot: BudgetSnapshot, categoryId: string) {
  return (
    snapshot.transactions.some((transaction) => transaction.categoryId === categoryId) ||
    snapshot.assignmentEvents.some((event) => event.categoryId === categoryId)
  );
}

function normalizeRequiredName(value: string, label: string) {
  const name = value.trim();

  if (!name) {
    throw new Error(`${label} is required.`);
  }

  return name;
}

function nextSortOrder(items: { sortOrder: number }[]) {
  if (items.length === 0) {
    return 0;
  }

  return Math.max(...items.map((item) => item.sortOrder)) + 1;
}

function nextPrefixedId(prefix: string, ids: string[]) {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);

  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}-${max + 1}`;
}

function assertBudgetExists(
  snapshot: BudgetSnapshot
): asserts snapshot is BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> } {
  if (!snapshot.account) {
    throw new Error('Complete onboarding before editing envelopes.');
  }
}
