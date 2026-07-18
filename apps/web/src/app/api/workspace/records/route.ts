import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(2_000),
  type: z.enum([
    'SPONSORSHIP',
    'PARTICIPANT_OUTREACH',
    'PARTNERSHIP',
    'FUNDRAISING',
    'EVENT',
    'COMMUNITY',
  ]),
});

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const [
    contacts,
    organizations,
    trashedOrganizations,
    campaigns,
    followUps,
    interactions,
    bobRequests,
  ] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        consentStatus: true,
        customFields: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        organization: { select: { name: true } },
        source: true,
        type: true,
      },
      take: 1_000,
      where: { deletedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.organization.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        _count: { select: { contacts: { where: { deletedAt: null } } } },
        contacts: {
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            consentStatus: true,
            email: true,
            firstName: true,
            id: true,
            lastName: true,
            title: true,
            type: true,
          },
          where: { deletedAt: null },
        },
        id: true,
        name: true,
        type: true,
        website: true,
      },
      take: 1_000,
      where: { deletedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.organization.findMany({
      orderBy: { deletedAt: 'desc' },
      select: {
        _count: { select: { contacts: true } },
        deletedAt: true,
        id: true,
        name: true,
        type: true,
        website: true,
      },
      take: 1_000,
      where: { deletedAt: { not: null }, workspaceId: session.workspaceId },
    }),
    prisma.campaign.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        _count: { select: { campaignContacts: true, followUpTasks: true } },
        campaignContacts: { select: { contactId: true } },
        id: true,
        name: true,
        objective: true,
        status: true,
        type: true,
      },
      take: 1_000,
      where: { archivedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.followUpTask.findMany({
      orderBy: { dueAt: 'asc' },
      select: {
        contact: { select: { firstName: true, id: true, lastName: true } },
        dueAt: true,
        id: true,
        priority: true,
        reason: true,
        status: true,
      },
      take: 1_000,
      where: { workspaceId: session.workspaceId },
    }),
    prisma.interaction.findMany({
      orderBy: { occurredAt: 'desc' },
      select: {
        bodyText: true,
        campaign: { select: { name: true } },
        contact: { select: { firstName: true, id: true, lastName: true } },
        direction: true,
        id: true,
        occurredAt: true,
        subject: true,
      },
      take: 500,
      where: { channel: 'EMAIL', workspaceId: session.workspaceId },
    }),
    prisma.bobGenerationRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      select: {
        contactId: true,
        draft: { select: { approvalStatus: true, bodyText: true, id: true, subject: true } },
        id: true,
        requestedAt: true,
        status: true,
      },
      take: 100,
      where: { workspaceId: session.workspaceId },
    }),
  ]);
  const importedFollowUps = contacts.flatMap((contact) => {
    const fields = contact.customFields as Record<string, unknown>;
    return fields.importedFollowUpPending === true && typeof fields.importedFollowUpAt === 'string'
      ? [
          {
            contactId: contact.id,
            contactName: `${contact.firstName} ${contact.lastName}`,
            dueAt: fields.importedFollowUpAt,
          },
        ]
      : [];
  });
  return NextResponse.json({
    data: {
      campaigns,
      bobRequests,
      contacts,
      followUps,
      importedFollowUps,
      interactions,
      organizations,
      trashedOrganizations,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = campaignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 400 });
  const campaign = await prisma.campaign.create({
    data: {
      defaultTone: 'PROFESSIONAL',
      description: parsed.data.objective,
      id: randomUUID(),
      idempotencyKey: `user:${session.userId}:${randomUUID()}`,
      name: parsed.data.name,
      objective: parsed.data.objective,
      ownerId: session.userId,
      quietHours: {},
      status: 'DRAFT',
      type: parsed.data.type,
      workspaceId: session.workspaceId,
    },
    select: { id: true, name: true },
  });
  await prisma.auditEvent.create({
    data: {
      action: 'CAMPAIGN_CREATED',
      actorId: session.userId,
      actorType: 'USER',
      entityId: campaign.id,
      entityType: 'Campaign',
      id: randomUUID(),
      metadata: {},
      workspaceId: session.workspaceId,
    },
  });
  return NextResponse.json({ data: campaign }, { status: 201 });
}
