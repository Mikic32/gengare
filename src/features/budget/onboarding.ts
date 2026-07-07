import { assertValidCurrencyCode } from './money';
import type { BudgetSnapshot, CompleteOnboardingInput } from './types';

export function applyCompleteOnboarding(
  snapshot: BudgetSnapshot,
  input: CompleteOnboardingInput,
  now: Date = new Date()
): BudgetSnapshot {
  if (snapshot.account) {
    throw new Error('Onboarding has already been completed for this device.');
  }

  const normalized = normalizeOnboardingInput(input);
  const createdAt = now.toISOString();
  let nextId = 1;
  const createId = (prefix: string) => `${prefix}-${nextId++}`;

  const account = {
    id: createId('account'),
    name: normalized.accountName,
    currencyCode: normalized.currencyCode,
    createdAt,
  };

  const categoryGroups = normalized.categoryGroups.map((group, groupIndex) => ({
    id: createId('group'),
    name: group.name,
    sortOrder: groupIndex,
    createdAt,
  }));

  const categories = normalized.categoryGroups.flatMap((group, groupIndex) => {
    const parentGroup = categoryGroups[groupIndex];

    return group.categories.map((categoryName, categoryIndex) => ({
      id: createId('category'),
      groupId: parentGroup.id,
      name: categoryName,
      sortOrder: categoryIndex,
      createdAt,
    }));
  });

  const startingBalanceTransaction = {
    id: createId('transaction'),
    accountId: account.id,
    source: 'starting_balance' as const,
    kind: 'inflow' as const,
    status: 'approved' as const,
    amountCents: normalized.startingBalanceCents,
    occurredAt: createdAt,
    categoryId: null,
    balanceAfterCents: normalized.startingBalanceCents,
    payee: null,
    memo: 'Starting balance',
    createdAt,
  };

  return {
    account,
    categoryGroups,
    categories,
    transactions: [startingBalanceTransaction],
    assignmentEvents: [],
    rawSmsMessages: [],
    smsParseResults: [],
    importOutcomes: [],
  };
}

export function normalizeOnboardingInput(input: CompleteOnboardingInput): CompleteOnboardingInput {
  const accountName = input.accountName.trim();
  const currencyCode = assertValidCurrencyCode(input.currencyCode);
  const categoryGroups = input.categoryGroups
    .map((group) => ({
      name: group.name.trim(),
      categories: group.categories.map((category) => category.trim()).filter(Boolean),
    }))
    .filter((group) => group.name && group.categories.length > 0);

  if (!accountName) {
    throw new Error('Account name is required.');
  }

  if (!Number.isInteger(input.startingBalanceCents) || input.startingBalanceCents < 0) {
    throw new Error('Starting balance must be a whole number of cents and cannot be negative.');
  }

  if (categoryGroups.length === 0) {
    throw new Error('Create at least one category group with one category.');
  }

  return {
    accountName,
    currencyCode,
    startingBalanceCents: input.startingBalanceCents,
    categoryGroups,
  };
}
