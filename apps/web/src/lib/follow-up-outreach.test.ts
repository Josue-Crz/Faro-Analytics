import { describe, expect, it } from 'vitest';

import { findAssociatedOutreachRequest, outreachRequestHref } from './follow-up-outreach';

const requests = [
  {
    campaignId: 'campaign-b',
    contactId: 'contact-1',
    draft: { id: 'draft-other-campaign' },
    followUpTaskId: null,
    id: 'request-other-campaign',
    requestedAt: '2026-07-30T18:00:00.000Z',
  },
  {
    campaignId: 'campaign-a',
    contactId: 'contact-1',
    draft: null,
    followUpTaskId: 'follow-up-1',
    id: 'request-latest-awaiting',
    requestedAt: '2026-07-30T17:00:00.000Z',
  },
  {
    campaignId: 'campaign-a',
    contactId: 'contact-1',
    draft: { id: 'draft-exact' },
    followUpTaskId: 'follow-up-1',
    id: 'request-exact-draft',
    requestedAt: '2026-07-30T16:00:00.000Z',
  },
];

describe('assigned follow-up outreach association', () => {
  it('prefers the saved draft created for the exact follow-up', () => {
    expect(
      findAssociatedOutreachRequest(requests, {
        campaignId: 'campaign-a',
        contactId: 'contact-1',
        id: 'follow-up-1',
      })?.id,
    ).toBe('request-exact-draft');
  });

  it('links to the exact contact and draft in Outreach', () => {
    expect(outreachRequestHref(requests[2]!)).toBe(
      '/outreach?contact=contact-1&request=request-exact-draft&draft=draft-exact#outreach-draft-draft-exact',
    );
  });

  it('does not attach a message from another campaign to the follow-up', () => {
    expect(
      findAssociatedOutreachRequest(requests.slice(0, 2), {
        campaignId: 'campaign-a',
        contactId: 'contact-1',
        id: 'follow-up-1',
      })?.id,
    ).toBe('request-latest-awaiting');
  });
});
