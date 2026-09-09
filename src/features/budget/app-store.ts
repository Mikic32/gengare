import { createActionableNotifications } from './actionable-notifications';
import { createBudgetAppStore } from './app-module';
import { createAppNotificationPresenter } from './notification-gateway';
import { createPlatformSmsQueue } from './sms-queue';
import { createAppBudgetStorage } from './storage';
import { createBudgetStore } from './store';

export { createBudgetAppStore } from './app-module';
export type {
  BudgetAppStore,
  InboxScreenData,
  ManualImportTask,
  ReportsScreenData,
  TransactionsScreenData,
} from './app-module';

export const budgetAppStore = createBudgetAppStore(
  createBudgetStore(createAppBudgetStorage(), createPlatformSmsQueue()),
  {
    notifications: createActionableNotifications({
      presenter: createAppNotificationPresenter(),
    }),
  }
);
