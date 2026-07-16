import { describe, expect, it } from 'vitest';

import {
  OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
  optimizeOutreachWindow,
  type OutreachOptimizerInput,
  type RecommendedWindow,
} from './index';

function input(overrides: Partial<OutreachOptimizerInput> = {}): OutreachOptimizerInput {
  return {
    referenceTime: '2026-07-10T23:00:00.000Z',
    contact: {
      id: 'contact-1',
      timeZone: 'America/New_York',
      consentStatus: 'OPTED_IN',
      suppressed: false,
      organizationId: 'organization-1',
      cohortId: 'sponsor',
      preferredChannel: 'EMAIL',
    },
    workspace: {
      id: 'workspace-1',
      timeZone: 'America/Los_Angeles',
      quietHours: [{ start: '19:00', end: '08:00' }],
    },
    campaign: {
      id: 'campaign-1',
      channel: 'EMAIL',
      priority: 'MEDIUM',
      sequenceStage: 1,
    },
    ...overrides,
  };
}

function localMinutes(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

function allWindows(primary: RecommendedWindow, alternatives: readonly RecommendedWindow[]) {
  return [primary, ...alternatives];
}

describe('optimizeOutreachWindow', () => {
  it('uses a reproducible, low-confidence business-hours fallback when history is absent', () => {
    const first = optimizeOutreachWindow(input());
    const second = optimizeOutreachWindow(input());

    expect(first).toEqual(second);
    expect(first.status).toBe('RECOMMENDED');
    if (first.status !== 'RECOMMENDED') return;

    expect(first.algorithmVersion).toBe(OUTREACH_OPTIMIZER_ALGORITHM_VERSION);
    expect(first.reproducibility.inputHash).toMatch(/^fnv1a64-[0-9a-f]{16}$/);
    expect(first.reproducibility.referenceTime).toBe('2026-07-10T23:00:00.000Z');
    expect(first.reproducibility.evaluatedCandidates).toBeGreaterThan(0);
    expect(first.dataSufficiency).toBe('INSUFFICIENT');
    expect(first.confidence).toBeLessThanOrEqual(0.33);
    expect(first.warnings).toEqual(
      expect.arrayContaining(['DEFAULT_CONTACT_QUIET_HOURS_APPLIED', 'NO_HISTORICAL_DATA']),
    );
    expect(first.reasonCodes).toEqual(
      expect.arrayContaining([
        'CONTACT_TIMEZONE',
        'DEFAULT_BUSINESS_WINDOW',
        'PREFERRED_CHANNEL',
        'QUIET_HOURS_RESPECTED',
      ]),
    );
    expect(first.primary.contactLocal.timeZone).toBe('America/New_York');
    expect(first.primary.contactLocal.weekday).toBe('Monday');
    // 09:00 Eastern is still inside the workspace's Pacific quiet hours.
    expect(first.primary.contactLocal.time).toBe('11:00');
    expect(first.alternatives).toHaveLength(3);
  });

  it('treats suppression and unverified consent as unconditional hard stops', () => {
    const suppressed = optimizeOutreachWindow(
      input({ contact: { ...input().contact, suppressed: true } }),
    );
    const unknownConsent = optimizeOutreachWindow(
      input({ contact: { ...input().contact, consentStatus: 'UNKNOWN' } }),
    );

    expect(suppressed.status).toBe('BLOCKED');
    expect(unknownConsent.status).toBe('BLOCKED');
    if (suppressed.status === 'BLOCKED' && unknownConsent.status === 'BLOCKED') {
      expect(suppressed.blockers.map((blocker) => blocker.code)).toEqual(['SUPPRESSED_CONTACT']);
      expect(unknownConsent.blockers.map((blocker) => blocker.code)).toEqual([
        'CONSENT_NOT_GRANTED',
      ]);
      expect(suppressed.reproducibility.evaluatedCandidates).toBe(0);
      expect(unknownConsent.reproducibility.evaluatedCandidates).toBe(0);
    }
  });

  it('enforces contact, workspace, and user quiet hours in their own timezones', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T00:00:00.000Z',
        contact: {
          ...input().contact,
          timeZone: 'Europe/London',
          quietHours: [{ start: '20:00', end: '08:00' }],
        },
        workspace: {
          ...input().workspace,
          timeZone: 'America/Los_Angeles',
          quietHours: [{ start: '18:00', end: '07:00' }],
        },
        userSchedule: {
          timeZone: 'Asia/Tokyo',
          quietHours: [{ start: '02:00', end: '06:00' }],
        },
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    for (const window of allWindows(result.primary, result.alternatives)) {
      const contactTime = localMinutes(window.recommendedAt, 'Europe/London');
      const workspaceTime = localMinutes(window.recommendedAt, 'America/Los_Angeles');
      const userTime = localMinutes(window.recommendedAt, 'Asia/Tokyo');
      expect(contactTime >= 8 * 60 && contactTime < 20 * 60).toBe(true);
      expect(workspaceTime >= 7 * 60 && workspaceTime < 18 * 60).toBe(true);
      expect(userTime < 2 * 60 || userTime >= 6 * 60).toBe(true);
    }
  });

  it('skips the nonexistent spring-forward hour', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-03-08T06:30:00.000Z', // 01:30 EST
        contact: {
          ...input().contact,
          timeZone: 'America/New_York',
          quietHours: [{ start: '00:00', end: '03:00' }],
        },
        workspace: { ...input().workspace, quietHours: [] },
        campaign: {
          ...input().campaign,
          priority: 'URGENT',
          deadline: '2026-03-08T08:00:00.000Z',
        },
        options: { intervalMinutes: 60, horizonDays: 1, alternativeCount: 2 },
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    expect(result.primary.recommendedAt).toBe('2026-03-08T07:00:00.000Z');
    expect(result.primary.contactLocal.time).toBe('03:00');
    expect(
      allWindows(result.primary, result.alternatives).some((window) =>
        window.contactLocal.time.startsWith('02:'),
      ),
    ).toBe(false);
  });

  it('applies quiet hours to both copies of a repeated fall-back hour', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-11-01T04:30:00.000Z', // 00:30 EDT
        contact: {
          ...input().contact,
          timeZone: 'America/New_York',
          quietHours: [{ start: '00:00', end: '02:00' }],
        },
        workspace: { ...input().workspace, quietHours: [] },
        campaign: {
          ...input().campaign,
          priority: 'URGENT',
          deadline: '2026-11-01T08:00:00.000Z',
        },
        options: { intervalMinutes: 60, horizonDays: 1, alternativeCount: 2 },
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    // 01:00 occurs at both 05:00Z and 06:00Z; both must be excluded.
    expect(result.primary.recommendedAt).toBe('2026-11-01T07:00:00.000Z');
    expect(result.primary.contactLocal.time).toBe('02:00');
  });

  it('aligns candidate slots to local wall-clock boundaries in non-hour-offset timezones', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T00:07:00.000Z',
        contact: {
          ...input().contact,
          timeZone: 'Asia/Kathmandu',
          quietHours: [],
        },
        workspace: { ...input().workspace, quietHours: [] },
        options: { intervalMinutes: 30, horizonDays: 2, alternativeCount: 2 },
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    for (const window of allWindows(result.primary, result.alternatives)) {
      expect([0, 30]).toContain(Number(window.contactLocal.time.slice(3)));
    }
  });

  it('honors cooldown and rolling frequency caps before evaluating candidate scores', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T12:00:00.000Z',
        contact: { ...input().contact, timeZone: 'UTC', quietHours: [] },
        workspace: { ...input().workspace, timeZone: 'UTC', quietHours: [] },
        recentContactOutreach: [
          { sentAt: '2026-07-06T08:00:00.000Z', respondedAt: '2026-07-06T09:00:00.000Z' },
        ],
        frequencyPolicy: {
          minimumHoursBetweenAttempts: 48,
          lookbackDays: 7,
          maximumAttemptsInLookback: 3,
          maximumUnansweredAttempts: 3,
        },
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    expect(Date.parse(result.primary.recommendedAt)).toBeGreaterThanOrEqual(
      Date.parse('2026-07-08T08:00:00.000Z'),
    );
    expect(result.reasonCodes).toContain('FREQUENCY_COOLDOWN');

    const rollingCap = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T12:00:00.000Z',
        contact: { ...input().contact, timeZone: 'UTC', quietHours: [] },
        workspace: { ...input().workspace, timeZone: 'UTC', quietHours: [] },
        recentContactOutreach: [
          { sentAt: '2026-07-01T12:00:00.000Z', respondedAt: '2026-07-01T13:00:00.000Z' },
          { sentAt: '2026-07-03T12:00:00.000Z', respondedAt: '2026-07-03T13:00:00.000Z' },
          { sentAt: '2026-07-05T12:00:00.000Z', respondedAt: '2026-07-05T13:00:00.000Z' },
        ],
      }),
    );
    expect(rollingCap.status).toBe('RECOMMENDED');
    if (rollingCap.status === 'RECOMMENDED') {
      expect(Date.parse(rollingCap.primary.recommendedAt)).toBeGreaterThanOrEqual(
        Date.parse('2026-07-08T12:00:00.000Z'),
      );
      expect(rollingCap.reasonCodes).toContain('FREQUENCY_ROLLING_CAP');
    }

    const unansweredCap = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T12:00:00.000Z',
        recentContactOutreach: [
          { sentAt: '2026-07-01T12:00:00.000Z' },
          { sentAt: '2026-07-03T12:00:00.000Z' },
          { sentAt: '2026-07-05T12:00:00.000Z' },
        ],
      }),
    );
    expect(unansweredCap.status).toBe('BLOCKED');
    if (unansweredCap.status === 'BLOCKED') {
      expect(unansweredCap.blockers[0]?.code).toBe('UNANSWERED_OUTREACH_CAP_REACHED');
      expect(unansweredCap.nextEligibleAt).toBeNull();
    }
  });

  it('down-weights windows too close to the last interaction', () => {
    const common = input({
      referenceTime: '2026-07-06T08:00:00.000Z',
      contact: { ...input().contact, timeZone: 'UTC', quietHours: [] },
      workspace: { ...input().workspace, timeZone: 'UTC', quietHours: [] },
      options: { horizonDays: 1, intervalMinutes: 30, alternativeCount: 2 },
    });
    const withoutRecentInteraction = optimizeOutreachWindow(common);
    const withRecentInteraction = optimizeOutreachWindow({
      ...common,
      lastInteractionAt: '2026-07-06T07:55:00.000Z',
    });

    expect(withoutRecentInteraction.status).toBe('RECOMMENDED');
    expect(withRecentInteraction.status).toBe('RECOMMENDED');
    if (
      withoutRecentInteraction.status === 'RECOMMENDED' &&
      withRecentInteraction.status === 'RECOMMENDED'
    ) {
      expect(withRecentInteraction.primary.score).toBeLessThan(
        withoutRecentInteraction.primary.score,
      );
      expect(withRecentInteraction.reasonCodes).toContain('TIME_SINCE_LAST_INTERACTION');
    }
  });

  it('smooths sparse contact observations with broader fallbacks and labels them honestly', () => {
    const result = optimizeOutreachWindow(
      input({
        referenceTime: '2026-07-06T00:00:00.000Z',
        contact: { ...input().contact, timeZone: 'UTC', quietHours: [] },
        workspace: { ...input().workspace, timeZone: 'UTC', quietHours: [] },
        historicalOutcomes: [
          {
            sentAt: '2026-07-01T14:00:00.000Z',
            respondedAt: '2026-07-01T15:00:00.000Z',
            contactId: 'contact-1',
            organizationId: 'organization-1',
            campaignId: 'campaign-1',
            cohortId: 'sponsor',
            channel: 'EMAIL',
            timeZone: 'UTC',
          },
        ],
      }),
    );

    expect(result.status).toBe('RECOMMENDED');
    if (result.status !== 'RECOMMENDED') return;
    expect(result.dataSufficiency).toBe('LOW');
    expect(result.historicalObservationCount).toBe(1);
    expect(result.effectiveHistoricalObservationCount).toBe(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0.39);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.warnings).toContain('SPARSE_HISTORICAL_DATA');
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        'CONTACT_HISTORY',
        'CAMPAIGN_HISTORY',
        'ORGANIZATION_HISTORY',
        'COHORT_HISTORY',
        'RESPONSE_TIME_PATTERN',
      ]),
    );
  });

  it('rejects ambiguous instants and invalid IANA timezones at the package boundary', () => {
    expect(() => optimizeOutreachWindow(input({ referenceTime: '2026-07-10T12:00:00' }))).toThrow(
      /explicit offset/,
    );
    expect(() =>
      optimizeOutreachWindow(
        input({ contact: { ...input().contact, timeZone: 'Mars/Olympus_Mons' } }),
      ),
    ).toThrow(/valid IANA timezone/);
  });
});
