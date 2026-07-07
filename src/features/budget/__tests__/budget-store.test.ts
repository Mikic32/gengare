import { describe, expect, it } from 'vitest';

import { deriveBudgetView } from '../budget-engine';
import { createMemoryBudgetStorage, createBudgetStore, type BudgetStorage } from '../store';

describe('budget store bootstrap', () => {
  it('returns null before onboarding exists', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'))).resolves.toBeNull();
  });

  it('persists onboarding data and derives the current month budget shell', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const view = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
          {
            name: 'Savings',
            categories: ['Emergency fund'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(view.accountName).toBe('Main account');
    expect(view.currencyCode).toBe('RSD');
    expect(view.monthKey).toBe('2026-06');
    expect(view.authoritativeBalanceCents).toBe(125_500);
    expect(view.readyToAssignCents).toBe(125_500);
    expect(view.categoryGroups).toEqual([
      {
        id: expect.any(String),
        name: 'Essentials',
        categories: [
          {
            id: expect.any(String),
            name: 'Rent',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
          {
            id: expect.any(String),
            name: 'Groceries',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
        ],
      },
      {
        id: expect.any(String),
        name: 'Savings',
        categories: [
          {
            id: expect.any(String),
            name: 'Emergency fund',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
        ],
      },
    ]);

    const reloadedView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));
    expect(reloadedView).toEqual(view);
  });

  it('assigns money into a category for the current month', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const assignedView = await store.assignMoneyToCategory(
      {
        categoryId: initialView.categoryGroups[0].categories[0].id,
        amountCents: 50_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(assignedView.readyToAssignCents).toBe(75_500);
    expect(assignedView.categoryGroups).toEqual([
      {
        id: expect.any(String),
        name: 'Essentials',
        categories: [
          {
            id: expect.any(String),
            name: 'Rent',
            assignedCents: 50_000,
            activityCents: 0,
            availableCents: 50_000,
          },
          {
            id: expect.any(String),
            name: 'Groceries',
            assignedCents: 0,
            activityCents: 0,
            availableCents: 0,
          },
        ],
      },
    ]);

    const reloadedView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));
    expect(reloadedView).toEqual(assignedView);
  });

  it('moves money between categories inside the current month without changing ready to assign', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;
    const groceriesCategoryId = initialView.categoryGroups[0].categories[1].id;

    await store.assignMoneyToCategory(
      {
        categoryId: rentCategoryId,
        amountCents: 50_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const movedView = await store.moveMoneyBetweenCategories(
      {
        fromCategoryId: rentCategoryId,
        toCategoryId: groceriesCategoryId,
        amountCents: 20_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(movedView.readyToAssignCents).toBe(75_500);
    expect(movedView.categoryGroups).toEqual([
      {
        id: expect.any(String),
        name: 'Essentials',
        categories: [
          {
            id: expect.any(String),
            name: 'Rent',
            assignedCents: 30_000,
            activityCents: 0,
            availableCents: 30_000,
          },
          {
            id: expect.any(String),
            name: 'Groceries',
            assignedCents: 20_000,
            activityCents: 0,
            availableCents: 20_000,
          },
        ],
      },
    ]);

    const reloadedView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));
    expect(reloadedView).toEqual(movedView);
  });

  it('creates approved manual outflows and exposes them in the transaction ledger', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId: rentCategoryId,
        amountCents: 50_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const updatedView = await store.createManualTransaction(
      {
        kind: 'outflow',
        amountCents: 25_000,
        occurredAt: '2026-06-25T12:00:00.000Z',
        categoryId: rentCategoryId,
        payee: 'Landlord',
        memo: 'Late utility split',
      },
      new Date('2026-06-26T10:00:00.000Z')
    );

    expect(updatedView.readyToAssignCents).toBe(75_500);
    expect(updatedView.categoryGroups[0].categories[0]).toMatchObject({
      name: 'Rent',
      assignedCents: 50_000,
      activityCents: -25_000,
      availableCents: 25_000,
    });

    const transactions = await store.getTransactions();
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      source: 'manual',
      kind: 'outflow',
      status: 'approved',
      amountCents: -25_000,
      occurredAt: '2026-06-25T12:00:00.000Z',
      categoryId: rentCategoryId,
      payee: 'Landlord',
      memo: 'Late utility split',
    });
  });

  it('creates approved manual inflows as uncategorized cash', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(initialView.readyToAssignCents).toBe(125_500);

    const updatedView = await store.createManualTransaction(
      {
        kind: 'inflow',
        amountCents: 20_000,
        occurredAt: '2026-06-25T09:00:00.000Z',
        categoryId: null,
        payee: 'Refund',
        memo: null,
      },
      new Date('2026-06-26T10:00:00.000Z')
    );

    expect(updatedView.readyToAssignCents).toBe(145_500);

    const transactions = await store.getTransactions();
    expect(transactions[0]).toMatchObject({
      source: 'manual',
      kind: 'inflow',
      status: 'approved',
      amountCents: 20_000,
      categoryId: null,
      payee: 'Refund',
      memo: null,
    });
  });

  it('imports a debug SMS as a needs-review candidate and updates authoritative balance before approval', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(initialView.authoritativeBalanceCents).toBe(125_500);
    expect(initialView.readyToAssignCents).toBe(125_500);

    const importResult = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      new Date('2026-06-25T10:31:00.000Z')
    );

    const importedView = importResult.budgetView;
    expect(importedView.authoritativeBalanceCents).toBe(452_755);
    expect(importedView.readyToAssignCents).toBe(125_500);
    const expectedOccurredAt = new Date(2026, 5, 30, 3, 24, 4, 0).toISOString();
    expect(importResult.parseResult?.status).toBe('parsed');
    expect(importResult.transaction?.status).toBe('needs_review');
    expect(importResult.importOutcome).toMatchObject({
      kind: 'needs_review',
      reason: 'parsed_ok',
      candidateTransactionId: importResult.transaction?.id,
    });

    const inboxTransactions = await store.getInboxTransactions();
    expect(inboxTransactions).toHaveLength(1);
    expect(inboxTransactions[0]).toMatchObject({
      source: 'sms',
      kind: 'outflow',
      status: 'needs_review',
      amountCents: -156_880,
      occurredAt: expectedOccurredAt,
      categoryId: null,
      balanceAfterCents: 452_755,
      payee: null,
    });

    const allTransactions = await store.getTransactions();
    expect(allTransactions).toHaveLength(2);

    const rawSmsMessages = await store.getRawSmsMessages();
    expect(rawSmsMessages).toHaveLength(1);
    expect(rawSmsMessages[0]).toMatchObject({
      sender: 'BANK',
      body: [
        'Datum: 30.06.2026, Vreme: 03:24:04',
        'Tekuci racun: 93005***84',
        'Odliv: 1.568,80 RSD',
        'Raspoloziva sredstva: 4.527,55 RSD',
        'Vasa OTP banka',
      ].join('\n'),
      receivedAt: '2026-06-25T10:31:00.000Z',
    });

    const parseResults = await store.getSmsParseResults();
    expect(parseResults).toHaveLength(1);
    expect(parseResults[0]).toMatchObject({
      rawSmsMessageId: rawSmsMessages[0].id,
      parserId: 'debug-bank-sms',
      parserVersion: 1,
      status: 'parsed',
      transactionId: inboxTransactions[0].id,
      kind: 'outflow',
      amountCents: -156_880,
      occurredAt: expectedOccurredAt,
      balanceAfterCents: 452_755,
      payee: null,
    });

    const importOutcomes = await store.getImportOutcomes();
    expect(importOutcomes).toHaveLength(1);
    expect(importOutcomes[0]).toMatchObject({
      rawSmsMessageId: rawSmsMessages[0].id,
      parseResultId: parseResults[0].id,
      kind: 'needs_review',
      candidateTransactionId: inboxTransactions[0].id,
      reason: 'parsed_ok',
    });
  });

  it('persists raw SMS and an unparseable parse result when parsing throws', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const importResult = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 31.02.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      new Date('2026-06-25T10:31:00.000Z')
    );

    const importedView = importResult.budgetView;
    expect(importedView.authoritativeBalanceCents).toBe(125_500);
    expect(importedView.readyToAssignCents).toBe(125_500);
    expect(importResult.parseResult?.status).toBe('unparseable');
    expect(importResult.transaction).toBeNull();
    expect(importResult.importOutcome).toMatchObject({
      kind: 'manual_import',
      reason: 'unparseable',
      candidateTransactionId: null,
    });

    expect(await store.getInboxTransactions()).toEqual([]);

    const allTransactions = await store.getTransactions();
    expect(allTransactions).toHaveLength(1);

    const rawSmsMessages = await store.getRawSmsMessages();
    expect(rawSmsMessages).toHaveLength(1);
    expect(rawSmsMessages[0]).toMatchObject({
      sender: 'BANK',
      body: [
        'Datum: 31.02.2026, Vreme: 03:24:04',
        'Tekuci racun: 93005***84',
        'Odliv: 1.568,80 RSD',
        'Raspoloziva sredstva: 4.527,55 RSD',
        'Vasa OTP banka',
      ].join('\n'),
    });

    const parseResults = await store.getSmsParseResults();
    expect(parseResults).toHaveLength(1);
    expect(parseResults[0]).toMatchObject({
      rawSmsMessageId: rawSmsMessages[0].id,
      parserId: 'debug-bank-sms',
      parserVersion: 1,
      status: 'unparseable',
      transactionId: null,
      kind: null,
      amountCents: null,
      occurredAt: null,
      balanceAfterCents: null,
    });
    expect(parseResults[0].memo).toMatch(/invalid occurred-at timestamp/i);

    const importOutcomes = await store.getImportOutcomes();
    expect(importOutcomes).toHaveLength(1);
    expect(importOutcomes[0]).toMatchObject({
      rawSmsMessageId: rawSmsMessages[0].id,
      parseResultId: parseResults[0].id,
      kind: 'manual_import',
      candidateTransactionId: null,
      reason: 'unparseable',
    });
  });

  it('approves imported outflows into the transaction month instead of the review month', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 500_000,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );
    const groceriesCategoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId: groceriesCategoryId,
        amountCents: 200_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const importResult = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-07-02T09:00:00.000Z',
      },
      new Date('2026-07-02T09:00:00.000Z')
    );

    const approvedView = await store.approveImportedTransaction(
      {
        transactionId: importResult.transaction?.id ?? 'missing',
        categoryId: groceriesCategoryId,
      },
      new Date('2026-07-02T09:30:00.000Z')
    );

    expect(approvedView.authoritativeBalanceCents).toBe(452_755);

    const juneView = await store.getCurrentBudgetView(new Date('2026-06-30T12:00:00.000Z'));
    const julyView = await store.getCurrentBudgetView(new Date('2026-07-02T12:00:00.000Z'));

    expect(juneView?.categoryGroups[0].categories[0]).toMatchObject({
      assignedCents: 200_000,
      activityCents: -156_880,
      availableCents: 43_120,
    });
    expect(julyView?.categoryGroups[0].categories[0]).toMatchObject({
      assignedCents: 0,
      activityCents: 0,
      availableCents: 43_120,
    });
  });

  it('approves imported inflows as categoryless cash for the transaction month', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 100_000,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const importResult = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Priliv: 5.825,00 RSD',
          'Raspoloziva sredstva: 1.058,25 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-07-02T09:00:00.000Z',
      },
      new Date('2026-07-02T09:00:00.000Z')
    );

    const approvedView = await store.approveImportedTransaction(
      {
        transactionId: importResult.transaction?.id ?? 'missing',
        categoryId: null,
      },
      new Date('2026-07-02T09:30:00.000Z')
    );

    expect(approvedView.authoritativeBalanceCents).toBe(105_825);

    const juneView = await store.getCurrentBudgetView(new Date('2026-06-30T12:00:00.000Z'));
    const julyView = await store.getCurrentBudgetView(new Date('2026-07-02T12:00:00.000Z'));

    expect(juneView?.readyToAssignCents).toBe(682_500);
    expect(julyView?.readyToAssignCents).toBe(682_500);

    const transactions = await store.getTransactions();
    expect(transactions[0]).toMatchObject({
      id: importResult.transaction?.id,
      kind: 'inflow',
      status: 'approved',
      categoryId: null,
      amountCents: 582_500,
    });
  });

  it('ignores imported candidates and removes their balance evidence from the authoritative header', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const importResult = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      new Date('2026-06-25T10:31:00.000Z')
    );

    expect(importResult.budgetView.authoritativeBalanceCents).toBe(452_755);

    const ignoredView = await store.ignoreImportedTransaction(
      {
        transactionId: importResult.transaction?.id ?? 'missing',
      },
      new Date('2026-06-25T11:00:00.000Z')
    );

    expect(ignoredView.authoritativeBalanceCents).toBe(125_500);
    expect(ignoredView.readyToAssignCents).toBe(125_500);
    await expect(store.getInboxTransactions()).resolves.toEqual([]);
  });

  it('allows approving the original SMS candidate but blocks approving its duplicate afterward', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 500_000,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );
    const groceriesCategoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId: groceriesCategoryId,
        amountCents: 400_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      new Date('2026-06-25T10:31:00.000Z')
    );

    const duplicateImport = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:32:00.000Z',
      },
      new Date('2026-06-25T10:32:00.000Z')
    );

    expect(duplicateImport.importOutcome.kind).toBe('possible_duplicate');

    const originalTransactions = await store.getInboxTransactions();
    const originalTransaction = originalTransactions.find(
      (transaction) => transaction.id !== duplicateImport.transaction?.id
    );

    await store.approveImportedTransaction(
      {
        transactionId: originalTransaction?.id ?? 'missing',
        categoryId: groceriesCategoryId,
      },
      new Date('2026-06-25T10:33:00.000Z')
    );

    await expect(
      store.approveImportedTransaction(
        {
          transactionId: duplicateImport.transaction?.id ?? 'missing',
          categoryId: groceriesCategoryId,
        },
        new Date('2026-06-25T10:34:00.000Z')
      )
    ).rejects.toThrow(/already approved SMS import/);

    const transactions = await store.getTransactions();
    const approvedOriginal = transactions.find((transaction) => transaction.id === originalTransaction?.id);
    const duplicateTransaction = transactions.find(
      (transaction) => transaction.id === duplicateImport.transaction?.id
    );

    expect(approvedOriginal).toMatchObject({
      status: 'approved',
      categoryId: groceriesCategoryId,
    });
    expect(duplicateTransaction).toMatchObject({
      status: 'needs_review',
      categoryId: null,
    });

    const juneView = await store.getCurrentBudgetView(new Date('2026-06-30T12:00:00.000Z'));
    expect(juneView?.categoryGroups[0].categories[0]).toMatchObject({
      activityCents: -156_880,
      availableCents: 243_120,
    });
  });

  it('also blocks approving the original later when the duplicate was approved first', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 500_000,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );
    const groceriesCategoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId: groceriesCategoryId,
        amountCents: 400_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const originalImport = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:31:00.000Z',
      },
      new Date('2026-06-25T10:31:00.000Z')
    );

    const duplicateImport = await store.importDebugSms(
      {
        sender: 'BANK',
        body: [
          'Datum: 30.06.2026, Vreme: 03:24:04',
          'Tekuci racun: 93005***84',
          'Odliv: 1.568,80 RSD',
          'Raspoloziva sredstva: 4.527,55 RSD',
          'Vasa OTP banka',
        ].join('\n'),
        receivedAt: '2026-06-25T10:32:00.000Z',
      },
      new Date('2026-06-25T10:32:00.000Z')
    );

    await store.approveImportedTransaction(
      {
        transactionId: duplicateImport.transaction?.id ?? 'missing',
        categoryId: groceriesCategoryId,
      },
      new Date('2026-06-25T10:33:00.000Z')
    );

    await expect(
      store.approveImportedTransaction(
        {
          transactionId: originalImport.transaction?.id ?? 'missing',
          categoryId: groceriesCategoryId,
        },
        new Date('2026-06-25T10:34:00.000Z')
      )
    ).rejects.toThrow(/already approved SMS import/);

    const transactions = await store.getTransactions();
    const approvedDuplicate = transactions.find(
      (transaction) => transaction.id === duplicateImport.transaction?.id
    );
    const originalTransaction = transactions.find(
      (transaction) => transaction.id === originalImport.transaction?.id
    );

    expect(approvedDuplicate).toMatchObject({
      status: 'approved',
      categoryId: groceriesCategoryId,
    });
    expect(originalTransaction).toMatchObject({
      status: 'needs_review',
      categoryId: null,
    });
  });

  it('rejects invalid approved manual transaction category invariants', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;

    await expect(
      store.createManualTransaction(
        {
          kind: 'outflow',
          amountCents: 10_000,
          occurredAt: '2026-06-25T09:00:00.000Z',
          categoryId: null,
          payee: 'Landlord',
          memo: null,
        },
        new Date('2026-06-26T10:00:00.000Z')
      )
    ).rejects.toThrow(/require a category/);

    await expect(
      store.createManualTransaction(
        {
          kind: 'inflow',
          amountCents: 10_000,
          occurredAt: '2026-06-25T09:00:00.000Z',
          categoryId: rentCategoryId,
          payee: 'Refund',
          memo: null,
        },
        new Date('2026-06-26T10:00:00.000Z')
      )
    ).rejects.toThrow(/must not have a category/);
  });

  it('edits manual transactions and applies month math using occurred at', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 100_000,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-05-01T09:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId: rentCategoryId,
        amountCents: 50_000,
      },
      new Date('2026-05-10T09:00:00.000Z')
    );

    await store.createManualTransaction(
      {
        kind: 'outflow',
        amountCents: 20_000,
        occurredAt: '2026-06-20T09:00:00.000Z',
        categoryId: rentCategoryId,
        payee: 'Landlord',
        memo: null,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const createdTransaction = (await store.getTransactions())[0];

    await store.updateManualTransaction(
      {
        transactionId: createdTransaction.id,
        kind: 'outflow',
        amountCents: 20_000,
        occurredAt: '2026-05-20T09:00:00.000Z',
        categoryId: rentCategoryId,
        payee: 'Landlord',
        memo: 'Backdated correction',
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const mayView = await store.getCurrentBudgetView(new Date('2026-05-24T10:00:00.000Z'));
    const juneView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));

    expect(mayView?.categoryGroups[0].categories[0]).toMatchObject({
      activityCents: -20_000,
      availableCents: 30_000,
    });
    expect(juneView?.categoryGroups[0].categories[0]).toMatchObject({
      activityCents: 0,
      availableCents: 30_000,
    });

    const transactions = await store.getTransactions();
    expect(transactions[0]).toMatchObject({
      id: createdTransaction.id,
      occurredAt: '2026-05-20T09:00:00.000Z',
      memo: 'Backdated correction',
    });
  });

  it('rejects invalid currency codes during onboarding', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(
      store.completeOnboarding({
        accountName: 'Main account',
        currencyCode: 'TEST',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      })
    ).rejects.toThrow(/valid 3-letter ISO code/);
  });

  it('rejects assigning money before onboarding exists', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await expect(
      store.assignMoneyToCategory(
        {
          categoryId: 'category-1',
          amountCents: 1_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/Complete onboarding/);
  });

  it('rejects zero or fractional cent assignment amounts', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const categoryId = initialView.categoryGroups[0].categories[0].id;

    await expect(
      store.assignMoneyToCategory(
        {
          categoryId,
          amountCents: 0,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/non-zero whole number of cents/);

    await expect(
      store.assignMoneyToCategory(
        {
          categoryId,
          amountCents: 10.5,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/non-zero whole number of cents/);
  });

  it('rejects assigning money into an unknown category', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());

    await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    await expect(
      store.assignMoneyToCategory(
        {
          categoryId: 'missing-category',
          amountCents: 1_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/Category does not exist/);
  });

  it('allows negative ready to assign when the current month is over-assigned', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const assignedView = await store.assignMoneyToCategory(
      {
        categoryId: initialView.categoryGroups[0].categories[0].id,
        amountCents: 130_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(assignedView.readyToAssignCents).toBe(-4_500);
    expect(assignedView.categoryGroups[0].categories[0].assignedCents).toBe(130_000);
    expect(assignedView.categoryGroups[0].categories[0].availableCents).toBe(130_000);
  });

  it('preserves both assignment events when two assign actions overlap', async () => {
    const store = createBudgetStore(createDelayedWriteBudgetStorage());
    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;
    const groceriesCategoryId = initialView.categoryGroups[0].categories[1].id;

    await Promise.all([
      store.assignMoneyToCategory(
        {
          categoryId: rentCategoryId,
          amountCents: 30_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      ),
      store.assignMoneyToCategory(
        {
          categoryId: groceriesCategoryId,
          amountCents: 20_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      ),
    ]);

    const reloadedView = await store.getCurrentBudgetView(new Date('2026-06-24T10:00:00.000Z'));

    expect(reloadedView?.readyToAssignCents).toBe(75_500);
    expect(reloadedView?.categoryGroups).toEqual([
      {
        id: expect.any(String),
        name: 'Essentials',
        categories: [
          {
            id: expect.any(String),
            name: 'Rent',
            assignedCents: 30_000,
            activityCents: 0,
            availableCents: 30_000,
          },
          {
            id: expect.any(String),
            name: 'Groceries',
            assignedCents: 20_000,
            activityCents: 0,
            availableCents: 20_000,
          },
        ],
      },
    ]);
  });

  it('rejects moving money to the same category', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const categoryId = initialView.categoryGroups[0].categories[0].id;

    await store.assignMoneyToCategory(
      {
        categoryId,
        amountCents: 10_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    await expect(
      store.moveMoneyBetweenCategories(
        {
          fromCategoryId: categoryId,
          toCategoryId: categoryId,
          amountCents: 1_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/different categories/);
  });

  it('rejects moving more money than the source category currently has available', async () => {
    const store = createBudgetStore(createMemoryBudgetStorage());
    const initialView = await store.completeOnboarding(
      {
        accountName: 'Main account',
        currencyCode: 'RSD',
        startingBalanceCents: 125_500,
        categoryGroups: [
          {
            name: 'Essentials',
            categories: ['Rent', 'Groceries'],
          },
        ],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    const rentCategoryId = initialView.categoryGroups[0].categories[0].id;
    const groceriesCategoryId = initialView.categoryGroups[0].categories[1].id;

    await store.assignMoneyToCategory(
      {
        categoryId: rentCategoryId,
        amountCents: 10_000,
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    await expect(
      store.moveMoneyBetweenCategories(
        {
          fromCategoryId: rentCategoryId,
          toCategoryId: groceriesCategoryId,
          amountCents: 20_000,
        },
        new Date('2026-06-24T10:00:00.000Z')
      )
    ).rejects.toThrow(/available/);
  });
});

describe('budget engine month math', () => {
  it('carries unassigned cash into later months', () => {
    const view = deriveBudgetView(
      {
        account: {
          id: 'account-1',
          name: 'Main account',
          currencyCode: 'RSD',
          createdAt: '2026-05-31T09:00:00.000Z',
        },
        categoryGroups: [
          {
            id: 'group-1',
            name: 'Essentials',
            sortOrder: 0,
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        categories: [
          {
            id: 'category-1',
            groupId: 'group-1',
            name: 'Rent',
            sortOrder: 0,
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        transactions: [
          {
            id: 'txn-1',
            accountId: 'account-1',
            source: 'starting_balance',
            kind: 'inflow',
            status: 'approved',
            amountCents: 90_000,
            occurredAt: '2026-05-31T09:00:00.000Z',
            categoryId: null,
            balanceAfterCents: 90_000,
            payee: null,
            memo: 'Starting balance',
            createdAt: '2026-05-31T09:00:00.000Z',
          },
        ],
        assignmentEvents: [],
        rawSmsMessages: [],
        smsParseResults: [],
        importOutcomes: [],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(view.readyToAssignCents).toBe(90_000);
    expect(view.authoritativeBalanceCents).toBe(90_000);
    expect(view.monthKey).toBe('2026-06');
  });

  it('reduces next month ready to assign by prior-month overspending', () => {
    const view = deriveBudgetView(
      {
        account: {
          id: 'account-1',
          name: 'Main account',
          currencyCode: 'RSD',
          createdAt: '2026-05-01T09:00:00.000Z',
        },
        categoryGroups: [
          {
            id: 'group-1',
            name: 'Essentials',
            sortOrder: 0,
            createdAt: '2026-05-01T09:00:00.000Z',
          },
        ],
        categories: [
          {
            id: 'category-1',
            groupId: 'group-1',
            name: 'Rent',
            sortOrder: 0,
            createdAt: '2026-05-01T09:00:00.000Z',
          },
        ],
        transactions: [
          {
            id: 'txn-1',
            accountId: 'account-1',
            source: 'starting_balance',
            kind: 'inflow',
            status: 'approved',
            amountCents: 100_000,
            occurredAt: '2026-05-01T09:00:00.000Z',
            categoryId: null,
            balanceAfterCents: 100_000,
            payee: null,
            memo: 'Starting balance',
            createdAt: '2026-05-01T09:00:00.000Z',
          },
          {
            id: 'txn-2',
            accountId: 'account-1',
            source: 'manual',
            kind: 'outflow',
            status: 'approved',
            amountCents: -90_000,
            occurredAt: '2026-05-20T09:00:00.000Z',
            categoryId: 'category-1',
            balanceAfterCents: 10_000,
            payee: 'Landlord',
            memo: null,
            createdAt: '2026-05-20T09:00:00.000Z',
          },
        ],
        assignmentEvents: [
          {
            id: 'assignment-1',
            categoryId: 'category-1',
            monthKey: '2026-05',
            amountCents: 70_000,
            createdAt: '2026-05-10T09:00:00.000Z',
          },
        ],
        rawSmsMessages: [],
        smsParseResults: [],
        importOutcomes: [],
      },
      new Date('2026-06-24T10:00:00.000Z')
    );

    expect(view.readyToAssignCents).toBe(10_000);
    expect(view.categoryGroups[0].categories[0].availableCents).toBe(0);
    expect(view.authoritativeBalanceCents).toBe(10_000);
  });

  it('uses created-at as a stable tiebreaker for equal occurred-at authoritative balances', () => {
    const view = deriveBudgetView(
      {
        account: {
          id: 'account-1',
          name: 'Main account',
          currencyCode: 'RSD',
          createdAt: '2026-06-01T09:00:00.000Z',
        },
        categoryGroups: [],
        categories: [],
        transactions: [
          {
            id: 'txn-1',
            accountId: 'account-1',
            source: 'manual',
            kind: 'inflow',
            status: 'approved',
            amountCents: 100_000,
            occurredAt: '2026-06-25T10:30:00.000Z',
            categoryId: null,
            balanceAfterCents: 100_000,
            payee: null,
            memo: null,
            createdAt: '2026-06-25T10:31:00.000Z',
          },
          {
            id: 'txn-2',
            accountId: 'account-1',
            source: 'sms',
            kind: 'inflow',
            status: 'needs_review',
            amountCents: 200_000,
            occurredAt: '2026-06-25T10:30:00.000Z',
            categoryId: null,
            balanceAfterCents: 200_000,
            payee: 'Employer',
            memo: null,
            createdAt: '2026-06-25T10:32:00.000Z',
          },
        ],
        assignmentEvents: [],
        rawSmsMessages: [],
        smsParseResults: [],
        importOutcomes: [],
      },
      new Date('2026-06-25T12:00:00.000Z')
    );

    expect(view.authoritativeBalanceCents).toBe(200_000);
  });
});

function createDelayedWriteBudgetStorage(): BudgetStorage {
  const storage = createMemoryBudgetStorage();

  return {
    async readSnapshot() {
      return storage.readSnapshot();
    },

    async replaceSnapshot(snapshot) {
      await Promise.resolve();
      await storage.replaceSnapshot(snapshot);
    },

    async appendAssignmentEvents(events) {
      await Promise.resolve();
      await storage.appendAssignmentEvents(events);
    },

    async appendTransaction(transaction) {
      await Promise.resolve();
      await storage.appendTransaction(transaction);
    },

    async updateTransaction(transaction) {
      await Promise.resolve();
      await storage.updateTransaction(transaction);
    },

    async appendImportedSmsFacts(facts) {
      await Promise.resolve();
      await storage.appendImportedSmsFacts(facts);
    },
  };
}
