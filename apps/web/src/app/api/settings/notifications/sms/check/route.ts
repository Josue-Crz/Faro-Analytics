import { prisma } from '@faro/database';
import { e164PhoneNumberSchema } from '@faro/notifications';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { maskPhoneNumber, notificationPreferences } from '@/lib/server/notification-preferences';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createTwilioVerifyClient } from '@/lib/server/twilio';

const checkSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,10}$/),
    phone: e164PhoneNumberSchema,
  })
  .strict();

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sms-verify-check:${session.userId}`, 10, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Wait before checking another verification code.' },
      { headers: { 'Retry-After': String(limit.retryAfterSeconds) }, status: 429 },
    );
  }
  const parsed = checkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_VERIFICATION_CODE', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const client = createTwilioVerifyClient();
  if (!client) {
    return NextResponse.json({ error: 'SMS_VERIFICATION_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const verification = await client.check(parsed.data.phone, parsed.data.code);
    if (verification.status !== 'approved') {
      return NextResponse.json(
        { error: 'SMS_CODE_NOT_APPROVED', message: 'That code was not accepted.' },
        { status: 400 },
      );
    }
    const [user, workspace] = await Promise.all([
      prisma.user.findFirst({
        select: { notificationPreferences: true },
        where: {
          id: session.userId,
          memberships: { some: { workspaceId: session.workspaceId } },
        },
      }),
      prisma.workspace.findUnique({
        select: { quietHoursEnd: true, quietHoursStart: true },
        where: { id: session.workspaceId },
      }),
    ]);
    if (!user || !workspace) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    const now = new Date();
    const preferences = {
      ...notificationPreferences(user.notificationPreferences, workspace),
      sms: true,
    };
    await prisma.$transaction([
      prisma.user.update({
        data: {
          notificationPreferences: preferences,
          smsConsentAt: now,
          smsOptedOutAt: null,
          smsPhone: parsed.data.phone,
          smsVerifiedAt: now,
        },
        where: {
          id: session.userId,
          memberships: { some: { workspaceId: session.workspaceId } },
        },
      }),
      prisma.auditEvent.create({
        data: {
          action: 'SMS_RECIPIENT_VERIFIED',
          actorId: session.userId,
          actorType: 'USER',
          entityId: session.userId,
          entityType: 'User',
          id: randomUUID(),
          metadata: {
            consentMethod: 'TWILIO_VERIFY',
            phoneLast4: parsed.data.phone.slice(-4),
          },
          workspaceId: session.workspaceId,
        },
      }),
    ]);
    return NextResponse.json({
      data: {
        phoneMasked: maskPhoneNumber(parsed.data.phone),
        preferences,
        verifiedAt: now.toISOString(),
      },
    });
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'SMS_VERIFICATION_FAILED';
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
