import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePalette } from '@/lib/theme';
import { cn } from '@/lib/utils';
import * as React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import {
  addDaysToLocalDateKey,
  formatShortDate,
  getLocalDateKey,
} from '@/src/features/budget/app-helpers';

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  autoFocus?: boolean;
};

type CategoryOption = {
  id: string;
  label: string;
};

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  autoFocus,
}: FormFieldProps) {
  const palette = usePalette();

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{label}</Text>
      <TextInput
        className={cn('rounded-xl border px-4 py-3.5', multiline && 'min-h-32')}
        style={{
          color: palette.foreground,
          backgroundColor: palette.secondary,
          borderColor: palette.border,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        autoFocus={autoFocus}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export function ScreenScroll({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View className="gap-5" style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SelectChip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = usePalette();

  return (
    <Pressable
      className={cn('rounded-full border px-3.5 py-2.5', disabled && 'opacity-50')}
      style={{
        backgroundColor: selected ? palette.primary : palette.secondary,
        borderColor: selected ? palette.primary : palette.border,
      }}
      onPress={onPress}
      disabled={disabled}>
      <Text
        className="text-sm font-medium"
        style={{ color: selected ? palette.primaryForeground : palette.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function LoadingState({ message }: { message: string }) {
  const palette = usePalette();

  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator color={palette.primary} />
      <Text className="text-muted-foreground">{message}</Text>
    </View>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  secondaryAction,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  secondaryAction?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-1 justify-center gap-4 px-5">
      <View className="gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
        <Text className="font-semibold text-destructive">{title}</Text>
        <Text className="text-destructive">{message}</Text>
      </View>
      <Button onPress={onRetry}>
        <Text>Try again</Text>
      </Button>
      {secondaryAction ? (
        <Button variant="outline" onPress={secondaryAction.onPress}>
          <Text>{secondaryAction.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-5">
      <Text variant="large">{title}</Text>
      <Text className="text-muted-foreground">{message}</Text>
      {action ? (
        <Button className="mt-2" onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
      <Text className="text-destructive">{message}</Text>
    </View>
  );
}

export function CategoryChips({
  options,
  selectedId,
  onSelect,
  disabled,
}: {
  options: CategoryOption[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) {
    return <Text className="text-sm text-muted-foreground">No categories yet.</Text>;
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((category) => (
        <SelectChip
          key={category.id}
          label={category.label}
          selected={selectedId === category.id}
          onPress={() => onSelect(category.id)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

export function KindToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'inflow' | 'outflow';
  onChange: (kind: 'inflow' | 'outflow') => void;
  disabled?: boolean;
}) {
  const palette = usePalette();

  return (
    <View
      className="flex-row rounded-xl border p-1"
      style={{ backgroundColor: palette.secondary, borderColor: palette.border }}>
      <Pressable
        className="flex-1 items-center rounded-lg py-2.5"
        style={value === 'outflow' ? { backgroundColor: palette.card } : undefined}
        onPress={() => onChange('outflow')}
        disabled={disabled}>
        <Text
          className={
            value === 'outflow' ? 'font-semibold text-destructive' : 'text-muted-foreground'
          }>
          Spending
        </Text>
      </Pressable>
      <Pressable
        className="flex-1 items-center rounded-lg py-2.5"
        style={value === 'inflow' ? { backgroundColor: palette.card } : undefined}
        onPress={() => onChange('inflow')}
        disabled={disabled}>
        <Text
          className={value === 'inflow' ? 'font-semibold text-primary' : 'text-muted-foreground'}>
          Income
        </Text>
      </Pressable>
    </View>
  );
}

export function DateQuickField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  const today = getLocalDateKey();
  const yesterday = addDaysToLocalDateKey(today, -1);
  const isPreset = value === today || value === yesterday;
  const [editingOther, setEditingOther] = React.useState(!isPreset);

  React.useEffect(() => {
    setEditingOther(value !== today && value !== yesterday);
  }, [value, today, yesterday]);

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">Date</Text>
      <View className="flex-row flex-wrap gap-2">
        <SelectChip
          label="Today"
          selected={!editingOther && value === today}
          onPress={() => {
            setEditingOther(false);
            onChange(today);
          }}
          disabled={disabled}
        />
        <SelectChip
          label="Yesterday"
          selected={!editingOther && value === yesterday}
          onPress={() => {
            setEditingOther(false);
            onChange(yesterday);
          }}
          disabled={disabled}
        />
        <SelectChip
          label={editingOther ? formatShortDate(value) : 'Other'}
          selected={editingOther}
          onPress={() => setEditingOther(true)}
          disabled={disabled}
        />
      </View>
      {editingOther ? (
        <TextInput
          className="rounded-xl border px-4 py-3.5"
          style={{
            color: palette.foreground,
            backgroundColor: palette.secondary,
            borderColor: palette.border,
          }}
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.mutedForeground}
          autoCapitalize="none"
          editable={!disabled}
        />
      ) : null}
    </View>
  );
}

export function ProgressBar({
  value,
  tone = 'primary',
}: {
  value: number;
  tone?: 'primary' | 'destructive';
}) {
  const width = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;

  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-muted">
      <View
        className={
          tone === 'destructive'
            ? 'h-full rounded-full bg-destructive'
            : 'h-full rounded-full bg-primary'
        }
        style={{ width }}
      />
    </View>
  );
}

export function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable
        className="gap-1 p-5 active:bg-muted/40"
        onPress={() => setIsOpen((current) => !current)}>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="large">{title}</Text>
          <Text className="text-sm text-muted-foreground">{isOpen ? 'Hide' : 'Show'}</Text>
        </View>
        {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
      </Pressable>
      {isOpen ? <View className="gap-4 border-t border-border p-5">{children}</View> : null}
    </View>
  );
}
