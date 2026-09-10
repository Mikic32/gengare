import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePalette } from '@/lib/theme';
import {
  CategoryChips,
  ErrorBanner,
  ErrorState,
  FormField,
  LoadingState,
  ProgressBar,
  ScreenScroll,
} from '@/src/features/budget/app-components';
import {
  centsToDecimalString,
  formatMonthLabel,
  getErrorMessage,
  moneyTextClass,
  parseRequiredPositiveAmountToCents,
} from '@/src/features/budget/app-helpers';
import { useAppShell } from '@/src/features/budget/app-shell';
import { budgetAppStore } from '@/src/features/budget/app-store';
import { BackupActions } from '@/src/features/budget/backup-actions';
import { DEFAULT_CATEGORY_GROUPS } from '@/src/features/budget/defaults';
import {
  createEditableGroups,
  EnvelopeGroupCard,
  OnboardingEnvelopeEditor,
  useLiveEnvelopeEditor,
  type EditableGroup,
} from '@/src/features/budget/envelope-editor';
import { formatCurrency, parseDecimalMoneyToCents } from '@/src/features/budget/money';
import type {
  BudgetCategoryView,
  BudgetView,
  CompleteOnboardingInput,
  EnvelopeCommand,
} from '@/src/features/budget/types';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const READY_SOURCE_ID = 'ready';

export default function Screen() {
  const { refreshInboxCount, setOnboarded } = useAppShell();
  const palette = usePalette();
  const [budgetView, setBudgetView] = React.useState<BudgetView | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [accountName, setAccountName] = React.useState('Main account');
  const [currencyCode, setCurrencyCode] = React.useState('RSD');
  const [startingBalance, setStartingBalance] = React.useState('0.00');
  const [showAccountDetails, setShowAccountDetails] = React.useState(false);
  const [groups, setGroups] = React.useState<EditableGroup[]>(() =>
    createEditableGroups(DEFAULT_CATEGORY_GROUPS)
  );

  const loadBudgetView = React.useCallback(
    async (options?: { showSpinner?: boolean }) => {
      if (options?.showSpinner !== false) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const nextView = await budgetAppStore.getBudgetView(new Date());
        setBudgetView(nextView);
        setOnboarded(nextView !== null);
      } catch (error) {
        setLoadError(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [setOnboarded]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadBudgetView({ showSpinner: false });
      void refreshInboxCount();
    }, [loadBudgetView, refreshInboxCount])
  );

  async function handleCreateBudget() {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const nextView = await budgetAppStore.completeOnboarding(
        {
          accountName,
          currencyCode,
          startingBalanceCents: parseDecimalMoneyToCents(startingBalance),
          categoryGroups: groups.map((group) => ({
            name: group.name,
            categories: group.categories.map((category) => category.name),
          })),
        } satisfies CompleteOnboardingInput,
        new Date()
      );

      setBudgetView(nextView);
      setOnboarded(true);
      await refreshInboxCount();
    } catch (error) {
      const message = getErrorMessage(error);
      setSubmitError(message);
      Alert.alert('Could not create budget', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {isLoading ? (
        <LoadingState message="Loading budget…" />
      ) : loadError ? (
        <ErrorState
          title="Could not load budget"
          message={loadError}
          onRetry={() => void loadBudgetView({ showSpinner: true })}
        />
      ) : budgetView ? (
        <BudgetScreen budgetView={budgetView} onBudgetViewChange={setBudgetView} />
      ) : (
        <ScreenScroll>
          <View className="gap-2">
            <Text variant="h3">Start with what’s in the bank</Text>
            <Text className="text-muted-foreground">
              That cash starts unassigned. Next you’ll tap envelopes and give it a job.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium">Bank balance</Text>
            <TextInput
              className="rounded-2xl border border-border bg-card px-4 py-5 text-3xl font-bold text-foreground"
              value={startingBalance}
              onChangeText={setStartingBalance}
              placeholder="0.00"
              placeholderTextColor={palette.mutedForeground}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <Pressable onPress={() => setShowAccountDetails((current) => !current)}>
            <Text className="text-sm text-muted-foreground">
              {showAccountDetails ? 'Hide account details' : `${accountName} · ${currencyCode}`}
            </Text>
          </Pressable>

          {showAccountDetails ? (
            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <FormField
                label="Account name"
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Main account"
              />
              <FormField
                label="Currency"
                value={currencyCode}
                onChangeText={(value) => setCurrencyCode(value.toUpperCase())}
                placeholder="RSD"
                autoCapitalize="characters"
              />
            </View>
          ) : null}

          <OnboardingEnvelopeEditor groups={groups} onChange={setGroups} />

          {submitError ? <ErrorBanner message={submitError} /> : null}

          <Button onPress={() => void handleCreateBudget()} disabled={isSubmitting}>
            <Text>{isSubmitting ? 'Creating budget…' : 'Start budgeting'}</Text>
          </Button>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">Already have a backup?</Text>
            <BackupActions
              showExport={false}
              restoreLabel="Restore from backup"
              onRestored={async (view) => {
                setBudgetView(view);
                setOnboarded(view !== null);
                await refreshInboxCount();
              }}
            />
          </View>
        </ScreenScroll>
      )}
    </SafeAreaView>
  );
}

function BudgetScreen({
  budgetView,
  onBudgetViewChange,
}: {
  budgetView: BudgetView;
  onBudgetViewChange: React.Dispatch<React.SetStateAction<BudgetView | null>>;
}) {
  const { inboxCount } = useAppShell();
  const [assignmentDrafts, setAssignmentDrafts] = React.useState<Record<string, string>>({});
  const [expandedCategoryId, setExpandedCategoryId] = React.useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isUpdatingBudget, setIsUpdatingBudget] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollOffsetRef = React.useRef(0);
  const rowRefs = React.useRef(new Map<string, View>());

  const readyToAssignCents = budgetView.moneyState.assignableCash.amountCents;
  const reconciliationGapCents = budgetView.moneyState.reconciliationGap.amountCents;
  const approvedLedgerCents = budgetView.moneyState.reconciliationGap.approvedLedgerCents;
  const overspentCategories = budgetView.categoryGroups.flatMap((group) =>
    group.categories.filter((category) => category.availableCents < 0)
  );
  const moveSources = budgetView.categoryGroups.flatMap((group) =>
    group.categories
      .filter((category) => category.availableCents > 0 && category.id !== expandedCategoryId)
      .map((category) => ({
        id: category.id,
        label: `${category.name} · ${formatCurrency(category.availableCents, budgetView.currencyCode)}`,
      }))
  );

  async function runBudgetUpdate(action: () => Promise<BudgetView>, failureTitle: string) {
    setIsUpdatingBudget(true);
    setActionError(null);

    try {
      onBudgetViewChange(await action());
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      Alert.alert(failureTitle, message);
    } finally {
      setIsUpdatingBudget(false);
    }
  }

  function readDraftAmount(categoryId: string, amountCents?: number) {
    return (
      amountCents ??
      parseRequiredPositiveAmountToCents(assignmentDrafts[categoryId] ?? '', 'Amount')
    );
  }

  async function handleAssignMoney(categoryId: string, amountCents?: number) {
    await runBudgetUpdate(
      () =>
        budgetAppStore.assignMoneyToCategory(
          {
            categoryId,
            amountCents: readDraftAmount(categoryId, amountCents),
          },
          new Date()
        ),
      'Could not assign money'
    );

    setAssignmentDrafts((current) => ({
      ...current,
      [categoryId]: '',
    }));
    setExpandedCategoryId(null);
  }

  async function handleMoveMoney(
    fromCategoryId: string,
    toCategoryId: string,
    amountCents?: number
  ) {
    await runBudgetUpdate(
      () =>
        budgetAppStore.moveMoneyBetweenCategories(
          {
            fromCategoryId,
            toCategoryId,
            amountCents: readDraftAmount(toCategoryId, amountCents),
          },
          new Date()
        ),
      'Could not move money'
    );

    setAssignmentDrafts((current) => ({
      ...current,
      [toCategoryId]: '',
    }));
    setExpandedCategoryId(null);
  }

  async function handleCreateReconciliationAdjustment() {
    await runBudgetUpdate(
      () => budgetAppStore.createReconciliationAdjustment(new Date()),
      'Could not reconcile'
    );
  }

  async function handleEnvelopeCommand(command: EnvelopeCommand) {
    await runBudgetUpdate(
      () => budgetAppStore.applyEnvelopeCommand(command, new Date()),
      'Could not update envelopes'
    );
  }

  const envelopeEditor = useLiveEnvelopeEditor({
    disabled: isUpdatingBudget,
    groups: budgetView.categoryGroups,
    currencyCode: budgetView.currencyCode,
    onCommand: handleEnvelopeCommand,
  });

  const gapAmount = formatCurrency(Math.abs(reconciliationGapCents), budgetView.currencyCode);

  function setRowRef(categoryId: string, node: View | null) {
    if (node) {
      rowRefs.current.set(categoryId, node);
    } else {
      rowRefs.current.delete(categoryId);
    }
  }

  function focusEnvelope(categoryId: string) {
    setExpandedCategoryId(categoryId);
    setPendingFocusId(categoryId);
  }

  function focusOverspentEnvelope() {
    const firstOverspentId = overspentCategories[0]?.id;
    if (!firstOverspentId) {
      return;
    }

    focusEnvelope(firstOverspentId);
  }

  function scrollEnvelopeIntoView(categoryId: string) {
    const row = rowRefs.current.get(categoryId);
    const scroll = scrollRef.current;
    if (!row || !scroll) {
      return;
    }

    row.measureInWindow((_x, rowY) => {
      scroll.measureInWindow((_sx, scrollY) => {
        scroll.scrollTo({
          y: Math.max(0, scrollOffsetRef.current + (rowY - scrollY) - 16),
          animated: true,
        });
      });
    });
  }

  React.useLayoutEffect(() => {
    if (!pendingFocusId || pendingFocusId !== expandedCategoryId) {
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        scrollEnvelopeIntoView(pendingFocusId);
        setPendingFocusId(null);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pendingFocusId, expandedCategoryId]);

  return (
    <ScreenScroll
      ref={scrollRef}
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }}>
      <View className="gap-1 pr-14">
        <Text className="text-sm text-muted-foreground">{budgetView.accountName}</Text>
        <Text variant="h3">{formatMonthLabel(budgetView.monthKey)}</Text>
      </View>

      <ReadyToAssignCard
        amount={formatCurrency(readyToAssignCents, budgetView.currencyCode)}
        bankBalance={formatCurrency(
          budgetView.moneyState.accountBalance.amountCents,
          budgetView.currencyCode
        )}
        bankBalanceCents={budgetView.moneyState.accountBalance.amountCents}
        ledgerBalance={formatCurrency(approvedLedgerCents, budgetView.currencyCode)}
        gapCents={reconciliationGapCents}
        amountCents={readyToAssignCents}
      />

      {inboxCount > 0 ? (
        <Pressable
          className="mt-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 active:bg-amber-500/20"
          onPress={() => router.push('/inbox')}>
          <Text className="font-medium">
            {inboxCount === 1 ? '1 bank message waiting' : `${inboxCount} bank messages waiting`}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Review in Inbox, then it hits the budget.
          </Text>
        </Pressable>
      ) : null}

      {reconciliationGapCents !== 0 ? (
        <View className="gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <Text className="font-medium text-destructive">Ledger is {gapAmount} off the bank</Text>
          <Text className="text-sm text-muted-foreground">
            {reconciliationGapCents > 0
              ? 'The bank has more cash than the approved ledger. Add an adjustment instead of rewriting history.'
              : 'The bank has less cash than the approved ledger. Add an adjustment instead of rewriting history.'}
          </Text>
          <Button
            onPress={() => void handleCreateReconciliationAdjustment()}
            disabled={isUpdatingBudget}>
            <Text>
              {isUpdatingBudget
                ? 'Saving…'
                : reconciliationGapCents > 0
                  ? `Add ${gapAmount} adjustment`
                  : `Remove ${gapAmount} adjustment`}
            </Text>
          </Button>
        </View>
      ) : null}

      {overspentCategories.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          className="gap-1 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 active:bg-destructive/20"
          onPress={focusOverspentEnvelope}>
          <Text className="font-medium text-destructive">
            {overspentCategories.length === 1
              ? `${overspentCategories[0].name} is overspent`
              : `${overspentCategories.length} envelopes are overspent`}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Cover it from Ready to Assign or another envelope.
          </Text>
        </Pressable>
      ) : null}

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <View className="gap-3">
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="large">Envelopes</Text>
            {envelopeEditor.addButton}
          </View>
          {readyToAssignCents > 0 ? (
            <Text className="text-sm text-muted-foreground">
              Tap an envelope to give this money a job.
            </Text>
          ) : null}
        </View>

        {budgetView.categoryGroups.map((group) => (
          <EnvelopeGroupCard
            key={group.id}
            title={group.name}
            onLongPress={() => envelopeEditor.openGroupMenu(group)}>
            {group.categories.map((category, categoryIndex) => (
              <CategoryRow
                key={category.id}
                category={category}
                containerRef={(node) => setRowRef(category.id, node)}
                currencyCode={budgetView.currencyCode}
                isExpanded={expandedCategoryId === category.id}
                isLast={categoryIndex === group.categories.length - 1}
                draft={assignmentDrafts[category.id] ?? ''}
                isUpdating={isUpdatingBudget}
                readyToAssignCents={readyToAssignCents}
                moveSources={moveSources}
                onToggle={() =>
                  setExpandedCategoryId((current) => (current === category.id ? null : category.id))
                }
                onLongPress={() => envelopeEditor.openCategoryMenu(category)}
                onDraftChange={(value) => {
                  setAssignmentDrafts((current) => ({
                    ...current,
                    [category.id]: value,
                  }));
                }}
                onAssignFromReady={(amountCents) =>
                  void handleAssignMoney(category.id, amountCents)
                }
                onMoveFrom={(fromCategoryId, amountCents) =>
                  void handleMoveMoney(fromCategoryId, category.id, amountCents)
                }
              />
            ))}
          </EnvelopeGroupCard>
        ))}
        {envelopeEditor.dialog}
      </View>
    </ScreenScroll>
  );
}

function ReadyToAssignCard({
  amount,
  bankBalance,
  ledgerBalance,
  gapCents,
  amountCents,
  bankBalanceCents,
}: {
  amount: string;
  bankBalance: string;
  ledgerBalance: string;
  gapCents: number;
  amountCents: number;
  bankBalanceCents: number;
}) {
  const helper =
    amountCents > 0
      ? 'This is leftover cash. Put it in envelopes below.'
      : amountCents < 0
        ? "You've given envelopes more than you have. Move money around."
        : 'Every dinar has a job.';

  const isNegative = amountCents < 0;
  const hasCash = amountCents > 0;

  return (
    <View
      className={
        isNegative
          ? 'gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-5'
          : hasCash
            ? 'gap-4 rounded-2xl border border-primary bg-primary p-5'
            : 'gap-4 rounded-2xl border border-border bg-card p-5'
      }>
      <View className="gap-1">
        <Text
          className={
            hasCash ? 'text-sm text-primary-foreground/70' : 'text-sm text-muted-foreground'
          }>
          To assign
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className={
            hasCash
              ? 'text-3xl font-bold text-primary-foreground'
              : moneyTextClass(amountCents, 'text-3xl font-bold')
          }>
          {amount}
        </Text>
      </View>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text
          className={
            hasCash ? 'text-sm text-primary-foreground/70' : 'text-sm text-muted-foreground'
          }>
          In the bank
        </Text>
        <Text
          className={
            hasCash
              ? 'text-base font-semibold text-primary-foreground'
              : moneyTextClass(bankBalanceCents, 'text-base font-semibold')
          }
          numberOfLines={1}>
          {bankBalance}
        </Text>
      </View>
      {gapCents !== 0 ? (
        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            className={
              hasCash ? 'text-sm text-primary-foreground/70' : 'text-sm text-muted-foreground'
            }>
            Approved ledger
          </Text>
          <Text className="text-base font-semibold text-destructive" numberOfLines={1}>
            {ledgerBalance}
          </Text>
        </View>
      ) : null}
      <Text className={hasCash ? 'text-primary-foreground/80' : 'text-muted-foreground'}>
        {helper}
      </Text>
    </View>
  );
}

function CategoryRow({
  category,
  containerRef,
  currencyCode,
  isExpanded,
  isLast,
  draft,
  isUpdating,
  readyToAssignCents,
  moveSources,
  onToggle,
  onLongPress,
  onDraftChange,
  onAssignFromReady,
  onMoveFrom,
}: {
  category: BudgetCategoryView;
  containerRef?: React.Ref<View>;
  currencyCode: string;
  isExpanded: boolean;
  isLast: boolean;
  draft: string;
  isUpdating: boolean;
  readyToAssignCents: number;
  moveSources: { id: string; label: string }[];
  onToggle: () => void;
  onLongPress: () => void;
  onDraftChange: (value: string) => void;
  onAssignFromReady: (amountCents?: number) => void;
  onMoveFrom: (fromCategoryId: string, amountCents?: number) => void;
}) {
  const isOverspent = category.availableCents < 0;
  const overspendCents = isOverspent ? Math.abs(category.availableCents) : 0;
  const [sourceId, setSourceId] = React.useState(
    readyToAssignCents > 0 ? READY_SOURCE_ID : (moveSources[0]?.id ?? READY_SOURCE_ID)
  );

  React.useEffect(() => {
    if (!isExpanded) {
      return;
    }

    onDraftChange(isOverspent ? centsToDecimalString(overspendCents) : '');
    setSourceId(readyToAssignCents > 0 ? READY_SOURCE_ID : (moveSources[0]?.id ?? READY_SOURCE_ID));
    // Prefill only when a row is opened, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, category.id]);

  const sourceOptions = [
    {
      id: READY_SOURCE_ID,
      label: `Ready to assign · ${formatCurrency(readyToAssignCents, currencyCode)}`,
    },
    ...moveSources,
  ];
  const canSubmit =
    sourceId === READY_SOURCE_ID || moveSources.some((source) => source.id === sourceId);

  function submit(amountCents?: number) {
    if (sourceId === READY_SOURCE_ID) {
      onAssignFromReady(amountCents);
      return;
    }

    onMoveFrom(sourceId, amountCents);
  }

  return (
    <View
      ref={containerRef}
      collapsable={false}
      className={isLast ? undefined : 'border-b border-border'}>
      <Pressable
        className="gap-1 px-5 py-4 active:bg-muted/40"
        delayLongPress={400}
        onPress={onToggle}
        onLongPress={onLongPress}>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-medium">{category.name}</Text>
          <View className="flex-row items-center gap-2">
            <Text className={moneyTextClass(category.availableCents, 'text-base font-semibold')}>
              {formatCurrency(category.availableCents, currencyCode)}
            </Text>
            <Icon
              as={isExpanded ? ChevronUp : ChevronDown}
              className="text-muted-foreground"
              size={16}
            />
          </View>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm text-muted-foreground">
            Assigned {formatCurrency(category.assignedCents, currencyCode)} · Spent{' '}
            {formatCurrency(Math.abs(Math.min(category.activityCents, 0)), currencyCode)}
          </Text>
          {isOverspent ? (
            <Text className="text-xs font-medium uppercase text-destructive">Overspent</Text>
          ) : null}
        </View>
        <ProgressBar
          value={
            category.assignedCents > 0
              ? Math.abs(Math.min(category.activityCents, 0)) / category.assignedCents
              : isOverspent
                ? 1
                : 0
          }
          tone={isOverspent ? 'destructive' : 'primary'}
        />
      </Pressable>

      {isExpanded ? (
        <View className="gap-3 border-t border-border bg-muted/20 px-5 py-4">
          {isOverspent ? (
            <Text className="text-sm text-destructive">
              Cover {formatCurrency(overspendCents, currencyCode)} to get this back to zero.
            </Text>
          ) : null}

          <FormField
            label="Amount"
            value={draft}
            onChangeText={onDraftChange}
            placeholder={readyToAssignCents > 0 ? centsToDecimalString(readyToAssignCents) : '0.00'}
            keyboardType="decimal-pad"
          />

          <View className="gap-2">
            <Text className="text-sm font-medium">Take it from</Text>
            <CategoryChips
              options={sourceOptions}
              selectedId={sourceId}
              onSelect={setSourceId}
              disabled={isUpdating}
            />
          </View>

          {readyToAssignCents > 0 && sourceId === READY_SOURCE_ID && !isOverspent ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => onAssignFromReady(readyToAssignCents)}
              disabled={isUpdating}>
              <Text>Assign all {formatCurrency(readyToAssignCents, currencyCode)}</Text>
            </Button>
          ) : null}

          <Button onPress={() => submit()} disabled={isUpdating || !canSubmit}>
            <Text>
              {isUpdating
                ? 'Saving…'
                : sourceId === READY_SOURCE_ID
                  ? isOverspent
                    ? 'Cover from Ready to Assign'
                    : readyToAssignCents <= 0
                      ? 'Assign anyway'
                      : `Add to ${category.name}`
                  : 'Move into this envelope'}
            </Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
