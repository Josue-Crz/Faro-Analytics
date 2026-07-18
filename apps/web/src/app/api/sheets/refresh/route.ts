import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { syncGoogleSheet } from '@/lib/server/sheet-sync';

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sheet-refresh:${session.userId}`, 3, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const connections = await prisma.sheetConnection.findMany({
    take: 10,
    where: { workspaceId: session.workspaceId },
  });
  const results = [];
  for (const connection of connections) {
    try {
      const result = await syncGoogleSheet(
        session,
        {
          displayName: connection.displayName,
          readRange: connection.readRange,
          spreadsheetId: connection.spreadsheetId,
          worksheetTitle: connection.worksheetId,
        },
        'MANUAL_REFRESH',
      );
      results.push({ connectionId: connection.id, result, status: 'SUCCEEDED' });
    } catch (error) {
      results.push({
        connectionId: connection.id,
        error: error instanceof Error ? error.message : 'SYNC_FAILED',
        status: 'FAILED',
      });
    }
  }
  return NextResponse.json({ data: { attempted: connections.length, results } });
}
