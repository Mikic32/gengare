import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import type { BudgetStorage } from './store';
import type {
  Account,
  AssignmentEvent,
  BudgetSnapshot,
  CanonicalTransaction,
  Category,
  CategoryGroup,
  ImportOutcome,
  RawSmsMessage,
  SmsParseResult,
} from './types';

const DB_NAME = 'gengare.db';
const WEB_STORAGE_KEY = 'gengare-budget-snapshot';

type SQLiteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

type AccountRow = {
  id: string;
  name: string;
  currency_code: string;
  created_at: string;
};

type CategoryGroupRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

type CategoryRow = {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

type TransactionRow = {
  id: string;
  account_id: string;
  source: CanonicalTransaction['source'];
  kind: CanonicalTransaction['kind'];
  status: CanonicalTransaction['status'];
  amount_cents: number;
  occurred_at: string;
  category_id: string | null;
  balance_after_cents: number | null;
  payee: string | null;
  memo: string | null;
  created_at: string;
};

type AssignmentEventRow = {
  id: string;
  category_id: string;
  month_key: string;
  amount_cents: number;
  created_at: string;
};

type RawSmsMessageRow = {
  id: string;
  sender: string;
  body: string;
  received_at: string;
  created_at: string;
};

type SmsParseResultRow = {
  id: string;
  raw_sms_message_id: string;
  parser_id: string;
  parser_version: number;
  status: SmsParseResult['status'];
  transaction_id: string | null;
  kind: SmsParseResult['kind'];
  amount_cents: number | null;
  occurred_at: string | null;
  balance_after_cents: number | null;
  payee: string | null;
  memo: string | null;
  created_at: string;
};

type ImportOutcomeRow = {
  id: string;
  raw_sms_message_id: string;
  parse_result_id: string | null;
  kind: ImportOutcome['kind'];
  candidate_transaction_id: string | null;
  reason: ImportOutcome['reason'];
  created_at: string;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

export function createAppBudgetStorage(): BudgetStorage {
  if (Platform.OS === 'web') {
    return createWebBudgetStorage();
  }

  return createSQLiteBudgetStorage();
}

function createSQLiteBudgetStorage(): BudgetStorage {
  return {
    async readSnapshot() {
      const db = await getDatabase();
      await ensureSchema(db);

      const [accountRow] = await db.getAllAsync<AccountRow>('SELECT id, name, currency_code, created_at FROM accounts LIMIT 1');
      const categoryGroupRows = await db.getAllAsync<CategoryGroupRow>(
        'SELECT id, name, sort_order, created_at FROM category_groups ORDER BY sort_order ASC'
      );
      const categoryRows = await db.getAllAsync<CategoryRow>(
        'SELECT id, group_id, name, sort_order, created_at FROM categories ORDER BY group_id ASC, sort_order ASC'
      );
      const transactionRows = await db.getAllAsync<TransactionRow>(
        'SELECT id, account_id, source, kind, status, amount_cents, occurred_at, category_id, balance_after_cents, payee, memo, created_at FROM transactions ORDER BY occurred_at ASC, created_at ASC'
      );
      const assignmentEventRows = await db.getAllAsync<AssignmentEventRow>(
        'SELECT id, category_id, month_key, amount_cents, created_at FROM assignment_events ORDER BY month_key ASC, created_at ASC'
      );
      const rawSmsMessageRows = await db.getAllAsync<RawSmsMessageRow>(
        'SELECT id, sender, body, received_at, created_at FROM raw_sms_messages ORDER BY received_at ASC, created_at ASC'
      );
      const smsParseResultRows = await db.getAllAsync<SmsParseResultRow>(
        'SELECT id, raw_sms_message_id, parser_id, parser_version, status, transaction_id, kind, amount_cents, occurred_at, balance_after_cents, payee, memo, created_at FROM sms_parse_results ORDER BY created_at ASC'
      );
      const importOutcomeRows = await db.getAllAsync<ImportOutcomeRow>(
        'SELECT id, raw_sms_message_id, parse_result_id, kind, candidate_transaction_id, reason, created_at FROM import_outcomes ORDER BY created_at ASC'
      );

      return {
        account: accountRow ? mapAccountRow(accountRow) : null,
        categoryGroups: categoryGroupRows.map(mapCategoryGroupRow),
        categories: categoryRows.map(mapCategoryRow),
        transactions: transactionRows.map(mapTransactionRow),
        assignmentEvents: assignmentEventRows.map(mapAssignmentEventRow),
        rawSmsMessages: rawSmsMessageRows.map(mapRawSmsMessageRow),
        smsParseResults: smsParseResultRows.map(mapSmsParseResultRow),
        importOutcomes: importOutcomeRows.map(mapImportOutcomeRow),
      };
    },

    async writeSnapshot(snapshot) {
      const db = await getDatabase();
      await ensureSchema(db);
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          DELETE FROM import_outcomes;
          DELETE FROM sms_parse_results;
          DELETE FROM raw_sms_messages;
          DELETE FROM assignment_events;
          DELETE FROM transactions;
          DELETE FROM categories;
          DELETE FROM category_groups;
          DELETE FROM accounts;
        `);

        if (snapshot.account) {
          await db.runAsync(
            'INSERT INTO accounts (id, name, currency_code, created_at) VALUES (?, ?, ?, ?)',
            snapshot.account.id,
            snapshot.account.name,
            snapshot.account.currencyCode,
            snapshot.account.createdAt
          );
        }

        for (const group of snapshot.categoryGroups) {
          await db.runAsync(
            'INSERT INTO category_groups (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
            group.id,
            group.name,
            group.sortOrder,
            group.createdAt
          );
        }

        for (const category of snapshot.categories) {
          await db.runAsync(
            'INSERT INTO categories (id, group_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
            category.id,
            category.groupId,
            category.name,
            category.sortOrder,
            category.createdAt
          );
        }

        for (const transaction of snapshot.transactions) {
          await db.runAsync(
            'INSERT INTO transactions (id, account_id, source, kind, status, amount_cents, occurred_at, category_id, balance_after_cents, payee, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            transaction.id,
            transaction.accountId,
            transaction.source,
            transaction.kind,
            transaction.status,
            transaction.amountCents,
            transaction.occurredAt,
            transaction.categoryId,
            transaction.balanceAfterCents,
            transaction.payee,
            transaction.memo,
            transaction.createdAt
          );
        }

        for (const rawSmsMessage of snapshot.rawSmsMessages) {
          await db.runAsync(
            'INSERT INTO raw_sms_messages (id, sender, body, received_at, created_at) VALUES (?, ?, ?, ?, ?)',
            rawSmsMessage.id,
            rawSmsMessage.sender,
            rawSmsMessage.body,
            rawSmsMessage.receivedAt,
            rawSmsMessage.createdAt
          );
        }

        for (const smsParseResult of snapshot.smsParseResults) {
          await db.runAsync(
            'INSERT INTO sms_parse_results (id, raw_sms_message_id, parser_id, parser_version, status, transaction_id, kind, amount_cents, occurred_at, balance_after_cents, payee, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            smsParseResult.id,
            smsParseResult.rawSmsMessageId,
            smsParseResult.parserId,
            smsParseResult.parserVersion,
            smsParseResult.status,
            smsParseResult.transactionId,
            smsParseResult.kind,
            smsParseResult.amountCents,
            smsParseResult.occurredAt,
            smsParseResult.balanceAfterCents,
            smsParseResult.payee,
            smsParseResult.memo,
            smsParseResult.createdAt
          );
        }

        for (const importOutcome of snapshot.importOutcomes) {
          await db.runAsync(
            'INSERT INTO import_outcomes (id, raw_sms_message_id, parse_result_id, kind, candidate_transaction_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            importOutcome.id,
            importOutcome.rawSmsMessageId,
            importOutcome.parseResultId,
            importOutcome.kind,
            importOutcome.candidateTransactionId,
            importOutcome.reason,
            importOutcome.createdAt
          );
        }

        for (const assignmentEvent of snapshot.assignmentEvents) {
          await db.runAsync(
            'INSERT INTO assignment_events (id, category_id, month_key, amount_cents, created_at) VALUES (?, ?, ?, ?, ?)',
            assignmentEvent.id,
            assignmentEvent.categoryId,
            assignmentEvent.monthKey,
            assignmentEvent.amountCents,
            assignmentEvent.createdAt
          );
        }
      });
    },
  };
}

function createWebBudgetStorage(): BudgetStorage {
  return {
    async readSnapshot() {
      if (typeof localStorage === 'undefined') {
        return emptySnapshot();
      }

      const raw = localStorage.getItem(WEB_STORAGE_KEY);
      if (!raw) {
        return emptySnapshot();
      }

      return normalizeSnapshot(JSON.parse(raw) as Partial<BudgetSnapshot>);
    },

    async writeSnapshot(snapshot) {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(snapshot));
    },
  };
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DB_NAME);
  }

  return databasePromise;
}

async function ensureSchema(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES category_groups (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      category_id TEXT,
      balance_after_cents INTEGER,
      payee TEXT,
      memo TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_events (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS raw_sms_messages (
      id TEXT PRIMARY KEY NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sms_parse_results (
      id TEXT PRIMARY KEY NOT NULL,
      raw_sms_message_id TEXT NOT NULL,
      parser_id TEXT NOT NULL,
      parser_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      transaction_id TEXT,
      kind TEXT,
      amount_cents INTEGER,
      occurred_at TEXT,
      balance_after_cents INTEGER,
      payee TEXT,
      memo TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (raw_sms_message_id) REFERENCES raw_sms_messages (id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS import_outcomes (
      id TEXT PRIMARY KEY NOT NULL,
      raw_sms_message_id TEXT NOT NULL,
      parse_result_id TEXT,
      kind TEXT NOT NULL,
      candidate_transaction_id TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (raw_sms_message_id) REFERENCES raw_sms_messages (id) ON DELETE CASCADE,
      FOREIGN KEY (parse_result_id) REFERENCES sms_parse_results (id) ON DELETE SET NULL,
      FOREIGN KEY (candidate_transaction_id) REFERENCES transactions (id) ON DELETE SET NULL
    );
  `);
}

function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
}

function mapCategoryGroupRow(row: CategoryGroupRow): CategoryGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapTransactionRow(row: TransactionRow): CanonicalTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    source: row.source,
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    balanceAfterCents: row.balance_after_cents,
    payee: row.payee,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

function mapAssignmentEventRow(row: AssignmentEventRow): AssignmentEvent {
  return {
    id: row.id,
    categoryId: row.category_id,
    monthKey: row.month_key,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  };
}

function mapRawSmsMessageRow(row: RawSmsMessageRow): RawSmsMessage {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    receivedAt: row.received_at,
    createdAt: row.created_at,
  };
}

function mapSmsParseResultRow(row: SmsParseResultRow): SmsParseResult {
  return {
    id: row.id,
    rawSmsMessageId: row.raw_sms_message_id,
    parserId: row.parser_id,
    parserVersion: row.parser_version,
    status: row.status,
    transactionId: row.transaction_id,
    kind: row.kind,
    amountCents: row.amount_cents,
    occurredAt: row.occurred_at,
    balanceAfterCents: row.balance_after_cents,
    payee: row.payee,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

function mapImportOutcomeRow(row: ImportOutcomeRow): ImportOutcome {
  return {
    id: row.id,
    rawSmsMessageId: row.raw_sms_message_id,
    parseResultId: row.parse_result_id,
    kind: row.kind,
    candidateTransactionId: row.candidate_transaction_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function emptySnapshot(): BudgetSnapshot {
  return {
    account: null,
    categoryGroups: [],
    categories: [],
    transactions: [],
    assignmentEvents: [],
    rawSmsMessages: [],
    smsParseResults: [],
    importOutcomes: [],
  };
}

function normalizeSnapshot(snapshot: Partial<BudgetSnapshot>): BudgetSnapshot {
  return {
    account: snapshot.account ?? null,
    categoryGroups: snapshot.categoryGroups ?? [],
    categories: snapshot.categories ?? [],
    transactions: snapshot.transactions ?? [],
    assignmentEvents: snapshot.assignmentEvents ?? [],
    rawSmsMessages: snapshot.rawSmsMessages ?? [],
    smsParseResults: snapshot.smsParseResults ?? [],
    importOutcomes: snapshot.importOutcomes ?? [],
  };
}
