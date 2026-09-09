import { createActionableNotifications } from './actionable-notifications';
import { createBudgetAppStore } from './app-module';
import { createAppNotificationPresenter } from './notification-gateway';
import { createAppBudgetStorage } from './storage';
import { createBudgetStore } from './store';

export { createBudgetAppStore } from './app-module';
export type {
  BudgetAppStore,
  InboxScreenData,
  ManualImportTask,
  TransactionsScreenData,
} from './app-module';

export const budgetAppStore = createBudgetAppStore(createBudgetStore(createAppBudgetStorage()), {
  notifications: createActionableNotifications({
    presenter: createAppNotificationPresenter(),
  }),
});
