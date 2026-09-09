import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export function createBackupFilename(now: Date = new Date()) {
  return `gengare-backup-${now.toISOString().slice(0, 10)}.json`;
}

export async function shareBackupFile(serialized: string, now: Date = new Date()) {
  const file = new File(Paths.cache, createBackupFilename(now));
  file.create({ overwrite: true });
  file.write(serialized);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export budget backup',
  });
}

export async function pickBackupFile(): Promise<string | null> {
  try {
    const picked = await File.pickFileAsync();
    const file = Array.isArray(picked) ? picked[0] : picked;
    return await file.text();
  } catch (error) {
    if (isPickerCancellation(error)) {
      return null;
    }

    throw error;
  }
}

function isPickerCancellation(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('cancel') || message.includes('dismiss');
}
