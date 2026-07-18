import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const requestSchema = z.object({ contactIds: z.array(z.string().min(1).max(160)).min(1).max(500) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_CONTACT_SELECTION' }, { status: 400 });
  const [campaign, contacts] = await Promise.all([
    prisma.campaign.findFirst({
      where: { archivedAt: null, id, workspaceId: session.workspaceId },
    }),
    prisma.contact.findMany({
      select: { id: true },
      where: {
        deletedAt: null,
        id: { in: parsed.data.contactIds },
        workspaceId: session.workspaceId,
      },
    }),
  ]);
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
  if (contacts.length !== new Set(parsed.data.contactIds).size)
    return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 });
  await prisma.$transaction(async (database) => {
    for (const contact of contacts) {
      await database.campaignContact.upsert({
        create: {
          assignedUserId: session.userId,
          campaignId: campaign.id,
          contactId: contact.id,
          priority: 'MEDIUM',
          stage: 'Added',
          workspaceId: session.workspaceId,
        },
        update: { assignedUserId: session.userId },
        where: {
          workspaceId_campaignId_contactId: {
            campaignId: campaign.id,
            contactId: contact.id,
            workspaceId: session.workspaceId,
          },
        },
      });
    }
    await database.auditEvent.create({
      data: {
        action: 'CAMPAIGN_CONTACTS_ASSIGNED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: campaign.id,
        entityType: 'Campaign',
        id: randomUUID(),
        metadata: { contactCount: contacts.length },
        workspaceId: session.workspaceId,
      },
    });
  });
  return NextResponse.json({ data: { assigned: contacts.length, campaignId: campaign.id } });
}
