import { requireNativeModule } from 'expo';

import type { NativeSmsQueuePort } from './native-sms-queue';

type NativeSmsQueueModule = {
  drain(): Promise<Array<{ sender: string; body: string; receivedAt: string }>>;
  setAllowedSenders(senders: string[]): Promise<void>;
};

const nativeSmsQueue = requireNativeModule<NativeSmsQueueModule>('SmsQueue');

export function createPlatformSmsQueue(): NativeSmsQueuePort {
  return {
    drain() {
      return nativeSmsQueue.drain();
    },
    setAllowedSenders(senders) {
      return nativeSmsQueue.setAllowedSenders([...senders]);
    },
  };
}
