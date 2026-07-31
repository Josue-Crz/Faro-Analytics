import { describe, expect, it } from 'vitest';

import type { NotificationPreferences } from './notification-preferences';
import { followUpNotificationPolicy } from './follow-up-notification-policy';

const preferences: NotificationPreferences = {
  dailyDigest: true,
  email: true,
  followUpLeadMinutes: 30,
  highPriorityOnly: true,
  inApp: true,
  quietHoursEnd: '08:00',
  quietHoursStart: '18:00',
  sms: false,
};

describe('required follow-up SMS policy', () => {
  it('schedules SMS for every priority once the assignee is verified and consenting', () => {
    const policy = followUpNotificationPolicy(preferences, 'LOW', {
      smsConsentAt: new Date('2026-07-29T16:00:00.000Z'),
      smsOptedOutAt: null,
      smsPhone: '+14155550123',
      smsVerifiedAt: new Date('2026-07-29T16:00:00.000Z'),
    });

    expect(policy).toEqual({ emailPreview: false, inApp: false, sms: true });
  });

  it('does not schedule SMS without verified consent or after opt-out', () => {
    expect(
      followUpNotificationPolicy(preferences, 'URGENT', {
        smsConsentAt: null,
        smsOptedOutAt: null,
        smsPhone: '+14155550123',
        smsVerifiedAt: null,
      }).sms,
    ).toBe(false);
    expect(
      followUpNotificationPolicy(preferences, 'URGENT', {
        smsConsentAt: new Date('2026-07-29T16:00:00.000Z'),
        smsOptedOutAt: new Date('2026-07-29T17:00:00.000Z'),
        smsPhone: '+14155550123',
        smsVerifiedAt: new Date('2026-07-29T16:00:00.000Z'),
      }).sms,
    ).toBe(false);
  });
});
