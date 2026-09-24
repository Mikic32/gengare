import type { ActionableNotifications } from './actionable-notifications';
import { countInboxItems } from './app-helpers';
import type {
  AssignMoneyToCategoryInput,
  BudgetStore,
  DebugSmsImportInput,
  DebugSmsImportResult,
  MoveMoneyBetweenCategoriesInput,
  ResetLocalDataConfirmation,
  RestoreBackupConfirmation,
} from './store';
import type {
  ApproveImportedTransactionInput,
  BudgetView,
  CanonicalTransaction,
  CompleteOnboardingInput,
  EnvelopeCommand,
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
  approved: CanonicalTransaction[];
  ignored: CanonicalTransaction[];
  ignoredMessages: ManualImportTask[];
};

export type BudgetAppStore = {
  getBudgetView(now?: Date): Promise<BudgetView | null>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  applyEnvelopeCommand(command: EnvelopeCommand, now?: Date): Promise<BudgetView>;
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
  resetLocalData(confirmation: ResetLocalDataConfirmation): Promise<void>;
  drainQueuedSms(now?: Date): Promise<InboxScreenData>;
};

export function createBudgetAppStore(
  store: BudgetStore,
  options?: {
    notifications?: ActionableNotifications;
  }
): BudgetAppStore {
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
    const [inboxTransactions, transactions, importOutcomes, rawSmsMessages, smsParseResults] =
      await Promise.all([
        store.getInboxTransactions(),
        store.getTransactions(),
        store.getImportOutcomes(),
        store.getRawSmsMessages(),
        store.getSmsParseResults(),
      ]);

    return assembleInboxScreenData({
      budgetView,
      inboxTransactions,
      transactions,
      importOutcomes,
      rawSmsMessages,
      smsParseResults,
    });
  }

  function syncActionableNotificationsFromInbox(screenData: InboxScreenData) {
    options?.notifications?.sync({
      inboxItemCount: countInboxItems(screenData),
      budgetView: screenData.budgetView,
    });
  }

  async function syncActionableNotifications(budgetView: BudgetView | null) {
    if (!options?.notifications) {
      return;
    }

    const screenData = await hydrateInboxScreenData(budgetView);
    syncActionableNotificationsFromInbox(screenData);
  }

  async function mutateInbox(run: () => Promise<BudgetView>): Promise<InboxScreenData> {
    const budgetView = await run();
    const screenData = await hydrateInboxScreenData(budgetView);
    syncActionableNotificationsFromInbox(screenData);
    return screenData;
  }

  return {
    getBudgetView(now = new Date()) {
      return store.getCurrentBudgetView(now);
    },

    completeOnboarding(input, now = new Date()) {
      return store.completeOnboarding(input, now);
    },

    async applyEnvelopeCommand(command, now = new Date()) {
      const budgetView = await store.applyEnvelopeCommand(command, now);
      await syncActionableNotifications(budgetView);
      return budgetView;
    },

    async assignMoneyToCategory(input, now = new Date()) {
      const budgetView = await store.assignMoneyToCategory(input, now);
      await syncActionableNotifications(budgetView);
      return budgetView;
    },

    async moveMoneyBetweenCategories(input, now = new Date()) {
      const budgetView = await store.moveMoneyBetweenCategories(input, now);
      await syncActionableNotifications(budgetView);
      return budgetView;
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

      const screenData = await hydrateTransactionsScreenData(budgetView);
      await syncActionableNotifications(budgetView);
      return screenData;
    },

    async importDebugSms(input, now = new Date()) {
      const importResult = await store.importDebugSms(input, now);
      const screenData = await hydrateInboxScreenData(importResult.budgetView);
      syncActionableNotificationsFromInbox(screenData);

      return {
        importResult,
        screenData,
      };
    },

    approveImportedTransaction(input, now = new Date()) {
      return mutateInbox(() => store.approveImportedTransaction(input, now));
    },

    ignoreImportedTransaction(input, now = new Date()) {
      return mutateInbox(() => store.ignoreImportedTransaction(input, now));
    },

    recoverUnparseableSms(input, now = new Date()) {
      return mutateInbox(() => store.recoverUnparseableSms(input, now));
    },

    ignoreUnparseableSms(input, now = new Date()) {
      return mutateInbox(() => store.ignoreUnparseableSms(input, now));
    },

    async createReconciliationAdjustment(now = new Date()) {
      const budgetView = await store.createReconciliationAdjustment(now);
      await syncActionableNotifications(budgetView);
      return budgetView;
    },

    exportBackup(now = new Date()) {
      return store.exportBackup(now);
    },

    async restoreBackup(serialized, confirmation, now = new Date()) {
      const budgetView = await store.restoreBackup(serialized, confirmation, now);
      await syncActionableNotifications(budgetView);
      return budgetView;
    },

    async resetLocalData(confirmation) {
      await store.resetLocalData(confirmation);
      await syncActionableNotifications(null);
    },

    async drainQueuedSms(now = new Date()) {
      const importResults = await store.importQueuedSms(now);
      const budgetView =
        importResults.at(-1)?.budgetView ?? (await store.getCurrentBudgetView(now));
      const screenData = await hydrateInboxScreenData(budgetView);
      syncActionableNotificationsFromInbox(screenData);
      return screenData;
    },
  };
}

function assembleInboxScreenData(input: {
  budgetView: BudgetView | null;
  inboxTransactions: CanonicalTransaction[];
  transactions: CanonicalTransaction[];
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
    approved: input.transactions.filter(
      (transaction) => transaction.source === 'sms' && transaction.status === 'approved'
    ),
    ignored: input.transactions.filter(
      (transaction) => transaction.source === 'sms' && transaction.status === 'ignored'
    ),
    ignoredMessages: input.importOutcomes
      .filter((outcome) => outcome.kind === 'ignored' && outcome.candidateTransactionId === null)
      .flatMap((outcome) => {
        const rawSmsMessage = rawSmsById.get(outcome.rawSmsMessageId);
        if (!rawSmsMessage) return [];
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
