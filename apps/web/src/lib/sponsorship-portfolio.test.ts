import { describe, expect, it } from 'vitest';

import {
  calculateCampaignFundingProgress,
  faroAnnualFundingPlan,
  faroSponsorshipPortfolio,
  readSponsorshipRelationship,
  sponsorshipRelationshipSchema,
} from './sponsorship-portfolio';

describe('Faro sponsorship portfolio', () => {
  it('keeps confirmed cash, in-kind credits, and high interest as distinct states', () => {
    expect(faroSponsorshipPortfolio).toHaveLength(3);
    expect(
      faroSponsorshipPortfolio.reduce((total, item) => total + item.relationship.cashAmountUsd, 0),
    ).toBe(1_000);
    expect(
      faroSponsorshipPortfolio.find((item) => item.name === 'Tavily')?.relationship,
    ).toMatchObject({
      cashAmountUsd: 0,
      credits: 8_000,
      creditsApproximate: true,
      status: 'IN_KIND_CONFIRMED',
    });
    expect(faroSponsorshipPortfolio.find((item) => item.name === 'Meta')?.relationship.status).toBe(
      'HIGH_INTEREST',
    );
  });

  it('preserves Meta’s December loop-back while recommending an earlier planning start', () => {
    const meta = faroSponsorshipPortfolio.find((item) => item.name === 'Meta')!;

    expect(Date.parse(meta.relationship.recommendedStartAt!)).toBeLessThan(
      Date.parse(meta.relationship.requestedReconnectAt!),
    );
    expect(meta.relationship.recommendedStartAt).toContain('2026-11');
    expect(meta.relationship.requestedReconnectAt).toContain('2026-12');
    expect(meta.relationship.planningYear).toBe(2027);
  });

  it('shows campaign cash progress without counting credits or interest as money raised', () => {
    const progress = calculateCampaignFundingProgress(
      faroSponsorshipPortfolio,
      faroAnnualFundingPlan,
    );

    expect(faroAnnualFundingPlan.targetCashUsd).toBe(faroAnnualFundingPlan.priorSponsorCashUsd);
    expect(progress).toEqual({
      confirmedCashUsd: 1_000,
      confirmedCredits: 8_000,
      percentFunded: 2.3,
      remainingCashUsd: 42_000,
    });
  });

  it('rejects an in-kind confirmation without a credit amount', () => {
    expect(
      sponsorshipRelationshipSchema.safeParse({
        cashAmountUsd: 0,
        evidenceSummary: 'Workspace update.',
        interestSummary: 'Credits confirmed.',
        nextAction: 'Confirm delivery.',
        sourceUpdatedAt: '2026-07-30T16:00:00.000Z',
        status: 'IN_KIND_CONFIRMED',
      }).success,
    ).toBe(false);
  });

  it('returns null instead of trusting malformed organization custom fields', () => {
    expect(
      readSponsorshipRelationship({
        sponsorshipRelationship: {
          cashAmountUsd: -1,
          status: 'CASH_CONFIRMED',
        },
      }),
    ).toBeNull();
  });
});
