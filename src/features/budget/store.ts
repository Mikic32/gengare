import { parseBackup, serializeBackup } from './backup';
import { deriveBudgetView, toMonthKey } from './budget-engine';
import { DEBUG_BANK_ALLOWED_SENDERS, orchestrateSmsImport } from './import-orchestration';
import { applyCreateManualTransaction, applyUpdateManualTransaction } from './manual-transactions';
import { createNoopNativeSmsQueue, type NativeSmsQueuePort } from './native-sms-queue';
import { applyCompleteOnboarding } from './onboarding';
import { applyCreateReconciliationAdjustment } from './reconciliation';
import { deriveMonthlyReport } from './reports';
import { applyTransactionWorkflow } from './transaction-workflow';
import type {
  ApproveImportedTransactionInput,
  AssignmentEvent,
  BudgetSnapshot,
  BudgetView,
  CanonicalTransaction,
  CompleteOnboardingInput,
  IgnoreImportedTransactionInput,
  IgnoreUnparseableSmsInput,
  ImportOutcome,
  ManualTransactionInput,
  MonthlyReport,
  RawSmsMessage,
  RecoverUnparseableSmsInput,
  SmsParseResult,
  UpdateManualTransactionInput,
} from './types';

export type ImportedSmsFacts = {
  rawSmsMessage: RawSmsMessage;
  parseResult: SmsParseResult | null;
  candidateTransaction: CanonicalTransaction | null;
  importOutcome: ImportOutcome;
};

export type RecoveredUnparseableSmsFacts = {
  transaction: CanonicalTransaction;
  importOutcome: ImportOutcome;
};

export type BudgetStorage = {
  readSnapshot(): Promise<BudgetSnapshot>;
  replaceSnapshot(snapshot: BudgetSnapshot): Promise<void>;
  appendAssignmentEvents(events: AssignmentEvent[]): Promise<void>;
  appendTransaction(transaction: CanonicalTransaction): Promise<void>;
  updateTransaction(transaction: CanonicalTransaction): Promise<void>;
  appendImportedSmsFacts(facts: ImportedSmsFacts): Promise<void>;
  appendRecoveredUnparseableSmsFacts(facts: RecoveredUnparseableSmsFacts): Promise<void>;
  updateImportOutcome(outcome: ImportOutcome): Promise<void>;
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

export type RestoreBackupConfirmation = {
  confirmed: boolean;
};

export type BudgetStore = {
  getCurrentBudgetView(now?: Date): Promise<BudgetView | null>;
  getMonthlyReport(monthKey: string): Promise<MonthlyReport | null>;
  getTransactions(): Promise<BudgetSnapshot['transactions']>;
  getInboxTransactions(): Promise<BudgetSnapshot['transactions']>;
  getRawSmsMessages(): Promise<BudgetSnapshot['rawSmsMessages']>;
  getSmsParseResults(): Promise<BudgetSnapshot['smsParseResults']>;
  getImportOutcomes(): Promise<BudgetSnapshot['importOutcomes']>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  assignMoneyToCategory(input: AssignMoneyToCategoryInput, now?: Date): Promise<BudgetView>;
  moveMoneyBetweenCategories(
    input: MoveMoneyBetweenCategoriesInput,
    now?: Date
  ): Promise<BudgetView>;
  createManualTransaction(input: ManualTransactionInput, now?: Date): Promise<BudgetView>;
  updateManualTransaction(input: UpdateManualTransactionInput, now?: Date): Promise<BudgetView>;
  approveImportedTransaction(
    input: ApproveImportedTransactionInput,
    now?: Date
  ): Promise<BudgetView>;
  ignoreImportedTransaction(input: IgnoreImportedTransactionInput, now?: Date): Promise<BudgetView>;
  recoverUnparseableSms(input: RecoverUnparseableSmsInput, now?: Date): Promise<BudgetView>;
  ignoreUnparseableSms(input: IgnoreUnparseableSmsInput, now?: Date): Promise<BudgetView>;
  createReconciliationAdjustment(now?: Date): Promise<BudgetView>;
  importDebugSms(input: DebugSmsImportInput, now?: Date): Promise<DebugSmsImportResult>;
  exportBackup(now?: Date): Promise<string>;
  restoreBackup(
    serialized: string,
    confirmation: RestoreBackupConfirmation,
    now?: Date
  ): Promise<BudgetView | null>;
  importQueuedSms(now?: Date): Promise<DebugSmsImportResult[]>;
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

export function createBudgetStore(
  storage: BudgetStorage,
  smsQueue: NativeSmsQueuePort = createNoopNativeSmsQueue()
): BudgetStore {
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

  async function importOneSms(
    input: DebugSmsImportInput,
    now: Date
  ): Promise<DebugSmsImportResult> {
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

    const nextSnapshot = appendImportedSmsFactsToSnapshot(snapshot, importResult);

    await storage.appendImportedSmsFacts(importResult);
    return {
      budgetView: deriveBudgetView(nextSnapshot, now),
      parseResult: importResult.parseResult,
      transaction: importResult.candidateTransaction,
      importOutcome: importResult.importOutcome,
    };
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

    async getMonthlyReport(monthKey: string) {
      await waitForPendingMutations();
      const snapshot = await storage.readSnapshot();

      if (!snapshot.account) {
        return null;
      }

      return deriveMonthlyReport(snapshot, monthKey);
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
        await storage.replaceSnapshot(nextSnapshot);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async assignMoneyToCategory(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        assertBudgetExists(snapshot);
        assertWholeNumberOfCents(input.amountCents, 'Assigned amount');
        assertCategoryExists(snapshot, input.categoryId);

        const nextEvent: AssignmentEvent = {
          id: createAssignmentEventId(snapshot),
          categoryId: input.categoryId,
          monthKey: toMonthKey(now),
          amountCents: input.amountCents,
          createdAt: now.toISOString(),
        };
        const nextSnapshot = appendAssignmentEventsToSnapshot(snapshot, [nextEvent]);

        await storage.appendAssignmentEvents([nextEvent]);
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

        const nextEvents: AssignmentEvent[] = [
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
        ];
        const nextSnapshot = appendAssignmentEventsToSnapshot(snapshot, nextEvents);

        await storage.appendAssignmentEvents(nextEvents);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async createManualTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyCreateManualTransaction(snapshot, input, now);
        const nextTransaction = getAppendedTransaction(snapshot, nextSnapshot);
        await storage.appendTransaction(nextTransaction);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async updateManualTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyUpdateManualTransaction(snapshot, input);
        const updatedTransaction = getTransactionById(nextSnapshot, input.transactionId);
        await storage.updateTransaction(updatedTransaction);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async approveImportedTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyTransactionWorkflow(snapshot, {
          kind: 'approve_imported_transaction',
          transactionId: input.transactionId,
          categoryId: input.categoryId,
        });
        const updatedTransaction = getTransactionById(nextSnapshot, input.transactionId);
        await storage.updateTransaction(updatedTransaction);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async ignoreImportedTransaction(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyTransactionWorkflow(snapshot, {
          kind: 'ignore_imported_transaction',
          transactionId: input.transactionId,
        });
        const updatedTransaction = getTransactionById(nextSnapshot, input.transactionId);
        await storage.updateTransaction(updatedTransaction);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async recoverUnparseableSms(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyTransactionWorkflow(
          snapshot,
          {
            kind: 'recover_unparseable_sms',
            importOutcomeId: input.importOutcomeId,
            transaction: input.transaction,
          },
          now
        );
        await storage.appendRecoveredUnparseableSmsFacts(
          getRecoveredUnparseableSmsFacts(snapshot, nextSnapshot, input.importOutcomeId)
        );
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async ignoreUnparseableSms(input, now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyTransactionWorkflow(snapshot, {
          kind: 'ignore_unparseable_sms',
          importOutcomeId: input.importOutcomeId,
        });
        await storage.updateImportOutcome(
          getImportOutcomeById(nextSnapshot, input.importOutcomeId)
        );
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async createReconciliationAdjustment(now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        const nextSnapshot = applyCreateReconciliationAdjustment(snapshot, now);
        const nextTransaction = getAppendedTransaction(snapshot, nextSnapshot);
        await storage.appendTransaction(nextTransaction);
        return deriveBudgetView(nextSnapshot, now);
      });
    },

    async importDebugSms(input, now = new Date()) {
      return runSerializedMutation(() => importOneSms(input, now));
    },

    async importQueuedSms(now = new Date()) {
      return runSerializedMutation(async () => {
        await smsQueue.setAllowedSenders(DEBUG_BANK_ALLOWED_SENDERS);
        const snapshot = await storage.readSnapshot();
        if (!snapshot.account) {
          return [];
        }

        const payloads = await smsQueue.drain();
        const importResults: DebugSmsImportResult[] = [];

        for (const payload of payloads) {
          importResults.push(await importOneSms(payload, now));
        }

        return importResults;
      });
    },

    async exportBackup(now = new Date()) {
      return runSerializedMutation(async () => {
        const snapshot = await storage.readSnapshot();
        return serializeBackup(snapshot, now);
      });
    },

    async restoreBackup(serialized, confirmation, now = new Date()) {
      return runSerializedMutation(async () => {
        if (confirmation.confirmed !== true) {
          throw new Error('Restore requires explicit confirmation.');
        }

        const snapshot = parseBackup(serialized);
        await storage.replaceSnapshot(snapshot);

        if (!snapshot.account) {
          return null;
        }

        return deriveBudgetView(snapshot, now);
      });
    },
  };
}

export function createMemoryBudgetStorage(
  initialSnapshot: BudgetSnapshot = EMPTY_SNAPSHOT
): BudgetStorage {
  let snapshot = cloneSnapshot(initialSnapshot);

  return {
    async readSnapshot() {
      return cloneSnapshot(snapshot);
    },

    async replaceSnapshot(nextSnapshot) {
      snapshot = cloneSnapshot(nextSnapshot);
    },

    async appendAssignmentEvents(events) {
      snapshot = appendAssignmentEventsToSnapshot(snapshot, events);
    },

    async appendTransaction(transaction) {
      snapshot = appendTransactionToSnapshot(snapshot, transaction);
    },

    async updateTransaction(transaction) {
      snapshot = updateTransactionInSnapshot(snapshot, transaction);
    },

    async appendImportedSmsFacts(facts) {
      snapshot = appendImportedSmsFactsToSnapshot(snapshot, facts);
    },

    async appendRecoveredUnparseableSmsFacts(facts) {
      snapshot = appendRecoveredUnparseableSmsFactsToSnapshot(snapshot, facts);
    },

    async updateImportOutcome(outcome) {
      snapshot = updateImportOutcomeInSnapshot(snapshot, outcome);
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
  const category = budgetView.categoryGroups
    .flatMap((group) => group.categories)
    .find((entry) => entry.id === categoryId);

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

function appendAssignmentEventsToSnapshot(
  snapshot: BudgetSnapshot,
  events: AssignmentEvent[]
): BudgetSnapshot {
  return {
    ...snapshot,
    assignmentEvents: [...snapshot.assignmentEvents, ...events],
  };
}

function appendTransactionToSnapshot(
  snapshot: BudgetSnapshot,
  transaction: CanonicalTransaction
): BudgetSnapshot {
  return {
    ...snapshot,
    transactions: [...snapshot.transactions, transaction],
  };
}

function updateTransactionInSnapshot(
  snapshot: BudgetSnapshot,
  transaction: CanonicalTransaction
): BudgetSnapshot {
  const transactionIndex = snapshot.transactions.findIndex((entry) => entry.id === transaction.id);

  if (transactionIndex < 0) {
    throw new Error('Transaction does not exist.');
  }

  return {
    ...snapshot,
    transactions: snapshot.transactions.map((entry, index) =>
      index === transactionIndex ? transaction : entry
    ),
  };
}

function appendImportedSmsFactsToSnapshot(
  snapshot: BudgetSnapshot,
  facts: ImportedSmsFacts
): BudgetSnapshot {
  return {
    ...snapshot,
    transactions: facts.candidateTransaction
      ? [...snapshot.transactions, facts.candidateTransaction]
      : snapshot.transactions,
    rawSmsMessages: [...snapshot.rawSmsMessages, facts.rawSmsMessage],
    smsParseResults: facts.parseResult
      ? [...snapshot.smsParseResults, facts.parseResult]
      : snapshot.smsParseResults,
    importOutcomes: [...snapshot.importOutcomes, facts.importOutcome],
  };
}

function appendRecoveredUnparseableSmsFactsToSnapshot(
  snapshot: BudgetSnapshot,
  facts: RecoveredUnparseableSmsFacts
): BudgetSnapshot {
  return {
    ...snapshot,
    transactions: [...snapshot.transactions, facts.transaction],
    importOutcomes: snapshot.importOutcomes.map((entry) =>
      entry.id === facts.importOutcome.id ? facts.importOutcome : entry
    ),
  };
}

function updateImportOutcomeInSnapshot(
  snapshot: BudgetSnapshot,
  outcome: ImportOutcome
): BudgetSnapshot {
  const outcomeIndex = snapshot.importOutcomes.findIndex((entry) => entry.id === outcome.id);

  if (outcomeIndex < 0) {
    throw new Error('Import outcome does not exist.');
  }

  return {
    ...snapshot,
    importOutcomes: snapshot.importOutcomes.map((entry, index) =>
      index === outcomeIndex ? outcome : entry
    ),
  };
}

function getRecoveredUnparseableSmsFacts(
  snapshot: BudgetSnapshot,
  nextSnapshot: BudgetSnapshot,
  importOutcomeId: string
): RecoveredUnparseableSmsFacts {
  const transaction = getAppendedTransaction(snapshot, nextSnapshot);
  const importOutcome = getImportOutcomeById(nextSnapshot, importOutcomeId);

  return {
    transaction,
    importOutcome,
  };
}

function getImportOutcomeById(snapshot: BudgetSnapshot, importOutcomeId: string): ImportOutcome {
  const outcome = snapshot.importOutcomes.find((entry) => entry.id === importOutcomeId);

  if (!outcome) {
    throw new Error('Import outcome does not exist.');
  }

  return outcome;
}

function getAppendedTransaction(
  snapshot: BudgetSnapshot,
  nextSnapshot: BudgetSnapshot
): CanonicalTransaction {
  const existingTransactionIds = new Set(
    snapshot.transactions.map((transaction) => transaction.id)
  );
  const appendedTransactions = nextSnapshot.transactions.filter(
    (transaction) => !existingTransactionIds.has(transaction.id)
  );

  if (appendedTransactions.length !== 1) {
    throw new Error('Expected exactly one appended transaction.');
  }

  return appendedTransactions[0];
}

function getTransactionById(snapshot: BudgetSnapshot, transactionId: string): CanonicalTransaction {
  const transaction = snapshot.transactions.find((entry) => entry.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction does not exist.');
  }

  return transaction;
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
