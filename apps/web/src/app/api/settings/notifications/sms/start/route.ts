import { prisma } from '@faro/database';
import { e164PhoneNumberSchema } from '@faro/notifications';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createTwilioVerifyClient } from '@/lib/server/twilio';

const startSchema = z.object({ phone: e164PhoneNumberSchema }).strict();

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sms-verify-start:${session.userId}`, 3, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Wait before requesting another verification code.' },
      { headers: { 'Retry-After': String(limit.retryAfterSeconds) }, status: 429 },
    );
  }
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_PHONE_NUMBER', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const client = createTwilioVerifyClient();
  if (!client) {
    return NextResponse.json({ error: 'SMS_VERIFICATION_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const verification = await client.start(parsed.data.phone);
    await prisma.auditEvent.create({
      data: {
        action: 'SMS_VERIFICATION_STARTED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: session.userId,
        entityType: 'User',
        id: randomUUID(),
        metadata: { phoneLast4: parsed.data.phone.slice(-4), provider: 'twilio-verify' },
        workspaceId: session.workspaceId,
      },
    });
    return NextResponse.json({ data: { status: verification.status } });
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'SMS_VERIFICATION_FAILED';
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
