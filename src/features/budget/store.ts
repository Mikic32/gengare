import { deriveBudgetView, toMonthKey } from './budget-engine';
import { assertValidCurrencyCode } from './money';
import { DEBUG_BANK_SMS_PARSER_ID, DEBUG_BANK_SMS_PARSER_VERSION, parseDebugBankSms } from './sms-import';
import type {
  BudgetSnapshot,
  BudgetView,
  CompleteOnboardingInput,
  RawSmsMessage,
  SmsParseResult,
} from './types';

export type BudgetStorage = {
  readSnapshot(): Promise<BudgetSnapshot>;
  writeSnapshot(snapshot: BudgetSnapshot): Promise<void>;
};

export type AssignMoneyToCategoryInput = {
  categoryId: string;
  amountCents: number;
};

export type MoveMoneyBetweenCategoriesInput = {
  fromCategoryId: string;
  toCategoryId: string;
  amountCents: number;
};

export type ManualTransactionInput = {
  kind: 'inflow' | 'outflow';
  amountCents: number;
  occurredAt: string;
  categoryId: string | null;
  payee: string | null;
  memo: string | null;
};

export type UpdateManualTransactionInput = ManualTransactionInput & {
  transactionId: string;
};

export type DebugSmsImportInput = {
  sender: string;
  body: string;
  receivedAt: string;
};

export type BudgetStore = {
  getCurrentBudgetView(now?: Date): Promise<BudgetView | null>;
  getTransactions(): Promise<BudgetSnapshot['transactions']>;
  getInboxTransactions(): Promise<BudgetSnapshot['transactions']>;
  getRawSmsMessages(): Promise<BudgetSnapshot['rawSmsMessages']>;
  getSmsParseResults(): Promise<BudgetSnapshot['smsParseResults']>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  assignMoneyToCategory(input: AssignMoneyToCategoryInput, now?: Date): Promise<BudgetView>;
  moveMoneyBetweenCategories(input: MoveMoneyBetweenCategoriesInput, now?: Date): Promise<BudgetView>;
  createManualTransaction(input: ManualTransactionInput, now?: Date): Promise<BudgetView>;
  updateManualTransaction(input: UpdateManualTransactionInput, now?: Date): Promise<BudgetView>;
  importDebugSms(input: DebugSmsImportInput, now?: Date): Promise<BudgetView>;
};

const EMPTY_SNAPSHOT: BudgetSnapshot = {
  account: null,
  categoryGroups: [],
  categories: [],
  transactions: [],
  assignmentEvents: [],
  rawSmsMessages: [],
  smsParseResults: [],
};

export function createBudgetStore(storage: BudgetStorage): BudgetStore {
  let mutationChain = Promise.resolve();

  async function waitForPendingMutations() {
    await mutationChain;
  }

  function runSerializedMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationChain.then(operation);
    mutationChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    async getCurrentBudgetView(now = new Date()) {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      if (!snapshot.account) {
        return null;
      }

      return deriveBudgetView(snapshot, now);
    },

    async getTransactions() {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      return [...snapshot.transactions].sort(compareTransactionsNewestFirst);
    },

    async getInboxTransactions() {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      return snapshot.transactions
        .filter((transaction) => transaction.status === 'needs_review')
        .sort(compareTransactionsNewestFirst);
    },

    async getRawSmsMessages() {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      return [...snapshot.rawSmsMessages].sort(compareRawSmsMessagesNewestFirst);
    },

    async getSmsParseResults() {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      return [...snapshot.smsParseResults].sort(compareSmsParseResultsNewestFirst);
    },

    async completeOnboarding(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
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

        const nextSnapshot: BudgetSnapshot = {
          account,
          categoryGroups,
          categories,
          transactions: [startingBalanceTransaction],
          assignmentEvents: [],
          rawSmsMessages: [],
          smsParseResults: [],
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async assignMoneyToCategory(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        assertBudgetExists(snapshot);
        assertWholeNumberOfCents(input.amountCents, 'Assigned amount');
        assertCategoryExists(snapshot, input.categoryId);

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          assignmentEvents: [
            ...snapshot.assignmentEvents,
            {
              id: createAssignmentEventId(snapshot),
              categoryId: input.categoryId,
              monthKey: toMonthKey(now),
              amountCents: input.amountCents,
              createdAt: now.toISOString(),
            },
          ],
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async moveMoneyBetweenCategories(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        assertBudgetExists(snapshot);
        assertWholeNumberOfCents(input.amountCents, 'Move amount');
        assertCategoryExists(snapshot, input.fromCategoryId);
        assertCategoryExists(snapshot, input.toCategoryId);
        assertDifferentCategories(input.fromCategoryId, input.toCategoryId);
        assertCategoryHasAvailableBalance(snapshot, input.fromCategoryId, input.amountCents, now);

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          assignmentEvents: [
            ...snapshot.assignmentEvents,
            {
              id: createAssignmentEventId(snapshot, 1),
              categoryId: input.fromCategoryId,
              monthKey: toMonthKey(now),
              amountCents: -input.amountCents,
              createdAt: now.toISOString(),
            },
            {
              id: createAssignmentEventId(snapshot, 2),
              categoryId: input.toCategoryId,
              monthKey: toMonthKey(now),
              amountCents: input.amountCents,
              createdAt: now.toISOString(),
            },
          ],
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async createManualTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
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

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          transactions: [...snapshot.transactions, nextTransaction],
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async updateManualTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
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

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          transactions: snapshot.transactions.map((transaction, index) =>
            index === transactionIndex ? nextTransaction : transaction
          ),
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async importDebugSms(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        assertBudgetExists(snapshot);

        const normalized = normalizeDebugSmsImportInput(input);
        const createdAt = now.toISOString();
        const rawSmsMessage = {
          id: createRawSmsMessageId(snapshot),
          sender: normalized.sender,
          body: normalized.body,
          receivedAt: normalized.receivedAt,
          createdAt,
        } satisfies RawSmsMessage;

        const parsedSms = parseDebugBankSms(normalized.body);
        const transaction =
          parsedSms === null
            ? null
            : {
                id: createTransactionId(snapshot),
                accountId: snapshot.account.id,
                source: 'sms' as const,
                kind: parsedSms.kind,
                status: 'needs_review' as const,
                amountCents: parsedSms.kind === 'outflow' ? -parsedSms.amountCents : parsedSms.amountCents,
                occurredAt: parsedSms.occurredAt,
                categoryId: null,
                balanceAfterCents: parsedSms.balanceAfterCents,
                payee: parsedSms.payee,
                memo: parsedSms.memo,
                createdAt,
              };

        const smsParseResult = {
          id: createSmsParseResultId(snapshot),
          rawSmsMessageId: rawSmsMessage.id,
          parserId: DEBUG_BANK_SMS_PARSER_ID,
          parserVersion: DEBUG_BANK_SMS_PARSER_VERSION,
          status: parsedSms ? 'parsed' : 'unparseable',
          transactionId: transaction?.id ?? null,
          kind: transaction?.kind ?? null,
          amountCents: transaction?.amountCents ?? null,
          occurredAt: transaction?.occurredAt ?? null,
          balanceAfterCents: transaction?.balanceAfterCents ?? null,
          payee: transaction?.payee ?? null,
          memo: transaction?.memo ?? null,
          createdAt,
        } satisfies SmsParseResult;

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          transactions: transaction ? [...snapshot.transactions, transaction] : snapshot.transactions,
          rawSmsMessages: [...snapshot.rawSmsMessages, rawSmsMessage],
          smsParseResults: [...snapshot.smsParseResults, smsParseResult],
        };

        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },
  };
}

export function createMemoryBudgetStorage(initialSnapshot: BudgetSnapshot = EMPTY_SNAPSHOT): BudgetStorage {
  let snapshot = cloneSnapshot(initialSnapshot);

  return {
    async readSnapshot() {
      return cloneSnapshot(snapshot);
    },

    async writeSnapshot(nextSnapshot) {
      snapshot = cloneSnapshot(nextSnapshot);
    },
  };
}

function normalizeOnboardingInput(input: CompleteOnboardingInput): CompleteOnboardingInput {
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

function assertBudgetExists(
  snapshot: BudgetSnapshot
): asserts snapshot is BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> } {
  if (!snapshot.account) {
    throw new Error('Complete onboarding before assigning money.');
  }
}

function assertWholeNumberOfCents(amountCents: number, label: string) {
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw new Error(`${label} must be a non-zero whole number of cents.`);
  }
}

function assertCategoryExists(snapshot: BudgetSnapshot, categoryId: string) {
  const categoryExists = snapshot.categories.some((category) => category.id === categoryId);

  if (!categoryExists) {
    throw new Error('Category does not exist.');
  }
}

function assertDifferentCategories(fromCategoryId: string, toCategoryId: string) {
  if (fromCategoryId === toCategoryId) {
    throw new Error('Move money between different categories.');
  }
}

function assertCategoryHasAvailableBalance(
  snapshot: BudgetSnapshot,
  categoryId: string,
  amountCents: number,
  now: Date
) {
  const budgetView = deriveBudgetView(snapshot, now);
  const category = budgetView.categoryGroups.flatMap((group) => group.categories).find((entry) => entry.id === categoryId);

  if (!category) {
    throw new Error('Category does not exist.');
  }

  if (amountCents > category.availableCents) {
    throw new Error('Cannot move more than the source category currently has available.');
  }
}

function createAssignmentEventId(snapshot: BudgetSnapshot, offset = 1) {
  return `assignment-${snapshot.assignmentEvents.length + offset}`;
}

function createTransactionId(snapshot: BudgetSnapshot) {
  return `transaction-${snapshot.transactions.length + 1}`;
}

function createRawSmsMessageId(snapshot: BudgetSnapshot) {
  return `raw-sms-${snapshot.rawSmsMessages.length + 1}`;
}

function createSmsParseResultId(snapshot: BudgetSnapshot) {
  return `sms-parse-${snapshot.smsParseResults.length + 1}`;
}

function normalizeManualTransactionInput(
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

function normalizeDebugSmsImportInput(input: DebugSmsImportInput): DebugSmsImportInput {
  const sender = input.sender.trim();
  const body = input.body.trim();
  const receivedAt = normalizeOccurredAt(input.receivedAt);

  if (!sender) {
    throw new Error('SMS sender is required.');
  }

  if (!body) {
    throw new Error('SMS body is required.');
  }

  return {
    sender,
    body,
    receivedAt,
  };
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

function compareTransactionsNewestFirst(
  left: BudgetSnapshot['transactions'][number],
  right: BudgetSnapshot['transactions'][number]
) {
  const occurredComparison = right.occurredAt.localeCompare(left.occurredAt);
  if (occurredComparison !== 0) {
    return occurredComparison;
  }

  return right.createdAt.localeCompare(left.createdAt);
}

function compareRawSmsMessagesNewestFirst(
  left: BudgetSnapshot['rawSmsMessages'][number],
  right: BudgetSnapshot['rawSmsMessages'][number]
) {
  const receivedComparison = right.receivedAt.localeCompare(left.receivedAt);
  if (receivedComparison !== 0) {
    return receivedComparison;
  }

  return right.createdAt.localeCompare(left.createdAt);
}

function compareSmsParseResultsNewestFirst(
  left: BudgetSnapshot['smsParseResults'][number],
  right: BudgetSnapshot['smsParseResults'][number]
) {
  return right.createdAt.localeCompare(left.createdAt);
}

function cloneSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot {
  return {
    account: snapshot.account ? { ...snapshot.account } : null,
    categoryGroups: snapshot.categoryGroups.map((group) => ({ ...group })),
    categories: snapshot.categories.map((category) => ({ ...category })),
    transactions: snapshot.transactions.map((transaction) => ({ ...transaction })),
    assignmentEvents: snapshot.assignmentEvents.map((event) => ({ ...event })),
    rawSmsMessages: (snapshot.rawSmsMessages ?? []).map((message) => ({ ...message })),
    smsParseResults: (snapshot.smsParseResults ?? []).map((result) => ({ ...result })),
  };
}
