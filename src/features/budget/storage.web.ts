import type { BudgetStorage, ImportedSmsFacts, RecoveredUnparseableSmsFacts } from './store';
import type { BudgetSnapshot, ImportOutcome } from './types';

const WEB_STORAGE_KEY = 'gengare-budget-snapshot';

export function createAppBudgetStorage(): BudgetStorage {
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

    async replaceSnapshot(snapshot) {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(snapshot));
    },

    async appendAssignmentEvents(events) {
      await updateWebSnapshot((snapshot) => ({
        ...snapshot,
        assignmentEvents: [...snapshot.assignmentEvents, ...events],
      }));
    },

    async appendTransaction(transaction) {
      await updateWebSnapshot((snapshot) => ({
        ...snapshot,
        transactions: [...snapshot.transactions, transaction],
      }));
    },

    async updateTransaction(transaction) {
      await updateWebSnapshot((snapshot) => ({
        ...snapshot,
        transactions: snapshot.transactions.map((entry) =>
          entry.id === transaction.id ? transaction : entry
        ),
      }));
    },

    async appendImportedSmsFacts(facts) {
      await updateWebSnapshot((snapshot) => appendImportedSmsFactsToSnapshot(snapshot, facts));
    },

    async appendRecoveredUnparseableSmsFacts(facts) {
      await updateWebSnapshot((snapshot) =>
        appendRecoveredUnparseableSmsFactsToSnapshot(snapshot, facts)
      );
    },

    async updateImportOutcome(outcome) {
      await updateWebSnapshot((snapshot) => updateImportOutcomeInSnapshot(snapshot, outcome));
    },
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

async function updateWebSnapshot(update: (snapshot: BudgetSnapshot) => BudgetSnapshot) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const rawSnapshot = localStorage.getItem(WEB_STORAGE_KEY);
  const snapshot = rawSnapshot
    ? normalizeSnapshot(JSON.parse(rawSnapshot) as Partial<BudgetSnapshot>)
    : emptySnapshot();
  localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(update(snapshot)));
}

function appendImportedSmsFactsToSnapshot(
  snapshot: BudgetSnapshot,
  facts: ImportedSmsFacts
): BudgetSnapshot {
  return {
    ...snapshot,
    transactions: facts.candidateTransaction
      ? [...snapshot.transactions, facts.candidateTransaction]
      : snapshot.transactions,
    rawSmsMessages: [...snapshot.rawSmsMessages, facts.rawSmsMessage],
    smsParseResults: facts.parseResult
      ? [...snapshot.smsParseResults, facts.parseResult]
      : snapshot.smsParseResults,
    importOutcomes: [...snapshot.importOutcomes, facts.importOutcome],
  };
}

function appendRecoveredUnparseableSmsFactsToSnapshot(
  snapshot: BudgetSnapshot,
  facts: RecoveredUnparseableSmsFacts
): BudgetSnapshot {
  return {
    ...snapshot,
    transactions: [...snapshot.transactions, facts.transaction],
    importOutcomes: snapshot.importOutcomes.map((entry) =>
      entry.id === facts.importOutcome.id ? facts.importOutcome : entry
    ),
  };
}

function updateImportOutcomeInSnapshot(
  snapshot: BudgetSnapshot,
  outcome: ImportOutcome
): BudgetSnapshot {
  return {
    ...snapshot,
    importOutcomes: snapshot.importOutcomes.map((entry) =>
      entry.id === outcome.id ? outcome : entry
    ),
  };
}
