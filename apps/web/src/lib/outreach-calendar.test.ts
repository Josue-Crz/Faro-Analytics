import { describe, expect, it } from 'vitest';

import {
  calendarMonth,
  companyOutreachDaySignals,
  companyOutreachHistory,
  currentPlanningReferenceTime,
  generalCompanyOutreachPlan,
  isFuturePlanningInstant,
  OUTREACH_TIMING_BENCHMARK,
  outreachBenchmarkAlignment,
  quarterMarker,
} from './outreach-calendar';

const interactions = [
  {
    contactId: 'company-contact',
    direction: 'OUTBOUND',
    occurredAt: '2026-06-29T18:00:00.000Z',
  },
  {
    contactId: 'company-contact',
    direction: 'INBOUND',
    occurredAt: '2026-06-30T17:00:00.000Z',
  },
  {
    contactId: 'non-company-contact',
    direction: 'OUTBOUND',
    occurredAt: '2026-07-01T18:00:00.000Z',
  },
];

describe('general-company outreach calendar', () => {
  it('rebases a stale planning snapshot so yesterday cannot remain the current send time', () => {
    expect(
      currentPlanningReferenceTime('2026-07-28T17:00:00.000Z', '2026-07-29T18:30:00.000Z'),
    ).toBe('2026-07-29T18:30:00.000Z');
  });

  it('never lets an earlier client clock move the server planning boundary backward', () => {
    expect(
      currentPlanningReferenceTime('2026-07-29T18:30:00.000Z', '2026-07-29T17:45:00.000Z'),
    ).toBe('2026-07-29T18:30:00.000Z');
  });

  it('requires accepted planning instants to be strictly later than the current time', () => {
    const now = '2026-07-29T18:30:00.000Z';
    expect(isFuturePlanningInstant('2026-07-28T18:30:00.000Z', now)).toBe(false);
    expect(isFuturePlanningInstant('2026-07-29T18:29:59.999Z', now)).toBe(false);
    expect(isFuturePlanningInstant(now, now)).toBe(false);
    expect(isFuturePlanningInstant('2026-07-29T18:30:00.001Z', now)).toBe(true);
  });

  it('reports whether a recommendation aligns with the independent timing benchmark', () => {
    expect(OUTREACH_TIMING_BENCHMARK).toMatchObject({
      href: expect.stringMatching(/^https:\/\/mailchimp\.com\//),
      publisher: 'Mailchimp',
    });
    expect(outreachBenchmarkAlignment({ time: '10:00', weekday: 'Tuesday' })).toEqual({
      dayAligned: true,
      label: 'Aligned with external benchmark',
      timeAligned: true,
    });
    expect(outreachBenchmarkAlignment({ time: '14:00', weekday: 'Friday' })).toEqual({
      dayAligned: false,
      label: 'Local evidence or constraints override the benchmark',
      timeAligned: false,
    });
  });

  it('pairs tracked company sends with their next reply and excludes non-company contacts', () => {
    expect(
      companyOutreachHistory(interactions, ['company-contact'], 'America/Los_Angeles'),
    ).toEqual([
      expect.objectContaining({
        contactId: 'company-contact',
        respondedAt: '2026-06-30T17:00:00.000Z',
        sentAt: '2026-06-29T18:00:00.000Z',
      }),
    ]);
  });

  it('marks quarter beginnings and endings', () => {
    expect(quarterMarker('2026-06-30')).toBe('Q2 ends');
    expect(quarterMarker('2026-07-01')).toBe('Q3 begins');
    expect(quarterMarker('2026-07-02')).toBeNull();
  });

  it('builds an interactive six-week month model with tracked activity', () => {
    const days = calendarMonth(2026, 6, interactions, 'UTC');
    expect(days).toHaveLength(42);
    expect(days[0]?.date).toBe('2026-06-29');
    expect(days.find((day) => day.date === '2026-07-01')).toMatchObject({
      quarterMarker: 'Q3 begins',
      trackedEmails: 1,
    });
  });

  it('produces a deterministic, explainable company-planning recommendation', () => {
    const input = {
      campaign: null,
      companyContactIds: ['company-contact'],
      interactions,
      referenceTime: '2026-07-29T16:00:00.000Z',
      workspace: {
        id: 'workspace-one',
        quietHoursEnd: '08:00',
        quietHoursStart: '19:00',
        timeZone: 'America/Los_Angeles',
      },
    };
    const first = generalCompanyOutreachPlan(input);
    const second = generalCompanyOutreachPlan(input);

    expect(first).toEqual(second);
    expect(first.status).toBe('RECOMMENDED');
    if (first.status !== 'RECOMMENDED') return;
    expect(Date.parse(first.primary.recommendedAt)).toBeGreaterThan(
      Date.parse(input.referenceTime),
    );
    first.alternatives.forEach((window) => {
      expect(Date.parse(window.recommendedAt)).toBeGreaterThan(Date.parse(input.referenceTime));
    });
    expect(first.primary.contactLocal.timeZone).toBe('America/Los_Angeles');
    expect(first.explanation).toContain('historical outcomes');
    expect(first.reasonCodes).toContain('GLOBAL_HISTORY');
    expect(
      new Set([first.primary, ...first.alternatives].map((window) => window.contactLocal.date))
        .size,
    ).toBe(4);
  });

  it('brightens stronger weekdays and quarter-budget planning windows with reasons', () => {
    const input = {
      campaign: null,
      companyContactIds: ['company-contact'],
      interactions,
      referenceTime: '2026-08-20T16:00:00.000Z',
      workspace: {
        id: 'workspace-one',
        quietHoursEnd: '08:00',
        quietHoursStart: '19:00',
        timeZone: 'America/Los_Angeles',
      },
    };
    const plan = generalCompanyOutreachPlan(input);
    const signals = companyOutreachDaySignals(
      ['2026-08-23', '2026-09-15', '2026-10-01'],
      input,
      plan,
    );

    expect(signals[0]).toMatchObject({ label: 'Lower fit', level: 1 });
    expect(signals[1]?.score).toBeGreaterThan(signals[0]?.score ?? 0);
    expect(signals[1]?.reasons.join(' ')).toContain('before Q4 begins');
    expect(signals[2]).toMatchObject({ label: 'Best fit', level: 5 });
    expect(signals[2]?.reasons.join(' ')).toContain('Q4 begins on this date');
  });
});
