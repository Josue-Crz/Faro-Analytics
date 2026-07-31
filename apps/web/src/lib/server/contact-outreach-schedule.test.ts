import { describe, expect, it } from 'vitest';

import { ContactOutreachScheduleError, optimizeContactSchedule } from './contact-outreach-schedule';

const context = {
  campaign: {
    endAt: new Date('2026-08-20T23:59:00.000Z'),
    id: 'campaign-one',
  },
  contact: {
    consentStatus: 'OPTED_IN' as const,
    id: 'contact-one',
    interactions: [],
    organizationId: 'organization-one',
    preferredChannel: 'EMAIL' as const,
    suppressedAt: null,
    timezone: 'America/Los_Angeles',
  },
  priority: 'HIGH' as const,
  workspace: {
    id: 'workspace-one',
    quietHoursEnd: '08:00',
    quietHoursStart: '20:00',
    timeZone: 'America/Los_Angeles',
  },
};

describe('contact outreach schedule optimization', () => {
  it('assigns a future initial contact and a later cooldown-safe follow-up from an explicit clock', () => {
    const now = new Date('2026-07-30T16:12:00.000Z');
    const schedule = optimizeContactSchedule(context, now);

    expect(schedule.initialAt.getTime()).toBeGreaterThan(now.getTime());
    expect(schedule.followUpAt.getTime()).toBeGreaterThan(schedule.initialAt.getTime());
    expect(schedule.followUpAt.getTime() - schedule.initialAt.getTime()).toBeGreaterThanOrEqual(
      48 * 60 * 60_000,
    );
    expect(schedule.initial.reproducibility.referenceTime).toBe(now.toISOString());
    expect(schedule.followUp.reproducibility.referenceTime).toBe(schedule.initialAt.toISOString());
  });

  it('does not schedule a contact without outreach permission', () => {
    expect(() =>
      optimizeContactSchedule(
        {
          ...context,
          contact: { ...context.contact, consentStatus: 'UNKNOWN' },
        },
        new Date('2026-07-30T16:12:00.000Z'),
      ),
    ).toThrowError(new ContactOutreachScheduleError('OUTREACH_NOT_ALLOWED'));
  });

  it('does not silently discard a campaign deadline that cannot fit the follow-up', () => {
    expect(() =>
      optimizeContactSchedule(
        {
          ...context,
          campaign: { ...context.campaign, endAt: new Date('2026-07-31T18:00:00.000Z') },
        },
        new Date('2026-07-30T16:12:00.000Z'),
      ),
    ).toThrowError('OPTIMIZER_COULD_NOT_SCHEDULE');
  });
});
