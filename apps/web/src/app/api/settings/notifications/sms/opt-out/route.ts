import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { notificationPreferences } from '@/lib/server/notification-preferences';

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });

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

  const optedOutAt = new Date();
  const preferences = {
    ...notificationPreferences(user.notificationPreferences, workspace),
    sms: false,
  };
  await prisma.$transaction([
    prisma.user.update({
      data: {
        notificationPreferences: preferences,
        smsOptedOutAt: optedOutAt,
      },
      where: {
        id: session.userId,
        memberships: { some: { workspaceId: session.workspaceId } },
      },
    }),
    prisma.notification.updateMany({
      data: { errorCode: 'SMS_RECIPIENT_OPTED_OUT', status: 'CANCELLED' },
      where: {
        channel: 'SMS',
        status: 'SCHEDULED',
        userId: session.userId,
        workspaceId: session.workspaceId,
      },
    }),
    prisma.auditEvent.create({
      data: {
        action: 'SMS_RECIPIENT_OPTED_OUT',
        actorId: session.userId,
        actorType: 'USER',
        entityId: session.userId,
        entityType: 'User',
        id: randomUUID(),
        metadata: { source: 'NOTIFICATION_SETTINGS' },
        workspaceId: session.workspaceId,
      },
    }),
  ]);

  return NextResponse.json({ data: { optedOutAt, preferences } });
}
