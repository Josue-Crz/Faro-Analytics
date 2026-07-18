import {
  OUTREACH_DRAFT_PROMPT_VERSION,
  bobObjectiveSchema,
  bobToneSchema,
  renderOutreachDraftPrompt,
} from '@faro/ibm-bob';
import { prisma } from '@faro/database';
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { campaigns, contacts, followUps } from '@/lib/demo-data';
import { bobRequestStore, bobRequestStoreMode } from '@/lib/server/bob-request-store';
import { isDemoApiAccessAllowed } from '@/lib/server/demo-boundary';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { sessionFromRequest } from '@/lib/server/auth';
import { completeWithLocalBobShell } from '@/lib/server/bob-shell';

const createRequestSchema = z
  .object({
    campaignId: z.string().min(1).max(160).nullable().optional(),
    associateWithCampaign: z.boolean().default(false),
    contactId: z.string().min(1).max(160),
    followUpTaskId: z.string().min(1).max(160).nullable().optional(),
    additionalContext: z.string().trim().max(6_000).optional(),
    objective: bobObjectiveSchema.default('FOLLOW_UP'),
    tone: bobToneSchema.default('PROFESSIONAL'),
  })
  .strict();

const demoWorkspaceId = 'ws-beacon-lab';
const demoUserId = 'user_jordan_lee';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session && !isDemoApiAccessAllowed()) {
    return NextResponse.json(
      {
        error: 'PRODUCTION_AUTH_REQUIRED',
        message: 'Database-backed API access requires a verified application session.',
      },
      { status: 503 },
    );
  }
  const workspaceId = session?.workspaceId ?? demoWorkspaceId;
  const requests = await bobRequestStore.listAwaiting(workspaceId, 25);
  return NextResponse.json({
    data: requests,
    persistence: bobRequestStoreMode,
    runtimeAdapter: 'unavailable',
    transport: 'faro-mcp',
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session && !isDemoApiAccessAllowed()) {
    return NextResponse.json(
      {
        error: 'PRODUCTION_AUTH_REQUIRED',
        message: 'Database-backed API access requires a verified application session.',
      },
      { status: 503 },
    );
  }
  const workspaceId = session?.workspaceId ?? demoWorkspaceId;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const limit = checkRateLimit(`bob-create:${forwarded}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Wait before creating another generation request.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = createRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let promptText: string;
  let approvedSourceRecordIds: string[];
  let followUpTaskId: string | null;
  let selectedCampaignId: string;
  if (session) {
    selectedCampaignId =
      parsed.data.campaignId ??
      (
        await prisma.campaign.upsert({
          create: {
            defaultTone: 'PROFESSIONAL',
            description:
              'Internal context for user-requested email drafts that are not assigned to a campaign.',
            id: randomUUID(),
            idempotencyKey: `system:unassigned-outreach:${workspaceId}`,
            name: 'Unassigned outreach drafts',
            objective: 'Draft initial and follow-up outreach requested outside a campaign.',
            ownerId: session.userId,
            quietHours: {},
            status: 'DRAFT',
            type: 'COMMUNITY',
            workspaceId,
          },
          update: {},
          where: {
            workspaceId_idempotencyKey: {
              idempotencyKey: `system:unassigned-outreach:${workspaceId}`,
              workspaceId,
            },
          },
        })
      ).id;
    const [contact, campaign, followUp, interactions] = await Promise.all([
      prisma.contact.findFirst({
        include: { organization: { select: { name: true } } },
        where: { deletedAt: null, id: parsed.data.contactId, workspaceId },
      }),
      prisma.campaign.findFirst({
        where: { archivedAt: null, id: selectedCampaignId, workspaceId },
      }),
      parsed.data.followUpTaskId
        ? prisma.followUpTask.findFirst({
            where: {
              campaignId: selectedCampaignId,
              contactId: parsed.data.contactId,
              id: parsed.data.followUpTaskId,
              workspaceId,
            },
          })
        : Promise.resolve(null),
      prisma.interaction.findMany({
        orderBy: { occurredAt: 'desc' },
        select: {
          bodyText: true,
          channel: true,
          direction: true,
          id: true,
          occurredAt: true,
          subject: true,
        },
        take: 20,
        where: {
          channel: 'EMAIL',
          contactId: parsed.data.contactId,
          workspaceId,
        },
      }),
    ]);
    if (!contact || !campaign || (parsed.data.followUpTaskId && !followUp)) {
      return NextResponse.json({ error: 'CONTEXT_NOT_FOUND' }, { status: 404 });
    }
    if (
      contact.suppressedAt ||
      (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED')
    ) {
      return NextResponse.json(
        {
          error: contact.suppressedAt ? 'CONTACT_SUPPRESSED' : 'CONSENT_UNVERIFIED',
          message: 'A human must confirm the outreach basis before IBM Bob may draft.',
        },
        { status: 409 },
      );
    }
    if (parsed.data.associateWithCampaign && parsed.data.campaignId) {
      await prisma.campaignContact.upsert({
        create: {
          assignedUserId: session.userId,
          campaignId: selectedCampaignId,
          contactId: contact.id,
          priority: 'MEDIUM',
          stage: 'Added',
          workspaceId,
        },
        update: { assignedUserId: session.userId },
        where: {
          workspaceId_campaignId_contactId: {
            campaignId: selectedCampaignId,
            contactId: contact.id,
            workspaceId,
          },
        },
      });
      await prisma.auditEvent.create({
        data: {
          action: 'CAMPAIGN_CONTACTS_ASSIGNED',
          actorId: session.userId,
          actorType: 'USER',
          entityId: selectedCampaignId,
          entityType: 'Campaign',
          id: randomUUID(),
          metadata: { contactCount: 1, source: 'bob-draft-request' },
          workspaceId,
        },
      });
    }
    followUpTaskId = followUp?.id ?? null;
    approvedSourceRecordIds = [
      contact.id,
      campaign.id,
      ...(followUp ? [followUp.id] : []),
      ...interactions.map((interaction) => interaction.id),
    ];
    const latestInbound = interactions.find((interaction) => interaction.direction === 'INBOUND');
    promptText = renderOutreachDraftPrompt({
      approvedSourceRecordIds,
      additionalContext: parsed.data.additionalContext || undefined,
      campaign: { id: campaign.id, name: campaign.name, objective: campaign.objective },
      contact: {
        consentStatus: contact.consentStatus,
        firstName: contact.firstName,
        id: contact.id,
        lastName: contact.lastName,
        organizationName: contact.organization?.name,
        preferredChannel: contact.preferredChannel,
        tags: contact.tags,
        timezone: contact.timezone,
        title: contact.title ?? undefined,
      },
      interactionHistory: interactions.reverse().map((interaction) => ({
        bodyText: interaction.bodyText.slice(0, 12_000),
        channel: interaction.channel,
        direction: interaction.direction,
        id: interaction.id,
        occurredAt: interaction.occurredAt.toISOString(),
        subject: interaction.subject ?? undefined,
      })),
      latestResponse: latestInbound?.bodyText.slice(0, 12_000),
      latestResponseSourceRecordId: latestInbound?.id,
      objective: parsed.data.objective,
      recommendedOutreachAt: null,
      selectedTone: parsed.data.tone,
      workspaceId,
    });
  } else {
    selectedCampaignId = parsed.data.campaignId ?? campaigns[0]!.id;
    const contact = contacts.find((item) => item.id === parsed.data.contactId);
    const campaign = campaigns.find((item) => item.id === selectedCampaignId);
    const followUp = followUps.find((item) => item.id === parsed.data.followUpTaskId);
    if (!contact || !campaign || !followUp || followUp.contactId !== contact.id) {
      return NextResponse.json({ error: 'CONTEXT_NOT_FOUND' }, { status: 404 });
    }
    if (contact.consent === 'Suppressed' || contact.consent === 'Unknown') {
      return NextResponse.json(
        {
          error: contact.consent === 'Suppressed' ? 'CONTACT_SUPPRESSED' : 'CONSENT_UNVERIFIED',
          message: 'Drafting requires confirmed consent and a non-suppressed contact.',
        },
        { status: 409 },
      );
    }
    followUpTaskId = followUp.id;
    approvedSourceRecordIds = [contact.id, campaign.id, followUp.id];
    promptText = renderOutreachDraftPrompt({
      approvedSourceRecordIds,
      additionalContext: parsed.data.additionalContext || undefined,
      campaign: { id: campaign.id, name: campaign.name, objective: campaign.objective },
      contact: {
        consentStatus: contact.consent === 'Granted' ? 'OPTED_IN' : 'UNKNOWN',
        firstName: contact.name.split(' ')[0],
        id: contact.id,
        lastName: contact.name.split(' ').slice(1).join(' '),
        organizationName: contact.organization,
        preferredChannel: 'EMAIL',
        tags: contact.tags,
        timezone: contact.timezone,
        title: contact.title,
      },
      interactionHistory: [],
      latestResponse: followUp.lastResponse,
      latestResponseSourceRecordId: followUp.id,
      objective: parsed.data.objective,
      recommendedOutreachAt: null,
      selectedTone: parsed.data.tone,
      workspaceId,
    });
  }

  let generationRequest;
  try {
    generationRequest = await bobRequestStore.create({
      approvedSourceRecordIds,
      campaignId: selectedCampaignId,
      contactId: parsed.data.contactId,
      contextVersion: 1,
      followUpTaskId,
      idempotencyKey: `outreach-draft:${followUpTaskId ?? parsed.data.contactId}:${OUTREACH_DRAFT_PROMPT_VERSION}:${createHash('sha256').update(promptText).digest('hex').slice(0, 24)}`,
      promptText,
      promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
      requestedBy: session?.userId ?? demoUserId,
      type: 'OUTREACH_DRAFT',
      workspaceId,
    });
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'BOB_REQUEST_PERSISTENCE_FAILED';
    console.error(
      JSON.stringify({ component: 'faro-web', errorCode, operation: 'create-bob-request' }),
    );
    return NextResponse.json(
      {
        error: errorCode,
        message: 'Faro could not persist the governed request. No draft was generated or sent.',
      },
      { status: errorCode === 'BOB_REQUEST_PERSISTENCE_FAILED' ? 503 : 409 },
    );
  }

  let runtimeStatus = generationRequest.status;
  let runtimeError: string | null = null;
  if (session && process.env.BOB_RUNTIME_ADAPTER === 'bob-shell') {
    try {
      const completed = await completeWithLocalBobShell(
        bobRequestStore,
        workspaceId,
        generationRequest.id,
      );
      runtimeStatus = completed.status;
    } catch (error) {
      runtimeStatus = 'FAILED';
      runtimeError = error instanceof Error ? error.message : 'BOB_SHELL_FAILED';
    }
  }

  return NextResponse.json(
    {
      data: {
        id: generationRequest.id,
        promptVersion: generationRequest.promptVersion,
        requestedAt: generationRequest.requestedAt,
        status: runtimeStatus,
      },
      audit: { action: 'BOB_GENERATION_REQUEST_CREATED', workspaceId },
      runtimeAdapter: process.env.BOB_RUNTIME_ADAPTER ?? 'unavailable',
      runtimeError,
      nextStep:
        runtimeStatus === 'COMPLETED'
          ? 'IBM Bob returned a validated draft for human review.'
          : bobRequestStoreMode === 'postgresql'
            ? 'Use faro_get_generation_request through the database-backed Faro MCP server.'
            : 'Switch to database mode for cross-process MCP retrieval; this demo request is process-local.',
      persistence: bobRequestStoreMode,
    },
    { status: 202 },
  );
}
