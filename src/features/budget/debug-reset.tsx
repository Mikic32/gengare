import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/src/features/budget/app-helpers';
import { budgetAppStore } from '@/src/features/budget/app-store';
import * as React from 'react';
import { Alert, View } from 'react-native';

export function DebugResetActions({ onReset }: { onReset: () => void | Promise<void> }) {
  const [isResetting, setIsResetting] = React.useState(false);

  async function handleReset() {
    const confirmed = await confirmResetLocalData();
    if (!confirmed) {
      return;
    }

    setIsResetting(true);

    try {
      await budgetAppStore.resetLocalData({ confirmed: true });
      await onReset();
    } catch (error) {
      Alert.alert('Could not reset app data', getErrorMessage(error));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text variant="large">Debug</Text>
        <Text className="text-muted-foreground">
          Temporary. Wipes the local database, queued SMS, notifications, and onboarding.
        </Text>
      </View>
      <Button variant="destructive" onPress={() => void handleReset()} disabled={isResetting}>
        <Text>{isResetting ? 'Resetting…' : 'Reset app data'}</Text>
      </Button>
    </View>
  );
}

function confirmResetLocalData() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Reset all local data?',
      'This erases the budget, SMS inbox, and queued messages on this device. You will go back to onboarding. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
