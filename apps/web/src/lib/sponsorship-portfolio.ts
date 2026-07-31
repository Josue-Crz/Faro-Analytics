import { z } from 'zod';

export const sponsorshipRelationshipSchema = z
  .object({
    cashAmountUsd: z.number().int().nonnegative(),
    credits: z.number().int().positive().optional(),
    creditsApproximate: z.boolean().optional(),
    evidenceSummary: z.string().trim().min(1).max(300),
    interestSummary: z.string().trim().min(1).max(300),
    nextAction: z.string().trim().min(1).max(300),
    planningYear: z.number().int().min(2026).max(2100).optional(),
    recommendedStartAt: z.string().datetime({ offset: true }).optional(),
    requestedReconnectAt: z.string().datetime({ offset: true }).optional(),
    sourceUpdatedAt: z.string().datetime({ offset: true }),
    status: z.enum(['CASH_CONFIRMED', 'IN_KIND_CONFIRMED', 'HIGH_INTEREST']),
  })
  .strict()
  .superRefine((relationship, context) => {
    if (relationship.status === 'CASH_CONFIRMED' && relationship.cashAmountUsd === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A confirmed cash sponsorship must have a positive cash amount.',
        path: ['cashAmountUsd'],
      });
    }
    if (relationship.status === 'IN_KIND_CONFIRMED' && !relationship.credits) {
      context.addIssue({
        code: 'custom',
        message: 'A confirmed in-kind credit sponsorship must include its credit amount.',
        path: ['credits'],
      });
    }
    if (relationship.status === 'HIGH_INTEREST') {
      if (!relationship.requestedReconnectAt) {
        context.addIssue({
          code: 'custom',
          message: 'A high-interest relationship must preserve the requested reconnect date.',
          path: ['requestedReconnectAt'],
        });
      }
      if (!relationship.recommendedStartAt) {
        context.addIssue({
          code: 'custom',
          message: 'A high-interest relationship must include Faro’s recommended start date.',
          path: ['recommendedStartAt'],
        });
      }
      if (
        relationship.requestedReconnectAt &&
        relationship.recommendedStartAt &&
        Date.parse(relationship.recommendedStartAt) >= Date.parse(relationship.requestedReconnectAt)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Faro’s recommended start must precede the requested reconnect date.',
          path: ['recommendedStartAt'],
        });
      }
    }
  });

export type SponsorshipRelationship = z.infer<typeof sponsorshipRelationshipSchema>;

export interface SponsorshipPortfolioItem {
  id: string;
  name: string;
  relationship: SponsorshipRelationship;
  sponsorshipStage: string;
}

export interface AnnualCampaignFundingPlan {
  campaignName: string;
  priorSponsorCashUsd: number;
  targetCashUsd: number;
  targetYear: number;
}

export interface CampaignFundingProgress {
  confirmedCashUsd: number;
  confirmedCredits: number;
  percentFunded: number;
  remainingCashUsd: number;
}

export function readSponsorshipRelationship(customFields: unknown) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null;
  const parsed = sponsorshipRelationshipSchema.safeParse(
    (customFields as Record<string, unknown>).sponsorshipRelationship,
  );
  return parsed.success ? parsed.data : null;
}

export function sponsorshipPortfolioItemFromOrganization(organization: {
  customFields: unknown;
  id: string;
  name: string;
  sponsorshipStage?: { name: string } | null;
}): SponsorshipPortfolioItem | null {
  const relationship = readSponsorshipRelationship(organization.customFields);
  if (!relationship) return null;
  return {
    id: organization.id,
    name: organization.name,
    relationship,
    sponsorshipStage: organization.sponsorshipStage?.name ?? 'Relationship',
  };
}

export function calculateCampaignFundingProgress(
  items: SponsorshipPortfolioItem[],
  plan: AnnualCampaignFundingPlan,
): CampaignFundingProgress {
  const confirmedCashUsd = items
    .filter((item) => item.relationship.status === 'CASH_CONFIRMED')
    .reduce((total, item) => total + item.relationship.cashAmountUsd, 0);
  const confirmedCredits = items
    .filter((item) => item.relationship.status === 'IN_KIND_CONFIRMED')
    .reduce((total, item) => total + (item.relationship.credits ?? 0), 0);
  return {
    confirmedCashUsd,
    confirmedCredits,
    percentFunded:
      plan.targetCashUsd > 0
        ? Math.min(100, Math.round((confirmedCashUsd / plan.targetCashUsd) * 1_000) / 10)
        : 0,
    remainingCashUsd: Math.max(0, plan.targetCashUsd - confirmedCashUsd),
  };
}

export const faroAnnualFundingPlan: AnnualCampaignFundingPlan = {
  campaignName: '2026 Event Sponsorship Campaign',
  priorSponsorCashUsd: 43_000,
  targetCashUsd: 43_000,
  targetYear: 2026,
};

export const faroSponsorshipPortfolio: SponsorshipPortfolioItem[] = [
  {
    id: 'org-faro-jolli-ai',
    name: 'jolli.ai',
    sponsorshipStage: 'Committed',
    relationship: {
      cashAmountUsd: 1_000,
      evidenceSummary: 'Workspace-confirmed sponsor update.',
      interestSummary: 'Confirmed cash sponsor for the upcoming event.',
      nextAction: 'Record fulfillment details and keep the sponsor relationship warm.',
      sourceUpdatedAt: '2026-07-30T16:00:00.000Z',
      status: 'CASH_CONFIRMED',
    },
  },
  {
    id: 'org-faro-tavily',
    name: 'Tavily',
    sponsorshipStage: 'Committed',
    relationship: {
      cashAmountUsd: 0,
      credits: 8_000,
      creditsApproximate: true,
      evidenceSummary: 'Workspace-confirmed in-kind sponsor update.',
      interestSummary: 'Approximately 8,000 credits confirmed; no monetary sponsorship.',
      nextAction: 'Confirm credit-delivery and redemption details before the event.',
      sourceUpdatedAt: '2026-07-30T16:00:00.000Z',
      status: 'IN_KIND_CONFIRMED',
    },
  },
  {
    id: 'org-faro-meta',
    name: 'Meta',
    sponsorshipStage: 'Engaged',
    relationship: {
      cashAmountUsd: 0,
      evidenceSummary: 'Workspace-confirmed relationship update.',
      interestSummary: 'High interest in the upcoming event and the team’s previous events.',
      nextAction:
        'Start 2027 sponsorship talks in early November, ahead of the requested December loop-back.',
      planningYear: 2027,
      recommendedStartAt: '2026-11-03T18:00:00.000Z',
      requestedReconnectAt: '2026-12-01T18:00:00.000Z',
      sourceUpdatedAt: '2026-07-30T16:00:00.000Z',
      status: 'HIGH_INTEREST',
    },
  },
];
