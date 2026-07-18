import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';

const positiveClassifications = new Set(['INTERESTED', 'MEETING_REQUESTED', 'REFERRED']);

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const campaigns = await prisma.campaign.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      bobRequests: { select: { draft: { select: { approvalStatus: true } }, status: true } },
      campaignContacts: { select: { contactId: true, stage: true } },
      followUpTasks: { select: { dueAt: true, status: true } },
      id: true,
      interactions: {
        select: {
          deliveryStatus: true,
          direction: true,
          occurredAt: true,
          response: {
            select: { classification: true, responseTimeMinutes: true, sentiment: true },
          },
        },
      },
      name: true,
      objective: true,
      status: true,
      type: true,
    },
    where: { archivedAt: null, workspaceId: session.workspaceId },
  });
  return NextResponse.json({
    data: campaigns.map((campaign) => {
      const outbound = campaign.interactions.filter((item) => item.direction === 'OUTBOUND');
      const delivered = outbound.filter((item) =>
        ['SENT', 'DELIVERED'].includes(item.deliveryStatus),
      );
      const responses = campaign.interactions.flatMap((item) =>
        item.response ? [item.response] : [],
      );
      const positive = responses.filter((item) => positiveClassifications.has(item.classification));
      const responseMinutes = responses.map((item) => item.responseTimeMinutes);
      return {
        awaitingBob: campaign.bobRequests.filter((item) => item.status === 'AWAITING_BOB').length,
        contacts: campaign.campaignContacts.length,
        delivered: delivered.length,
        draftsReady: campaign.bobRequests.filter(
          (item) => item.draft?.approvalStatus === 'PENDING_REVIEW',
        ).length,
        followUpsOpen: campaign.followUpTasks.filter((item) => item.status === 'OPEN').length,
        id: campaign.id,
        interactions: campaign.interactions.length,
        name: campaign.name,
        objective: campaign.objective,
        positiveResponses: positive.length,
        positiveResponseRate: responses.length
          ? Math.round((positive.length / responses.length) * 1000) / 10
          : 0,
        responses: responses.length,
        responseRate: delivered.length
          ? Math.round((responses.length / delivered.length) * 1000) / 10
          : 0,
        status: campaign.status,
        type: campaign.type,
        averageResponseMinutes: responseMinutes.length
          ? Math.round(
              responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length,
            )
          : null,
      };
    }),
  });
}
