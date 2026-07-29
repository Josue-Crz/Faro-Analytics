import { describe, expect, it } from 'vitest';

import {
  campaignContactSourceWhere,
  isCampaignContactSourceEligible,
} from './campaign-data-source';

describe('campaign data-source boundaries', () => {
  it('allows the associated sheet plus manually managed records', () => {
    expect(isCampaignContactSourceEligible('google-sheets:sheet-a', 'sheet-a')).toBe(true);
    expect(isCampaignContactSourceEligible(null, 'sheet-a')).toBe(true);
    expect(isCampaignContactSourceEligible('manual-entry', 'sheet-a')).toBe(true);
  });

  it('rejects contacts imported from another Google Sheet', () => {
    expect(isCampaignContactSourceEligible('google-sheets:sheet-b', 'sheet-a')).toBe(false);
  });

  it('allows the full workspace database when no sheet is associated', () => {
    expect(isCampaignContactSourceEligible('google-sheets:sheet-b', null)).toBe(true);
    expect(campaignContactSourceWhere(null)).toEqual({});
  });

  it('builds the database filter for a source-scoped campaign', () => {
    expect(campaignContactSourceWhere('sheet-a')).toEqual({
      OR: [
        { source: 'google-sheets:sheet-a' },
        { source: null },
        { source: { not: { startsWith: 'google-sheets:' } } },
      ],
    });
  });
});
