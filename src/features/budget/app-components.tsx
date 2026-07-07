import { Text } from '@/components/ui/text';
import * as React from 'react';
import { TextInput, View } from 'react-native';

type BudgetStatCardProps = {
  label: string;
  value: string;
  helper: string;
  valueClassName?: string;
};

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

export function BudgetStatCard({
  label,
  value,
  helper,
  valueClassName,
}: BudgetStatCardProps) {
  return (
    <View className="gap-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className={`text-3xl font-bold ${valueClassName ?? ''}`.trim()}>
        {value}
      </Text>
      <Text className="text-sm text-muted-foreground">{helper}</Text>
    </View>
  );
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: FormFieldProps) {
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
