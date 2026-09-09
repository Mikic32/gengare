import * as Notifications from 'expo-notifications';

import { createDeviceNotificationPresenter } from './notification-presenter';

export function createAppNotificationPresenter() {
  return createDeviceNotificationPresenter(Notifications, {
    channelImportance: Notifications.AndroidImportance.DEFAULT,
  });
}
