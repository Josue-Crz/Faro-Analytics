import {
  OUTREACH_DRAFT_PROMPT_VERSION,
  bobObjectiveSchema,
  bobToneSchema,
  renderOutreachDraftPrompt,
} from '@faro/ibm-bob';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { campaigns, contacts, followUps } from '@/lib/demo-data';
import { bobRequestStore, bobRequestStoreMode } from '@/lib/server/bob-request-store';
import { isDemoApiAccessAllowed } from '@/lib/server/demo-boundary';
import { checkRateLimit } from '@/lib/server/rate-limit';

const createRequestSchema = z
  .object({
    campaignId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160),
    followUpTaskId: z.string().min(1).max(160),
    objective: bobObjectiveSchema.default('FOLLOW_UP'),
    tone: bobToneSchema.default('PROFESSIONAL'),
  })
  .strict();

const workspaceId = 'ws-beacon-lab';
const demoUserId = 'user_jordan_lee';

export async function GET() {
  if (!isDemoApiAccessAllowed()) {
    return NextResponse.json(
      {
        error: 'PRODUCTION_AUTH_REQUIRED',
        message: 'Database-backed API access requires a verified application session.',
      },
      { status: 503 },
    );
  }
  const requests = await bobRequestStore.listAwaiting(workspaceId, 25);
  return NextResponse.json({
    data: requests,
    persistence: bobRequestStoreMode,
    runtimeAdapter: 'unavailable',
    transport: 'faro-mcp',
  });
}

export async function POST(request: NextRequest) {
  if (!isDemoApiAccessAllowed()) {
    return NextResponse.json(
      {
        error: 'PRODUCTION_AUTH_REQUIRED',
        message: 'Database-backed API access requires a verified application session.',
      },
      { status: 503 },
    );
  }
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

  const contact = contacts.find((item) => item.id === parsed.data.contactId);
  const campaign = campaigns.find((item) => item.id === parsed.data.campaignId);
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

  const promptText = renderOutreachDraftPrompt({
    approvedSourceRecordIds: [contact.id, campaign.id, followUp.id],
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
    },
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

  let generationRequest;
  try {
    generationRequest = await bobRequestStore.create({
      approvedSourceRecordIds: [contact.id, campaign.id, followUp.id],
      campaignId: campaign.id,
      contactId: contact.id,
      contextVersion: 1,
      followUpTaskId: followUp.id,
      idempotencyKey: `outreach-draft:${followUp.id}:${OUTREACH_DRAFT_PROMPT_VERSION}:${createHash('sha256').update(promptText).digest('hex').slice(0, 24)}`,
      promptText,
      promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
      requestedBy: demoUserId,
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

  return NextResponse.json(
    {
      data: {
        id: generationRequest.id,
        promptVersion: generationRequest.promptVersion,
        requestedAt: generationRequest.requestedAt,
        status: generationRequest.status,
      },
      audit: { action: 'BOB_GENERATION_REQUEST_CREATED', workspaceId },
      runtimeAdapter: 'unavailable',
      nextStep:
        bobRequestStoreMode === 'postgresql'
          ? 'Use faro_get_generation_request through the database-backed Faro MCP server.'
          : 'Switch to database mode for cross-process MCP retrieval; this demo request is process-local.',
      persistence: bobRequestStoreMode,
    },
    { status: 202 },
  );
}
