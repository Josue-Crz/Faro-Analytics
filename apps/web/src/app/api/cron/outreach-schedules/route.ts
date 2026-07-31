import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { assignMissingOptimizedContactSchedules } from '@/lib/server/contact-outreach-schedule';

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
  return NextResponse.json({ data: await assignMissingOptimizedContactSchedules() });
}
