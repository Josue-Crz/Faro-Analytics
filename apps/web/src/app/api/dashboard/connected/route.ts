import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const [
    contacts,
    organizations,
    campaigns,
    followUps,
    awaitingBob,
    connection,
    campaign,
    recentContacts,
    importedFollowUpContacts,
  ] = await Promise.all([
    prisma.contact.count({ where: { deletedAt: null, workspaceId: session.workspaceId } }),
    prisma.organization.count({ where: { deletedAt: null, workspaceId: session.workspaceId } }),
    prisma.campaign.count({ where: { archivedAt: null, workspaceId: session.workspaceId } }),
    prisma.followUpTask.count({ where: { status: 'OPEN', workspaceId: session.workspaceId } }),
    prisma.bobGenerationRequest.count({
      where: { status: 'AWAITING_BOB', workspaceId: session.workspaceId },
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
      where: { workspaceId: session.workspaceId },
    }),
    prisma.campaign.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true },
      where: { archivedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.contact.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        consentStatus: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        organization: { select: { name: true } },
      },
      take: 8,
      where: { deletedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.contact.findMany({
      select: { customFields: true },
      where: { deletedAt: null, workspaceId: session.workspaceId },
    }),
  ]);
  const importedFollowUps = importedFollowUpContacts.filter((contact) => {
    const fields = contact.customFields as Record<string, unknown>;
    return fields.importedFollowUpPending === true && typeof fields.importedFollowUpAt === 'string';
  }).length;
  return NextResponse.json({
    data: {
      awaitingBob,
      campaign,
      campaigns,
      connection,
      contacts,
      followUps: followUps + importedFollowUps,
      importedFollowUps,
      organizations,
      recentContacts,
      userName: session.name,
      workspaceId: session.workspaceId,
    },
  });
}
