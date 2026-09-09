import { describe, expect, it, vi } from 'vitest';

import { createDeviceNotificationPresenter } from '../notification-presenter';

describe('device notification presenter', () => {
  it('presents one local notification with a stable identifier', async () => {
    const device = createNotificationDeviceStub();
    const presenter = createDeviceNotificationPresenter(device);

    await presenter.present({
      title: 'Budget needs attention',
      body: '1 item to review',
    });

    expect(device.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(device.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'gengare-actionable',
      content: {
        title: 'Budget needs attention',
        body: '1 item to review',
      },
      trigger: null,
    });
  });

  it('clears the same local notification instead of leaving a stale alert', async () => {
    const device = createNotificationDeviceStub();
    const presenter = createDeviceNotificationPresenter(device);

    await presenter.clear();

    expect(device.dismissNotificationAsync).toHaveBeenCalledWith('gengare-actionable');
  });

  it('does not present when notification permission is denied', async () => {
    const device = createNotificationDeviceStub();
    device.getPermissionsAsync = vi.fn(async () => ({ status: 'denied' }));
    device.requestPermissionsAsync = vi.fn(async () => ({ status: 'denied' }));
    const presenter = createDeviceNotificationPresenter(device);

    await presenter.present({
      title: 'Budget needs attention',
      body: '1 item to review',
    });

    expect(device.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

function createNotificationDeviceStub() {
  return {
    setNotificationHandler: vi.fn(),
    getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    setNotificationChannelAsync: vi.fn(async () => undefined),
    scheduleNotificationAsync: vi.fn(async () => 'gengare-actionable'),
    dismissNotificationAsync: vi.fn(async () => undefined),
  };
}
