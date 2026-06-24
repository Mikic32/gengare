import type { OnboardingCategoryGroupInput } from './types';

export const DEFAULT_CATEGORY_GROUPS: OnboardingCategoryGroupInput[] = [
  {
    name: 'Essentials',
    categories: ['Rent', 'Groceries', 'Utilities'],
  },
  {
    name: 'Lifestyle',
    categories: ['Eating out', 'Transport', 'Fun'],
  },
  {
    name: 'Savings',
    categories: ['Emergency fund', 'Buffer'],
  },
];
