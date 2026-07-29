import { describe, expect, it } from 'vitest';

import { maskPhoneNumber, notificationPreferences } from './notification-preferences';

const workspace = { quietHoursEnd: '08:00', quietHoursStart: '18:00' };

describe('notification preferences', () => {
  it('applies safe defaults for an existing user with no preferences', () => {
    expect(notificationPreferences({}, workspace)).toEqual({
      dailyDigest: true,
      email: true,
      followUpLeadMinutes: 30,
      highPriorityOnly: false,
      inApp: true,
      quietHoursEnd: '08:00',
      quietHoursStart: '18:00',
      sms: false,
    });
  });

  it('preserves explicit opt-outs and validates scheduling values', () => {
    expect(
      notificationPreferences(
        {
          dailyDigest: false,
          email: false,
          followUpLeadMinutes: 60,
          highPriorityOnly: true,
          inApp: false,
          quietHoursEnd: '09:00',
          quietHoursStart: '21:00',
          sms: true,
        },
        workspace,
      ),
    ).toMatchObject({
      dailyDigest: false,
      email: false,
      followUpLeadMinutes: 60,
      highPriorityOnly: true,
      inApp: false,
      quietHoursEnd: '09:00',
      quietHoursStart: '21:00',
      sms: true,
    });
  });

  it('masks a verified recipient number before returning settings data', () => {
    expect(maskPhoneNumber('+14155550123')).toBe('+•••••••0123');
    expect(maskPhoneNumber(null)).toBeNull();
  });
});
