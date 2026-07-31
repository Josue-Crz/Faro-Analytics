import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { campaignContactSourceWhere } from '@/lib/server/campaign-data-source';
import { recalculateContactNextActionInTransaction } from '@/lib/server/contact-next-action';
import { saveContactOutreachSchedule } from '@/lib/server/contact-outreach-schedule';

const requestSchema = z.object({ contactIds: z.array(z.string().min(1).max(160)).min(1).max(500) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  if (session.focusedCampaignId && session.focusedCampaignId !== id) {
    return NextResponse.json({ error: 'WORKSPACE_FOCUS_CONFLICT' }, { status: 409 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_CONTACT_SELECTION' }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({
    select: { id: true, sheetConnectionId: true, status: true },
    where: { archivedAt: null, id, workspaceId: session.workspaceId },
  });
  if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
  if (campaign.status === 'COMPLETED') {
    return NextResponse.json({ error: 'CAMPAIGN_COMPLETED' }, { status: 409 });
  }
  const contacts = await prisma.contact.findMany({
    select: { consentStatus: true, id: true, nextActionAt: true, suppressedAt: true },
    where: {
      deletedAt: null,
      id: { in: parsed.data.contactIds },
      ...campaignContactSourceWhere(campaign.sheetConnectionId),
      workspaceId: session.workspaceId,
    },
  });
  if (contacts.length !== new Set(parsed.data.contactIds).size)
    return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 });
  await prisma.$transaction(async (database) => {
    for (const contact of contacts) {
      await database.campaignContact.upsert({
        create: {
          assignedUserId: session.userId,
          campaignId: campaign.id,
          contactId: contact.id,
          nextActionAt: contact.nextActionAt,
          priority: 'MEDIUM',
          stage: 'Added',
          workspaceId: session.workspaceId,
        },
        update: { assignedUserId: session.userId, nextActionAt: contact.nextActionAt },
        where: {
          workspaceId_campaignId_contactId: {
            campaignId: campaign.id,
            contactId: contact.id,
            workspaceId: session.workspaceId,
          },
        },
      });
      await recalculateContactNextActionInTransaction(
        database,
        session.workspaceId,
        contact.id,
        new Date(),
        { actorId: session.userId, actorType: 'USER' },
      );
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
  let scheduled = 0;
  const scheduleIssues: Array<{ contactId: string; error: string }> = [];
  for (const contact of contacts) {
    if (
      contact.suppressedAt ||
      (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED')
    ) {
      scheduleIssues.push({ contactId: contact.id, error: 'OUTREACH_NOT_ALLOWED' });
      continue;
    }
    try {
      await saveContactOutreachSchedule({
        actorId: session.userId,
        contactId: contact.id,
        focusedCampaignId: session.focusedCampaignId,
        request: { campaignId: campaign.id, mode: 'OPTIMIZE' },
        workspaceId: session.workspaceId,
      });
      scheduled += 1;
    } catch (error) {
      scheduleIssues.push({
        contactId: contact.id,
        error: error instanceof Error ? error.message : 'SCHEDULE_FAILED',
      });
    }
  }
  return NextResponse.json({
    data: {
      assigned: contacts.length,
      campaignId: campaign.id,
      scheduleIssues,
      scheduled,
    },
  });
}
