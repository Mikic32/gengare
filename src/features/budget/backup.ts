import type { BudgetSnapshot } from './types';

export const BACKUP_FORMAT = 'gengare-backup';
export const BACKUP_VERSION = 1;

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  snapshot: BudgetSnapshot;
};

export function serializeBackup(snapshot: BudgetSnapshot, now: Date = new Date()): string {
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    snapshot: cloneSnapshot(snapshot),
  };

  return JSON.stringify(document);
}

export function parseBackup(serialized: string): BudgetSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    throw new Error('Backup is not a gengare backup.');
  }

  if (parsed.version !== BACKUP_VERSION) {
    throw new Error('Backup version is not supported.');
  }

  if (!hasSnapshotCollections(parsed.snapshot)) {
    throw new Error('Backup snapshot is incomplete.');
  }

  return cloneSnapshot(parsed.snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSnapshotCollections(value: unknown): value is BudgetSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.account === null || isRecord(value.account)) &&
    Array.isArray(value.categoryGroups) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.assignmentEvents) &&
    Array.isArray(value.rawSmsMessages) &&
    Array.isArray(value.smsParseResults) &&
    Array.isArray(value.importOutcomes)
  );
}

function cloneSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot {
  return {
    account: snapshot.account ? { ...snapshot.account } : null,
    categoryGroups: snapshot.categoryGroups.map((group) => ({ ...group })),
    categories: snapshot.categories.map((category) => ({ ...category })),
    transactions: snapshot.transactions.map((transaction) => ({ ...transaction })),
    assignmentEvents: snapshot.assignmentEvents.map((event) => ({ ...event })),
    rawSmsMessages: snapshot.rawSmsMessages.map((message) => ({ ...message })),
    smsParseResults: snapshot.smsParseResults.map((result) => ({ ...result })),
    importOutcomes: snapshot.importOutcomes.map((outcome) => ({ ...outcome })),
  };
}
