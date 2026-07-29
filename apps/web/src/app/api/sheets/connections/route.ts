import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { canonicalGoogleSheetUrl } from '@/lib/sheet-connection-status';
import { sessionFromRequest } from '@/lib/server/auth';
import { AUTOMATIC_POLL_LOG_LIMIT } from '@/lib/server/sheet-poll-retention';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });

  const connections = await prisma.sheetConnection.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      displayName: true,
      id: true,
      lastErrorAt: true,
      lastErrorCode: true,
      lastSyncedAt: true,
      readRange: true,
      spreadsheetId: true,
      status: true,
      syncDirection: true,
      syncRuns: {
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: {
          completedAt: true,
          errorSummary: true,
          id: true,
          rowsCreated: true,
          rowsFailed: true,
          rowsRead: true,
          rowsUpdated: true,
          startedAt: true,
          status: true,
        },
        take: AUTOMATIC_POLL_LOG_LIMIT,
        where: { trigger: 'AUTOMATIC_POLL', workspaceId: session.workspaceId },
      },
      worksheetId: true,
      writeBackEnabled: true,
    },
    take: 100,
    where: {
      campaigns: session.focusedCampaignId
        ? {
            some: {
              id: session.focusedCampaignId,
              workspaceId: session.workspaceId,
            },
          }
        : undefined,
      workspaceId: session.workspaceId,
    },
  });

  return NextResponse.json({
    data: connections.map((connection) => ({
      ...connection,
      url: canonicalGoogleSheetUrl(connection.spreadsheetId),
    })),
    pollRetentionLimit: AUTOMATIC_POLL_LOG_LIMIT,
  });
}
