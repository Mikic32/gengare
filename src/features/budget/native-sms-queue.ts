import { DEBUG_BANK_ALLOWED_SENDERS, isAllowedSender } from './import-orchestration';
import type { InboundSmsInput } from './import-orchestration';

export type NativeSmsQueuePort = {
  drain(): Promise<InboundSmsInput[]>;
  setAllowedSenders(senders: readonly string[]): Promise<void>;
};

export type NativeSmsQueue = NativeSmsQueuePort & {
  receive(payload: InboundSmsInput): boolean;
};

export function createMemoryNativeSmsQueue(
  allowedSenders: readonly string[] = DEBUG_BANK_ALLOWED_SENDERS
): NativeSmsQueue {
  const queued: InboundSmsInput[] = [];
  let currentAllowedSenders = [...allowedSenders];

  return {
    receive(payload) {
      if (!isAllowedSender(payload.sender, currentAllowedSenders)) {
        return false;
      }

      queued.push(payload);
      return true;
    },

    async drain() {
      return queued.splice(0, queued.length);
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
    async drain() {
      return [];
    },
    async setAllowedSenders() {},
  };
}
