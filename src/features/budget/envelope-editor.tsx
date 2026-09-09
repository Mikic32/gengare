import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePalette } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react-native';
import * as React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCurrency } from '@/src/features/budget/money';
import type {
  BudgetCategoryView,
  CompleteOnboardingInput,
  EnvelopeCommand,
} from '@/src/features/budget/types';

export type EditableCategory = {
  id: string;
  name: string;
};

export type EditableGroup = {
  id: string;
  name: string;
  categories: EditableCategory[];
};

type SheetAction = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

type EnvelopeDialogState =
  | {
      kind: 'sheet';
      title: string;
      actions: SheetAction[];
    }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      onConfirm: () => void;
    }
  | {
      kind: 'name';
      id: string;
      title: string;
      placeholder: string;
      initialValue: string;
      submitLabel: string;
      onSubmit: (name: string) => void;
    };

export function OnboardingEnvelopeEditor({
  groups,
  onChange,
}: {
  groups: EditableGroup[];
  onChange: React.Dispatch<React.SetStateAction<EditableGroup[]>>;
}) {
  const [dialog, setDialog] = React.useState<EnvelopeDialogState | null>(null);

  function openCreateMenu() {
    setDialog({
      kind: 'sheet',
      title: 'Add',
      actions: [
        { label: 'New group', onPress: openCreateGroup },
        { label: 'New envelope', onPress: openCreateEnvelope },
      ],
    });
  }

  function openCreateGroup() {
    setDialog({
      kind: 'name',
      id: 'create-group',
      title: 'New group',
      placeholder: 'Group name',
      initialValue: '',
      submitLabel: 'Next',
      onSubmit: (groupName) => {
        setDialog({
          kind: 'name',
          id: 'create-group-envelope',
          title: 'First envelope',
          placeholder: 'Envelope name',
          initialValue: '',
          submitLabel: 'Add',
          onSubmit: (categoryName) => {
            setDialog(null);
            onChange((current) => [
              ...current,
              {
                id: createClientId('group'),
                name: groupName,
                categories: [{ id: createClientId('category'), name: categoryName }],
              },
            ]);
          },
        });
      },
    });
  }

  function openCreateEnvelope() {
    pickGroup(groups, setDialog, (groupId) => {
      setDialog({
        kind: 'name',
        id: 'create-envelope',
        title: 'New envelope',
        placeholder: 'Envelope name',
        initialValue: '',
        submitLabel: 'Add',
        onSubmit: (name) => {
          setDialog(null);
          onChange((current) =>
            current.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    categories: [...group.categories, { id: createClientId('category'), name }],
                  }
                : group
            )
          );
        },
      });
    });
  }

  function openGroupMenu(group: EditableGroup) {
    setDialog({
      kind: 'sheet',
      title: group.name,
      actions: [
        {
          label: 'Edit',
          onPress: () =>
            setDialog({
              kind: 'name',
              id: `rename-group-${group.id}`,
              title: 'Rename group',
              placeholder: 'Group name',
              initialValue: group.name,
              submitLabel: 'Save',
              onSubmit: (name) => {
                setDialog(null);
                onChange((current) =>
                  current.map((entry) => (entry.id === group.id ? { ...entry, name } : entry))
                );
              },
            }),
        },
        {
          label: 'Remove',
          destructive: true,
          onPress: () => {
            if (countEnvelopes(groups, group.id) < 1) {
              Alert.alert('Keep at least one envelope.');
              return;
            }
            setDialog({
              kind: 'confirm',
              title: 'Remove group?',
              message: `Remove ${group.name} and its envelopes?`,
              onConfirm: () =>
                onChange((current) => current.filter((entry) => entry.id !== group.id)),
            });
          },
        },
      ],
    });
  }

  function openCategoryMenu(group: EditableGroup, category: EditableCategory) {
    setDialog({
      kind: 'sheet',
      title: category.name,
      actions: [
        {
          label: 'Edit',
          onPress: () =>
            setDialog({
              kind: 'name',
              id: `rename-category-${category.id}`,
              title: 'Rename envelope',
              placeholder: 'Envelope name',
              initialValue: category.name,
              submitLabel: 'Save',
              onSubmit: (name) => {
                setDialog(null);
                onChange((current) =>
                  current.map((entry) =>
                    entry.id !== group.id
                      ? entry
                      : {
                          ...entry,
                          categories: entry.categories.map((item) =>
                            item.id === category.id ? { ...item, name } : item
                          ),
                        }
                  )
                );
              },
            }),
        },
        {
          label: 'Remove',
          destructive: true,
          onPress: () => {
            if (countEnvelopes(groups) <= 1) {
              Alert.alert('Keep at least one envelope.');
              return;
            }
            setDialog({
              kind: 'confirm',
              title: 'Remove envelope?',
              message: `Remove ${category.name}?`,
              onConfirm: () =>
                onChange((current) =>
                  current
                    .map((entry) =>
                      entry.id !== group.id
                        ? entry
                        : {
                            ...entry,
                            categories: entry.categories.filter((item) => item.id !== category.id),
                          }
                    )
                    .filter((entry) => entry.categories.length > 0)
                ),
            });
          },
        },
      ],
    });
  }

  return (
    <View className="gap-3">
      <EnvelopeSectionHeader onAdd={openCreateMenu} />
      {groups.map((group) => (
        <EnvelopeGroupCard
          key={group.id}
          title={group.name}
          onLongPress={() => openGroupMenu(group)}>
          {group.categories.map((category, index) => (
            <Pressable
              key={category.id}
              delayLongPress={400}
              onLongPress={() => openCategoryMenu(group, category)}
              className={cn(
                'px-5 py-4 active:bg-muted/40',
                index < group.categories.length - 1 && 'border-b border-border'
              )}>
              <Text className="font-medium">{category.name}</Text>
            </Pressable>
          ))}
        </EnvelopeGroupCard>
      ))}
      <EnvelopeDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

export function useLiveEnvelopeEditor({
  disabled,
  groups,
  currencyCode,
  onCommand,
}: {
  disabled: boolean;
  groups: { id: string; name: string; categories: BudgetCategoryView[] }[];
  currencyCode: string;
  onCommand: (command: EnvelopeCommand) => Promise<void>;
}) {
  const [dialog, setDialog] = React.useState<EnvelopeDialogState | null>(null);

  function openCreateMenu() {
    if (disabled) {
      return;
    }

    setDialog({
      kind: 'sheet',
      title: 'Add',
      actions: [
        { label: 'New group', onPress: openCreateGroup },
        { label: 'New envelope', onPress: openCreateEnvelope },
      ],
    });
  }

  function openCreateGroup() {
    setDialog({
      kind: 'name',
      id: 'create-group',
      title: 'New group',
      placeholder: 'Group name',
      initialValue: '',
      submitLabel: 'Next',
      onSubmit: (name) => {
        setDialog({
          kind: 'name',
          id: 'create-group-envelope',
          title: 'First envelope',
          placeholder: 'Envelope name',
          initialValue: '',
          submitLabel: 'Add',
          onSubmit: (categoryName) => {
            setDialog(null);
            void onCommand({ kind: 'create_group', name, categoryName });
          },
        });
      },
    });
  }

  function openCreateEnvelope() {
    pickGroup(groups, setDialog, (groupId) => {
      setDialog({
        kind: 'name',
        id: 'create-envelope',
        title: 'New envelope',
        placeholder: 'Envelope name',
        initialValue: '',
        submitLabel: 'Add',
        onSubmit: (name) => {
          setDialog(null);
          void onCommand({ kind: 'create_category', groupId, name });
        },
      });
    });
  }

  function openGroupMenu(group: { id: string; name: string; categories: BudgetCategoryView[] }) {
    if (disabled) {
      return;
    }

    setDialog({
      kind: 'sheet',
      title: group.name,
      actions: [
        {
          label: 'Edit',
          onPress: () =>
            setDialog({
              kind: 'name',
              id: `rename-group-${group.id}`,
              title: 'Rename group',
              placeholder: 'Group name',
              initialValue: group.name,
              submitLabel: 'Save',
              onSubmit: (name) => {
                setDialog(null);
                void onCommand({ kind: 'rename_group', groupId: group.id, name });
              },
            }),
        },
        {
          label: 'Remove',
          destructive: true,
          onPress: () =>
            setDialog({
              kind: 'confirm',
              title: 'Remove group?',
              message: removeGroupMessage(group.categories, currencyCode),
              onConfirm: () => void onCommand({ kind: 'remove_group', groupId: group.id }),
            }),
        },
      ],
    });
  }

  function openCategoryMenu(category: BudgetCategoryView) {
    if (disabled) {
      return;
    }

    setDialog({
      kind: 'sheet',
      title: category.name,
      actions: [
        {
          label: 'Edit',
          onPress: () =>
            setDialog({
              kind: 'name',
              id: `rename-category-${category.id}`,
              title: 'Rename envelope',
              placeholder: 'Envelope name',
              initialValue: category.name,
              submitLabel: 'Save',
              onSubmit: (name) => {
                setDialog(null);
                void onCommand({ kind: 'rename_category', categoryId: category.id, name });
              },
            }),
        },
        {
          label: 'Remove',
          destructive: true,
          onPress: () =>
            setDialog({
              kind: 'confirm',
              title: 'Remove envelope?',
              message: removeCategoryMessage(category, currencyCode),
              onConfirm: () => void onCommand({ kind: 'remove_category', categoryId: category.id }),
            }),
        },
      ],
    });
  }

  return {
    addButton: <EnvelopeAddButton disabled={disabled} onPress={openCreateMenu} />,
    dialog: <EnvelopeDialog dialog={dialog} onClose={() => setDialog(null)} />,
    openGroupMenu,
    openCategoryMenu,
  };
}

export function EnvelopeGroupCard({
  title,
  onLongPress,
  children,
}: {
  title: string;
  onLongPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable
        delayLongPress={400}
        onLongPress={onLongPress}
        className="border-b border-border px-5 py-3 active:bg-muted/40">
        <Text className="font-semibold">{title}</Text>
      </Pressable>
      {children}
    </View>
  );
}

export function createEditableGroups(
  input: CompleteOnboardingInput['categoryGroups']
): EditableGroup[] {
  return input.map((group) => ({
    id: createClientId('group'),
    name: group.name,
    categories: group.categories.map((category) => ({
      id: createClientId('category'),
      name: category,
    })),
  }));
}

function EnvelopeSectionHeader({ disabled, onAdd }: { disabled?: boolean; onAdd: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="large">Envelopes</Text>
      <EnvelopeAddButton disabled={disabled} onPress={onAdd} />
    </View>
  );
}

function EnvelopeAddButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={disabled} onPress={onPress}>
      <Icon as={Plus} className="text-foreground" size={16} />
      <Text>Add</Text>
    </Button>
  );
}

function EnvelopeDialog({
  dialog,
  onClose,
}: {
  dialog: EnvelopeDialogState | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isSheet = dialog?.kind === 'sheet';

  return (
    <Modal transparent animationType="fade" visible={dialog !== null} onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          className={cn('flex-1 bg-black/50', isSheet ? 'justify-end' : 'justify-center px-6')}
          onPress={onClose}>
          <Pressable
            className={
              isSheet
                ? 'gap-1 rounded-t-3xl border-t border-border bg-card px-5 pt-5'
                : 'gap-4 rounded-2xl border border-border bg-card p-5'
            }
            style={isSheet ? { paddingBottom: Math.max(insets.bottom, 20) } : undefined}
            onPress={(event) => event.stopPropagation()}>
            {dialog?.kind === 'sheet' ? (
              <SheetBody title={dialog.title} actions={dialog.actions} onClose={onClose} />
            ) : dialog?.kind === 'confirm' ? (
              <ConfirmBody
                title={dialog.title}
                message={dialog.message}
                onCancel={onClose}
                onConfirm={() => {
                  const confirm = dialog.onConfirm;
                  onClose();
                  confirm();
                }}
              />
            ) : dialog?.kind === 'name' ? (
              <NamePrompt
                key={dialog.id}
                title={dialog.title}
                placeholder={dialog.placeholder}
                initialValue={dialog.initialValue}
                submitLabel={dialog.submitLabel}
                onCancel={onClose}
                onSubmit={dialog.onSubmit}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetBody({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <>
      <Text className="px-1 pb-3 font-semibold">{title}</Text>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="rounded-xl px-3 py-3.5 active:bg-muted/60"
          onPress={action.onPress}>
          <Text className={action.destructive ? 'font-medium text-destructive' : 'font-medium'}>
            {action.label}
          </Text>
        </Pressable>
      ))}
      <Pressable className="rounded-xl px-3 py-3.5 active:bg-muted/60" onPress={onClose}>
        <Text className="text-muted-foreground">Cancel</Text>
      </Pressable>
    </>
  );
}

function ConfirmBody({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <Text className="font-semibold">{title}</Text>
      <Text className="text-muted-foreground">{message}</Text>
      <View className="flex-row justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
        <Button size="sm" variant="destructive" onPress={onConfirm}>
          <Text>Remove</Text>
        </Button>
      </View>
    </>
  );
}

function NamePrompt({
  title,
  placeholder,
  initialValue,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  initialValue: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const palette = usePalette();
  const [draft, setDraft] = React.useState(initialValue);
  const canSubmit = draft.trim().length > 0;

  return (
    <>
      <Text className="font-semibold">{title}</Text>
      <TextInput
        className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={palette.mutedForeground}
        autoFocus
        onSubmitEditing={() => {
          if (canSubmit) {
            onSubmit(draft.trim());
          }
        }}
      />
      <View className="flex-row justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
        <Button size="sm" disabled={!canSubmit} onPress={() => onSubmit(draft.trim())}>
          <Text>{submitLabel}</Text>
        </Button>
      </View>
    </>
  );
}

function pickGroup(
  groups: { id: string; name: string }[],
  setDialog: React.Dispatch<React.SetStateAction<EnvelopeDialogState | null>>,
  onPick: (groupId: string) => void
) {
  if (groups.length === 0) {
    Alert.alert('Add a group first.');
    return;
  }

  if (groups.length === 1) {
    onPick(groups[0].id);
    return;
  }

  setDialog({
    kind: 'sheet',
    title: 'Add to group',
    actions: groups.map((group) => ({
      label: group.name,
      onPress: () => onPick(group.id),
    })),
  });
}

function countEnvelopes(groups: EditableGroup[], exceptGroupId?: string) {
  return groups.reduce(
    (total, group) => (group.id === exceptGroupId ? total : total + group.categories.length),
    0
  );
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

let clientIdCounter = 1;

function createClientId(prefix: string) {
  return `${prefix}-${clientIdCounter++}`;
}
