import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { BudgetStatCard, FormField } from '@/src/features/budget/app-components';
import {
  createSampleDebugSmsBody,
  formatImportOutcomeReason,
  getErrorMessage,
  parseDateInputToIso,
  parseOptionalBalanceAfterToCents,
  parseRequiredPositiveAmountToCents,
} from '@/src/features/budget/app-helpers';
import { budgetAppStore } from '@/src/features/budget/app-store';
import type { InboxScreenData, ManualImportTask } from '@/src/features/budget/app-module';
import { toLocalDateKey } from '@/src/features/budget/budget-engine';
import { formatCurrency } from '@/src/features/budget/money';
import type { BudgetView, CanonicalTransaction } from '@/src/features/budget/types';
import { router, Stack } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_OPTIONS = {
  title: 'Inbox',
  headerShown: false,
};

type CategoryOption = {
  id: string;
  label: string;
};

type RecoveryDraft = {
  kind: 'inflow' | 'outflow';
  amount: string;
  occurredOn: string;
  categoryId: string | null;
  payee: string;
  memo: string;
  balanceAfter: string;
};

export default function InboxScreen() {
  const [screenData, setScreenData] = React.useState<InboxScreenData | null>(null);
  const [debugSmsSender, setDebugSmsSender] = React.useState('BANK');
  const [debugSmsBody, setDebugSmsBody] = React.useState(createSampleDebugSmsBody);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isImportingSms, setIsImportingSms] = React.useState(false);
  const [reviewingTransactionId, setReviewingTransactionId] = React.useState<string | null>(null);
  const [recoveringOutcomeId, setRecoveringOutcomeId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [smsImportError, setSmsImportError] = React.useState<string | null>(null);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [reviewCategoryIds, setReviewCategoryIds] = React.useState<Record<string, string | null>>(
    {}
  );
  const [recoveryDrafts, setRecoveryDrafts] = React.useState<Record<string, RecoveryDraft>>({});

  const budgetView = screenData?.budgetView ?? null;
  const needsReview = screenData?.needsReview ?? [];
  const possibleDuplicates = screenData?.possibleDuplicates ?? [];
  const manualImportTasks = screenData?.manualImportTasks ?? [];

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

  React.useEffect(() => {
    void loadScreenData();
  }, []);

  async function loadScreenData() {
    setIsLoading(true);
    setLoadError(null);

    try {
      setScreenData(await budgetAppStore.loadInboxScreenData(new Date()));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImportDebugSms() {
    setIsImportingSms(true);
    setSmsImportError(null);
    setReviewError(null);

    try {
      const { importResult, screenData: nextScreenData } = await budgetAppStore.importDebugSms(
        {
          sender: debugSmsSender,
          body: debugSmsBody,
          receivedAt: new Date().toISOString(),
        },
        new Date()
      );
      setScreenData(nextScreenData);

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
          ? (reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null)
          : null;
      setScreenData(
        await budgetAppStore.approveImportedTransaction(
          {
            transactionId: transaction.id,
            categoryId,
          },
          new Date()
        )
      );
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
      setScreenData(
        await budgetAppStore.ignoreImportedTransaction(
          {
            transactionId: transaction.id,
          },
          new Date()
        )
      );
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

  async function handleRecoverUnparseableSms(task: ManualImportTask) {
    setRecoveringOutcomeId(task.importOutcome.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      const draft = getRecoveryDraft(task, categoryOptions, recoveryDrafts);
      const amountCents = parseRequiredPositiveAmountToCents(draft.amount, 'Transaction amount');
      setScreenData(
        await budgetAppStore.recoverUnparseableSms(
          {
            importOutcomeId: task.importOutcome.id,
            transaction: {
              kind: draft.kind,
              amountCents,
              occurredAt: parseDateInputToIso(draft.occurredOn),
              categoryId: draft.kind === 'outflow' ? draft.categoryId : null,
              payee: draft.payee,
              memo: draft.memo,
              balanceAfterCents: parseOptionalBalanceAfterToCents(draft.balanceAfter),
            },
          },
          new Date()
        )
      );
      setRecoveryDrafts((current) => {
        const next = { ...current };
        delete next[task.importOutcome.id];
        return next;
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setReviewError(message);
      Alert.alert('Could not recover SMS', message);
    } finally {
      setRecoveringOutcomeId(null);
    }
  }

  async function handleIgnoreUnparseableSms(task: ManualImportTask) {
    setRecoveringOutcomeId(task.importOutcome.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      setScreenData(
        await budgetAppStore.ignoreUnparseableSms(
          {
            importOutcomeId: task.importOutcome.id,
          },
          new Date()
        )
      );
      setRecoveryDrafts((current) => {
        const next = { ...current };
        delete next[task.importOutcome.id];
        return next;
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setReviewError(message);
      Alert.alert('Could not ignore SMS', message);
    } finally {
      setRecoveringOutcomeId(null);
    }
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={SCREEN_OPTIONS} />
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator />
            <Text className="text-muted-foreground">Loading inbox…</Text>
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
              <Text className="font-semibold text-destructive">Could not load inbox</Text>
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
                Finish onboarding on the budget screen before reviewing imported SMS.
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
              <Text variant="h3">Inbox</Text>
              <Text className="text-muted-foreground">
                Review imports before they fully enter the budget.
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Button size="sm" variant="outline" onPress={() => router.replace('/')}>
                <Text>Budget</Text>
              </Button>
              <Button size="sm" variant="outline" onPress={() => router.push('./transactions')}>
                <Text>Transactions</Text>
              </Button>
            </View>
          </View>

          <View className="gap-3">
            <BudgetStatCard
              label="Ready to assign"
              value={formatCurrency(
                budgetView.moneyState.assignableCash.amountCents,
                budgetView.currencyCode
              )}
              helper="Approved uncategorized inflows land here until you assign them."
              valueClassName={
                budgetView.moneyState.assignableCash.amountCents < 0
                  ? 'text-destructive'
                  : undefined
              }
            />
            <BudgetStatCard
              label="Account balance"
              value={formatCurrency(
                budgetView.moneyState.accountBalance.amountCents,
                budgetView.currencyCode
              )}
              helper="Newest non-ignored bank balance evidence."
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
                placeholder={createSampleDebugSmsBody()}
                placeholderTextColor="#71717a"
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
              />
            </View>

            <View className="rounded-xl bg-muted/40 p-3">
              <Text className="text-sm text-muted-foreground">
                Supported sample: OTP banka multiline `Priliv` / `Odliv` SMS with `Datum`, `Vreme`,
                and `Raspoloziva sredstva`.
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

          {reviewError ? (
            <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <Text className="text-destructive">{reviewError}</Text>
            </View>
          ) : null}

          <InboxSection
            title="Needs review"
            emptyText="No SMS candidates need review yet. Import a debug SMS above.">
            {needsReview.map((transaction) => (
              <ReviewTransactionCard
                key={transaction.id}
                transaction={transaction}
                budgetView={budgetView}
                badgeLabel="Needs review"
                subtitle="Waiting for review"
                helperText="This candidate updates account balance evidence but does not touch category math until approval."
                categoryOptions={categoryOptions}
                selectedCategoryId={
                  reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null
                }
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
            ))}
          </InboxSection>

          <InboxSection
            title="Possible duplicates"
            emptyText="No duplicate-looking SMS imports right now.">
            {possibleDuplicates.map((transaction) => (
              <ReviewTransactionCard
                key={transaction.id}
                transaction={transaction}
                budgetView={budgetView}
                badgeLabel="Possible duplicate"
                subtitle="Review possible duplicate"
                helperText="This candidate updates account balance evidence but was flagged as a possible duplicate."
                categoryOptions={categoryOptions}
                selectedCategoryId={
                  reviewCategoryIds[transaction.id] ?? categoryOptions[0]?.id ?? null
                }
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
            ))}
          </InboxSection>

          <InboxSection
            title="Needs manual import"
            emptyText="No unparseable SMS imports waiting for manual recovery.">
            {manualImportTasks.map((task) => {
              const draft = getRecoveryDraft(task, categoryOptions, recoveryDrafts);

              return (
                <ManualImportCard
                  key={task.importOutcome.id}
                  task={task}
                  draft={draft}
                  categoryOptions={categoryOptions}
                  isSubmitting={recoveringOutcomeId === task.importOutcome.id}
                  onDraftChange={(nextDraft) =>
                    setRecoveryDrafts((current) => ({
                      ...current,
                      [task.importOutcome.id]: nextDraft,
                    }))
                  }
                  onRecover={() => void handleRecoverUnparseableSms(task)}
                  onIgnore={() => void handleIgnoreUnparseableSms(task)}
                />
              );
            })}
          </InboxSection>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function InboxSection({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);

  return (
    <View className="gap-3">
      <Text variant="large">{title}</Text>
      {items.length === 0 ? (
        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-muted-foreground">{emptyText}</Text>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

function ReviewTransactionCard({
  transaction,
  budgetView,
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
  budgetView: BudgetView;
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
          <Text
            className={
              transaction.amountCents < 0 ? 'font-semibold text-destructive' : 'font-semibold'
            }>
            {formatCurrency(transaction.amountCents, budgetView.currencyCode)}
          </Text>
          <Text className="text-xs uppercase text-amber-600">{badgeLabel}</Text>
        </View>
      </View>

      <View className="gap-1 rounded-xl bg-muted/40 p-3">
        <Text className="text-sm text-muted-foreground">
          Balance after import:{' '}
          <Text className="font-medium text-foreground">
            {transaction.balanceAfterCents === null
              ? 'Unknown'
              : formatCurrency(transaction.balanceAfterCents, budgetView.currencyCode)}
          </Text>
        </Text>
        <Text className="text-sm text-muted-foreground">{helperText}</Text>
        {transaction.memo ? (
          <Text className="text-sm text-muted-foreground">{transaction.memo}</Text>
        ) : null}
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
            Approving this inflow keeps it uncategorized and increases assignable cash.
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

function ManualImportCard({
  task,
  draft,
  categoryOptions,
  isSubmitting,
  onDraftChange,
  onRecover,
  onIgnore,
}: {
  task: ManualImportTask;
  draft: RecoveryDraft;
  categoryOptions: CategoryOption[];
  isSubmitting: boolean;
  onDraftChange: (draft: RecoveryDraft) => void;
  onRecover: () => void;
  onIgnore: () => void;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
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
          From <Text className="font-medium text-foreground">{task.rawSmsMessage.sender}</Text>
        </Text>
        <Text className="text-sm text-muted-foreground">
          Outcome reason:{' '}
          <Text className="font-medium text-foreground">
            {formatImportOutcomeReason(task.importOutcome.reason)}
          </Text>
        </Text>
        {task.parseResult?.memo ? (
          <Text className="text-sm text-muted-foreground">{task.parseResult.memo}</Text>
        ) : null}
        <Text className="text-sm text-foreground">{task.rawSmsMessage.body}</Text>
      </View>

      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant={draft.kind === 'outflow' ? 'secondary' : 'outline'}
          onPress={() =>
            onDraftChange({
              ...draft,
              kind: 'outflow',
              categoryId: draft.categoryId ?? categoryOptions[0]?.id ?? null,
            })
          }
          disabled={isSubmitting}>
          <Text>Outflow</Text>
        </Button>
        <Button
          size="sm"
          variant={draft.kind === 'inflow' ? 'secondary' : 'outline'}
          onPress={() => onDraftChange({ ...draft, kind: 'inflow', categoryId: null })}
          disabled={isSubmitting}>
          <Text>Inflow</Text>
        </Button>
      </View>

      <FormField
        label="Amount"
        value={draft.amount}
        onChangeText={(value) => onDraftChange({ ...draft, amount: value })}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />
      <FormField
        label="Occurred on"
        value={draft.occurredOn}
        onChangeText={(value) => onDraftChange({ ...draft, occurredOn: value })}
        placeholder="2026-06-30"
        autoCapitalize="none"
      />
      <FormField
        label="Payee"
        value={draft.payee}
        onChangeText={(value) => onDraftChange({ ...draft, payee: value })}
        placeholder={draft.kind === 'inflow' ? 'Salary, refund…' : 'Store, landlord…'}
      />
      <FormField
        label="Memo"
        value={draft.memo}
        onChangeText={(value) => onDraftChange({ ...draft, memo: value })}
        placeholder="Optional note"
      />
      <FormField
        label="Balance after (optional)"
        value={draft.balanceAfter}
        onChangeText={(value) => onDraftChange({ ...draft, balanceAfter: value })}
        placeholder="0.00"
        keyboardType="decimal-pad"
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
                onPress={() => onDraftChange({ ...draft, categoryId: category.id })}
                disabled={isSubmitting}>
                <Text>{category.label}</Text>
              </Button>
            ))}
          </View>
        </View>
      ) : (
        <View className="rounded-xl bg-muted/40 p-3">
          <Text className="text-sm text-muted-foreground">
            Recovered inflows stay uncategorized and increase assignable cash.
          </Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button variant="outline" onPress={onIgnore} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Working…' : 'Ignore'}</Text>
        </Button>
        <Button onPress={onRecover} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Working…' : 'Save transaction'}</Text>
        </Button>
      </View>
    </View>
  );
}

function getRecoveryDraft(
  task: ManualImportTask,
  categoryOptions: CategoryOption[],
  drafts: Record<string, RecoveryDraft>
): RecoveryDraft {
  return (
    drafts[task.importOutcome.id] ?? {
      kind: 'outflow',
      amount: '',
      occurredOn: toLocalDateKey(task.rawSmsMessage.receivedAt),
      categoryId: categoryOptions[0]?.id ?? null,
      payee: '',
      memo: '',
      balanceAfter: '',
    }
  );
}
