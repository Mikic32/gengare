import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  ScreenScroll,
} from '@/src/features/budget/app-components';
import {
  currentMonthKey,
  formatMonthLabel,
  getErrorMessage,
  moneyTextClass,
  shiftMonthKey,
} from '@/src/features/budget/app-helpers';
import { useAppShell } from '@/src/features/budget/app-shell';
import { budgetAppStore } from '@/src/features/budget/app-store';
import { formatCurrency } from '@/src/features/budget/money';
import type { BudgetView, MonthlyReport } from '@/src/features/budget/types';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportsScreen() {
  const { refreshInboxCount } = useAppShell();
  const [monthKey, setMonthKey] = React.useState(() => currentMonthKey());
  const [budgetView, setBudgetView] = React.useState<BudgetView | null>(null);
  const [report, setReport] = React.useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const loadScreenData = React.useCallback(
    async (selectedMonthKey: string, options?: { showSpinner?: boolean }) => {
      if (options?.showSpinner !== false) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const nextScreenData = await budgetAppStore.loadReportsScreenData(
          selectedMonthKey,
          new Date()
        );
        setBudgetView(nextScreenData.budgetView);
        setReport(nextScreenData.report);
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
      void loadScreenData(monthKey, { showSpinner: false });
    }, [loadScreenData, monthKey])
  );

  function handleShiftMonth(offset: number) {
    setMonthKey((current) => shiftMonthKey(current, offset));
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <LoadingState message="Loading reports…" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ErrorState
          title="Could not load reports"
          message={loadError}
          onRetry={() => void loadScreenData(monthKey)}
          secondaryAction={{ label: 'Back to budget', onPress: () => router.replace('/') }}
        />
      </SafeAreaView>
    );
  }

  if (!budgetView || !report) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 justify-center px-5">
          <EmptyState
            title="Set up your budget first"
            message="Finish setup on the budget tab before viewing reports."
            action={{ label: 'Go to budget', onPress: () => router.replace('/') }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const { cashflow, spendingByCategory } = report;
  const hasActivity = cashflow.inflowCents !== 0 || cashflow.outflowCents !== 0;
  const maxSpentCents = Math.max(0, ...spendingByCategory.map((entry) => entry.spentCents));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenScroll>
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityLabel="Previous month"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            onPress={() => handleShiftMonth(-1)}>
            <Icon as={ChevronLeft} className="text-foreground" size={22} />
          </Pressable>
          <View className="flex-1 items-center gap-1">
            <Text className="text-sm text-muted-foreground">Reports</Text>
            <Text variant="h3">{formatMonthLabel(report.monthKey)}</Text>
          </View>
          <Pressable
            accessibilityLabel="Next month"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            onPress={() => handleShiftMonth(1)}>
            <Icon as={ChevronRight} className="text-foreground" size={22} />
          </Pressable>
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-5">
          <Text variant="large">In versus out</Text>
          <CashflowRow
            label="Inflow"
            amount={formatCurrency(cashflow.inflowCents, budgetView.currencyCode)}
            cents={cashflow.inflowCents}
          />
          <CashflowRow
            label="Outflow"
            amount={formatCurrency(cashflow.outflowCents, budgetView.currencyCode)}
            cents={-cashflow.outflowCents}
          />
          <View className="border-t border-border pt-3">
            <CashflowRow
              label="Net"
              amount={formatCurrency(cashflow.netCents, budgetView.currencyCode)}
              cents={cashflow.netCents}
              emphasize
            />
          </View>
        </View>

        <View className="gap-3">
          <Text variant="large">Spending by envelope</Text>
          {!hasActivity ? (
            <EmptyState
              title="No approved activity this month"
              message="Approved inflows and outflows from the ledger will show up here."
              action={{ label: 'Go to activity', onPress: () => router.push('/transactions') }}
            />
          ) : spendingByCategory.length === 0 ? (
            <EmptyState
              title="No categorized spending"
              message="Approved outflows in this month will group here by envelope."
            />
          ) : (
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {spendingByCategory.map((category, index) => {
                const isLast = index === spendingByCategory.length - 1;
                return (
                  <View
                    key={category.categoryId}
                    className={isLast ? 'gap-2 p-5' : 'gap-2 border-b border-border p-5'}>
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="flex-1 font-semibold">{category.categoryName}</Text>
                      <Text
                        className={moneyTextClass(-category.spentCents, 'shrink-0 font-semibold')}>
                        {formatCurrency(category.spentCents, budgetView.currencyCode)}
                      </Text>
                    </View>
                    <ProgressBar
                      value={maxSpentCents > 0 ? category.spentCents / maxSpentCents : 0}
                      tone="destructive"
                    />
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScreenScroll>
    </SafeAreaView>
  );
}

function CashflowRow({
  label,
  amount,
  cents,
  emphasize,
}: {
  label: string;
  amount: string;
  cents: number;
  emphasize?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className={emphasize ? 'font-medium' : 'text-muted-foreground'}>{label}</Text>
      <Text
        numberOfLines={1}
        className={moneyTextClass(cents, emphasize ? 'font-semibold' : 'font-medium')}>
        {amount}
      </Text>
    </View>
  );
}
