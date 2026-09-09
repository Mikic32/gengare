import { DEBUG_BANK_ALLOWED_SENDERS, isAllowedSender } from './import-orchestration';
import type { InboundSmsInput } from './import-orchestration';

export type NativeSmsQueuePort = {
  drain(): Promise<InboundSmsInput[]>;
  scanInbox(sinceReceivedAt: string): Promise<InboundSmsInput[]>;
  setAllowedSenders(senders: readonly string[]): Promise<void>;
};

export type NativeSmsQueue = NativeSmsQueuePort & {
  receive(payload: InboundSmsInput): boolean;
  seedInbox(payload: InboundSmsInput): void;
};

export function createMemoryNativeSmsQueue(
  allowedSenders: readonly string[] = DEBUG_BANK_ALLOWED_SENDERS
): NativeSmsQueue {
  const queued: InboundSmsInput[] = [];
  const inbox: InboundSmsInput[] = [];
  let currentAllowedSenders = [...allowedSenders];

  return {
    receive(payload) {
      if (!isAllowedSender(payload.sender, currentAllowedSenders)) {
        return false;
      }

      queued.push(payload);
      return true;
    },

    seedInbox(payload) {
      inbox.push(payload);
    },

    async drain() {
      return queued.splice(0, queued.length);
    },

    async scanInbox(sinceReceivedAt) {
      return inbox.filter(
        (payload) =>
          isAllowedSender(payload.sender, currentAllowedSenders) &&
          payload.receivedAt.localeCompare(sinceReceivedAt) >= 0
      );
    },

    async setAllowedSenders(senders) {
      currentAllowedSenders = [...senders];
    },
  };
}

export function createNoopNativeSmsQueue(): NativeSmsQueue {
  return {
    receive() {
      return false;
    },
    seedInbox() {},
    async drain() {
      return [];
    },
    async scanInbox() {
      return [];
    },
    async setAllowedSenders() {},
  };
}
