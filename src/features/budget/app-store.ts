import { createBudgetAppStore } from './app-module';
import { createAppBudgetStorage } from './storage';
import { createBudgetStore } from './store';

export { createBudgetAppStore } from './app-module';
export type { BudgetAppStore, TransactionsScreenData } from './app-module';

export const budgetAppStore = createBudgetAppStore(
  createBudgetStore(createAppBudgetStorage())
);
