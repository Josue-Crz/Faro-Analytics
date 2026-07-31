import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { nonArchivedCampaignWorkWhere } from '@/lib/server/campaign-visibility';
import { refreshExpiredContactNextActions } from '@/lib/server/contact-next-action';
import { sponsorshipPortfolioItemFromOrganization } from '@/lib/sponsorship-portfolio';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  await refreshExpiredContactNextActions(session.workspaceId);
  const focusedCampaignId = session.focusedCampaignId;
  const scopedCampaignContact = focusedCampaignId
    ? {
        campaignContacts: {
          some: {
            campaignId: focusedCampaignId,
            workspaceId: session.workspaceId,
          },
        },
      }
    : {};
  const scopedFollowUp = {
    ...nonArchivedCampaignWorkWhere(focusedCampaignId),
    workspaceId: session.workspaceId,
  };
  const [
    contacts,
    organizations,
    campaigns,
    followUps,
    overdue,
    dueNext24Hours,
    awaitingBob,
    draftsReady,
    connection,
    priorityFollowUps,
    importedFollowUpContacts,
    nextActions,
    sponsorshipOrganizations,
    focusedCampaign,
  ] = await Promise.all([
    prisma.contact.count({
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...scopedCampaignContact,
      },
    }),
    prisma.organization.count({
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...(focusedCampaignId
          ? {
              contacts: {
                some: {
                  campaignContacts: {
                    some: {
                      campaignId: focusedCampaignId,
                      workspaceId: session.workspaceId,
                    },
                  },
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
    }),
    prisma.campaign.count({
      where: {
        archivedAt: null,
        id: focusedCampaignId ?? undefined,
        workspaceId: session.workspaceId,
      },
    }),
    prisma.followUpTask.count({ where: { ...scopedFollowUp, status: 'OPEN' } }),
    prisma.followUpTask.count({
      where: { ...scopedFollowUp, dueAt: { lt: new Date() }, status: 'OPEN' },
    }),
    prisma.followUpTask.count({
      where: {
        ...scopedFollowUp,
        dueAt: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
        status: 'OPEN',
      },
    }),
    prisma.bobGenerationRequest.count({
      where: {
        ...nonArchivedCampaignWorkWhere(focusedCampaignId),
        status: 'AWAITING_BOB',
        workspaceId: session.workspaceId,
      },
    }),
    prisma.bobDraft.count({
      where: {
        approvalStatus: 'PENDING_REVIEW',
        generationRequest: nonArchivedCampaignWorkWhere(focusedCampaignId),
        workspaceId: session.workspaceId,
      },
    }),
    prisma.sheetConnection.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        displayName: true,
        lastErrorAt: true,
        lastErrorCode: true,
        lastSyncedAt: true,
        status: true,
        syncRuns: {
          orderBy: { startedAt: 'desc' },
          select: { errorSummary: true, rowsFailed: true, status: true },
          take: 1,
        },
        worksheetId: true,
      },
      where: {
        campaigns: focusedCampaignId
          ? {
              some: {
                id: focusedCampaignId,
                workspaceId: session.workspaceId,
              },
            }
          : undefined,
        workspaceId: session.workspaceId,
      },
    }),
    prisma.followUpTask.findMany({
      orderBy: { dueAt: 'asc' },
      select: {
        campaign: { select: { id: true, name: true } },
        contact: {
          select: {
            firstName: true,
            id: true,
            lastName: true,
            organization: { select: { industry: true, name: true } },
          },
        },
        dueAt: true,
        id: true,
        initialAt: true,
        priority: true,
        reason: true,
        recommendedNextAction: true,
        status: true,
      },
      take: 5,
      where: { ...scopedFollowUp, status: 'OPEN' },
    }),
    prisma.contact.findMany({
      select: { customFields: true },
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...scopedCampaignContact,
      },
    }),
    prisma.contact.findMany({
      orderBy: { nextActionAt: 'asc' },
      select: {
        consentStatus: true,
        firstName: true,
        id: true,
        lastName: true,
        nextActionAt: true,
        nextActionType: true,
        organization: { select: { industry: true, name: true } },
      },
      take: 5,
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...scopedCampaignContact,
      },
    }),
    prisma.organization.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        customFields: true,
        id: true,
        name: true,
        sponsorshipStage: { select: { name: true } },
      },
      take: 100,
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...(focusedCampaignId
          ? {
              contacts: {
                some: {
                  campaignContacts: {
                    some: {
                      campaignId: focusedCampaignId,
                      workspaceId: session.workspaceId,
                    },
                  },
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
    }),
    focusedCampaignId
      ? prisma.campaign.findFirst({
          select: { id: true, name: true },
          where: {
            archivedAt: null,
            id: focusedCampaignId,
            workspaceId: session.workspaceId,
          },
        })
      : null,
  ]);
  const importedFollowUps = importedFollowUpContacts.filter((contact) => {
    const fields = contact.customFields as Record<string, unknown>;
    return fields.importedFollowUpPending === true && typeof fields.importedFollowUpAt === 'string';
  }).length;
  const sponsorshipPortfolio = sponsorshipOrganizations
    .map(sponsorshipPortfolioItemFromOrganization)
    .filter((item) => item !== null);
  return NextResponse.json({
    data: {
      awaitingBob,
      campaigns,
      connection,
      contacts,
      draftsReady,
      dueNext24Hours,
      followUps: followUps + importedFollowUps,
      importedFollowUps,
      nextActions,
      organizations,
      overdue,
      priorityFollowUps,
      sponsorshipPortfolio,
      scope: {
        campaign: focusedCampaign,
        kind: focusedCampaign ? 'CAMPAIGN' : 'WORKSPACE',
      },
      userName: session.name,
      workspaceId: session.workspaceId,
    },
  });
}
