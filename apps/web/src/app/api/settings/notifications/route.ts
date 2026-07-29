import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { notificationPreferencesSchema } from '@/lib/server/notification-preferences';
import { smsProviderState } from '@/lib/server/twilio';

export async function PATCH(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = notificationPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_NOTIFICATION_PREFERENCES', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = await prisma.user.findFirst({
    select: {
      smsConsentAt: true,
      smsOptedOutAt: true,
      smsPhone: true,
      smsVerifiedAt: true,
    },
    where: {
      id: session.userId,
      memberships: { some: { workspaceId: session.workspaceId } },
    },
  });
  if (!user) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  if (
    parsed.data.sms &&
    (!smsProviderState().configured ||
      !user.smsPhone ||
      !user.smsVerifiedAt ||
      !user.smsConsentAt ||
      user.smsOptedOutAt)
  ) {
    return NextResponse.json(
      {
        error: 'SMS_NOT_READY',
        message: 'Verify a mobile number and configure Twilio before enabling SMS reminders.',
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      data: { notificationPreferences: parsed.data },
      where: {
        id: session.userId,
        memberships: { some: { workspaceId: session.workspaceId } },
      },
    }),
    prisma.auditEvent.create({
      data: {
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: session.userId,
        entityType: 'User',
        id: randomUUID(),
        metadata: {
          dailyDigest: parsed.data.dailyDigest,
          email: parsed.data.email,
          followUpLeadMinutes: parsed.data.followUpLeadMinutes,
          highPriorityOnly: parsed.data.highPriorityOnly,
          inApp: parsed.data.inApp,
          sms: parsed.data.sms,
        },
        workspaceId: session.workspaceId,
      },
    }),
  ]);
  return NextResponse.json({ data: parsed.data });
}
