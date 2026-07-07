import { describe, expect, it, vi } from 'vitest';

import { createBudgetAppStore } from '../app-module';
import type {
  BudgetStore,
  DebugSmsImportInput,
  DebugSmsImportResult,
} from '../store';
import type {
  ApproveImportedTransactionInput,
  BudgetView,
  CanonicalTransaction,
  CompleteOnboardingInput,
  IgnoreImportedTransactionInput,
  ImportOutcome,
  ManualTransactionInput,
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
      inboxTransactions: TEST_INBOX_TRANSACTIONS,
      importOutcomes: TEST_IMPORT_OUTCOMES,
    });
    expect(store.getCurrentBudgetView).toHaveBeenCalledTimes(1);
    expect(store.getTransactions).toHaveBeenCalledTimes(1);
    expect(store.getInboxTransactions).toHaveBeenCalledTimes(1);
    expect(store.getImportOutcomes).toHaveBeenCalledTimes(1);
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
    expect(screenData.inboxTransactions).toEqual(TEST_INBOX_TRANSACTIONS);
    expect(screenData.importOutcomes).toEqual(TEST_IMPORT_OUTCOMES);
  });

  it('returns import result plus refreshed transactions screen data after SMS import', async () => {
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
      transactions: TEST_TRANSACTIONS,
      inboxTransactions: TEST_INBOX_TRANSACTIONS,
      importOutcomes: TEST_IMPORT_OUTCOMES,
    });
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
    getCurrentBudgetView: vi.fn<
      (now?: Date) => Promise<BudgetView | null>
    >(async () => TEST_BUDGET_VIEW),
    getTransactions: vi.fn<
      () => Promise<CanonicalTransaction[]>
    >(async () => TEST_TRANSACTIONS),
    getInboxTransactions: vi.fn<
      () => Promise<CanonicalTransaction[]>
    >(async () => TEST_INBOX_TRANSACTIONS),
    getRawSmsMessages: vi.fn(async () => []),
    getSmsParseResults: vi.fn(async () => []),
    getImportOutcomes: vi.fn<
      () => Promise<ImportOutcome[]>
    >(async () => TEST_IMPORT_OUTCOMES),
    completeOnboarding: vi.fn<
      (input: CompleteOnboardingInput, now?: Date) => Promise<BudgetView>
    >(async () => TEST_BUDGET_VIEW),
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
    importDebugSms: vi.fn<
      (input: DebugSmsImportInput, now?: Date) => Promise<DebugSmsImportResult>
    >(async () => TEST_IMPORT_RESULT),
  };
}
