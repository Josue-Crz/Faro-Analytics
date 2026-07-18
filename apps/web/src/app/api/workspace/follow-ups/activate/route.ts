import { prisma } from '@faro/database';
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const requestSchema = z.object({ campaignId: z.string().trim().min(1).max(160) });

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({
    where: { archivedAt: null, id: parsed.data.campaignId, workspaceId: session.workspaceId },
  });
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
  const contacts = await prisma.contact.findMany({
    select: { customFields: true, id: true },
    where: { deletedAt: null, workspaceId: session.workspaceId },
  });
  let activated = 0;
  await prisma.$transaction(async (database) => {
    for (const contact of contacts) {
      const fields = contact.customFields as Record<string, unknown>;
      if (fields.importedFollowUpPending !== true || typeof fields.importedFollowUpAt !== 'string')
        continue;
      const dueAt = new Date(fields.importedFollowUpAt);
      if (Number.isNaN(dueAt.getTime())) continue;
      await database.campaignContact.upsert({
        create: {
          assignedUserId: session.userId,
          campaignId: campaign.id,
          contactId: contact.id,
          nextActionAt: dueAt,
          priority: 'MEDIUM',
          stage: 'Imported follow-up',
          workspaceId: session.workspaceId,
        },
        update: { assignedUserId: session.userId, nextActionAt: dueAt },
        where: {
          workspaceId_campaignId_contactId: {
            campaignId: campaign.id,
            contactId: contact.id,
            workspaceId: session.workspaceId,
          },
        },
      });
      const idempotencyKey = `sheet-follow-up:${campaign.id}:${contact.id}:${createHash('sha256').update(dueAt.toISOString()).digest('hex').slice(0, 16)}`;
      await database.followUpTask.upsert({
        create: {
          assignedUserId: session.userId,
          campaignId: campaign.id,
          contactId: contact.id,
          dueAt,
          id: randomUUID(),
          idempotencyKey,
          priority: 'MEDIUM',
          reason: 'Follow-up date imported from Google Sheets and assigned by the workspace owner.',
          status: 'OPEN',
          workspaceId: session.workspaceId,
        },
        update: { dueAt, status: 'OPEN' },
        where: { workspaceId_idempotencyKey: { idempotencyKey, workspaceId: session.workspaceId } },
      });
      await database.contact.update({
        data: {
          customFields: {
            ...fields,
            importedFollowUpActivatedAtValue: dueAt.toISOString(),
            importedFollowUpPending: false,
          },
        },
        where: { id: contact.id },
      });
      activated += 1;
    }
  });
  return NextResponse.json({ data: { activated, campaignId: campaign.id } });
}
