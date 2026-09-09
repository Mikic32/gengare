import type { ActionableNotification, NotificationPresenter } from './actionable-notifications';

export const ACTIONABLE_NOTIFICATION_ID = 'gengare-actionable';

export type NotificationDevice = {
  setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner: boolean;
      shouldShowList: boolean;
    }>;
  }): void;
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  setNotificationChannelAsync?(
    channelId: string,
    config: {
      name: string;
      importance: number;
    }
  ): Promise<unknown>;
  scheduleNotificationAsync(request: {
    identifier: string;
    content: {
      title: string;
      body: string;
    };
    trigger: null;
  }): Promise<string>;
  dismissNotificationAsync(identifier: string): Promise<void>;
};

export function createDeviceNotificationPresenter(
  device: NotificationDevice,
  options?: {
    channelImportance?: number;
  }
): NotificationPresenter {
  device.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  let channelReady: Promise<void> | null = null;

  async function ensureChannel() {
    if (!device.setNotificationChannelAsync) {
      return;
    }

    if (!channelReady) {
      channelReady = device
        .setNotificationChannelAsync(ACTIONABLE_NOTIFICATION_ID, {
          name: 'Budget',
          importance: options?.channelImportance ?? 5,
        })
        .then(() => undefined);
    }

    await channelReady;
  }

  async function ensurePermission() {
    const current = await device.getPermissionsAsync();
    if (current.status === 'granted') {
      return true;
    }

    const requested = await device.requestPermissionsAsync();
    return requested.status === 'granted';
  }

  return {
    async present(notification: ActionableNotification) {
      if (!(await ensurePermission())) {
        return;
      }

      await ensureChannel();
      await device.scheduleNotificationAsync({
        identifier: ACTIONABLE_NOTIFICATION_ID,
        content: {
          title: notification.title,
          body: notification.body,
        },
        trigger: null,
      });
    },

    async clear() {
      await device.dismissNotificationAsync(ACTIONABLE_NOTIFICATION_ID);
    },
  };
}

export function createNoopNotificationPresenter(): NotificationPresenter {
  return {
    present() {},
    clear() {},
  };
}
