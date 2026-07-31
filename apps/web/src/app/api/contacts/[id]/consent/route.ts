import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { recalculateContactNextActionInTransaction } from '@/lib/server/contact-next-action';
import { saveContactOutreachSchedule } from '@/lib/server/contact-outreach-schedule';

const consentSchema = z.object({ status: z.enum(['IMPLIED', 'OPTED_IN', 'OPTED_OUT']) }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_CONSENT_STATUS' }, { status: 400 });
  const { id } = await context.params;
  const contact = await prisma.contact.findFirst({
    select: { id: true },
    where: {
      campaignContacts: session.focusedCampaignId
        ? {
            some: {
              campaignId: session.focusedCampaignId,
              workspaceId: session.workspaceId,
            },
          }
        : undefined,
      deletedAt: null,
      id,
      workspaceId: session.workspaceId,
    },
  });
  if (!contact) return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 });
  const now = new Date();
  const schedule = await prisma.$transaction(async (database) => {
    await database.contact.update({
      data: {
        consentStatus: parsed.data.status,
        suppressedAt: parsed.data.status === 'OPTED_OUT' ? now : null,
      },
      where: { id_workspaceId: { id, workspaceId: session.workspaceId } },
    });
    await database.auditEvent.create({
      data: {
        action: 'CONTACT_CONSENT_REVIEWED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: id,
        entityType: 'Contact',
        id: randomUUID(),
        metadata: { status: parsed.data.status },
        workspaceId: session.workspaceId,
      },
    });
    return recalculateContactNextActionInTransaction(database, session.workspaceId, id, now, {
      actorId: session.userId,
      actorType: 'USER',
    });
  });
  let campaignSchedulesAssigned = 0;
  if (parsed.data.status === 'OPTED_IN' || parsed.data.status === 'IMPLIED') {
    const memberships = await prisma.campaignContact.findMany({
      select: { campaignId: true },
      take: 25,
      where: {
        campaign: { archivedAt: null, status: { in: ['ACTIVE', 'DRAFT'] } },
        contactId: id,
        ...(session.focusedCampaignId ? { campaignId: session.focusedCampaignId } : {}),
        workspaceId: session.workspaceId,
      },
    });
    for (const membership of memberships) {
      try {
        await saveContactOutreachSchedule({
          actorId: session.userId,
          contactId: id,
          focusedCampaignId: session.focusedCampaignId,
          request: { campaignId: membership.campaignId, mode: 'OPTIMIZE' },
          workspaceId: session.workspaceId,
        });
        campaignSchedulesAssigned += 1;
      } catch {
        // Consent remains the user's explicit decision; the worker safely retries missing schedules.
      }
    }
  }
  return NextResponse.json({
    data: {
      campaignSchedulesAssigned,
      id,
      nextActionAt: schedule?.nextActionAt.toISOString(),
      nextActionType: schedule?.nextActionType,
      status: parsed.data.status,
    },
  });
}
