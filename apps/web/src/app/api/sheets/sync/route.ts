import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { sheetSyncRequestSchema, syncGoogleSheet } from '@/lib/server/sheet-sync';

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sheet-sync:${session.userId}`, 5, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const parsed = sheetSyncRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_SYNC_REQUEST', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ data: await syncGoogleSheet(session, parsed.data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHEET_SYNC_FAILED';
    return NextResponse.json(
      { error: code, message: 'The last successful database snapshot was preserved.' },
      { status: code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 502 },
    );
  }
}
