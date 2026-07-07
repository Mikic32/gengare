import type {
  AssignMoneyToCategoryInput,
  BudgetStore,
  DebugSmsImportInput,
  DebugSmsImportResult,
  MoveMoneyBetweenCategoriesInput,
} from './store';
import type {
  ApproveImportedTransactionInput,
  BudgetView,
  CanonicalTransaction,
  CompleteOnboardingInput,
  IgnoreImportedTransactionInput,
  ImportOutcome,
  ManualTransactionInput,
  UpdateManualTransactionInput,
} from './types';

export type TransactionsScreenData = {
  budgetView: BudgetView | null;
  transactions: CanonicalTransaction[];
  inboxTransactions: CanonicalTransaction[];
  importOutcomes: ImportOutcome[];
};

export type BudgetAppStore = {
  getBudgetView(now?: Date): Promise<BudgetView | null>;
  completeOnboarding(input: CompleteOnboardingInput, now?: Date): Promise<BudgetView>;
  assignMoneyToCategory(input: AssignMoneyToCategoryInput, now?: Date): Promise<BudgetView>;
  moveMoneyBetweenCategories(input: MoveMoneyBetweenCategoriesInput, now?: Date): Promise<BudgetView>;
  loadTransactionsScreenData(now?: Date): Promise<TransactionsScreenData>;
  saveManualTransaction(
    input: ManualTransactionInput | UpdateManualTransactionInput,
    now?: Date
  ): Promise<TransactionsScreenData>;
  importDebugSms(
    input: DebugSmsImportInput,
    now?: Date
  ): Promise<{
    importResult: DebugSmsImportResult;
    screenData: TransactionsScreenData;
  }>;
  approveImportedTransaction(
    input: ApproveImportedTransactionInput,
    now?: Date
  ): Promise<TransactionsScreenData>;
  ignoreImportedTransaction(
    input: IgnoreImportedTransactionInput,
    now?: Date
  ): Promise<TransactionsScreenData>;
};

export function createBudgetAppStore(store: BudgetStore): BudgetAppStore {
  async function hydrateTransactionsScreenData(
    budgetView: BudgetView | null
  ): Promise<TransactionsScreenData> {
    const [transactions, inboxTransactions, importOutcomes] = await Promise.all([
      store.getTransactions(),
      store.getInboxTransactions(),
      store.getImportOutcomes(),
    ]);

    return {
      budgetView,
      transactions,
      inboxTransactions,
      importOutcomes,
    };
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
      const [budgetView, transactions, inboxTransactions, importOutcomes] =
        await Promise.all([
          store.getCurrentBudgetView(now),
          store.getTransactions(),
          store.getInboxTransactions(),
          store.getImportOutcomes(),
        ]);

      return {
        budgetView,
        transactions,
        inboxTransactions,
        importOutcomes,
      };
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
        screenData: await hydrateTransactionsScreenData(importResult.budgetView),
      };
    },

    async approveImportedTransaction(input, now = new Date()) {
      const budgetView = await store.approveImportedTransaction(input, now);
      return hydrateTransactionsScreenData(budgetView);
    },

    async ignoreImportedTransaction(input, now = new Date()) {
      const budgetView = await store.ignoreImportedTransaction(input, now);
      return hydrateTransactionsScreenData(budgetView);
    },
  };
}
