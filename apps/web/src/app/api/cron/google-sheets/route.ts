import { prisma } from '@faro/database';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { syncGoogleSheet } from '@/lib/server/sheet-sync';

function authorized(request: NextRequest): boolean {
  const configured = process.env.FARO_SYNC_CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!configured || !supplied || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

export async function POST(request: NextRequest) {
  if (!process.env.FARO_SYNC_CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'SYNC_CRON_NOT_CONFIGURED' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const staleAttemptStartedAt = new Date(Date.now() - 5 * 60_000);
  const connections = await prisma.sheetConnection.findMany({
    orderBy: { updatedAt: 'asc' },
    take: 25,
    where: {
      OR: [
        { status: { in: ['CONNECTED', 'SYNC_ISSUE'] } },
        { status: 'ATTEMPTING', updatedAt: { lt: staleAttemptStartedAt } },
      ],
    },
  });
  const results = [];
  for (const connection of connections) {
    const userId = connection.credentialReference?.replace(/^google-user:/, '');
    if (!userId) {
      results.push({ connectionId: connection.id, status: 'SKIPPED_NO_CREDENTIAL_OWNER' });
      continue;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      results.push({ connectionId: connection.id, status: 'SKIPPED_USER_NOT_FOUND' });
      continue;
    }
    try {
      await syncGoogleSheet(
        {
          email: user.email,
          expiresAt: Date.now() + 60_000,
          name: user.name,
          userId,
          workspaceId: connection.workspaceId,
        },
        {
          displayName: connection.displayName,
          readRange: connection.readRange,
          spreadsheetId: connection.spreadsheetId,
          worksheetTitle: connection.worksheetId,
        },
        'AUTOMATIC_POLL',
      );
      results.push({ connectionId: connection.id, status: 'SYNCED' });
    } catch (error) {
      results.push({
        connectionId: connection.id,
        status: error instanceof Error ? error.message : 'SYNC_FAILED',
      });
    }
  }
  return NextResponse.json({ data: { attempted: connections.length, results } });
}
