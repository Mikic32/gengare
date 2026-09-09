import { Text } from '@/components/ui/text';
import { storeColorScheme, usePalette, type AppColorScheme } from '@/lib/theme';
import { useColorScheme } from 'nativewind';
import { Pressable, View } from 'react-native';

export function AppearanceSettings() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const scheme: AppColorScheme = colorScheme === 'dark' ? 'dark' : 'light';

  function applyScheme(next: AppColorScheme) {
    setColorScheme(next);
    storeColorScheme(next);
  }

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text variant="large">Appearance</Text>
        <Text className="text-muted-foreground">Light or dark mode for this device.</Text>
      </View>
      <ThemeToggle value={scheme} onChange={applyScheme} />
    </View>
  );
}

function ThemeToggle({
  value,
  onChange,
}: {
  value: AppColorScheme;
  onChange: (scheme: AppColorScheme) => void;
}) {
  const palette = usePalette();

  return (
    <View
      className="flex-row rounded-xl border p-1"
      style={{ backgroundColor: palette.secondary, borderColor: palette.border }}>
      <Pressable
        className="flex-1 items-center rounded-lg py-2.5"
        style={value === 'light' ? { backgroundColor: palette.card } : undefined}
        onPress={() => onChange('light')}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'light' }}
        accessibilityLabel="Light mode">
        <Text
          className={value === 'light' ? 'font-semibold text-primary' : 'text-muted-foreground'}>
          Light
        </Text>
      </Pressable>
      <Pressable
        className="flex-1 items-center rounded-lg py-2.5"
        style={value === 'dark' ? { backgroundColor: palette.card } : undefined}
        onPress={() => onChange('dark')}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'dark' }}
        accessibilityLabel="Dark mode">
        <Text className={value === 'dark' ? 'font-semibold text-primary' : 'text-muted-foreground'}>
          Dark
        </Text>
      </Pressable>
    </View>
  );
}
