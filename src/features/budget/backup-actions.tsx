import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/src/features/budget/app-helpers';
import { budgetAppStore } from '@/src/features/budget/app-store';
import { pickBackupFile, shareBackupFile } from '@/src/features/budget/backup-io';
import type { BudgetView } from '@/src/features/budget/types';
import * as React from 'react';
import { Alert, View } from 'react-native';

export function BackupActions({
  onRestored,
  exportLabel = 'Export backup',
  restoreLabel = 'Restore backup',
  showExport = true,
}: {
  onRestored: (view: BudgetView | null) => void | Promise<void>;
  exportLabel?: string;
  restoreLabel?: string;
  showExport?: boolean;
}) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);

  async function handleExport() {
    setIsExporting(true);

    try {
      const now = new Date();
      await shareBackupFile(await budgetAppStore.exportBackup(now), now);
    } catch (error) {
      Alert.alert('Could not export backup', getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);

    try {
      const serialized = await pickBackupFile();
      if (serialized === null) {
        return;
      }

      const confirmed = await confirmReplaceLocalData();
      if (!confirmed) {
        return;
      }

      await onRestored(
        await budgetAppStore.restoreBackup(serialized, { confirmed: true }, new Date())
      );
    } catch (error) {
      Alert.alert('Could not restore backup', getErrorMessage(error));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <View className="gap-3">
      {showExport ? (
        <Button
          variant="outline"
          onPress={() => void handleExport()}
          disabled={isExporting || isRestoring}>
          <Text>{isExporting ? 'Exporting…' : exportLabel}</Text>
        </Button>
      ) : null}
      <Button
        variant="secondary"
        onPress={() => void handleRestore()}
        disabled={isExporting || isRestoring}>
        <Text>{isRestoring ? 'Restoring…' : restoreLabel}</Text>
      </Button>
    </View>
  );
}

function confirmReplaceLocalData() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Replace all local data?',
      'This erases the budget currently on this device and replaces it with the backup. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
