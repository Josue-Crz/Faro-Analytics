import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const focusedCampaign = session.focusedCampaignId
    ? await prisma.campaign.findFirst({
        select: { sheetConnectionId: true },
        where: {
          archivedAt: null,
          id: session.focusedCampaignId,
          workspaceId: session.workspaceId,
        },
      })
    : null;
  if (session.focusedCampaignId && !focusedCampaign?.sheetConnectionId) {
    return NextResponse.json({ data: [] });
  }
  const events = await prisma.auditEvent.findMany({
    orderBy: { occurredAt: 'desc' },
    take: 100,
    where: {
      OR: [
        { action: 'GOOGLE_SHEET_READ' },
        {
          action: {
            in: ['GOOGLE_SHEET_SYNC_COMPLETED', 'GOOGLE_SHEET_SYNC_FAILED'],
          },
          metadata: { equals: 'MANUAL_IMPORT', path: ['trigger'] },
        },
        {
          action: {
            in: ['GOOGLE_SHEET_SYNC_COMPLETED', 'GOOGLE_SHEET_SYNC_FAILED'],
          },
          metadata: { equals: 'MANUAL_REFRESH', path: ['trigger'] },
        },
        {
          action: {
            in: ['GOOGLE_SHEET_SYNC_COMPLETED', 'GOOGLE_SHEET_SYNC_FAILED'],
          },
          metadata: { equals: 'OAUTH_RECONNECT', path: ['trigger'] },
        },
      ],
      entityId: focusedCampaign?.sheetConnectionId ?? undefined,
      workspaceId: session.workspaceId,
    },
  });
  const actorIds = [...new Set(events.flatMap((event) => (event.actorId ? [event.actorId] : [])))];
  const connectionIds = events
    .filter((event) => event.entityType === 'SheetConnection')
    .map((event) => event.entityId);
  const [actors, connections] = await Promise.all([
    prisma.user.findMany({
      select: { email: true, id: true, name: true },
      where: { id: { in: actorIds } },
    }),
    prisma.sheetConnection.findMany({
      select: { displayName: true, id: true, worksheetId: true },
      where: { id: { in: connectionIds }, workspaceId: session.workspaceId },
    }),
  ]);
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  return NextResponse.json({
    data: events.map((event) => {
      const actor = event.actorId ? actorById.get(event.actorId) : null;
      const connection = connectionById.get(event.entityId);
      return {
        action: event.action === 'GOOGLE_SHEET_READ' ? 'READ' : 'SYNC',
        actor: actor
          ? { email: actor.email, name: actor.name }
          : { email: null, name: event.actorType },
        id: event.id,
        metadata: event.metadata,
        occurredAt: event.occurredAt,
        source: connection
          ? `${connection.displayName} · ${connection.worksheetId}`
          : event.entityId,
      };
    }),
  });
}
