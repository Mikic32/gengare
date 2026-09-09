import { Text } from '@/components/ui/text';
import { ScreenScroll } from '@/src/features/budget/app-components';
import { useAppShell } from '@/src/features/budget/app-shell';
import { BackupActions } from '@/src/features/budget/backup-actions';
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
      </ScreenScroll>
    </SafeAreaView>
  );
}
