import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  CategoryChips,
  DateQuickField,
  EmptyState,
  ErrorBanner,
  ErrorState,
  FormField,
  KindToggle,
  LoadingState,
  ScreenScroll,
} from '@/src/features/budget/app-components';
import {
  centsToDecimalString,
  formatShortDate,
  getErrorMessage,
  getLocalDateKey,
  moneyTextClass,
  parseDateInputToIso,
  parseRequiredPositiveAmountToCents,
  transactionSourceLabel,
  transactionTitle,
} from '@/src/features/budget/app-helpers';
import { useAppShell } from '@/src/features/budget/app-shell';
import { budgetAppStore } from '@/src/features/budget/app-store';
import { toLocalDateKey } from '@/src/features/budget/budget-engine';
import { formatCurrency } from '@/src/features/budget/money';
import type { BudgetView, CanonicalTransaction } from '@/src/features/budget/types';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type TransactionGroup = {
  dateKey: string;
  transactions: CanonicalTransaction[];
};

export default function TransactionsScreen() {
  const { refreshInboxCount } = useAppShell();
  const [budgetView, setBudgetView] = React.useState<BudgetView | null>(null);
  const [transactions, setTransactions] = React.useState<CanonicalTransaction[]>([]);
  const [draft, setDraft] = React.useState<TransactionDraft>(() => createEmptyDraft());
  const [isComposerOpen, setIsComposerOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const categoryOptions = React.useMemo<CategoryOption[]>(() => {
    if (!budgetView) {
      return [];
    }

    return budgetView.categoryGroups.flatMap((group) =>
      group.categories.map((category) => ({
        id: category.id,
        label: category.name,
      }))
    );
  }, [budgetView]);

  const ledgerGroups = React.useMemo<TransactionGroup[]>(() => {
    const approved = transactions
      .filter((transaction) => transaction.status === 'approved')
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const groups = new Map<string, CanonicalTransaction[]>();

    for (const transaction of approved) {
      const dateKey = toLocalDateKey(transaction.occurredAt);
      const existing = groups.get(dateKey);

      if (existing) {
        existing.push(transaction);
      } else {
        groups.set(dateKey, [transaction]);
      }
    }

    return [...groups.entries()].map(([dateKey, groupedTransactions]) => ({
      dateKey,
      transactions: groupedTransactions,
    }));
  }, [transactions]);

  const loadScreenData = React.useCallback(
    async (options?: { showSpinner?: boolean }) => {
      if (options?.showSpinner !== false) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const nextScreenData = await budgetAppStore.loadTransactionsScreenData(new Date());
        setBudgetView(nextScreenData.budgetView);
        setTransactions(nextScreenData.transactions);
        await refreshInboxCount();
      } catch (error) {
        setLoadError(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [refreshInboxCount]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadScreenData({ showSpinner: false });
    }, [loadScreenData])
  );

  async function handleSubmit() {
    setIsSaving(true);
    setSaveError(null);

    try {
      const amountCents = parseRequiredPositiveAmountToCents(draft.amount, 'Amount');
      const occurredAt = parseDateInputToIso(draft.occurredOn);
      const input = {
        kind: draft.kind,
        amountCents,
        occurredAt,
        categoryId: draft.kind === 'outflow' ? draft.categoryId : null,
        payee: draft.payee,
        memo: draft.memo,
      } as const;

      const nextScreenData = await budgetAppStore.saveManualTransaction(
        draft.transactionId
          ? {
              transactionId: draft.transactionId,
              ...input,
            }
          : input,
        new Date()
      );

      setBudgetView(nextScreenData.budgetView);
      setTransactions(nextScreenData.transactions);
      setDraft(createEmptyDraft());
      setIsComposerOpen(false);
    } catch (error) {
      const message = getErrorMessage(error);
      setSaveError(message);
      Alert.alert(draft.transactionId ? 'Could not update' : 'Could not save', message);
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(transaction: CanonicalTransaction) {
    if (transaction.source !== 'manual') {
      return;
    }

    setSaveError(null);
    setIsComposerOpen(true);
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

  function closeComposer() {
    setDraft(createEmptyDraft());
    setSaveError(null);
    setIsComposerOpen(false);
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <LoadingState message="Loading activity…" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ErrorState
          title="Could not load activity"
          message={loadError}
          onRetry={() => void loadScreenData()}
          secondaryAction={{ label: 'Back to budget', onPress: () => router.replace('/') }}
        />
      </SafeAreaView>
    );
  }

  if (!budgetView) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 justify-center px-5">
          <EmptyState
            title="Set up your budget first"
            message="Finish setup on the budget tab before adding transactions."
            action={{ label: 'Go to budget', onPress: () => router.replace('/') }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const canSave = draft.kind === 'inflow' || draft.categoryId !== null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenScroll>
        <View className="flex-row items-start justify-between gap-3 pr-14">
          <View className="flex-1 gap-1">
            <Text variant="h3">Activity</Text>
            <Text className="text-muted-foreground">Approved money in and out.</Text>
          </View>
          {isComposerOpen ? (
            <Button size="sm" variant="ghost" onPress={closeComposer}>
              <Text>Cancel</Text>
            </Button>
          ) : (
            <Button size="sm" onPress={() => setIsComposerOpen(true)}>
              <Text>Add</Text>
            </Button>
          )}
        </View>

        {isComposerOpen ? (
          <View className="gap-4 rounded-2xl border border-border bg-card p-5">
            <Text variant="large">
              {draft.transactionId ? 'Edit transaction' : 'Add transaction'}
            </Text>

            <KindToggle
              value={draft.kind}
              onChange={(kind) =>
                setDraft((current) => ({
                  ...current,
                  kind,
                  categoryId: kind === 'outflow' ? current.categoryId : null,
                }))
              }
            />

            <FormField
              label="Amount"
              value={draft.amount}
              onChangeText={(value) => setDraft((current) => ({ ...current, amount: value }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
            />
            <DateQuickField
              value={draft.occurredOn}
              onChange={(occurredOn) => setDraft((current) => ({ ...current, occurredOn }))}
            />
            <FormField
              label="Payee"
              value={draft.payee}
              onChangeText={(value) => setDraft((current) => ({ ...current, payee: value }))}
              placeholder={draft.kind === 'inflow' ? 'Salary, refund…' : 'Store, landlord…'}
            />
            <FormField
              label="Note"
              value={draft.memo}
              onChangeText={(value) => setDraft((current) => ({ ...current, memo: value }))}
              placeholder="Optional"
            />

            {draft.kind === 'outflow' ? (
              <View className="gap-2">
                <Text className="text-sm font-medium">Envelope</Text>
                <CategoryChips
                  options={categoryOptions}
                  selectedId={draft.categoryId}
                  onSelect={(categoryId) =>
                    setDraft((current) => ({
                      ...current,
                      categoryId,
                    }))
                  }
                />
              </View>
            ) : (
              <Text className="text-sm text-muted-foreground">Income goes to Ready to Assign.</Text>
            )}

            {saveError ? <ErrorBanner message={saveError} /> : null}

            <Button onPress={() => void handleSubmit()} disabled={isSaving || !canSave}>
              <Text>{isSaving ? 'Saving…' : draft.transactionId ? 'Update' : 'Save'}</Text>
            </Button>
          </View>
        ) : null}

        {!isComposerOpen && ledgerGroups.length === 0 ? (
          <EmptyState
            title="No activity yet"
            message="Bank SMS you approve and anything you add by hand will show up here."
            action={{ label: 'Add a transaction', onPress: () => setIsComposerOpen(true) }}
          />
        ) : (
          ledgerGroups.map((group) => (
            <View key={group.dateKey} className="gap-2">
              <Text className="text-sm font-medium text-muted-foreground">
                {formatShortDate(group.dateKey)}
              </Text>
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {group.transactions.map((transaction, index) => {
                  const categoryLabel = transaction.categoryId
                    ? (categoryOptions.find((category) => category.id === transaction.categoryId)
                        ?.label ?? 'Unknown category')
                    : transaction.kind === 'inflow'
                      ? 'Ready to Assign'
                      : 'Uncategorized';
                  const isLast = index === group.transactions.length - 1;
                  const isEditable = transaction.source === 'manual';

                  return (
                    <Pressable
                      key={transaction.id}
                      className={isLast ? 'gap-1 p-5' : 'gap-1 border-b border-border p-5'}
                      onPress={() => startEditing(transaction)}
                      disabled={!isEditable}>
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1 gap-1">
                          <Text className="font-semibold">{transactionTitle(transaction)}</Text>
                          <Text className="text-sm text-muted-foreground">
                            {categoryLabel}
                            {isEditable
                              ? ' · Tap to edit'
                              : ` · ${transactionSourceLabel(transaction.source)}`}
                          </Text>
                        </View>
                        <Text
                          numberOfLines={1}
                          className={moneyTextClass(
                            transaction.amountCents,
                            'shrink-0 font-semibold'
                          )}>
                          {formatCurrency(transaction.amountCents, budgetView.currencyCode)}
                        </Text>
                      </View>
                      {transaction.memo && transaction.source !== 'starting_balance' ? (
                        <Text className="text-sm text-muted-foreground">{transaction.memo}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScreenScroll>
    </SafeAreaView>
  );
}

function createEmptyDraft(): TransactionDraft {
  return {
    transactionId: null,
    kind: 'outflow',
    amount: '',
    occurredOn: getLocalDateKey(),
    categoryId: null,
    payee: '',
    memo: '',
  };
}
