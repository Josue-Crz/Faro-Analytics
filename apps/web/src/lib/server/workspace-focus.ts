import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';

import type { AuthenticatedFaroSession } from './auth';

export class WorkspaceFocusError extends Error {
  constructor(readonly code: 'CAMPAIGN_NOT_FOUND') {
    super(code);
    this.name = 'WorkspaceFocusError';
  }
}

export async function setWorkspaceFocus(
  session: AuthenticatedFaroSession,
  campaignId: string | null,
) {
  const campaign = campaignId
    ? await prisma.campaign.findFirst({
        select: { id: true, name: true },
        where: {
          archivedAt: null,
          id: campaignId,
          workspaceId: session.workspaceId,
        },
      })
    : null;
  if (campaignId && !campaign) throw new WorkspaceFocusError('CAMPAIGN_NOT_FOUND');

  await prisma.$transaction([
    prisma.membership.update({
      data: { focusedCampaignId: campaign?.id ?? null },
      where: {
        workspaceId_userId: {
          userId: session.userId,
          workspaceId: session.workspaceId,
        },
      },
    }),
    prisma.auditEvent.create({
      data: {
        action: campaign ? 'CAMPAIGN_FOCUS_SELECTED' : 'MAIN_WORKSPACE_FOCUS_SELECTED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: campaign?.id ?? session.workspaceId,
        entityType: campaign ? 'Campaign' : 'Workspace',
        id: randomUUID(),
        metadata: {
          focusedCampaignId: campaign?.id ?? null,
          previousCampaignId: session.focusedCampaignId,
        },
        workspaceId: session.workspaceId,
      },
    }),
  ]);

  return {
    campaign,
    scope: {
      campaignId: campaign?.id ?? null,
      kind: campaign ? ('CAMPAIGN' as const) : ('WORKSPACE' as const),
    },
  };
}
