import { describe, expect, it } from 'vitest';

import {
  nonArchivedCampaignWorkWhere,
  visibleInteractionCampaignWhere,
} from './campaign-visibility';

describe('campaign visibility boundaries', () => {
  it('excludes work attached to deleted campaigns from the main workspace', () => {
    expect(nonArchivedCampaignWorkWhere(null)).toEqual({
      campaign: { archivedAt: null },
    });
    expect(visibleInteractionCampaignWhere(null)).toEqual({
      OR: [{ campaignId: null }, { campaign: { archivedAt: null } }],
    });
  });

  it('keeps campaign-focused work scoped to an active campaign', () => {
    expect(nonArchivedCampaignWorkWhere('campaign-1')).toEqual({
      campaign: { archivedAt: null },
      campaignId: 'campaign-1',
    });
    expect(visibleInteractionCampaignWhere('campaign-1')).toEqual({
      campaign: { archivedAt: null },
      campaignId: 'campaign-1',
    });
  });
});
