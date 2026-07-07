import { deriveBudgetView, toMonthKey } from './budget-engine';
import { orchestrateSmsImport } from './import-orchestration';
import { applyCreateManualTransaction, applyUpdateManualTransaction } from './manual-transactions';
import { applyCompleteOnboarding } from './onboarding';
import type {
  BudgetSnapshot,
  BudgetView,
  CompleteOnboardingInput,
  ImportOutcome,
  ManualTransactionInput,
  UpdateManualTransactionInput,
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

export type DebugSmsImportInput = {
  sender: string;
  body: string;
  receivedAt: string;
};

export type DebugSmsImportResult = {
  budgetView: BudgetView;
  parseResult: BudgetSnapshot['smsParseResults'][number] | null;
  transaction: BudgetSnapshot['transactions'][number] | null;
  importOutcome: ImportOutcome;
};

export type BudgetStore = {
  getCurrentBudgetView(now?: Date): Promise<BudgetView | null>;
  getTransactions(): Promise<BudgetSnapshot['transactions']>;
  getInboxTransactions(): Promise<BudgetSnapshot['transactions']>;
  getRawSmsMessages(): Promise<BudgetSnapshot['rawSmsMessages']>;
  getSmsParseResults(): Promise<BudgetSnapshot['smsParseResults']>;
  getImportOutcomes(): Promise<BudgetSnapshot['importOutcomes']>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  assignMoneyToCategory(input: AssignMoneyToCategoryInput, now?: Date): Promise<BudgetView>;
  moveMoneyBetweenCategories(input: MoveMoneyBetweenCategoriesInput, now?: Date): Promise<BudgetView>;
  createManualTransaction(input: ManualTransactionInput, now?: Date): Promise<BudgetView>;
  updateManualTransaction(input: UpdateManualTransactionInput, now?: Date): Promise<BudgetView>;
  importDebugSms(input: DebugSmsImportInput, now?: Date): Promise<DebugSmsImportResult>;
};

const EMPTY_SNAPSHOT: BudgetSnapshot = {
  account: null,
  categoryGroups: [],
  categories: [],
  transactions: [],
  assignmentEvents: [],
  rawSmsMessages: [],
  smsParseResults: [],
  importOutcomes: [],
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

    async getImportOutcomes() {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      return [...snapshot.importOutcomes].sort(compareImportOutcomesNewestFirst);
    },

    async completeOnboarding(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyCompleteOnboarding(snapshot, input, now);
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
        const nextSnapshot = applyCreateManualTransaction(snapshot, input, now);
        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async updateManualTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyUpdateManualTransaction(snapshot, input);
        await storage.writeSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async importDebugSms(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        assertBudgetExists(snapshot);
        const createdAt = now.toISOString();
        const importResult = orchestrateSmsImport({
          snapshot,
          sms: input,
          createdAt,
          ids: {
            rawSmsMessageId: createRawSmsMessageId(snapshot),
            parseResultId: createSmsParseResultId(snapshot),
            transactionId: createTransactionId(snapshot),
            importOutcomeId: createImportOutcomeId(snapshot),
          },
        });

        const nextSnapshot: BudgetSnapshot = {
          ...snapshot,
          transactions: importResult.candidateTransaction
            ? [...snapshot.transactions, importResult.candidateTransaction]
            : snapshot.transactions,
          rawSmsMessages: [...snapshot.rawSmsMessages, importResult.rawSmsMessage],
          smsParseResults: importResult.parseResult
            ? [...snapshot.smsParseResults, importResult.parseResult]
            : snapshot.smsParseResults,
          importOutcomes: [...snapshot.importOutcomes, importResult.importOutcome],
        };

        await storage.writeSnapshot(nextSnapshot);
        return {
          budgetView: deriveBudgetView(nextSnapshot, now),
          parseResult: importResult.parseResult,
          transaction: importResult.candidateTransaction,
          importOutcome: importResult.importOutcome,
        };
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

function createImportOutcomeId(snapshot: BudgetSnapshot) {
  return `import-outcome-${snapshot.importOutcomes.length + 1}`;
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

function compareImportOutcomesNewestFirst(
  left: BudgetSnapshot['importOutcomes'][number],
  right: BudgetSnapshot['importOutcomes'][number]
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
    importOutcomes: (snapshot.importOutcomes ?? []).map((outcome) => ({ ...outcome })),
  };
}
