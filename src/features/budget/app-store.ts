import { createAppBudgetStorage } from './storage';
import { createBudgetStore } from './store';

export const budgetStore = createBudgetStore(createAppBudgetStorage());
