import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { DEFAULT_CATEGORY_GROUPS } from '@/src/features/budget/defaults';
import { formatCurrency, parseDecimalMoneyToCents } from '@/src/features/budget/money';
import { BudgetStatCard, FormField } from '@/src/features/budget/app-components';
import { getErrorMessage, parseRequiredPositiveAmountToCents } from '@/src/features/budget/app-helpers';
import { budgetAppStore } from '@/src/features/budget/app-store';
import type { BudgetView, CompleteOnboardingInput } from '@/src/features/budget/types';
import { router, Stack } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_OPTIONS = {
  title: 'Gengare',
  headerShown: false,
};

type EditableCategory = {
  id: string;
  name: string;
};

type EditableGroup = {
  id: string;
  name: string;
  categories: EditableCategory[];
};

type MoveCategoryOption = {
  id: string;
  name: string;
  groupName: string;
};

export default function Screen() {
  const [budgetView, setBudgetView] = React.useState<BudgetView | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [accountName, setAccountName] = React.useState('Main account');
  const [currencyCode, setCurrencyCode] = React.useState('RSD');
  const [startingBalance, setStartingBalance] = React.useState('0.00');
  const [groups, setGroups] = React.useState<EditableGroup[]>(() => createEditableGroups(DEFAULT_CATEGORY_GROUPS));

  React.useEffect(() => {
    void loadBudgetView();
  }, []);

  async function loadBudgetView() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextView = await budgetAppStore.getBudgetView(new Date());
      setBudgetView(nextView);
    } catch (loadError) {
      setLoadError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

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
    } catch (submitError) {
      const message = getErrorMessage(submitError);
      setSubmitError(message);
      Alert.alert('Could not create budget', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <SafeAreaView className="flex-1 bg-background">
        {isLoading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator />
            <Text className="text-muted-foreground">Loading local budget…</Text>
          </View>
        ) : loadError ? (
          <View className="flex-1 justify-center gap-4 px-5">
            <View className="gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <Text className="font-semibold text-destructive">Could not load local budget</Text>
              <Text className="text-destructive">{loadError}</Text>
            </View>
            <Button onPress={() => void loadBudgetView()}>
              <Text>Retry loading</Text>
            </Button>
          </View>
        ) : budgetView ? (
          <BudgetScreen budgetView={budgetView} onBudgetViewChange={setBudgetView} />
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 py-6">
            <View className="gap-2">
              <Text variant="h3">Bootstrap your local budget</Text>
              <Text className="text-muted-foreground">
                Create the first on-budget account, seed your category groups, and lock in the
                starting balance that anchors the rest of the budget.
              </Text>
            </View>

            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <FormField
                label="Account name"
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Main account"
              />
              <FormField
                label="Currency code"
                value={currencyCode}
                onChangeText={(value) => setCurrencyCode(value.toUpperCase())}
                placeholder="RSD"
                autoCapitalize="characters"
              />
              <FormField
                label="Starting balance"
                value={startingBalance}
                onChangeText={setStartingBalance}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text variant="large">Category groups</Text>
                <Button size="sm" variant="outline" onPress={() => setGroups((current) => [...current, createEmptyGroup()])}>
                  <Text>Add group</Text>
                </Button>
              </View>

              {groups.map((group, groupIndex) => (
                <View key={group.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <FormField
                        label={`Group ${groupIndex + 1}`}
                        value={group.name}
                        onChangeText={(value) => {
                          setGroups((current) =>
                            current.map((entry) => (entry.id === group.id ? { ...entry, name: value } : entry))
                          );
                        }}
                        placeholder="Essentials"
                      />
                    </View>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setGroups((current) => current.filter((entry) => entry.id !== group.id));
                      }}>
                      <Text>Remove</Text>
                    </Button>
                  </View>

                  <View className="gap-2">
                    {group.categories.map((category, categoryIndex) => (
                      <View key={category.id} className="flex-row items-end gap-2">
                        <View className="flex-1">
                          <FormField
                            label={`Category ${categoryIndex + 1}`}
                            value={category.name}
                            onChangeText={(value) => {
                              setGroups((current) =>
                                current.map((entry) =>
                                  entry.id !== group.id
                                    ? entry
                                    : {
                                        ...entry,
                                        categories: entry.categories.map((item) =>
                                          item.id === category.id ? { ...item, name: value } : item
                                        ),
                                      }
                                )
                              );
                            }}
                            placeholder="Groceries"
                          />
                        </View>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            setGroups((current) =>
                              current.map((entry) =>
                                entry.id !== group.id
                                  ? entry
                                  : {
                                      ...entry,
                                      categories: entry.categories.filter((item) => item.id !== category.id),
                                    }
                              )
                            );
                          }}>
                          <Text>Remove</Text>
                        </Button>
                      </View>
                    ))}
                  </View>

                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setGroups((current) =>
                        current.map((entry) =>
                          entry.id !== group.id
                            ? entry
                            : {
                                ...entry,
                                categories: [...entry.categories, createEmptyCategory()],
                              }
                        )
                      );
                    }}>
                    <Text>Add category</Text>
                  </Button>
                </View>
              ))}
            </View>

            {submitError ? (
              <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                <Text className="text-destructive">{submitError}</Text>
              </View>
            ) : null}

            <Button onPress={handleCreateBudget} disabled={isSubmitting}>
              <Text>{isSubmitting ? 'Creating budget…' : 'Create budget'}</Text>
            </Button>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function BudgetScreen({
  budgetView,
  onBudgetViewChange,
}: {
  budgetView: BudgetView;
  onBudgetViewChange: React.Dispatch<React.SetStateAction<BudgetView | null>>;
}) {
  const [assignmentDrafts, setAssignmentDrafts] = React.useState<Record<string, string>>({});
  const [moveAmount, setMoveAmount] = React.useState('');
  const [moveFromCategoryId, setMoveFromCategoryId] = React.useState<string | null>(null);
  const [moveToCategoryId, setMoveToCategoryId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isUpdatingBudget, setIsUpdatingBudget] = React.useState(false);
  const categoryOptions = React.useMemo<MoveCategoryOption[]>(
    () =>
      budgetView.categoryGroups.flatMap((group) =>
        group.categories.map((category) => ({
          id: category.id,
          name: category.name,
          groupName: group.name,
        }))
      ),
    [budgetView]
  );

  React.useEffect(() => {
    setMoveFromCategoryId((current) => {
      if (current && categoryOptions.some((option) => option.id === current)) {
        return current;
      }

      return categoryOptions[0]?.id ?? null;
    });
  }, [categoryOptions]);

  React.useEffect(() => {
    setMoveToCategoryId((current) => {
      if (
        current &&
        current !== moveFromCategoryId &&
        categoryOptions.some((option) => option.id === current)
      ) {
        return current;
      }

      return categoryOptions.find((option) => option.id !== moveFromCategoryId)?.id ?? null;
    });
  }, [categoryOptions, moveFromCategoryId]);

  async function handleAssignMoney(categoryId: string) {
    setIsUpdatingBudget(true);
    setActionError(null);

    try {
      const nextView = await budgetAppStore.assignMoneyToCategory(
        {
          categoryId,
          amountCents: parseRequiredPositiveAmountToCents(
            assignmentDrafts[categoryId] ?? '',
            'Assignment amount'
          ),
        },
        new Date()
      );

      onBudgetViewChange(nextView);
      setAssignmentDrafts((current) => ({
        ...current,
        [categoryId]: '',
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      Alert.alert('Could not assign money', message);
    } finally {
      setIsUpdatingBudget(false);
    }
  }

  async function handleMoveMoney() {
    setIsUpdatingBudget(true);
    setActionError(null);

    try {
      if (!moveFromCategoryId || !moveToCategoryId) {
        throw new Error('Pick both a source and destination category.');
      }

      const nextView = await budgetAppStore.moveMoneyBetweenCategories(
        {
          fromCategoryId: moveFromCategoryId,
          toCategoryId: moveToCategoryId,
          amountCents: parseRequiredPositiveAmountToCents(moveAmount, 'Move amount'),
        },
        new Date()
      );

      onBudgetViewChange(nextView);
      setMoveAmount('');
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      Alert.alert('Could not move money', message);
    } finally {
      setIsUpdatingBudget(false);
    }
  }

  const selectedMoveFrom = categoryOptions.find((option) => option.id === moveFromCategoryId) ?? null;
  const selectedMoveTo = categoryOptions.find((option) => option.id === moveToCategoryId) ?? null;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 py-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="gap-1">
          <Text variant="h3">{budgetView.accountName}</Text>
          <Text className="text-muted-foreground">
            Current month: <Text variant="code">{budgetView.monthKey}</Text>
          </Text>
        </View>
        <Button size="sm" variant="outline" onPress={() => router.push('./transactions')}>
          <Text>Transactions</Text>
        </Button>
      </View>

      <View className="gap-3">
        <BudgetStatCard
          label="Account balance"
          value={formatCurrency(budgetView.moneyState.accountBalance.amountCents, budgetView.currencyCode)}
          helper="Latest non-ignored bank balance evidence."
        />
        <BudgetStatCard
          label="Ready to assign"
          value={formatCurrency(budgetView.moneyState.assignableCash.amountCents, budgetView.currencyCode)}
          helper="Approved uncategorized cash available this month."
          valueClassName={budgetView.moneyState.assignableCash.amountCents < 0 ? 'text-destructive' : undefined}
        />
      </View>

      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <Text variant="large">Move money</Text>
        {categoryOptions.length < 2 ? (
          <Text className="text-sm text-muted-foreground">
            Create at least two categories before moving money between them.
          </Text>
        ) : (
          <>
            <Text className="text-sm text-muted-foreground">
              From {formatMoveCategoryLabel(selectedMoveFrom)} to {formatMoveCategoryLabel(selectedMoveTo)}
            </Text>
            <View className="gap-2">
              <Text className="text-sm font-medium">Amount</Text>
              <TextInput
                className="rounded-xl border border-border bg-background px-4 py-3 text-foreground"
                value={moveAmount}
                onChangeText={setMoveAmount}
                placeholder="0.00"
                placeholderTextColor="#71717a"
                keyboardType="decimal-pad"
              />
            </View>
            <Button
              onPress={() => void handleMoveMoney()}
              disabled={isUpdatingBudget || !moveFromCategoryId || !moveToCategoryId}>
              <Text>{isUpdatingBudget ? 'Updating budget…' : 'Move money'}</Text>
            </Button>
          </>
        )}
      </View>

      {actionError ? (
        <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <Text className="text-destructive">{actionError}</Text>
        </View>
      ) : null}

      <View className="gap-3">
        <Text variant="large">Budget</Text>
        {budgetView.categoryGroups.map((group) => (
          <View key={group.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Text className="text-lg font-semibold">{group.name}</Text>
            {group.categories.map((category) => (
              <View key={category.id} className="gap-1 rounded-xl bg-muted/40 p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="font-medium">{category.name}</Text>
                  <Text className={category.availableCents < 0 ? 'text-destructive' : undefined}>
                    {formatCurrency(category.availableCents, budgetView.currencyCode)}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  Assigned {formatCurrency(category.assignedCents, budgetView.currencyCode)} · Activity{' '}
                  {formatCurrency(category.activityCents, budgetView.currencyCode)}
                </Text>
                <View className="mt-2 flex-row items-end gap-2">
                  <View className="flex-1 gap-2">
                    <Text className="text-sm font-medium">Assign this month</Text>
                    <TextInput
                      className="rounded-xl border border-border bg-background px-4 py-3 text-foreground"
                      value={assignmentDrafts[category.id] ?? ''}
                      onChangeText={(value) => {
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [category.id]: value,
                        }));
                      }}
                      placeholder="0.00"
                      placeholderTextColor="#71717a"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Button
                    size="sm"
                    onPress={() => void handleAssignMoney(category.id)}
                    disabled={isUpdatingBudget}>
                    <Text>{isUpdatingBudget ? 'Saving…' : 'Assign'}</Text>
                  </Button>
                </View>
                <View className="mt-2 flex-row gap-2">
                  <Button
                    size="sm"
                    variant={moveFromCategoryId === category.id ? 'secondary' : 'outline'}
                    onPress={() => setMoveFromCategoryId(category.id)}
                    disabled={categoryOptions.length < 2 || isUpdatingBudget}>
                    <Text>Set from</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant={moveToCategoryId === category.id ? 'secondary' : 'outline'}
                    onPress={() => setMoveToCategoryId(category.id)}
                    disabled={categoryOptions.length < 2 || isUpdatingBudget}>
                    <Text>Set to</Text>
                  </Button>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function createEditableGroups(input: CompleteOnboardingInput['categoryGroups']): EditableGroup[] {
  return input.map((group) => ({
    id: createClientId('group'),
    name: group.name,
    categories: group.categories.map((category) => ({
      id: createClientId('category'),
      name: category,
    })),
  }));
}

function createEmptyGroup(): EditableGroup {
  return {
    id: createClientId('group'),
    name: '',
    categories: [createEmptyCategory()],
  };
}

function createEmptyCategory(): EditableCategory {
  return {
    id: createClientId('category'),
    name: '',
  };
}

function formatMoveCategoryLabel(category: MoveCategoryOption | null) {
  if (!category) {
    return 'nothing';
  }

  return `${category.groupName} / ${category.name}`;
}

let clientIdCounter = 1;

function createClientId(prefix: string) {
  return `${prefix}-${clientIdCounter++}`;
}
