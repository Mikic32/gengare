export type CurrencyCode = string;

export type Account = {
  id: string;
  name: string;
  currencyCode: CurrencyCode;
  createdAt: string;
};

export type CategoryGroup = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type Category = {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type TransactionSource = 'starting_balance' | 'manual' | 'sms' | 'reconciliation';
export type TransactionKind = 'inflow' | 'outflow';
export type TransactionStatus = 'approved' | 'needs_review' | 'ignored';

export type CanonicalTransaction = {
  id: string;
  accountId: string;
  source: TransactionSource;
  kind: TransactionKind;
  status: TransactionStatus;
  amountCents: number;
  occurredAt: string;
  categoryId: string | null;
  balanceAfterCents: number | null;
  payee: string | null;
  memo: string | null;
  createdAt: string;
};

export type RawSmsMessage = {
  id: string;
  sender: string;
  body: string;
  receivedAt: string;
  createdAt: string;
};

export type SmsParseResultStatus = 'parsed' | 'unparseable';

export type SmsParseResult = {
  id: string;
  rawSmsMessageId: string;
  parserId: string;
  parserVersion: number;
  status: SmsParseResultStatus;
  transactionId: string | null;
  kind: TransactionKind | null;
  amountCents: number | null;
  occurredAt: string | null;
  balanceAfterCents: number | null;
  payee: string | null;
  memo: string | null;
  createdAt: string;
};

export type ImportOutcomeKind = 'needs_review' | 'manual_import' | 'possible_duplicate' | 'ignored';
export type ImportOutcomeReason =
  | 'parsed_ok'
  | 'unparseable'
  | 'possible_duplicate'
  | 'sender_not_allowed'
  | 'before_tracking_cutover';

export type ImportOutcome = {
  id: string;
  rawSmsMessageId: string;
  parseResultId: string | null;
  kind: ImportOutcomeKind;
  candidateTransactionId: string | null;
  reason: ImportOutcomeReason;
  createdAt: string;
};

export type AssignmentEvent = {
  id: string;
  categoryId: string;
  monthKey: string;
  amountCents: number;
  createdAt: string;
};

export type BudgetSnapshot = {
  account: Account | null;
  categoryGroups: CategoryGroup[];
  categories: Category[];
  transactions: CanonicalTransaction[];
  assignmentEvents: AssignmentEvent[];
  rawSmsMessages: RawSmsMessage[];
  smsParseResults: SmsParseResult[];
  importOutcomes: ImportOutcome[];
};

export type OnboardingCategoryGroupInput = {
  name: string;
  categories: string[];
};

export type CompleteOnboardingInput = {
  accountName: string;
  currencyCode: CurrencyCode;
  startingBalanceCents: number;
  categoryGroups: OnboardingCategoryGroupInput[];
};

export type BudgetCategoryView = {
  id: string;
  name: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
};

export type BudgetCategoryGroupView = {
  id: string;
  name: string;
  categories: BudgetCategoryView[];
};

export type BudgetView = {
  accountName: string;
  currencyCode: CurrencyCode;
  monthKey: string;
  authoritativeBalanceCents: number;
  readyToAssignCents: number;
  categoryGroups: BudgetCategoryGroupView[];
};
