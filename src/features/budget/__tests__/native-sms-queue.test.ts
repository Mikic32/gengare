import { describe, expect, it } from 'vitest';

import { createMemoryNativeSmsQueue } from '../native-sms-queue';

describe('native SMS queue', () => {
  it('queues raw SMS from an allowed sender', async () => {
    const queue = createMemoryNativeSmsQueue();
    const payload = {
      sender: 'BANK',
      body: 'Odliv: 1.568,80 RSD',
      receivedAt: '2026-06-25T10:31:00.000Z',
    };

    expect(queue.receive(payload)).toBe(true);
    expect(await queue.drain()).toEqual([payload]);
  });

  it('ignores SMS from a sender that is not allowlisted', async () => {
    const queue = createMemoryNativeSmsQueue();

    expect(
      queue.receive({
        sender: 'SPAMMER',
        body: 'Odliv: 1.568,80 RSD',
        receivedAt: '2026-06-25T10:31:00.000Z',
      })
    ).toBe(false);

    expect(await queue.drain()).toEqual([]);
  });

  it('matches allowed senders case-insensitively after trim', async () => {
    const queue = createMemoryNativeSmsQueue();
    const payload = {
      sender: ' bank ',
      body: 'Priliv: 5.825,00 RSD',
      receivedAt: '2026-06-25T10:31:00.000Z',
    };

    expect(queue.receive(payload)).toBe(true);
    expect(await queue.drain()).toEqual([payload]);
  });

  it('drains queued payloads in arrival order and clears the queue', async () => {
    const queue = createMemoryNativeSmsQueue();
    const first = {
      sender: 'BANK',
      body: 'first',
      receivedAt: '2026-06-25T10:31:00.000Z',
    };
    const second = {
      sender: 'BANK',
      body: 'second',
      receivedAt: '2026-06-25T10:32:00.000Z',
    };

    queue.receive(first);
    queue.receive({
      sender: 'SPAMMER',
      body: 'noise',
      receivedAt: '2026-06-25T10:31:30.000Z',
    });
    queue.receive(second);

    expect(await queue.drain()).toEqual([first, second]);
    expect(await queue.drain()).toEqual([]);
  });

  it('scans allowlisted inbox messages received after the cutover', async () => {
    const queue = createMemoryNativeSmsQueue();
    const kept = {
      sender: 'OTP_Info',
      body: 'Odliv: 735,70 RSD',
      receivedAt: '2026-09-09T17:39:19.000Z',
    };

    queue.seedInbox({
      sender: 'OTP_Info',
      body: 'old',
      receivedAt: '2026-09-08T10:00:00.000Z',
    });
    queue.seedInbox({
      sender: 'SPAMMER',
      body: 'noise',
      receivedAt: '2026-09-09T17:39:19.000Z',
    });
    queue.seedInbox(kept);

    expect(await queue.scanInbox('2026-09-09T00:00:00.000Z')).toEqual([kept]);
  });
});
