import { Text } from '@/components/ui/text';
import { ScreenScroll } from '@/src/features/budget/app-components';
import { useAppShell } from '@/src/features/budget/app-shell';
import { AppearanceSettings } from '@/src/features/budget/appearance-settings';
import { BackupActions } from '@/src/features/budget/backup-actions';
import { DebugResetActions } from '@/src/features/budget/debug-reset';
import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { refreshInboxCount, setOnboarded } = useAppShell();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenScroll>
        <View className="gap-2">
          <Text variant="h3">Settings</Text>
        </View>

        <AppearanceSettings />

        <View className="gap-3">
          <View className="gap-2">
            <Text variant="large">Backup</Text>
            <Text className="text-muted-foreground">
              Backups are local files. Restore replaces everything on this device.
            </Text>
          </View>
          <BackupActions
            onRestored={async (view) => {
              setOnboarded(view !== null);
              await refreshInboxCount();
              if (view) {
                router.replace('/');
              }
            }}
          />
        </View>

        <DebugResetActions
          onReset={async () => {
            setOnboarded(false);
            await refreshInboxCount();
            router.replace('/');
          }}
        />
      </ScreenScroll>
    </SafeAreaView>
  );
}
