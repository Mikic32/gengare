import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  CategoryChips,
  CollapsibleCard,
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
  countInboxItems,
  createSampleDebugSmsBody,
  formatImportOutcomeReason,
  formatShortDate,
  getErrorMessage,
  parseDateInputToIso,
  parseOptionalBalanceAfterToCents,
  parseRequiredPositiveAmountToCents,
  transactionTitle,
} from '@/src/features/budget/app-helpers';
import { useAppShell } from '@/src/features/budget/app-shell';
import { budgetAppStore } from '@/src/features/budget/app-store';
import type { InboxScreenData, ManualImportTask } from '@/src/features/budget/app-module';
import { toLocalDateKey } from '@/src/features/budget/budget-engine';
import { formatCurrency } from '@/src/features/budget/money';
import type { BudgetView, CanonicalTransaction } from '@/src/features/budget/types';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const { refreshInboxCount } = useAppShell();
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
  const inboxCount = screenData ? countInboxItems(screenData) : 0;
  const spendingToReview = needsReview.filter((transaction) => transaction.kind === 'outflow');
  const incomeToReview = needsReview.filter((transaction) => transaction.kind === 'inflow');

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

  const loadScreenData = React.useCallback(
    async (options?: { showSpinner?: boolean }) => {
      if (options?.showSpinner !== false) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const nextScreenData = await budgetAppStore.loadInboxScreenData(new Date());
        setScreenData(nextScreenData);
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

  async function applyInboxUpdate(nextScreenData: InboxScreenData) {
    setScreenData(nextScreenData);
    await refreshInboxCount();
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
      await applyInboxUpdate(nextScreenData);

      if (importResult.importOutcome.kind === 'ignored') {
        setSmsImportError(
          importResult.importOutcome.reason === 'sender_not_allowed'
            ? 'That sender isn’t your bank, so it was ignored.'
            : 'This is from before you started tracking, so it was ignored.'
        );
        return;
      }

      if (importResult.importOutcome.kind === 'manual_import') {
        setSmsImportError(
          importResult.parseResult?.memo ?? 'Saved the SMS, but it needs a manual entry.'
        );
      }

      setDebugSmsBody(createSampleDebugSmsBody());
    } catch (error) {
      const message = getErrorMessage(error);
      setSmsImportError(message);
      Alert.alert('Could not import SMS', message);
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
        transaction.kind === 'outflow' ? (reviewCategoryIds[transaction.id] ?? null) : null;
      await applyInboxUpdate(
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
      Alert.alert('Could not approve', message);
    } finally {
      setReviewingTransactionId(null);
    }
  }

  async function handleIgnoreImportedTransaction(transaction: CanonicalTransaction) {
    setReviewingTransactionId(transaction.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      await applyInboxUpdate(
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
      Alert.alert('Could not ignore', message);
    } finally {
      setReviewingTransactionId(null);
    }
  }

  async function handleRecoverUnparseableSms(task: ManualImportTask) {
    setRecoveringOutcomeId(task.importOutcome.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      const draft = getRecoveryDraft(task, recoveryDrafts);
      const amountCents = parseRequiredPositiveAmountToCents(draft.amount, 'Amount');
      await applyInboxUpdate(
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
      Alert.alert('Could not save transaction', message);
    } finally {
      setRecoveringOutcomeId(null);
    }
  }

  async function handleIgnoreUnparseableSms(task: ManualImportTask) {
    setRecoveringOutcomeId(task.importOutcome.id);
    setReviewError(null);
    setSmsImportError(null);

    try {
      await applyInboxUpdate(
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
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <LoadingState message="Loading inbox…" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ErrorState
          title="Could not load inbox"
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
            message="Finish setup on the budget tab, then bank messages will land here."
            action={{ label: 'Go to budget', onPress: () => router.replace('/') }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenScroll>
        <View className="gap-1 pr-14">
          <Text variant="h3">Inbox</Text>
          <Text className="text-muted-foreground">
            {inboxCount === 0
              ? 'Caught up. New bank SMS lands here before it hits the budget.'
              : inboxCount === 1
                ? '1 item to handle.'
                : `${inboxCount} items to handle.`}
          </Text>
        </View>

        {reviewError ? <ErrorBanner message={reviewError} /> : null}

        {spendingToReview.length > 0 ? (
          <InboxSection title="Spending — pick an envelope">
            {spendingToReview.map((transaction) => (
              <ReviewTransactionCard
                key={transaction.id}
                transaction={transaction}
                budgetView={budgetView}
                helperText="This isn’t in the budget until you approve it."
                categoryOptions={categoryOptions}
                selectedCategoryId={reviewCategoryIds[transaction.id] ?? null}
                isSubmitting={reviewingTransactionId === transaction.id}
                ignoreIsPrimary={false}
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
        ) : null}

        {incomeToReview.length > 0 ? (
          <InboxSection title="Income — add to Ready to Assign">
            {incomeToReview.map((transaction) => (
              <ReviewTransactionCard
                key={transaction.id}
                transaction={transaction}
                budgetView={budgetView}
                helperText="Approve and it becomes cash you can assign."
                categoryOptions={categoryOptions}
                selectedCategoryId={reviewCategoryIds[transaction.id] ?? null}
                isSubmitting={reviewingTransactionId === transaction.id}
                ignoreIsPrimary={false}
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
        ) : null}

        {possibleDuplicates.length > 0 ? (
          <InboxSection title="Looks like a duplicate">
            {possibleDuplicates.map((transaction) => (
              <ReviewTransactionCard
                key={transaction.id}
                transaction={transaction}
                budgetView={budgetView}
                helperText="Ignore it if you already have this. Approve if it’s actually new."
                categoryOptions={categoryOptions}
                selectedCategoryId={reviewCategoryIds[transaction.id] ?? null}
                isSubmitting={reviewingTransactionId === transaction.id}
                ignoreIsPrimary
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
        ) : null}

        {manualImportTasks.length > 0 ? (
          <InboxSection title="Couldn’t read these">
            {manualImportTasks.map((task) => {
              const draft = getRecoveryDraft(task, recoveryDrafts);

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
        ) : null}

        <CollapsibleCard
          title="Paste a bank SMS"
          subtitle="Until native capture is on. Same pipeline as a real message.">
          <FormField
            label="Sender"
            value={debugSmsSender}
            onChangeText={setDebugSmsSender}
            placeholder="BANK"
            autoCapitalize="characters"
          />
          <FormField
            label="Message"
            value={debugSmsBody}
            onChangeText={setDebugSmsBody}
            placeholder={createSampleDebugSmsBody()}
            autoCapitalize="none"
            multiline
          />
          {smsImportError ? <ErrorBanner message={smsImportError} /> : null}
          <Button onPress={() => void handleImportDebugSms()} disabled={isImportingSms}>
            <Text>{isImportingSms ? 'Importing…' : 'Import SMS'}</Text>
          </Button>
        </CollapsibleCard>
      </ScreenScroll>
    </SafeAreaView>
  );
}

function InboxSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="large">{title}</Text>
      {children}
    </View>
  );
}

function ReviewTransactionCard({
  transaction,
  budgetView,
  helperText,
  categoryOptions,
  selectedCategoryId,
  isSubmitting,
  ignoreIsPrimary,
  onSelectCategory,
  onApprove,
  onIgnore,
}: {
  transaction: CanonicalTransaction;
  budgetView: BudgetView;
  helperText: string;
  categoryOptions: CategoryOption[];
  selectedCategoryId: string | null;
  isSubmitting: boolean;
  ignoreIsPrimary: boolean;
  onSelectCategory: (categoryId: string) => void;
  onApprove: () => void;
  onIgnore: () => void;
}) {
  const isOutflow = transaction.kind === 'outflow';
  const canApprove = !isOutflow || selectedCategoryId !== null;
  const approveLabel = isSubmitting ? 'Working…' : isOutflow ? 'Approve' : 'Add to Ready to Assign';
  const ignoreLabel = isSubmitting ? 'Working…' : 'Ignore';

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold">{transactionTitle(transaction)}</Text>
          <Text className="text-sm text-muted-foreground">
            {formatShortDate(toLocalDateKey(transaction.occurredAt))}
            {isOutflow ? ' · Spending' : ' · Income'}
          </Text>
        </View>
        <Text
          className={
            transaction.amountCents < 0
              ? 'text-lg font-semibold text-destructive'
              : 'text-lg font-semibold'
          }>
          {formatCurrency(transaction.amountCents, budgetView.currencyCode)}
        </Text>
      </View>

      <Text className="text-sm text-muted-foreground">{helperText}</Text>
      {transaction.memo ? (
        <Text className="text-sm text-muted-foreground">{transaction.memo}</Text>
      ) : null}

      {isOutflow ? (
        <View className="gap-2">
          <Text className="text-sm font-medium">Envelope</Text>
          <CategoryChips
            options={categoryOptions}
            selectedId={selectedCategoryId}
            onSelect={onSelectCategory}
            disabled={isSubmitting}
          />
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          variant={ignoreIsPrimary ? 'default' : 'outline'}
          onPress={onIgnore}
          disabled={isSubmitting}>
          <Text>{ignoreLabel}</Text>
        </Button>
        <Button
          className="flex-1"
          variant={ignoreIsPrimary ? 'outline' : 'default'}
          onPress={onApprove}
          disabled={isSubmitting || !canApprove}>
          <Text>{approveLabel}</Text>
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
  const canSave = draft.kind === 'inflow' || draft.categoryId !== null;
  const [showExtras, setShowExtras] = React.useState(false);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-5">
      <View className="gap-1">
        <Text className="font-semibold">Enter this one yourself</Text>
        <Text className="text-sm text-muted-foreground">
          {formatImportOutcomeReason(task.importOutcome.reason)}
        </Text>
      </View>

      <View className="gap-1 rounded-xl bg-muted/40 p-3">
        <Text className="text-sm text-muted-foreground">From {task.rawSmsMessage.sender}</Text>
        <Text className="text-sm text-foreground">{task.rawSmsMessage.body}</Text>
      </View>

      <KindToggle
        value={draft.kind}
        disabled={isSubmitting}
        onChange={(kind) =>
          onDraftChange({
            ...draft,
            kind,
            categoryId: kind === 'outflow' ? draft.categoryId : null,
          })
        }
      />

      <FormField
        label="Amount"
        value={draft.amount}
        onChangeText={(value) => onDraftChange({ ...draft, amount: value })}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />
      <DateQuickField
        value={draft.occurredOn}
        onChange={(occurredOn) => onDraftChange({ ...draft, occurredOn })}
        disabled={isSubmitting}
      />

      {draft.kind === 'outflow' ? (
        <View className="gap-2">
          <Text className="text-sm font-medium">Envelope</Text>
          <CategoryChips
            options={categoryOptions}
            selectedId={draft.categoryId}
            onSelect={(categoryId) => onDraftChange({ ...draft, categoryId })}
            disabled={isSubmitting}
          />
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">Income goes to Ready to Assign.</Text>
      )}

      <Pressable onPress={() => setShowExtras((current) => !current)}>
        <Text className="text-sm text-muted-foreground">
          {showExtras ? 'Hide extra fields' : 'Payee, note, bank balance'}
        </Text>
      </Pressable>

      {showExtras ? (
        <View className="gap-3">
          <FormField
            label="Payee"
            value={draft.payee}
            onChangeText={(value) => onDraftChange({ ...draft, payee: value })}
            placeholder={draft.kind === 'inflow' ? 'Salary, refund…' : 'Store, landlord…'}
          />
          <FormField
            label="Note"
            value={draft.memo}
            onChangeText={(value) => onDraftChange({ ...draft, memo: value })}
            placeholder="Optional"
          />
          <FormField
            label="Bank balance after (optional)"
            value={draft.balanceAfter}
            onChangeText={(value) => onDraftChange({ ...draft, balanceAfter: value })}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Button className="flex-1" variant="outline" onPress={onIgnore} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Working…' : 'Ignore'}</Text>
        </Button>
        <Button className="flex-1" onPress={onRecover} disabled={isSubmitting || !canSave}>
          <Text>{isSubmitting ? 'Working…' : 'Save'}</Text>
        </Button>
      </View>
    </View>
  );
}

function getRecoveryDraft(
  task: ManualImportTask,
  drafts: Record<string, RecoveryDraft>
): RecoveryDraft {
  return (
    drafts[task.importOutcome.id] ?? {
      kind: 'outflow',
      amount: '',
      occurredOn: toLocalDateKey(task.rawSmsMessage.receivedAt),
      categoryId: null,
      payee: '',
      memo: '',
      balanceAfter: '',
    }
  );
}
