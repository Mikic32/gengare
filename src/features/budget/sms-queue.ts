import { createNoopNativeSmsQueue, type NativeSmsQueuePort } from './native-sms-queue';

export function createPlatformSmsQueue(): NativeSmsQueuePort {
  return createNoopNativeSmsQueue();
}
