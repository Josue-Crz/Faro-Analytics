import { describe, expect, it } from 'vitest';

import {
  campaignDateRange,
  campaignManagementRequestSchema,
  campaignMutationConflictsWithFocus,
} from './campaign-management';

const campaignDetails = {
  action: 'UPDATE_DETAILS' as const,
  endDate: '2026-10-31',
  name: 'Neighborhood sponsor campaign',
  objective: 'Coordinate sponsor outreach.',
  startDate: '2026-09-01',
  type: 'SPONSORSHIP' as const,
};

describe('campaign management validation', () => {
  it('accepts a complete campaign date range', () => {
    expect(campaignManagementRequestSchema.parse(campaignDetails)).toEqual(campaignDetails);
  });

  it('rejects incomplete or reversed campaign ranges', () => {
    expect(
      campaignManagementRequestSchema.safeParse({ ...campaignDetails, endDate: null }).success,
    ).toBe(false);
    expect(
      campaignManagementRequestSchema.safeParse({
        ...campaignDetails,
        endDate: '2026-08-31',
      }).success,
    ).toBe(false);
  });

  it('converts the selected range to inclusive UTC boundaries', () => {
    expect(campaignDateRange(campaignDetails)).toEqual({
      endAt: new Date('2026-10-31T23:59:59.999Z'),
      startAt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('keeps operational focus boundaries without blocking campaign administration', () => {
    const focus = {
      focusedCampaignId: 'campaign-focused',
      targetCampaignId: 'campaign-other',
    };
    expect(campaignMutationConflictsWithFocus({ ...focus, action: 'UPDATE_SOURCE' })).toBe(true);
    expect(campaignMutationConflictsWithFocus({ ...focus, action: 'COMPLETE' })).toBe(true);
    expect(campaignMutationConflictsWithFocus({ ...focus, action: 'UPDATE_DETAILS' })).toBe(false);
    expect(campaignMutationConflictsWithFocus({ ...focus, action: 'DELETE' })).toBe(false);
  });
});
