import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { budgetStore } from '@/src/features/budget/app-store';
import { toLocalDateKey, toMonthKey } from '@/src/features/budget/budget-engine';
import { formatCurrency, parseDecimalMoneyToCents } from '@/src/features/budget/money';
import type { BudgetView, CanonicalTransaction, ImportOutcome } from '@/src/features/budget/types';
import { router, Stack } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_OPTIONS = {
  title: 'Transactions',
  headerShown: false,
};

type TransactionKindDraft = 'inflow' | 'outflow';

type TransactionDraft = {
  transactionId: string | null;
  kind: TransactionKindDraft;
  amount: string;
  occurredOn: string;
  categoryId: string | null;
  payee: string;
  memo: string;
};

type CategoryOption = {
  id: string;
  label: string;
};

export default function TransactionsScreen() {
  const [budgetView, setBudgetView] = React.useState<BudgetView | null>(null);
  const [transactions, setTransactions] = React.useState<CanonicalTransaction[]>([]);
  const [inboxTransactions, setInboxTransactions] = React.useState<CanonicalTransaction[]>([]);
  const [importOutcomes, setImportOutcomes] = React.useState<ImportOutcome[]>([]);
  const [draft, setDraft] = React.useState<TransactionDraft>(() => createEmptyDraft());
  const [debugSmsSender, setDebugSmsSender] = React.useState('BANK');
  const [debugSmsBody, setDebugSmsBody] = React.useState(createSampleDebugSmsBody);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isImportingSms, setIsImportingSms] = React.useState(false);
  const [reviewingTransactionId, setReviewingTransactionId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [smsImportError, setSmsImportError] = React.useState<string | null>(null);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [reviewCategoryIds, setReviewCategoryIds] = React.useState<Record<string, string | null>>({});

  const categoryOptions = React.useMemo<CategoryOption[]>(() => {
    if (!budgetView) {
      return [];
    }

    return budgetView.categoryGroups.flatMap((group) =>
      group.categories.map((category) => ({
        id: category.id,
        label: `${group.name} / ${category.name}`,
      }))
    );
  }, [budgetView]);

  const manualTransactions = React.useMemo(
    () => transactions.filter((transaction) => transaction.source === 'manual'),
    [transactions]
  );

  const importOutcomeByTransactionId = React.useMemo(() => {
    return new Map(
      importOutcomes
        .filter((outcome) => outcome.candidateTransactionId !== null)
        .map((outcome) => [outcome.candidateTransactionId as string, outcome])
    );
  }, [importOutcomes]);

  const needsReviewTransactions = React.useMemo(
    () =>
      inboxTransactions.filter((transaction) => {
        const outcome = importOutcomeByTransactionId.get(transaction.id);
        return outcome?.kind !== 'possible_duplicate';
      }),
    [importOutcomeByTransactionId, inboxTransactions]
  );

  const duplicateTransactions = React.useMemo(
    () =>
      inboxTransactions.filter((transaction) => {
        const outcome = importOutcomeByTransactionId.get(transaction.id);
        return outcome?.kind === 'possible_duplicate';
      }),
    [importOutcomeByTransactionId, inboxTransactions]
  );

  const manualImportOutcomes = React.useMemo(
    () => importOutcomes.filter((outcome) => outcome.kind === 'manual_import'),
    [importOutcomes]
  );

  React.useEffect(() => {
    void loadScreenData();
  }, []);

  React.useEffect(() => {
    if (draft.kind === 'inflow' && draft.categoryId !== null) {
      setDraft((current) => ({
        ...current,
        categoryId: null,
      }));
    }
  }, [draft.kind, draft.categoryId]);

  React.useEffect(() => {
    if (draft.kind === 'outflow' && !draft.categoryId && categoryOptions[0]) {
      setDraft((current) => ({
        ...current,
        categoryId: current.categoryId ?? categoryOptions[0].id,
      }));
    }
  }, [categoryOptions, draft.kind, draft.categoryId]);

  async function loadScreenData() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [nextBudgetView, nextTransactions, nextInboxTransactions, nextImportOutcomes] = await Promise.all([
        budgetStore.getCurrentBudgetView(new Date()),
        budgetStore.getTransactions(),
        budgetStore.getInboxTransactions(),
        budgetStore.getImportOutcomes(),
      ]);

      setBudgetView(nextBudgetView);
      setTransactions(nextTransactions);
      setInboxTransactions(nextInboxTransactions);
      setImportOutcomes(nextImportOutcomes);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshImportedWorkflowState(nextBudgetView: BudgetView) {
    const [nextTransactions, nextInboxTransactions, nextImportOutcomes] = await Promise.all([
      budgetStore.getTransactions(),
      budgetStore.getInboxTransactions(),
      budgetStore.getImportOutcomes(),
    ]);

    setBudgetView(nextBudgetView);
    setTransactions(nextTransactions);
    setInboxTransactions(nextInboxTransactions);
    setImportOutcomes(nextImportOutcomes);
  }

  async function handleSubmit() {
    setIsSaving(true);
    setSaveError(null);

    try {
      const amountCents = parsePositiveMoneyToCents(draft.amount, 'Transaction amount');
      const occurredAt = parseDateInputToIso(draft.occurredOn);
      const input = {
        kind: draft.kind,
        amountCents,
        occurredAt,
        categoryId: draft.kind === 'outflow' ? draft.categoryId : null,
        payee: draft.payee,
        memo: draft.memo,
      } as const;

      const nextBudgetView = draft.transactionId
        ? await budgetStore.updateManualTransaction(
            {
              transactionId: draft.transactionId,
              ...input,
            },
            new Date()
          )
        : await budgetStore.createManualTransaction(input, new Date());

      const nextTransactions = await budgetStore.getTransactions();
      setBudgetView(nextBudgetView);
      setTransactions(nextTransactions);
      setDraft(createEmptyDraft());
    } catch (error) {
      const message = getErrorMessage(error);
      setSaveError(message);
      Alert.alert(draft.transactionId ? 'Could not update transaction' : 'Could not save transaction', message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImportDebugSms() {
    setIsImportingSms(true);
    setSmsImportError(null);
    setReviewError(null);

    try {
      const importResult = await budgetStore.importDebugSms(
        {
          sender: debugSmsSender,
          body: debugSmsBody,
          receivedAt: new Date().toISOString(),
        },
        new Date()
      );
      await refreshImportedWorkflowState(importResult.budgetView);

      if (importResult.importOutcome.kind === 'ignored') {
        const message =
          importResult.importOutcome.reason === 'sender_not_allowed'
            ? 'SMS sender is not on the allowlist.'
            : 'SMS happened before tracking started and was ignored.';
        setSmsImportError(message);
        Alert.alert('SMS ignored', message);
        return;
      }

      if (importResult.importOutcome.kind === 'manual_import') {
        const message = importResult.parseResult?.memo ?? 'SMS was saved, but parsing failed.';
        setSmsImportError(message);
        Alert.alert('SMS saved but not parsed', message);
        return;
      }

      if (importResult.importOutcome.kind === 'possible_duplicate') {
        Alert.alert(
          'SMS flagged as possible duplicate',
          'The SMS was imported as a review candidate and flagged as a possible duplicate.'
        );
      }

      setDebugSmsBody(createSampleDebugSmsBody());
    } catch (error) {
      const message = getErrorMessage(error);
      setSmsImportError(message);
      Alert.alert('Could not import debug SMS', message);
    } finally {
      setIsImportingSms(false);
    }
  }

  async function handleApproveImportedTransaction(transaction: CanonicalTransaction) {
    setReviewingTransactionId(transaction.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      const categoryId =
        transaction.kind === 'outflow'
          ? reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null
          : null;
      const nextBudgetView = await budgetStore.approveImportedTransaction(
        {
          transactionId: transaction.id,
          categoryId,
        },
        new Date()
      );

      await refreshImportedWorkflowState(nextBudgetView);
      setReviewCategoryIds((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setReviewError(message);
      Alert.alert('Could not approve transaction', message);
    } finally {
      setReviewingTransactionId(null);
    }
  }

  async function handleIgnoreImportedTransaction(transaction: CanonicalTransaction) {
    setReviewingTransactionId(transaction.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      const nextBudgetView = await budgetStore.ignoreImportedTransaction(
        {
          transactionId: transaction.id,
        },
        new Date()
      );

      await refreshImportedWorkflowState(nextBudgetView);
      setReviewCategoryIds((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setReviewError(message);
      Alert.alert('Could not ignore transaction', message);
    } finally {
      setReviewingTransactionId(null);
    }
  }

  function startEditing(transaction: CanonicalTransaction) {
    setSaveError(null);
    setDraft({
      transactionId: transaction.id,
      kind: transaction.kind,
      amount: centsToDecimalString(Math.abs(transaction.amountCents)),
      occurredOn: toLocalDateKey(transaction.occurredAt),
      categoryId: transaction.categoryId,
      payee: transaction.payee ?? '',
      memo: transaction.memo ?? '',
    });
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={SCREEN_OPTIONS} />
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator />
            <Text className="text-muted-foreground">Loading transactions…</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Stack.Screen options={SCREEN_OPTIONS} />
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-1 justify-center gap-4 px-5">
            <View className="gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <Text className="font-semibold text-destructive">Could not load transactions</Text>
              <Text className="text-destructive">{loadError}</Text>
            </View>
            <Button onPress={() => void loadScreenData()}>
              <Text>Retry loading</Text>
            </Button>
            <Button variant="outline" onPress={() => router.replace('/')}>
              <Text>Back to budget</Text>
            </Button>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!budgetView) {
    return (
      <>
        <Stack.Screen options={SCREEN_OPTIONS} />
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-1 justify-center gap-4 px-5">
            <View className="gap-2 rounded-2xl border border-border bg-card p-4">
              <Text variant="large">No budget yet</Text>
              <Text className="text-muted-foreground">
                Finish onboarding on the budget screen before adding manual transactions.
              </Text>
            </View>
            <Button onPress={() => router.replace('/')}>
              <Text>Go to budget</Text>
            </Button>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <SafeAreaView className="flex-1 bg-background">
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 py-6">
          <View className="flex-row items-start justify-between gap-3">
            <View className="gap-1">
              <Text variant="h3">Transactions</Text>
              <Text className="text-muted-foreground">
                Manual ledger for <Text variant="code">{budgetView.monthKey}</Text>
              </Text>
            </View>
            <Button size="sm" variant="outline" onPress={() => router.replace('/')}>
              <Text>Budget</Text>
            </Button>
          </View>

          <View className="gap-3">
            <BudgetStatCard
              label="Ready to assign"
              value={formatCurrency(budgetView.readyToAssignCents, budgetView.currencyCode)}
              helper="Approved inflows land here until you assign them."
              valueClassName={budgetView.readyToAssignCents < 0 ? 'text-destructive' : undefined}
            />
            <BudgetStatCard
              label="Authoritative balance"
              value={formatCurrency(budgetView.authoritativeBalanceCents, budgetView.currencyCode)}
              helper="Newest parsed bank balance can move ahead of approval and budgeting."
            />
          </View>

          <View className="gap-4 rounded-2xl border border-border bg-card p-4">
            <View className="gap-1">
              <Text variant="large">Debug SMS import</Text>
              <Text className="text-sm text-muted-foreground">
                Paste a sample bank SMS and run it through the real import pipeline.
              </Text>
            </View>

            <FormField
              label="Sender"
              value={debugSmsSender}
              onChangeText={setDebugSmsSender}
              placeholder="BANK"
              autoCapitalize="characters"
            />

            <View className="gap-2">
              <Text className="text-sm font-medium">SMS body</Text>
              <TextInput
                className="min-h-32 rounded-xl border border-border bg-background px-4 py-3 text-foreground"
                value={debugSmsBody}
                onChangeText={setDebugSmsBody}
                placeholder={[
                  'Datum: 30.06.2026, Vreme: 03:24:04',
                  'Tekuci racun: 93005***84',
                  'Odliv: 1.568,80 RSD',
                  'Raspoloziva sredstva: 4.527,55 RSD',
                  'Vasa OTP banka',
                ].join('\n')}
                placeholderTextColor="#71717a"
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
              />
            </View>

            <View className="rounded-xl bg-muted/40 p-3">
              <Text className="text-sm text-muted-foreground">
                Supported sample: OTP banka multiline `Priliv` / `Odliv` SMS with `Datum`, `Vreme`, and
                `Raspoloziva sredstva`.
              </Text>
            </View>

            {smsImportError ? (
              <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                <Text className="text-destructive">{smsImportError}</Text>
              </View>
            ) : null}

            <Button onPress={() => void handleImportDebugSms()} disabled={isImportingSms}>
              <Text>{isImportingSms ? 'Importing SMS…' : 'Import debug SMS'}</Text>
            </Button>
          </View>

          <View className="gap-4 rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="large">{draft.transactionId ? 'Edit transaction' : 'Add transaction'}</Text>
              {draft.transactionId ? (
                <Button size="sm" variant="ghost" onPress={() => setDraft(createEmptyDraft())}>
                  <Text>Cancel</Text>
                </Button>
              ) : null}
            </View>

            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant={draft.kind === 'outflow' ? 'secondary' : 'outline'}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    kind: 'outflow',
                    categoryId: current.categoryId ?? categoryOptions[0]?.id ?? null,
                  }))
                }>
                <Text>Outflow</Text>
              </Button>
              <Button
                size="sm"
                variant={draft.kind === 'inflow' ? 'secondary' : 'outline'}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    kind: 'inflow',
                    categoryId: null,
                  }))
                }>
                <Text>Inflow</Text>
              </Button>
            </View>

            <FormField
              label="Amount"
              value={draft.amount}
              onChangeText={(value) => setDraft((current) => ({ ...current, amount: value }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <FormField
              label="Occurred on"
              value={draft.occurredOn}
              onChangeText={(value) => setDraft((current) => ({ ...current, occurredOn: value }))}
              placeholder="2026-06-30"
              autoCapitalize="none"
            />
            <FormField
              label="Payee"
              value={draft.payee}
              onChangeText={(value) => setDraft((current) => ({ ...current, payee: value }))}
              placeholder={draft.kind === 'inflow' ? 'Salary, refund…' : 'Store, landlord…'}
            />
            <FormField
              label="Memo"
              value={draft.memo}
              onChangeText={(value) => setDraft((current) => ({ ...current, memo: value }))}
              placeholder="Optional note"
            />

            {draft.kind === 'outflow' ? (
              <View className="gap-2">
                <Text className="text-sm font-medium">Category</Text>
                <View className="flex-row flex-wrap gap-2">
                  {categoryOptions.map((category) => (
                    <Button
                      key={category.id}
                      size="sm"
                      variant={draft.categoryId === category.id ? 'secondary' : 'outline'}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          categoryId: category.id,
                        }))
                      }>
                      <Text>{category.label}</Text>
                    </Button>
                  ))}
                </View>
              </View>
            ) : (
              <View className="rounded-xl bg-muted/40 p-3">
                <Text className="text-sm text-muted-foreground">
                  Approved inflows stay uncategorized and increase Ready to assign.
                </Text>
              </View>
            )}

            {saveError ? (
              <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                <Text className="text-destructive">{saveError}</Text>
              </View>
            ) : null}

            <Button onPress={() => void handleSubmit()} disabled={isSaving}>
              <Text>{isSaving ? 'Saving transaction…' : draft.transactionId ? 'Update transaction' : 'Save transaction'}</Text>
            </Button>
          </View>

          <View className="gap-3">
            {reviewError ? (
              <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                <Text className="text-destructive">{reviewError}</Text>
              </View>
            ) : null}

            <Text variant="large">Needs review</Text>
            {needsReviewTransactions.length === 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-muted-foreground">
                  No SMS candidates need review yet. Import a debug SMS above.
                </Text>
              </View>
            ) : (
              needsReviewTransactions.map((transaction) => (
                <ReviewTransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  currencyCode={budgetView.currencyCode}
                  badgeLabel="Needs review"
                  subtitle="Waiting for review"
                  helperText="This candidate updates the account header balance but does not touch category math until approval."
                  categoryOptions={categoryOptions}
                  selectedCategoryId={reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null}
                  isSubmitting={reviewingTransactionId === transaction.id}
                  onSelectCategory={(categoryId) =>
                    setReviewCategoryIds((current) => ({
                      ...current,
                      [transaction.id]: categoryId,
                    }))
                  }
                  onApprove={() => void handleApproveImportedTransaction(transaction)}
                  onIgnore={() => void handleIgnoreImportedTransaction(transaction)}
                />
              ))
            )}
          </View>

          <View className="gap-3">
            <Text variant="large">Possible duplicates</Text>
            {duplicateTransactions.length === 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-muted-foreground">
                  No duplicate-looking SMS imports right now.
                </Text>
              </View>
            ) : (
              duplicateTransactions.map((transaction) => (
                <ReviewTransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  currencyCode={budgetView.currencyCode}
                  badgeLabel="Possible duplicate"
                  subtitle="Review possible duplicate"
                  helperText="This candidate updates the account header balance but was flagged as a possible duplicate."
                  categoryOptions={categoryOptions}
                  selectedCategoryId={reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null}
                  isSubmitting={reviewingTransactionId === transaction.id}
                  onSelectCategory={(categoryId) =>
                    setReviewCategoryIds((current) => ({
                      ...current,
                      [transaction.id]: categoryId,
                    }))
                  }
                  onApprove={() => void handleApproveImportedTransaction(transaction)}
                  onIgnore={() => void handleIgnoreImportedTransaction(transaction)}
                />
              ))
            )}
          </View>

          <View className="gap-3">
            <Text variant="large">Needs manual import</Text>
            {manualImportOutcomes.length === 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-muted-foreground">
                  No unparseable SMS imports waiting for manual recovery.
                </Text>
              </View>
            ) : (
              manualImportOutcomes.map((outcome) => (
                <View key={outcome.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="font-semibold">Manual import needed</Text>
                      <Text className="text-sm text-muted-foreground">
                        Parser could not turn this SMS into a canonical transaction.
                      </Text>
                    </View>
                    <Text className="text-xs uppercase text-amber-600">Manual import</Text>
                  </View>

                  <View className="gap-1 rounded-xl bg-muted/40 p-3">
                    <Text className="text-sm text-muted-foreground">
                      Outcome reason: <Text className="font-medium text-foreground">{formatImportOutcomeReason(outcome.reason)}</Text>
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text variant="large">Manual ledger</Text>
            {manualTransactions.length === 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-muted-foreground">
                  No manual transactions yet. Add an inflow or outflow above.
                </Text>
              </View>
            ) : (
              manualTransactions.map((transaction) => {
                const categoryLabel = transaction.categoryId
                  ? categoryOptions.find((category) => category.id === transaction.categoryId)?.label ?? 'Unknown category'
                  : 'Ready to assign';

                return (
                  <View key={transaction.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="font-semibold">
                          {transaction.payee ?? (transaction.kind === 'inflow' ? 'Manual inflow' : 'Manual outflow')}
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                          {toLocalDateKey(transaction.occurredAt)} · Budget month {toMonthKey(transaction.occurredAt)}
                        </Text>
                      </View>
                      <View className="items-end gap-2">
                        <Text className={transaction.amountCents < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
                          {formatCurrency(transaction.amountCents, budgetView.currencyCode)}
                        </Text>
                        <Button size="sm" variant="outline" onPress={() => startEditing(transaction)}>
                          <Text>Edit</Text>
                        </Button>
                      </View>
                    </View>

                    <View className="gap-1 rounded-xl bg-muted/40 p-3">
                      <Text className="text-sm font-medium">{categoryLabel}</Text>
                      <Text className="text-sm text-muted-foreground">
                        {transaction.kind === 'inflow'
                          ? 'Increases Ready to assign for this transaction month.'
                          : 'Reduces category availability in this transaction month.'}
                      </Text>
                      {transaction.memo ? <Text className="text-sm text-muted-foreground">{transaction.memo}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function ReviewTransactionCard({
  transaction,
  currencyCode,
  badgeLabel,
  subtitle,
  helperText,
  categoryOptions,
  selectedCategoryId,
  isSubmitting,
  onSelectCategory,
  onApprove,
  onIgnore,
}: {
  transaction: CanonicalTransaction;
  currencyCode: string;
  badgeLabel: string;
  subtitle: string;
  helperText: string;
  categoryOptions: CategoryOption[];
  selectedCategoryId: string | null;
  isSubmitting: boolean;
  onSelectCategory: (categoryId: string) => void;
  onApprove: () => void;
  onIgnore: () => void;
}) {
  const isOutflow = transaction.kind === 'outflow';

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold">
            {transaction.payee ?? (transaction.kind === 'inflow' ? 'SMS inflow' : 'SMS outflow')}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {toLocalDateKey(transaction.occurredAt)} · {subtitle}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className={transaction.amountCents < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
            {formatCurrency(transaction.amountCents, currencyCode)}
          </Text>
          <Text className="text-xs uppercase text-amber-600">{badgeLabel}</Text>
        </View>
      </View>

      <View className="gap-1 rounded-xl bg-muted/40 p-3">
        <Text className="text-sm text-muted-foreground">
          Balance after import:{' '}
          <Text className="font-medium text-foreground">
            {transaction.balanceAfterCents === null ? 'Unknown' : formatCurrency(transaction.balanceAfterCents, currencyCode)}
          </Text>
        </Text>
        <Text className="text-sm text-muted-foreground">{helperText}</Text>
        {transaction.memo ? <Text className="text-sm text-muted-foreground">{transaction.memo}</Text> : null}
      </View>

      {isOutflow ? (
        <View className="gap-2">
          <Text className="text-sm font-medium">Approval category</Text>
          <View className="flex-row flex-wrap gap-2">
            {categoryOptions.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={selectedCategoryId === category.id ? 'secondary' : 'outline'}
                onPress={() => onSelectCategory(category.id)}
                disabled={isSubmitting}>
                <Text>{category.label}</Text>
              </Button>
            ))}
          </View>
        </View>
      ) : (
        <View className="rounded-xl bg-muted/40 p-3">
          <Text className="text-sm text-muted-foreground">
            Approving this inflow keeps it uncategorized and increases Ready to assign.
          </Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button variant="outline" onPress={onIgnore} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Working…' : 'Ignore'}</Text>
        </Button>
        <Button onPress={onApprove} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Working…' : 'Approve'}</Text>
        </Button>
      </View>
    </View>
  );
}

function BudgetStatCard({
  label,
  value,
  helper,
  valueClassName,
}: {
  label: string;
  value: string;
  helper: string;
  valueClassName?: string;
}) {
  return (
    <View className="gap-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className={`text-3xl font-bold ${valueClassName ?? ''}`.trim()}>{value}</Text>
      <Text className="text-sm text-muted-foreground">{helper}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{label}</Text>
      <TextInput
        className="rounded-xl border border-border bg-background px-4 py-3 text-foreground"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function createEmptyDraft(): TransactionDraft {
  return {
    transactionId: null,
    kind: 'outflow',
    amount: '',
    occurredOn: toLocalDateKey(new Date()),
    categoryId: null,
    payee: '',
    memo: '',
  };
}

function createSampleDebugSmsBody() {
  return [
    'Datum: 30.06.2026, Vreme: 03:24:04',
    'Tekuci racun: 93005***84',
    'Odliv: 1.568,80 RSD',
    'Raspoloziva sredstva: 4.527,55 RSD',
    'Vasa OTP banka',
  ].join('\n');
}

function centsToDecimalString(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function parsePositiveMoneyToCents(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }

  let amountCents = 0;

  try {
    amountCents = parseDecimalMoneyToCents(value);
  } catch {
    throw new Error(`${label} must be a valid amount.`);
  }

  if (amountCents <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return amountCents;
}

function parseDateInputToIso(value: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Transaction date must use YYYY-MM-DD.');
  }

  const parsed = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error('Transaction date must be valid.');
  }

  return parsed.toISOString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function formatImportOutcomeReason(reason: ImportOutcome['reason']) {
  switch (reason) {
    case 'unparseable':
      return 'Parser could not understand the SMS';
    case 'sender_not_allowed':
      return 'Sender is not on the allowlist';
    case 'before_tracking_cutover':
      return 'Transaction happened before tracking started';
    case 'possible_duplicate':
      return 'Matched a duplicate heuristic';
    case 'parsed_ok':
      return 'Parsed successfully';
    default:
      return reason;
  }
}
