import { prisma, type Prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const readSchema = z
  .object({
    all: z.boolean().optional(),
    ids: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict()
  .refine((input) => input.all === true || Boolean(input.ids?.length), {
    message: 'Choose all notifications or provide notification IDs',
  });

function safeHref(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const href = 'href' in payload ? payload.href : null;
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const visibleWhere: Prisma.NotificationWhereInput = {
    followUpTask: session.focusedCampaignId
      ? {
          is: {
            campaignId: session.focusedCampaignId,
            workspaceId: session.workspaceId,
          },
        }
      : undefined,
    status: { in: ['ACCEPTED', 'DELIVERED', 'PREVIEWED', 'SENT'] },
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      orderBy: [{ readAt: 'asc' }, { scheduledFor: 'desc' }],
      select: {
        channel: true,
        id: true,
        message: true,
        payload: true,
        readAt: true,
        scheduledFor: true,
        status: true,
        title: true,
      },
      take: 20,
      where: visibleWhere,
    }),
    prisma.notification.count({ where: { ...visibleWhere, readAt: null } }),
  ]);
  return NextResponse.json({
    data: {
      items: notifications.map(({ payload, ...notification }) => ({
        ...notification,
        href: safeHref(payload),
      })),
      unread,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_NOTIFICATION_SELECTION', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const result = await prisma.notification.updateMany({
    data: { readAt: new Date() },
    where: {
      ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }),
      followUpTask: session.focusedCampaignId
        ? {
            is: {
              campaignId: session.focusedCampaignId,
              workspaceId: session.workspaceId,
            },
          }
        : undefined,
      readAt: null,
      userId: session.userId,
      workspaceId: session.workspaceId,
    },
  });
  if (result.count) {
    await prisma.auditEvent.create({
      data: {
        action: 'NOTIFICATIONS_MARKED_READ',
        actorId: session.userId,
        actorType: 'USER',
        entityId: session.userId,
        entityType: 'User',
        id: randomUUID(),
        metadata: { count: result.count, scope: parsed.data.all ? 'ALL' : 'SELECTED' },
        workspaceId: session.workspaceId,
      },
    });
  }
  return NextResponse.json({ data: { updated: result.count } });
}
