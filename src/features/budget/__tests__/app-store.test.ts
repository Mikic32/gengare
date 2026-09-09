import { describe, expect, it, vi } from 'vitest';

import { createBudgetAppStore } from '../app-module';
import type {
  BudgetStore,
  DebugSmsImportInput,
  DebugSmsImportResult,
  RestoreBackupConfirmation,
} from '../store';
import type {
  ApproveImportedTransactionInput,
  BudgetView,
  CanonicalTransaction,
  CompleteOnboardingInput,
  IgnoreImportedTransactionInput,
  ImportOutcome,
  ManualTransactionInput,
  MonthlyReport,
  UpdateManualTransactionInput,
} from '../types';

describe('budget app store', () => {
  it('loads transactions screen data through one app-facing Module call', async () => {
    const store = createBudgetStoreStub();
    const appStore = createBudgetAppStore(store);

    const screenData = await appStore.loadTransactionsScreenData(
      new Date('2026-07-07T10:00:00.000Z')
    );

    expect(screenData).toEqual({
      budgetView: TEST_BUDGET_VIEW,
      transactions: TEST_TRANSACTIONS,
    });
    expect(store.getCurrentBudgetView).toHaveBeenCalledTimes(1);
    expect(store.getTransactions).toHaveBeenCalledTimes(1);
    expect(store.getInboxTransactions).not.toHaveBeenCalled();
    expect(store.getImportOutcomes).not.toHaveBeenCalled();
  });

  it('loads reports screen data for a chosen month through one app-facing Module call', async () => {
    const store = createBudgetStoreStub();
    const appStore = createBudgetAppStore(store);

    const screenData = await appStore.loadReportsScreenData(
      '2026-07',
      new Date('2026-07-07T10:00:00.000Z')
    );

    expect(screenData).toEqual({
      budgetView: TEST_BUDGET_VIEW,
      report: TEST_MONTHLY_REPORT,
    });
    expect(store.getCurrentBudgetView).toHaveBeenCalledTimes(1);
    expect(store.getMonthlyReport).toHaveBeenCalledWith('2026-07');
    expect(store.getTransactions).not.toHaveBeenCalled();
  });

  it('rehydrates transaction screen data after saving a manual transaction', async () => {
    const store = createBudgetStoreStub();
    const appStore = createBudgetAppStore(store);

    const screenData = await appStore.saveManualTransaction(
      {
        kind: 'outflow',
        amountCents: 2_500,
        occurredAt: '2026-07-07T12:00:00.000Z',
        categoryId: 'category-1',
        payee: 'Coffee shop',
        memo: null,
      },
      new Date('2026-07-07T12:30:00.000Z')
    );

    expect(store.createManualTransaction).toHaveBeenCalledTimes(1);
    expect(store.updateManualTransaction).not.toHaveBeenCalled();
    expect(screenData.budgetView).toBe(TEST_BUDGET_VIEW);
    expect(screenData.transactions).toEqual(TEST_TRANSACTIONS);
  });

  it('returns import result plus refreshed inbox screen data after SMS import', async () => {
    const store = createBudgetStoreStub();
    const appStore = createBudgetAppStore(store);

    const result = await appStore.importDebugSms(
      {
        sender: 'BANK',
        body: 'Debug SMS',
        receivedAt: '2026-07-07T12:00:00.000Z',
      },
      new Date('2026-07-07T12:00:00.000Z')
    );

    expect(store.importDebugSms).toHaveBeenCalledTimes(1);
    expect(result.importResult).toEqual(TEST_IMPORT_RESULT);
    expect(result.screenData).toEqual({
      budgetView: TEST_BUDGET_VIEW,
      needsReview: TEST_INBOX_TRANSACTIONS,
      possibleDuplicates: [],
      manualImportTasks: [],
    });
  });

  it('loads inbox screen data grouped into review, duplicate, and manual-import sections', async () => {
    const store = createBudgetStoreStub();
    store.getInboxTransactions = vi.fn(async () => [
      TEST_INBOX_TRANSACTIONS[0],
      TEST_DUPLICATE_TRANSACTION,
    ]);
    store.getImportOutcomes = vi.fn(async () => [
      TEST_IMPORT_OUTCOMES[0],
      TEST_DUPLICATE_IMPORT_OUTCOME,
      TEST_MANUAL_IMPORT_OUTCOME,
    ]);
    store.getRawSmsMessages = vi.fn(async () => [TEST_UNPARSEABLE_RAW_SMS]);
    store.getSmsParseResults = vi.fn(async () => [TEST_UNPARSEABLE_PARSE_RESULT]);
    const appStore = createBudgetAppStore(store);

    const screenData = await appStore.loadInboxScreenData(new Date('2026-07-07T10:00:00.000Z'));

    expect(screenData).toEqual({
      budgetView: TEST_BUDGET_VIEW,
      needsReview: [TEST_INBOX_TRANSACTIONS[0]],
      possibleDuplicates: [TEST_DUPLICATE_TRANSACTION],
      manualImportTasks: [
        {
          importOutcome: TEST_MANUAL_IMPORT_OUTCOME,
          rawSmsMessage: TEST_UNPARSEABLE_RAW_SMS,
          parseResult: TEST_UNPARSEABLE_PARSE_RESULT,
        },
      ],
    });
  });

  it('rehydrates inbox screen data after recovering an unparseable SMS', async () => {
    const store = createBudgetStoreStub();
    store.getInboxTransactions = vi.fn(async () => []);
    store.getImportOutcomes = vi.fn(async () => []);
    store.getRawSmsMessages = vi.fn(async () => [TEST_UNPARSEABLE_RAW_SMS]);
    store.getSmsParseResults = vi.fn(async () => [TEST_UNPARSEABLE_PARSE_RESULT]);
    const appStore = createBudgetAppStore(store);

    const screenData = await appStore.recoverUnparseableSms(
      {
        importOutcomeId: 'import-outcome-3',
        transaction: {
          kind: 'outflow',
          amountCents: 15_000,
          occurredAt: '2026-07-07T11:00:00.000Z',
          categoryId: 'category-1',
          payee: 'Market',
          memo: null,
          balanceAfterCents: 110_500,
        },
      },
      new Date('2026-07-07T12:00:00.000Z')
    );

    expect(store.recoverUnparseableSms).toHaveBeenCalledTimes(1);
    expect(screenData.needsReview).toEqual([]);
    expect(screenData.possibleDuplicates).toEqual([]);
    expect(screenData.manualImportTasks).toEqual([]);
  });

  it('returns the updated budget view after creating a reconciliation adjustment', async () => {
    const store = createBudgetStoreStub();
    const appStore = createBudgetAppStore(store);

    const view = await appStore.createReconciliationAdjustment(
      new Date('2026-07-07T12:00:00.000Z')
    );

    expect(store.createReconciliationAdjustment).toHaveBeenCalledTimes(1);
    expect(view).toBe(TEST_BUDGET_VIEW);
  });
});

const TEST_BUDGET_VIEW: BudgetView = {
  accountName: 'Main account',
  currencyCode: 'RSD',
  monthKey: '2026-07',
  moneyState: {
    accountBalance: {
      amountCents: 120_000,
      derivedFrom: 'latest_non_ignored_balance_evidence',
    },
    assignableCash: {
      amountCents: 45_000,
      derivedFrom: 'approved_categoryless_inflows_minus_assignments_and_overspending',
    },
    reconciliationGap: {
      amountCents: 0,
      approvedLedgerCents: 120_000,
      derivedFrom: 'authoritative_minus_approved_ledger',
    },
  },
  categoryGroups: [
    {
      id: 'group-1',
      name: 'Essentials',
      categories: [
        {
          id: 'category-1',
          name: 'Groceries',
          assignedCents: 30_000,
          activityCents: -5_000,
          availableCents: 25_000,
        },
      ],
    },
  ],
};

const TEST_MONTHLY_REPORT: MonthlyReport = {
  monthKey: '2026-07',
  spendingByCategory: [
    {
      categoryId: 'category-1',
      categoryName: 'Groceries',
      spentCents: 5_000,
    },
  ],
  cashflow: {
    inflowCents: 0,
    outflowCents: 5_000,
    netCents: -5_000,
  },
};

const TEST_TRANSACTIONS: CanonicalTransaction[] = [
  {
    id: 'transaction-1',
    accountId: 'account-1',
    source: 'manual',
    kind: 'outflow',
    status: 'approved',
    amountCents: -5_000,
    occurredAt: '2026-07-07T09:00:00.000Z',
    categoryId: 'category-1',
    balanceAfterCents: null,
    payee: 'Grocer',
    memo: null,
    createdAt: '2026-07-07T09:00:00.000Z',
  },
];

const TEST_INBOX_TRANSACTIONS: CanonicalTransaction[] = [
  {
    id: 'transaction-2',
    accountId: 'account-1',
    source: 'sms',
    kind: 'outflow',
    status: 'needs_review',
    amountCents: -1_500,
    occurredAt: '2026-07-07T11:00:00.000Z',
    categoryId: null,
    balanceAfterCents: 118_500,
    payee: 'Bakery',
    memo: null,
    createdAt: '2026-07-07T11:01:00.000Z',
  },
];

const TEST_IMPORT_OUTCOMES: ImportOutcome[] = [
  {
    id: 'import-outcome-1',
    rawSmsMessageId: 'raw-sms-1',
    parseResultId: 'sms-parse-1',
    kind: 'needs_review',
    candidateTransactionId: 'transaction-2',
    reason: 'parsed_ok',
    createdAt: '2026-07-07T11:01:00.000Z',
  },
];

const TEST_DUPLICATE_TRANSACTION: CanonicalTransaction = {
  id: 'transaction-3',
  accountId: 'account-1',
  source: 'sms',
  kind: 'outflow',
  status: 'needs_review',
  amountCents: -1_500,
  occurredAt: '2026-07-07T11:00:00.000Z',
  categoryId: null,
  balanceAfterCents: 118_500,
  payee: 'Bakery',
  memo: null,
  createdAt: '2026-07-07T11:05:00.000Z',
};

const TEST_DUPLICATE_IMPORT_OUTCOME: ImportOutcome = {
  id: 'import-outcome-2',
  rawSmsMessageId: 'raw-sms-2',
  parseResultId: 'sms-parse-2',
  kind: 'possible_duplicate',
  candidateTransactionId: 'transaction-3',
  reason: 'possible_duplicate',
  createdAt: '2026-07-07T11:05:00.000Z',
};

const TEST_UNPARSEABLE_RAW_SMS = {
  id: 'raw-sms-3',
  sender: 'BANK',
  body: 'Garbled OTP banka SMS',
  receivedAt: '2026-07-07T11:10:00.000Z',
  createdAt: '2026-07-07T11:10:00.000Z',
};

const TEST_UNPARSEABLE_PARSE_RESULT = {
  id: 'sms-parse-3',
  rawSmsMessageId: 'raw-sms-3',
  parserId: 'debug-bank-sms',
  parserVersion: 1,
  status: 'unparseable' as const,
  transactionId: null,
  kind: null,
  amountCents: null,
  occurredAt: null,
  balanceAfterCents: null,
  payee: null,
  memo: 'invalid occurred-at timestamp',
  createdAt: '2026-07-07T11:10:00.000Z',
};

const TEST_MANUAL_IMPORT_OUTCOME: ImportOutcome = {
  id: 'import-outcome-3',
  rawSmsMessageId: 'raw-sms-3',
  parseResultId: 'sms-parse-3',
  kind: 'manual_import',
  candidateTransactionId: null,
  reason: 'unparseable',
  createdAt: '2026-07-07T11:10:00.000Z',
};

const TEST_BACKUP = '{"format":"gengare-backup","version":1}';

const TEST_IMPORT_RESULT: DebugSmsImportResult = {
  budgetView: TEST_BUDGET_VIEW,
  parseResult: {
    id: 'sms-parse-1',
    rawSmsMessageId: 'raw-sms-1',
    parserId: 'debug-bank-sms',
    parserVersion: 1,
    status: 'parsed',
    transactionId: 'transaction-2',
    kind: 'outflow',
    amountCents: -1_500,
    occurredAt: '2026-07-07T11:00:00.000Z',
    balanceAfterCents: 118_500,
    payee: 'Bakery',
    memo: null,
    createdAt: '2026-07-07T11:01:00.000Z',
  },
  transaction: TEST_INBOX_TRANSACTIONS[0],
  importOutcome: TEST_IMPORT_OUTCOMES[0],
};

function createBudgetStoreStub(): BudgetStore {
  return {
    getCurrentBudgetView: vi.fn<(now?: Date) => Promise<BudgetView | null>>(
      async () => TEST_BUDGET_VIEW
    ),
    getMonthlyReport: vi.fn<(monthKey: string) => Promise<MonthlyReport | null>>(
      async () => TEST_MONTHLY_REPORT
    ),
    getTransactions: vi.fn<() => Promise<CanonicalTransaction[]>>(async () => TEST_TRANSACTIONS),
    getInboxTransactions: vi.fn<() => Promise<CanonicalTransaction[]>>(
      async () => TEST_INBOX_TRANSACTIONS
    ),
    getRawSmsMessages: vi.fn(async () => []),
    getSmsParseResults: vi.fn(async () => []),
    getImportOutcomes: vi.fn<() => Promise<ImportOutcome[]>>(async () => TEST_IMPORT_OUTCOMES),
    completeOnboarding: vi.fn<(input: CompleteOnboardingInput, now?: Date) => Promise<BudgetView>>(
      async () => TEST_BUDGET_VIEW
    ),
    assignMoneyToCategory: vi.fn(async () => TEST_BUDGET_VIEW),
    moveMoneyBetweenCategories: vi.fn(async () => TEST_BUDGET_VIEW),
    createManualTransaction: vi.fn<
      (input: ManualTransactionInput, now?: Date) => Promise<BudgetView>
    >(async () => TEST_BUDGET_VIEW),
    updateManualTransaction: vi.fn<
      (input: UpdateManualTransactionInput, now?: Date) => Promise<BudgetView>
    >(async () => TEST_BUDGET_VIEW),
    approveImportedTransaction: vi.fn<
      (input: ApproveImportedTransactionInput, now?: Date) => Promise<BudgetView>
    >(async () => TEST_BUDGET_VIEW),
    ignoreImportedTransaction: vi.fn<
      (input: IgnoreImportedTransactionInput, now?: Date) => Promise<BudgetView>
    >(async () => TEST_BUDGET_VIEW),
    recoverUnparseableSms: vi.fn(async () => TEST_BUDGET_VIEW),
    ignoreUnparseableSms: vi.fn(async () => TEST_BUDGET_VIEW),
    createReconciliationAdjustment: vi.fn<(now?: Date) => Promise<BudgetView>>(
      async () => TEST_BUDGET_VIEW
    ),
    importDebugSms: vi.fn<
      (input: DebugSmsImportInput, now?: Date) => Promise<DebugSmsImportResult>
    >(async () => TEST_IMPORT_RESULT),
    exportBackup: vi.fn<(now?: Date) => Promise<string>>(async () => TEST_BACKUP),
    restoreBackup: vi.fn<
      (
        serialized: string,
        confirmation: RestoreBackupConfirmation,
        now?: Date
      ) => Promise<BudgetView | null>
    >(async () => TEST_BUDGET_VIEW),
  };
}
