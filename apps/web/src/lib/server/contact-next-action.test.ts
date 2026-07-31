import { describe, expect, it } from 'vitest';

import { calculateContactNextAction, type ContactNextActionInput } from './contact-next-action';

const now = new Date('2026-07-29T17:00:00.000Z');
const input: ContactNextActionInput = {
  campaign: { endAt: new Date('2026-08-20T17:00:00.000Z'), id: 'campaign-one' },
  consentStatus: 'OPTED_IN',
  contactId: 'contact-one',
  hasFollowUpTask: false,
  interactions: [],
  organizationId: 'organization-one',
  preferredChannel: 'EMAIL',
  suppressed: false,
  timeZone: 'America/Los_Angeles',
  workspace: {
    id: 'workspace-one',
    quietHoursEnd: '08:00',
    quietHoursStart: '18:00',
    timeZone: 'America/Los_Angeles',
  },
};

describe('contact next-action scheduling', () => {
  it('gives a new contact a future optimized initial-outreach date', () => {
    const result = calculateContactNextAction(input, now);
    expect(result.nextActionType).toBe('INITIAL_OUTREACH');
    expect(result.nextActionAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('gives a contact with outbound history a future follow-up date', () => {
    const result = calculateContactNextAction(
      {
        ...input,
        interactions: [
          {
            campaignId: 'campaign-one',
            direction: 'OUTBOUND',
            occurredAt: new Date('2026-07-20T17:00:00.000Z'),
          },
        ],
      },
      now,
    );
    expect(result.nextActionType).toBe('FOLLOW_UP');
    expect(result.nextActionAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('recalculates when an imported date and campaign deadline have expired', () => {
    const result = calculateContactNextAction(
      {
        ...input,
        campaign: { endAt: new Date('2026-07-28T17:00:00.000Z'), id: 'expired-campaign' },
        importedFollowUpAt: new Date('2026-07-28T16:00:00.000Z'),
      },
      now,
    );
    expect(result.nextActionAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result.nextActionType).toBe('FOLLOW_UP');
  });

  it('schedules a future consent review instead of outreach for suppressed contacts', () => {
    const result = calculateContactNextAction({ ...input, suppressed: true }, now);
    expect(result.nextActionType).toBe('CONSENT_REVIEW');
    expect(result.nextActionAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
