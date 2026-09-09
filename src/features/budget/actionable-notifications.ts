import type { BudgetView } from './types';

export type ActionableNotification = {
  title: string;
  body: string;
};

export type ActionableNotificationFacts = {
  inboxItemCount: number;
  budgetView: BudgetView | null;
};

export type NotificationPresenter = {
  present(notification: ActionableNotification): void | Promise<void>;
  clear(): void | Promise<void>;
};

export type ActionableNotifications = {
  sync(facts: ActionableNotificationFacts): void;
};

const DEFAULT_DEBOUNCE_MS = 30_000;

export function createActionableNotifications(options: {
  presenter: NotificationPresenter;
  debounceMs?: number;
}): ActionableNotifications {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPresented: ActionableNotification | null = null;

  return {
    sync(facts) {
      const notification = deriveActionableNotification(facts);

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (!notification) {
        if (lastPresented) {
          lastPresented = null;
          void options.presenter.clear();
        }
        return;
      }

      if (lastPresented && isSameNotification(notification, lastPresented)) {
        return;
      }

      timer = setTimeout(() => {
        timer = null;
        lastPresented = notification;
        void options.presenter.present(notification);
      }, debounceMs);
    },
  };
}

function deriveActionableNotification(
  facts: ActionableNotificationFacts
): ActionableNotification | null {
  const clauses: string[] = [];

  if (facts.inboxItemCount > 0) {
    clauses.push(
      `${facts.inboxItemCount} ${facts.inboxItemCount === 1 ? 'item' : 'items'} to review`
    );
  }

  const assignableCashCents = facts.budgetView?.moneyState.assignableCash.amountCents ?? 0;
  if (assignableCashCents > 0 && facts.budgetView) {
    clauses.push(`${formatCents(assignableCashCents)} ${facts.budgetView.currencyCode} to assign`);
  }

  const overspentNames = listOverspentCategoryNames(facts.budgetView);
  if (overspentNames.length === 1) {
    clauses.push(`${overspentNames[0]} is overspent`);
  } else if (overspentNames.length === 2) {
    clauses.push(`${overspentNames[0]} and ${overspentNames[1]} are overspent`);
  } else if (overspentNames.length > 2) {
    clauses.push(`${overspentNames.length} categories are overspent`);
  }

  if (assignableCashCents < 0) {
    clauses.push('Ready to Assign is negative');
  }

  if (clauses.length === 0) {
    return null;
  }

  return {
    title: 'Budget needs attention',
    body: clauses.join(' · '),
  };
}

function formatCents(amountCents: number) {
  return (Math.abs(amountCents) / 100).toFixed(2);
}

function isSameNotification(left: ActionableNotification, right: ActionableNotification) {
  return left.title === right.title && left.body === right.body;
}

function listOverspentCategoryNames(budgetView: BudgetView | null) {
  if (!budgetView) {
    return [];
  }

  return budgetView.categoryGroups.flatMap((group) =>
    group.categories
      .filter((category) => category.availableCents < 0)
      .map((category) => category.name)
  );
}
