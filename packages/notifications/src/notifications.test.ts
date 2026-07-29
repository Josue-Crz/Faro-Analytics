import { describe, expect, it } from 'vitest';

import type { InternalNotification } from './contracts.js';
import { InMemoryNotificationDeduplicator } from './deduplication.js';
import { InMemoryNotificationAuditSink, NotificationDispatcher } from './dispatcher.js';
import { PreviewNotificationAdapter } from './preview-adapter.js';
import { nextAllowedNotificationAt, notificationScheduledAtOrAfter } from './scheduling.js';
import { TwilioSmsNotificationAdapter, TwilioVerifyClient } from './twilio-sms-adapter.js';

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
  it('clamps a requested time from yesterday to the current scheduling boundary', () => {
    const now = new Date('2026-07-29T18:30:00.000Z');
    expect(notificationScheduledAtOrAfter('2026-07-28T09:00:00.000Z', now).toISOString()).toBe(
      now.toISOString(),
    );
  });

  it('clamps an earlier time from the same day without moving a future time', () => {
    const now = new Date('2026-07-29T18:30:00.000Z');
    expect(notificationScheduledAtOrAfter('2026-07-29T17:45:00.000Z', now).toISOString()).toBe(
      now.toISOString(),
    );
    expect(notificationScheduledAtOrAfter('2026-07-29T19:15:00.000Z', now).toISOString()).toBe(
      '2026-07-29T19:15:00.000Z',
    );
  });

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

describe('Twilio SMS reminders', () => {
  const accountSid = `AC${'a'.repeat(32)}`;
  const apiKey = `SK${'b'.repeat(32)}`;
  const messageSid = `SM${'c'.repeat(32)}`;
  const serviceSid = `VA${'d'.repeat(32)}`;
  const verificationSid = `VE${'e'.repeat(32)}`;

  it('requires an E.164 recipient for an SMS payload', async () => {
    const provider = new TwilioSmsNotificationAdapter({
      accountSid,
      apiKey,
      apiSecret: 'test-secret',
      appUrl: 'https://faro.example',
      messagingServiceSid: `MG${'f'.repeat(32)}`,
    });

    await expect(provider.deliver({ ...notification, channel: 'SMS' })).rejects.toThrow(
      /verified recipient/i,
    );
  });

  it('submits a verified internal reminder and reports provider acceptance truthfully', async () => {
    let request: { body: string; url: string } | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = { body: String(init?.body), url: String(input) };
      return new Response(JSON.stringify({ sid: messageSid, status: 'queued' }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      });
    };
    const provider = new TwilioSmsNotificationAdapter(
      {
        accountSid,
        apiKey,
        apiSecret: 'test-secret',
        appUrl: 'https://faro.example',
        messagingServiceSid: `MG${'f'.repeat(32)}`,
      },
      () => new Date('2026-07-10T16:00:00.000Z'),
      fetcher,
    );

    await expect(
      provider.deliver({
        ...notification,
        channel: 'SMS',
        recipientPhone: '+14155550123',
      }),
    ).resolves.toMatchObject({
      providerMessageId: messageSid,
      status: 'ACCEPTED',
    });
    expect(request?.url).toContain(`/Accounts/${accountSid}/Messages.json`);
    expect(request?.body).toContain('To=%2B14155550123');
    expect(request?.body).toContain('Reply+STOP+to+unsubscribe');
    expect(request?.body).toContain('https%3A%2F%2Ffaro.example%2Ffollow-ups%2Ffollowup-one');
  });

  it('starts and checks phone possession through Twilio Verify', async () => {
    const requests: string[] = [];
    const client = new TwilioVerifyClient(
      { apiKey, apiSecret: 'test-secret', serviceSid },
      async (input, init) => {
        requests.push(`${String(input)}?${String(init?.body)}`);
        return new Response(JSON.stringify({ sid: verificationSid, status: 'approved' }), {
          headers: { 'content-type': 'application/json' },
          status: 201,
        });
      },
    );

    await expect(client.start('+14155550123')).resolves.toMatchObject({ status: 'approved' });
    await expect(client.check('+14155550123', '123456')).resolves.toMatchObject({
      status: 'approved',
    });
    expect(requests[0]).toContain(`/Services/${serviceSid}/Verifications?`);
    expect(requests[1]).toContain(`/Services/${serviceSid}/VerificationCheck?`);
  });
});
