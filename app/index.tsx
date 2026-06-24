import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { DEFAULT_CATEGORY_GROUPS } from '@/src/features/budget/defaults';
import { formatCurrency, parseDecimalMoneyToCents } from '@/src/features/budget/money';
import { createAppBudgetStorage } from '@/src/features/budget/storage';
import { createBudgetStore } from '@/src/features/budget/store';
import type { BudgetView, CompleteOnboardingInput } from '@/src/features/budget/types';
import { Stack } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const budgetStore = createBudgetStore(createAppBudgetStorage());

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
      const nextView = await budgetStore.getCurrentBudgetView(new Date());
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
      const nextView = await budgetStore.completeOnboarding(
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
          <BudgetScreen budgetView={budgetView} />
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

function BudgetScreen({ budgetView }: { budgetView: BudgetView }) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 py-6">
      <View className="gap-1">
        <Text variant="h3">{budgetView.accountName}</Text>
        <Text className="text-muted-foreground">
          Current month: <Text variant="code">{budgetView.monthKey}</Text>
        </Text>
      </View>

      <View className="gap-3">
        <BudgetStatCard
          label="Authoritative balance"
          value={formatCurrency(budgetView.authoritativeBalanceCents, budgetView.currencyCode)}
          helper="Latest balance carried by approved bank evidence."
        />
        <BudgetStatCard
          label="Ready to assign"
          value={formatCurrency(budgetView.readyToAssignCents, budgetView.currencyCode)}
          helper="Unassigned cash available for this month."
        />
      </View>

      <View className="gap-3">
        <Text variant="large">Budget</Text>
        {budgetView.categoryGroups.map((group) => (
          <View key={group.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Text className="text-lg font-semibold">{group.name}</Text>
            {group.categories.map((category) => (
              <View key={category.id} className="gap-1 rounded-xl bg-muted/40 p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="font-medium">{category.name}</Text>
                  <Text>{formatCurrency(category.availableCents, budgetView.currencyCode)}</Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  Assigned {formatCurrency(category.assignedCents, budgetView.currencyCode)} · Activity{' '}
                  {formatCurrency(category.activityCents, budgetView.currencyCode)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function BudgetStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <View className="gap-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-3xl font-bold">{value}</Text>
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

let clientIdCounter = 1;

function createClientId(prefix: string) {
  return `${prefix}-${clientIdCounter++}`;
}
