import {
  DEBUG_BANK_SMS_PARSER_ID,
  DEBUG_BANK_SMS_PARSER_VERSION,
  parseDebugBankSms,
} from './sms-import';
import type {
  BudgetSnapshot,
  CanonicalTransaction,
  ImportOutcome,
  RawSmsMessage,
  SmsParseResult,
} from './types';

const DEBUG_BANK_ALLOWED_SENDERS = new Set(['BANK']);

export type InboundSmsInput = {
  sender: string;
  body: string;
  receivedAt: string;
};

export type ImportOrchestrationIds = {
  rawSmsMessageId: string;
  parseResultId: string;
  transactionId: string;
  importOutcomeId: string;
};

export type ImportOrchestrationInput = {
  snapshot: BudgetSnapshot & { account: NonNullable<BudgetSnapshot['account']> };
  sms: InboundSmsInput;
  createdAt: string;
  ids: ImportOrchestrationIds;
};

export type ImportOrchestrationResult = {
  rawSmsMessage: RawSmsMessage;
  parseResult: SmsParseResult | null;
  candidateTransaction: CanonicalTransaction | null;
  importOutcome: ImportOutcome;
};

export function orchestrateSmsImport(input: ImportOrchestrationInput): ImportOrchestrationResult {
  const normalizedSms = normalizeInboundSms(input.sms);
  const rawSmsMessage: RawSmsMessage = {
    id: input.ids.rawSmsMessageId,
    sender: normalizedSms.sender,
    body: normalizedSms.body,
    receivedAt: normalizedSms.receivedAt,
    createdAt: input.createdAt,
  };

  if (!isAllowedSender(normalizedSms.sender)) {
    return {
      rawSmsMessage,
      parseResult: null,
      candidateTransaction: null,
      importOutcome: {
        id: input.ids.importOutcomeId,
        rawSmsMessageId: rawSmsMessage.id,
        parseResultId: null,
        kind: 'ignored',
        candidateTransactionId: null,
        reason: 'sender_not_allowed',
        createdAt: input.createdAt,
      },
    };
  }

  let parsedSms: ReturnType<typeof parseDebugBankSms> = null;
  let parseFailureMessage: string | null = null;

  try {
    parsedSms = parseDebugBankSms(normalizedSms.body);
  } catch (error) {
    parseFailureMessage = getErrorMessage(error);
  }

  if (parsedSms === null) {
    const parseResult: SmsParseResult = {
      id: input.ids.parseResultId,
      rawSmsMessageId: rawSmsMessage.id,
      parserId: DEBUG_BANK_SMS_PARSER_ID,
      parserVersion: DEBUG_BANK_SMS_PARSER_VERSION,
      status: 'unparseable',
      transactionId: null,
      kind: null,
      amountCents: null,
      occurredAt: null,
      balanceAfterCents: null,
      payee: null,
      memo: parseFailureMessage,
      createdAt: input.createdAt,
    };

    return {
      rawSmsMessage,
      parseResult,
      candidateTransaction: null,
      importOutcome: {
        id: input.ids.importOutcomeId,
        rawSmsMessageId: rawSmsMessage.id,
        parseResultId: parseResult.id,
        kind: 'manual_import',
        candidateTransactionId: null,
        reason: 'unparseable',
        createdAt: input.createdAt,
      },
    };
  }

  const parseResultBase = {
    id: input.ids.parseResultId,
    rawSmsMessageId: rawSmsMessage.id,
    parserId: DEBUG_BANK_SMS_PARSER_ID,
    parserVersion: DEBUG_BANK_SMS_PARSER_VERSION,
    status: 'parsed' as const,
    kind: parsedSms.kind,
    amountCents: parsedSms.kind === 'outflow' ? -parsedSms.amountCents : parsedSms.amountCents,
    occurredAt: parsedSms.occurredAt,
    balanceAfterCents: parsedSms.balanceAfterCents,
    payee: parsedSms.payee,
    memo: parsedSms.memo,
    createdAt: input.createdAt,
  };

  if (isBeforeTrackingCutover(input.snapshot, parsedSms.occurredAt)) {
    const parseResult: SmsParseResult = {
      ...parseResultBase,
      transactionId: null,
    };

    return {
      rawSmsMessage,
      parseResult,
      candidateTransaction: null,
      importOutcome: {
        id: input.ids.importOutcomeId,
        rawSmsMessageId: rawSmsMessage.id,
        parseResultId: parseResult.id,
        kind: 'ignored',
        candidateTransactionId: null,
        reason: 'before_tracking_cutover',
        createdAt: input.createdAt,
      },
    };
  }

  const candidateTransaction: CanonicalTransaction = {
    id: input.ids.transactionId,
    accountId: input.snapshot.account.id,
    source: 'sms',
    kind: parsedSms.kind,
    status: 'needs_review',
    amountCents: parseResultBase.amountCents,
    occurredAt: parsedSms.occurredAt,
    categoryId: null,
    balanceAfterCents: parsedSms.balanceAfterCents,
    payee: parsedSms.payee,
    memo: parsedSms.memo,
    createdAt: input.createdAt,
  };

  const isDuplicate = hasPossibleDuplicate(input.snapshot.transactions, candidateTransaction);
  const parseResult: SmsParseResult = {
    ...parseResultBase,
    transactionId: candidateTransaction.id,
  };

  return {
    rawSmsMessage,
    parseResult,
    candidateTransaction,
    importOutcome: {
      id: input.ids.importOutcomeId,
      rawSmsMessageId: rawSmsMessage.id,
      parseResultId: parseResult.id,
      kind: isDuplicate ? 'possible_duplicate' : 'needs_review',
      candidateTransactionId: candidateTransaction.id,
      reason: isDuplicate ? 'possible_duplicate' : 'parsed_ok',
      createdAt: input.createdAt,
    },
  };
}

function normalizeInboundSms(input: InboundSmsInput): InboundSmsInput {
  const sender = input.sender.trim();
  const body = input.body.trim();
  const receivedAt = normalizeOccurredAt(input.receivedAt);

  if (!sender) {
    throw new Error('SMS sender is required.');
  }

  if (!body) {
    throw new Error('SMS body is required.');
  }

  return {
    sender,
    body,
    receivedAt,
  };
}

function normalizeOccurredAt(value: string) {
  const occurredAt = new Date(value);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Occurred at must be a valid date.');
  }

  return occurredAt.toISOString();
}

function isAllowedSender(sender: string) {
  return DEBUG_BANK_ALLOWED_SENDERS.has(sender.trim().toUpperCase());
}

function isBeforeTrackingCutover(snapshot: BudgetSnapshot, occurredAt: string) {
  const cutover = getTrackingCutover(snapshot);
  return occurredAt.localeCompare(cutover) < 0;
}

function getTrackingCutover(snapshot: BudgetSnapshot) {
  const startingBalance = snapshot.transactions.find((transaction) => transaction.source === 'starting_balance');
  return startingBalance?.occurredAt ?? snapshot.account?.createdAt ?? '';
}

function hasPossibleDuplicate(transactions: CanonicalTransaction[], candidateTransaction: CanonicalTransaction) {
  return transactions.some((transaction) => {
    if (transaction.source !== 'sms') {
      return false;
    }

    return (
      transaction.kind === candidateTransaction.kind &&
      transaction.amountCents === candidateTransaction.amountCents &&
      transaction.occurredAt === candidateTransaction.occurredAt &&
      transaction.balanceAfterCents === candidateTransaction.balanceAfterCents
    );
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown parser error.';
}
