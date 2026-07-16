import { describe, expect, it } from 'vitest';

import type { InternalNotification } from './contracts.js';
import { InMemoryNotificationDeduplicator } from './deduplication.js';
import { InMemoryNotificationAuditSink, NotificationDispatcher } from './dispatcher.js';
import { PreviewNotificationAdapter } from './preview-adapter.js';
import { nextAllowedNotificationAt } from './scheduling.js';

const notification: InternalNotification = {
  id: 'notification-one',
  workspaceId: 'ws-one',
  userId: 'user-one',
  followUpTaskId: 'followup-one',
  purpose: 'INTERNAL_REMINDER',
  kind: 'FOLLOW_UP',
  channel: 'EMAIL',
  title: 'Fictional follow-up is due',
  bodyText: 'Review the follow-up in Faro.',
  actionUrl: '/follow-ups/followup-one',
  scheduledFor: '2026-07-10T16:00:00.000Z',
  deduplicationKey: 'followup-one:email:2026-07-10',
};

describe('notification scheduling', () => {
  it('moves a notification out of overnight quiet hours in the user time zone', () => {
    const next = nextAllowedNotificationAt('2026-07-10T12:30:00.000Z', {
      start: '21:00',
      end: '08:00',
      timeZone: 'America/Los_Angeles',
    });

    expect(next.toISOString()).toBe('2026-07-10T15:00:00.000Z');
  });

  it('leaves an allowed instant unchanged', () => {
    const next = nextAllowedNotificationAt('2026-07-10T19:00:00.000Z', {
      start: '21:00',
      end: '08:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(next.toISOString()).toBe('2026-07-10T19:00:00.000Z');
  });

  it('uses the post-transition offset when quiet hours end after spring DST begins', () => {
    const next = nextAllowedNotificationAt('2026-03-08T09:30:00.000Z', {
      start: '21:00',
      end: '03:30',
      timeZone: 'America/Los_Angeles',
    });
    expect(next.toISOString()).toBe('2026-03-08T10:30:00.000Z');
  });

  it('moves to the first valid time when a spring DST gap contains the quiet-hours end', () => {
    const next = nextAllowedNotificationAt('2026-03-08T09:30:00.000Z', {
      start: '21:00',
      end: '02:30',
      timeZone: 'America/Los_Angeles',
    });
    expect(next.toISOString()).toBe('2026-03-08T10:00:00.000Z');
  });

  it('never schedules backward during the repeated fall DST hour', () => {
    const desired = new Date('2026-11-01T09:15:00.000Z');
    const next = nextAllowedNotificationAt(desired, {
      start: '21:00',
      end: '01:30',
      timeZone: 'America/Los_Angeles',
    });
    expect(next.toISOString()).toBe('2026-11-01T09:30:00.000Z');
    expect(next.getTime()).toBeGreaterThan(desired.getTime());
  });
});

describe('notification dispatch', () => {
  it('rejects protocol-relative action links', async () => {
    const provider = new PreviewNotificationAdapter();
    await expect(
      provider.deliver({ ...notification, actionUrl: '//evil.example/phish' }),
    ).rejects.toThrow(/single-slash/i);
  });

  it('labels preview delivery accurately and deduplicates by workspace', async () => {
    const provider = new PreviewNotificationAdapter(
      () => new Date('2026-07-10T16:00:00.000Z'),
      () => 'delivery-one',
    );
    const audit = new InMemoryNotificationAuditSink();
    const dispatcher = new NotificationDispatcher(
      provider,
      new InMemoryNotificationDeduplicator(),
      audit,
      () => new Date('2026-07-10T16:00:00.000Z'),
    );

    await expect(dispatcher.dispatch(notification)).resolves.toMatchObject({
      status: 'PREVIEWED',
      detail: expect.stringContaining('no email, push, or SMS provider was called'),
    });
    await expect(dispatcher.dispatch(notification)).resolves.toMatchObject({ status: 'DUPLICATE' });
    expect(provider.list()).toHaveLength(1);
    expect(audit.events.map((event) => event.action)).toEqual([
      'NOTIFICATION_DELIVERY_ATTEMPTED',
      'NOTIFICATION_DUPLICATE_SKIPPED',
    ]);
  });

  it('preserves the deduplication claim if auditing fails after preview delivery', async () => {
    const provider = new PreviewNotificationAdapter(
      () => new Date('2026-07-10T16:00:00.000Z'),
      () => 'delivery-one',
    );
    let auditAttempts = 0;
    const dispatcher = new NotificationDispatcher(
      provider,
      new InMemoryNotificationDeduplicator(),
      {
        record: async () => {
          auditAttempts += 1;
          if (auditAttempts === 1) throw new Error('audit unavailable');
        },
      },
      () => new Date('2026-07-10T16:00:00.000Z'),
    );

    await expect(dispatcher.dispatch(notification)).rejects.toThrow('audit unavailable');
    await expect(dispatcher.dispatch(notification)).resolves.toMatchObject({ status: 'DUPLICATE' });
    expect(provider.list()).toHaveLength(1);
  });
});
