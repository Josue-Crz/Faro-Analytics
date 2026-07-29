import { prisma } from '@faro/database';
import type { Prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { campaignContactSourceWhere } from '@/lib/server/campaign-data-source';
import {
  campaignDateRange,
  campaignManagementRequestSchema,
} from '@/lib/server/campaign-management';

const sourceSelect = {
  displayName: true,
  id: true,
  lastErrorAt: true,
  lastErrorCode: true,
  lastSyncedAt: true,
  readRange: true,
  schedule: true,
  status: true,
  worksheetId: true,
} as const;

async function cancelPendingCampaignWork(
  database: Prisma.TransactionClient,
  campaignId: string,
  workspaceId: string,
) {
  const followUps = await database.followUpTask.findMany({
    select: { id: true },
    where: {
      campaignId,
      status: { in: ['OPEN', 'SNOOZED'] },
      workspaceId,
    },
  });
  const followUpIds = followUps.map((followUp) => followUp.id);
  const [cancelledNotifications, cancelledFollowUps, cancelledBobRequests, supersededDrafts] =
    await Promise.all([
      followUpIds.length
        ? database.notification.updateMany({
            data: { status: 'CANCELLED' },
            where: {
              followUpTaskId: { in: followUpIds },
              status: 'SCHEDULED',
              workspaceId,
            },
          })
        : Promise.resolve({ count: 0 }),
      database.followUpTask.updateMany({
        data: { snoozedUntil: null, status: 'CANCELLED' },
        where: {
          campaignId,
          status: { in: ['OPEN', 'SNOOZED'] },
          workspaceId,
        },
      }),
      database.bobGenerationRequest.updateMany({
        data: { completedAt: new Date(), errorCode: 'CAMPAIGN_CLOSED', status: 'CANCELLED' },
        where: { campaignId, status: { in: ['AWAITING_BOB', 'PROCESSING'] }, workspaceId },
      }),
      database.bobDraft.updateMany({
        data: { approvalStatus: 'SUPERSEDED' },
        where: {
          approvalStatus: 'PENDING_REVIEW',
          generationRequest: { campaignId, workspaceId },
          workspaceId,
        },
      }),
    ]);
  return {
    bobRequests: cancelledBobRequests.count,
    drafts: supersededDrafts.count,
    followUps: cancelledFollowUps.count,
    notifications: cancelledNotifications.count,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const { id } = await context.params;

  const campaign = await prisma.campaign.findFirst({
    select: {
      _count: { select: { bobRequests: true, interactions: true } },
      campaignContacts: {
        orderBy: { updatedAt: 'desc' },
        select: {
          contact: {
            select: {
              consentStatus: true,
              email: true,
              firstName: true,
              id: true,
              interactions: {
                orderBy: { occurredAt: 'desc' },
                select: {
                  direction: true,
                  occurredAt: true,
                  subject: true,
                },
                take: 1,
                where: {
                  workspaceId: session.workspaceId,
                  OR: [{ campaignId: id }, { campaignId: null }],
                },
              },
              lastName: true,
              organization: { select: { industry: true, name: true } },
              source: true,
              title: true,
            },
          },
          nextActionAt: true,
          priority: true,
          stage: true,
        },
      },
      followUpTasks: {
        orderBy: { dueAt: 'asc' },
        select: {
          contact: { select: { firstName: true, id: true, lastName: true } },
          dueAt: true,
          id: true,
          priority: true,
          reason: true,
          status: true,
        },
        where: { status: { in: ['OPEN', 'SNOOZED'] }, workspaceId: session.workspaceId },
      },
      endAt: true,
      id: true,
      name: true,
      objective: true,
      owner: { select: { name: true } },
      sheetConnection: { select: sourceSelect },
      sheetConnectionId: true,
      startAt: true,
      status: true,
      type: true,
      updatedAt: true,
    },
    where: { archivedAt: null, id, workspaceId: session.workspaceId },
  });
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });

  const candidateContacts = await prisma.contact.findMany({
    orderBy: [{ updatedAt: 'desc' }, { lastName: 'asc' }],
    select: {
      consentStatus: true,
      email: true,
      firstName: true,
      id: true,
      lastName: true,
      organization: { select: { industry: true, name: true } },
      source: true,
      title: true,
    },
    take: 1_000,
    where: {
      ...campaignContactSourceWhere(campaign.sheetConnectionId),
      campaignContacts: {
        none: { campaignId: campaign.id, workspaceId: session.workspaceId },
      },
      deletedAt: null,
      workspaceId: session.workspaceId,
    },
  });
  const dataSources = await prisma.sheetConnection.findMany({
    orderBy: [{ lastSyncedAt: 'desc' }, { updatedAt: 'desc' }],
    select: sourceSelect,
    take: 100,
    where: { workspaceId: session.workspaceId },
  });

  return NextResponse.json({ data: { campaign, candidateContacts, dataSources } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  if (session.focusedCampaignId && session.focusedCampaignId !== id) {
    return NextResponse.json({ error: 'WORKSPACE_FOCUS_CONFLICT' }, { status: 409 });
  }
  const parsed = campaignManagementRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_CAMPAIGN_UPDATE', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const campaign = await prisma.campaign.findFirst({
    select: {
      endAt: true,
      id: true,
      name: true,
      objective: true,
      sheetConnectionId: true,
      startAt: true,
      status: true,
      type: true,
    },
    where: { archivedAt: null, id, workspaceId: session.workspaceId },
  });
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });

  if (parsed.data.action === 'UPDATE_SOURCE') {
    if (campaign.status === 'COMPLETED') {
      return NextResponse.json({ error: 'CAMPAIGN_COMPLETED' }, { status: 409 });
    }
    const source = parsed.data.sheetConnectionId
      ? await prisma.sheetConnection.findFirst({
          select: { id: true },
          where: {
            id: parsed.data.sheetConnectionId,
            workspaceId: session.workspaceId,
          },
        })
      : null;
    if (parsed.data.sheetConnectionId && !source) {
      return NextResponse.json({ error: 'DATA_SOURCE_NOT_FOUND' }, { status: 404 });
    }
    await prisma.$transaction([
      prisma.campaign.update({
        data: { sheetConnectionId: parsed.data.sheetConnectionId },
        where: { id_workspaceId: { id: campaign.id, workspaceId: session.workspaceId } },
      }),
      prisma.auditEvent.create({
        data: {
          action: 'CAMPAIGN_DATA_SOURCE_UPDATED',
          actorId: session.userId,
          actorType: 'USER',
          entityId: campaign.id,
          entityType: 'Campaign',
          id: randomUUID(),
          metadata: { sheetConnectionId: parsed.data.sheetConnectionId },
          workspaceId: session.workspaceId,
        },
      }),
    ]);
    return NextResponse.json({
      data: { campaignId: campaign.id, sheetConnectionId: parsed.data.sheetConnectionId },
    });
  }

  if (parsed.data.action === 'UPDATE_DETAILS') {
    const details = parsed.data;
    const { endAt, startAt } = campaignDateRange(details);
    const changedFields = [
      ...(campaign.name !== details.name ? ['name'] : []),
      ...(campaign.objective !== details.objective ? ['objective'] : []),
      ...(campaign.type !== details.type ? ['type'] : []),
      ...(campaign.startAt?.getTime() !== startAt?.getTime() ? ['startAt'] : []),
      ...(campaign.endAt?.getTime() !== endAt?.getTime() ? ['endAt'] : []),
    ];
    const updated = await prisma.$transaction(async (database) => {
      const saved = await database.campaign.update({
        data: {
          description: details.objective,
          endAt,
          name: details.name,
          objective: details.objective,
          startAt,
          type: details.type,
        },
        select: {
          endAt: true,
          id: true,
          name: true,
          objective: true,
          startAt: true,
          status: true,
          type: true,
          updatedAt: true,
        },
        where: { id_workspaceId: { id: campaign.id, workspaceId: session.workspaceId } },
      });
      await database.auditEvent.create({
        data: {
          action: 'CAMPAIGN_UPDATED',
          actorId: session.userId,
          actorType: 'USER',
          entityId: campaign.id,
          entityType: 'Campaign',
          id: randomUUID(),
          metadata: { changedFields },
          workspaceId: session.workspaceId,
        },
      });
      return saved;
    });
    return NextResponse.json({ data: updated });
  }

  if (campaign.status === 'COMPLETED') {
    return NextResponse.json({ data: { campaignId: campaign.id, status: campaign.status } });
  }
  const completed = await prisma.$transaction(async (database) => {
    const cancelled = await cancelPendingCampaignWork(database, campaign.id, session.workspaceId);
    const saved = await database.campaign.update({
      data: { status: 'COMPLETED' },
      select: { endAt: true, id: true, startAt: true, status: true, updatedAt: true },
      where: { id_workspaceId: { id: campaign.id, workspaceId: session.workspaceId } },
    });
    await database.auditEvent.create({
      data: {
        action: 'CAMPAIGN_COMPLETED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: campaign.id,
        entityType: 'Campaign',
        id: randomUUID(),
        metadata: { cancelled, previousStatus: campaign.status },
        workspaceId: session.workspaceId,
      },
    });
    return saved;
  });
  return NextResponse.json({ data: completed });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  if (session.focusedCampaignId && session.focusedCampaignId !== id) {
    return NextResponse.json({ error: 'WORKSPACE_FOCUS_CONFLICT' }, { status: 409 });
  }
  const campaign = await prisma.campaign.findFirst({
    select: { id: true, status: true },
    where: { archivedAt: null, id, workspaceId: session.workspaceId },
  });
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });

  const archivedAt = new Date();
  const result = await prisma.$transaction(async (database) => {
    const cancelled = await cancelPendingCampaignWork(database, campaign.id, session.workspaceId);
    const clearedFocus = await database.membership.updateMany({
      data: { focusedCampaignId: null },
      where: { focusedCampaignId: campaign.id, workspaceId: session.workspaceId },
    });
    await database.campaign.update({
      data: { archivedAt, status: 'ARCHIVED' },
      where: { id_workspaceId: { id: campaign.id, workspaceId: session.workspaceId } },
    });
    await database.auditEvent.create({
      data: {
        action: 'CAMPAIGN_DELETED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: campaign.id,
        entityType: 'Campaign',
        id: randomUUID(),
        metadata: {
          cancelled,
          clearedFocusCount: clearedFocus.count,
          previousStatus: campaign.status,
          softDeleted: true,
        },
        workspaceId: session.workspaceId,
      },
    });
    return { cancelled, clearedFocus: clearedFocus.count > 0 };
  });
  return NextResponse.json({
    data: { archivedAt: archivedAt.toISOString(), campaignId: campaign.id, ...result },
  });
}
