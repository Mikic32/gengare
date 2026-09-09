import type {
  AssignMoneyToCategoryInput,
  BudgetStore,
  DebugSmsImportInput,
  DebugSmsImportResult,
  MoveMoneyBetweenCategoriesInput,
  RestoreBackupConfirmation,
} from './store';
import type {
  ApproveImportedTransactionInput,
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

export type TransactionsScreenData = {
  budgetView: BudgetView | null;
  transactions: CanonicalTransaction[];
};

export type ReportsScreenData = {
  budgetView: BudgetView | null;
  report: MonthlyReport | null;
};

export type ManualImportTask = {
  importOutcome: ImportOutcome;
  rawSmsMessage: RawSmsMessage;
  parseResult: SmsParseResult | null;
};

export type InboxScreenData = {
  budgetView: BudgetView | null;
  needsReview: CanonicalTransaction[];
  possibleDuplicates: CanonicalTransaction[];
  manualImportTasks: ManualImportTask[];
};

export type BudgetAppStore = {
  getBudgetView(now?: Date): Promise<BudgetView | null>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  assignMoneyToCategory(input: AssignMoneyToCategoryInput, now?: Date): Promise<BudgetView>;
  moveMoneyBetweenCategories(
    input: MoveMoneyBetweenCategoriesInput,
    now?: Date
  ): Promise<BudgetView>;
  loadTransactionsScreenData(now?: Date): Promise<TransactionsScreenData>;
  loadReportsScreenData(monthKey: string, now?: Date): Promise<ReportsScreenData>;
  loadInboxScreenData(now?: Date): Promise<InboxScreenData>;
  saveManualTransaction(
    input: ManualTransactionInput | UpdateManualTransactionInput,
    now?: Date
  ): Promise<TransactionsScreenData>;
  importDebugSms(
    input: DebugSmsImportInput,
    now?: Date
  ): Promise<{
    importResult: DebugSmsImportResult;
    screenData: InboxScreenData;
  }>;
  approveImportedTransaction(
    input: ApproveImportedTransactionInput,
    now?: Date
  ): Promise<InboxScreenData>;
  ignoreImportedTransaction(
    input: IgnoreImportedTransactionInput,
    now?: Date
  ): Promise<InboxScreenData>;
  recoverUnparseableSms(input: RecoverUnparseableSmsInput, now?: Date): Promise<InboxScreenData>;
  ignoreUnparseableSms(input: IgnoreUnparseableSmsInput, now?: Date): Promise<InboxScreenData>;
  createReconciliationAdjustment(now?: Date): Promise<BudgetView>;
  exportBackup(now?: Date): Promise<string>;
  restoreBackup(
    serialized: string,
    confirmation: RestoreBackupConfirmation,
    now?: Date
  ): Promise<BudgetView | null>;
  drainQueuedSms(now?: Date): Promise<InboxScreenData>;
};

export function createBudgetAppStore(store: BudgetStore): BudgetAppStore {
  async function hydrateTransactionsScreenData(
    budgetView: BudgetView | null
  ): Promise<TransactionsScreenData> {
    const transactions = await store.getTransactions();

    return {
      budgetView,
      transactions,
    };
  }

  async function hydrateInboxScreenData(budgetView: BudgetView | null): Promise<InboxScreenData> {
    const [inboxTransactions, importOutcomes, rawSmsMessages, smsParseResults] = await Promise.all([
      store.getInboxTransactions(),
      store.getImportOutcomes(),
      store.getRawSmsMessages(),
      store.getSmsParseResults(),
    ]);

    return assembleInboxScreenData({
      budgetView,
      inboxTransactions,
      importOutcomes,
      rawSmsMessages,
      smsParseResults,
    });
  }

  return {
    getBudgetView(now = new Date()) {
      return store.getCurrentBudgetView(now);
    },

    completeOnboarding(input, now = new Date()) {
      return store.completeOnboarding(input, now);
    },

    assignMoneyToCategory(input, now = new Date()) {
      return store.assignMoneyToCategory(input, now);
    },

    moveMoneyBetweenCategories(input, now = new Date()) {
      return store.moveMoneyBetweenCategories(input, now);
    },

    async loadTransactionsScreenData(now = new Date()) {
      const [budgetView, transactions] = await Promise.all([
        store.getCurrentBudgetView(now),
        store.getTransactions(),
      ]);

      return {
        budgetView,
        transactions,
      };
    },

    async loadReportsScreenData(monthKey: string, now = new Date()) {
      const [budgetView, report] = await Promise.all([
        store.getCurrentBudgetView(now),
        store.getMonthlyReport(monthKey),
      ]);

      return {
        budgetView,
        report,
      };
    },

    async loadInboxScreenData(now = new Date()) {
      const budgetView = await store.getCurrentBudgetView(now);
      return hydrateInboxScreenData(budgetView);
    },

    async saveManualTransaction(input, now = new Date()) {
      const budgetView =
        'transactionId' in input
          ? await store.updateManualTransaction(input, now)
          : await store.createManualTransaction(input, now);

      return hydrateTransactionsScreenData(budgetView);
    },

    async importDebugSms(input, now = new Date()) {
      const importResult = await store.importDebugSms(input, now);

      return {
        importResult,
        screenData: await hydrateInboxScreenData(importResult.budgetView),
      };
    },

    async approveImportedTransaction(input, now = new Date()) {
      const budgetView = await store.approveImportedTransaction(input, now);
      return hydrateInboxScreenData(budgetView);
    },

    async ignoreImportedTransaction(input, now = new Date()) {
      const budgetView = await store.ignoreImportedTransaction(input, now);
      return hydrateInboxScreenData(budgetView);
    },

    async recoverUnparseableSms(input, now = new Date()) {
      const budgetView = await store.recoverUnparseableSms(input, now);
      return hydrateInboxScreenData(budgetView);
    },

    async ignoreUnparseableSms(input, now = new Date()) {
      const budgetView = await store.ignoreUnparseableSms(input, now);
      return hydrateInboxScreenData(budgetView);
    },

    createReconciliationAdjustment(now = new Date()) {
      return store.createReconciliationAdjustment(now);
    },

    exportBackup(now = new Date()) {
      return store.exportBackup(now);
    },

    restoreBackup(serialized, confirmation, now = new Date()) {
      return store.restoreBackup(serialized, confirmation, now);
    },

    async drainQueuedSms(now = new Date()) {
      const importResults = await store.importQueuedSms(now);
      const budgetView =
        importResults.at(-1)?.budgetView ?? (await store.getCurrentBudgetView(now));
      return hydrateInboxScreenData(budgetView);
    },
  };
}

function assembleInboxScreenData(input: {
  budgetView: BudgetView | null;
  inboxTransactions: CanonicalTransaction[];
  importOutcomes: ImportOutcome[];
  rawSmsMessages: RawSmsMessage[];
  smsParseResults: SmsParseResult[];
}): InboxScreenData {
  const outcomeByTransactionId = new Map(
    input.importOutcomes
      .filter((outcome) => outcome.candidateTransactionId !== null)
      .map((outcome) => [outcome.candidateTransactionId as string, outcome])
  );
  const rawSmsById = new Map(input.rawSmsMessages.map((message) => [message.id, message]));
  const parseResultById = new Map(input.smsParseResults.map((result) => [result.id, result]));

  return {
    budgetView: input.budgetView,
    needsReview: input.inboxTransactions.filter(
      (transaction) => outcomeByTransactionId.get(transaction.id)?.kind !== 'possible_duplicate'
    ),
    possibleDuplicates: input.inboxTransactions.filter(
      (transaction) => outcomeByTransactionId.get(transaction.id)?.kind === 'possible_duplicate'
    ),
    manualImportTasks: input.importOutcomes
      .filter(
        (outcome) => outcome.kind === 'manual_import' && outcome.candidateTransactionId === null
      )
      .flatMap((outcome) => {
        const rawSmsMessage = rawSmsById.get(outcome.rawSmsMessageId);
        if (!rawSmsMessage) {
          return [];
        }

        return [
          {
            importOutcome: outcome,
            rawSmsMessage,
            parseResult: outcome.parseResultId
              ? (parseResultById.get(outcome.parseResultId) ?? null)
              : null,
          },
        ];
      }),
  };
}
