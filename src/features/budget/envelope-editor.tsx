import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePalette } from '@/lib/theme';
import * as React from 'react';
import { Alert, TextInput, View } from 'react-native';

import { formatCurrency } from '@/src/features/budget/money';
import type { BudgetCategoryView, BudgetView, EnvelopeCommand } from '@/src/features/budget/types';

export function EnvelopeEditor({
  budgetView,
  disabled,
  onCommand,
}: {
  budgetView: BudgetView;
  disabled: boolean;
  onCommand: (command: EnvelopeCommand) => Promise<void>;
}) {
  return (
    <View className="gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onPress={() =>
          void onCommand({
            kind: 'create_group',
            name: 'New group',
            categoryName: 'New envelope',
          })
        }>
        <Text>Add group</Text>
      </Button>

      {budgetView.categoryGroups.map((group) => (
        <View key={group.id} className="gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <EditableName
                value={group.name}
                placeholder="Group name"
                disabled={disabled}
                emphasized
                onSubmit={(name) =>
                  void onCommand({ kind: 'rename_group', groupId: group.id, name })
                }
              />
            </View>
            <Button
              size="sm"
              variant="ghostDestructive"
              disabled={disabled}
              onPress={() =>
                confirmRemove({
                  title: 'Remove group?',
                  message: removeGroupMessage(group.categories, budgetView.currencyCode),
                  onConfirm: () => void onCommand({ kind: 'remove_group', groupId: group.id }),
                })
              }>
              <Text>Remove</Text>
            </Button>
          </View>

          <View className="gap-2">
            {group.categories.map((category) => (
              <View key={category.id} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <EditableName
                    value={category.name}
                    placeholder="Envelope name"
                    disabled={disabled}
                    onSubmit={(name) =>
                      void onCommand({ kind: 'rename_category', categoryId: category.id, name })
                    }
                  />
                </View>
                <Button
                  size="sm"
                  variant="ghostDestructive"
                  disabled={disabled}
                  onPress={() =>
                    confirmRemove({
                      title: 'Remove envelope?',
                      message: removeCategoryMessage(category, budgetView.currencyCode),
                      onConfirm: () =>
                        void onCommand({ kind: 'remove_category', categoryId: category.id }),
                    })
                  }>
                  <Text>Remove</Text>
                </Button>
              </View>
            ))}
          </View>

          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              void onCommand({
                kind: 'create_category',
                groupId: group.id,
                name: 'New envelope',
              })
            }>
            <Text>Add envelope</Text>
          </Button>
        </View>
      ))}
    </View>
  );
}

function EditableName({
  value,
  placeholder,
  disabled,
  emphasized,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  emphasized?: boolean;
  onSubmit: (name: string) => void;
}) {
  const palette = usePalette();
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    const nextName = draft.trim();
    if (!nextName) {
      setDraft(value);
      return;
    }

    if (nextName !== value) {
      onSubmit(nextName);
    }
  }

  return (
    <TextInput
      className={
        emphasized
          ? 'rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground'
          : 'rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground'
      }
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      placeholderTextColor={palette.mutedForeground}
      editable={!disabled}
    />
  );
}

function confirmRemove({
  title,
  message,
  onConfirm,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

function removeCategoryMessage(category: BudgetCategoryView, currencyCode: string) {
  if (category.availableCents > 0) {
    return `${category.name} still has ${formatCurrency(category.availableCents, currencyCode)}. That cash goes back to Ready to Assign.`;
  }

  if (category.availableCents < 0) {
    return `${category.name} is overspent by ${formatCurrency(Math.abs(category.availableCents), currencyCode)}. Removing it covers that from Ready to Assign.`;
  }

  return `Remove ${category.name}? Live transactions still using it must be recategorized first.`;
}

function removeGroupMessage(categories: BudgetCategoryView[], currencyCode: string) {
  const leftoverCents = categories.reduce((total, category) => total + category.availableCents, 0);
  if (leftoverCents > 0) {
    return `Leftover ${formatCurrency(leftoverCents, currencyCode)} goes back to Ready to Assign.`;
  }

  if (leftoverCents < 0) {
    return `Overspending of ${formatCurrency(Math.abs(leftoverCents), currencyCode)} will be covered from Ready to Assign.`;
  }

  return 'Live transactions still using these envelopes must be recategorized first.';
}
