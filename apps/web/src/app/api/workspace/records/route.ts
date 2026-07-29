import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    objective: z.string().trim().min(1).max(2_000),
    sheetConnectionId: z.string().trim().min(1).max(160).nullable().optional(),
    type: z.enum([
      'SPONSORSHIP',
      'PARTICIPANT_OUTREACH',
      'PARTNERSHIP',
      'FUNDRAISING',
      'EVENT',
      'COMMUNITY',
    ]),
  })
  .strict();

function categoryMetadata(customFields: unknown) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
    return { categoryConfidence: null, categorySource: null };
  }
  const classification = (customFields as Record<string, unknown>).industryClassification;
  if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
    return { categoryConfidence: null, categorySource: null };
  }
  const values = classification as Record<string, unknown>;
  return {
    categoryConfidence:
      values.confidence === 'HIGH' || values.confidence === 'MEDIUM' || values.confidence === 'LOW'
        ? values.confidence
        : null,
    categorySource:
      values.source === 'SOURCE_FIELD' ||
      values.source === 'THIRD_PARTY_CONTEXT' ||
      values.source === 'WIKIDATA' ||
      values.source === 'NAME_OR_DOMAIN' ||
      values.source === 'BEST_EFFORT' ||
      values.source === 'FALLBACK'
        ? values.source
        : null,
  };
}

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const focusedCampaignId = session.focusedCampaignId;
  const campaignContactFilter = focusedCampaignId
    ? {
        campaignContacts: {
          some: {
            campaignId: focusedCampaignId,
            workspaceId: session.workspaceId,
          },
        },
      }
    : {};
  const scopedContactFilter = {
    deletedAt: null,
    workspaceId: session.workspaceId,
    ...campaignContactFilter,
  };
  const [
    contacts,
    organizations,
    trashedOrganizations,
    campaigns,
    followUps,
    interactions,
    bobRequests,
    workspace,
    dataSources,
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
        organization: { select: { industry: true, name: true, type: true, website: true } },
        phone: true,
        preferredChannel: true,
        source: true,
        timezone: true,
        title: true,
        type: true,
        updatedAt: true,
      },
      take: 1_000,
      where: scopedContactFilter,
    }),
    prisma.organization.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        _count: {
          select: {
            contacts: {
              where: {
                deletedAt: null,
                ...(focusedCampaignId
                  ? {
                      campaignContacts: {
                        some: {
                          campaignId: focusedCampaignId,
                          workspaceId: session.workspaceId,
                        },
                      },
                    }
                  : {}),
              },
            },
          },
        },
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
          where: {
            deletedAt: null,
            ...(focusedCampaignId
              ? {
                  campaignContacts: {
                    some: {
                      campaignId: focusedCampaignId,
                      workspaceId: session.workspaceId,
                    },
                  },
                }
              : {}),
          },
        },
        customFields: true,
        id: true,
        industry: true,
        name: true,
        type: true,
        website: true,
      },
      take: 1_000,
      where: {
        deletedAt: null,
        workspaceId: session.workspaceId,
        ...(focusedCampaignId
          ? {
              contacts: {
                some: {
                  campaignContacts: {
                    some: {
                      campaignId: focusedCampaignId,
                      workspaceId: session.workspaceId,
                    },
                  },
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
    }),
    focusedCampaignId
      ? Promise.resolve([])
      : prisma.organization.findMany({
          orderBy: { deletedAt: 'desc' },
          select: {
            _count: { select: { contacts: true } },
            customFields: true,
            deletedAt: true,
            id: true,
            industry: true,
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
        endAt: true,
        id: true,
        name: true,
        objective: true,
        sheetConnection: {
          select: {
            displayName: true,
            id: true,
            lastSyncedAt: true,
            readRange: true,
            schedule: true,
            status: true,
            worksheetId: true,
          },
        },
        sheetConnectionId: true,
        startAt: true,
        status: true,
        type: true,
      },
      take: 1_000,
      where: { archivedAt: null, workspaceId: session.workspaceId },
    }),
    prisma.followUpTask.findMany({
      orderBy: { dueAt: 'asc' },
      select: {
        campaign: { select: { id: true, name: true } },
        contact: {
          select: {
            firstName: true,
            id: true,
            lastName: true,
            organization: { select: { industry: true, name: true, type: true, website: true } },
          },
        },
        dueAt: true,
        id: true,
        priority: true,
        reason: true,
        status: true,
      },
      take: 1_000,
      where: {
        campaignId: focusedCampaignId ?? undefined,
        workspaceId: session.workspaceId,
      },
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
      where: {
        campaignId: focusedCampaignId ?? undefined,
        channel: 'EMAIL',
        workspaceId: session.workspaceId,
      },
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
      where: {
        campaignId: focusedCampaignId ?? undefined,
        workspaceId: session.workspaceId,
      },
    }),
    prisma.workspace.findUnique({
      select: {
        defaultTimezone: true,
        id: true,
        name: true,
        quietHoursEnd: true,
        quietHoursStart: true,
        slug: true,
      },
      where: { id: session.workspaceId },
    }),
    prisma.sheetConnection.findMany({
      orderBy: [{ lastSyncedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        displayName: true,
        id: true,
        lastSyncedAt: true,
        readRange: true,
        schedule: true,
        status: true,
        worksheetId: true,
      },
      take: 100,
      where: { workspaceId: session.workspaceId },
    }),
  ]);
  if (!workspace) return NextResponse.json({ error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  const focusedCampaign = focusedCampaignId
    ? (campaigns.find((campaign) => campaign.id === focusedCampaignId) ?? null)
    : null;
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
      dataSources,
      followUps,
      importedFollowUps,
      interactions,
      organizations: organizations.map(({ customFields, ...organization }) => ({
        ...organization,
        ...categoryMetadata(customFields),
      })),
      planningReferenceTime: new Date().toISOString(),
      scope: {
        campaign: focusedCampaign ? { id: focusedCampaign.id, name: focusedCampaign.name } : null,
        kind: focusedCampaign ? 'CAMPAIGN' : 'WORKSPACE',
      },
      trashedOrganizations: trashedOrganizations.map(({ customFields, ...organization }) => ({
        ...organization,
        ...categoryMetadata(customFields),
      })),
      workspace,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = campaignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 400 });
  const sheetConnectionId = parsed.data.sheetConnectionId ?? null;
  if (sheetConnectionId) {
    const source = await prisma.sheetConnection.findFirst({
      select: { id: true },
      where: { id: sheetConnectionId, workspaceId: session.workspaceId },
    });
    if (!source) return NextResponse.json({ error: 'DATA_SOURCE_NOT_FOUND' }, { status: 404 });
  }
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
      sheetConnectionId,
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
      metadata: { sheetConnectionId },
      workspaceId: session.workspaceId,
    },
  });
  return NextResponse.json({ data: campaign }, { status: 201 });
}
