import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { runFollowUpNotifications } from '@/lib/server/follow-up-notifications';

function authorized(request: NextRequest): boolean {
  const configured = process.env.FARO_NOTIFICATION_CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!configured || !supplied || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

export async function POST(request: NextRequest) {
  if (!process.env.FARO_NOTIFICATION_CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'NOTIFICATION_CRON_NOT_CONFIGURED' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const summary = await runFollowUpNotifications();
    return NextResponse.json({ data: summary });
  } catch {
    return NextResponse.json({ error: 'NOTIFICATION_RUN_FAILED' }, { status: 500 });
  }
}
