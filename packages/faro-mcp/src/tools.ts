import {
  MAX_OUTREACH_DRAFT_PROMPT_CHARS,
  outreachDraftResultSchema,
  responseAnalysisResultSchema,
} from '@faro/ibm-bob';
import { optimizeOutreachWindow, type OutreachOptimizerInput } from '@faro/optimizer';
import { z } from 'zod';

import type {
  FaroMcpBackend,
  FaroToolName,
  McpAuditEvent,
  McpAuditSink,
  WorkspaceAuthorizer,
} from './contracts.js';

const id = z.string().trim().min(1).max(200);
const instant = z.string().datetime({ offset: true });
const workspaceInput = { workspaceId: id };

const dueFollowupsInput = z
  .object({
    ...workspaceInput,
    dueBefore: instant,
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();
const generationRequestInput = z.object({ ...workspaceInput, requestId: id }).strict();
const contactInput = z.object({ ...workspaceInput, requestId: id, contactId: id }).strict();
const organizationInput = z
  .object({ ...workspaceInput, requestId: id, organizationId: id })
  .strict();
const campaignInput = z.object({ ...workspaceInput, requestId: id, campaignId: id }).strict();
const interactionInput = z
  .object({
    ...workspaceInput,
    requestId: id,
    contactId: id,
    campaignId: id.optional(),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
const saveDraftInput = z
  .object({
    ...workspaceInput,
    requestId: id,
    providerOperationId: id,
    generatedAt: instant,
    draft: outreachDraftResultSchema,
  })
  .strict();
const saveAnalysisInput = z
  .object({
    ...workspaceInput,
    requestId: id,
    providerOperationId: id,
    generatedAt: instant,
    analysis: responseAnalysisResultSchema,
  })
  .strict();
const failInput = z.object({ ...workspaceInput, requestId: id, errorCode: id }).strict();
const optimizerQuietHoursSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  })
  .strict();
const historicalOutcomeSchema = z
  .object({
    sentAt: instant,
    respondedAt: instant.nullable().optional(),
    contactId: id.optional(),
    organizationId: id.optional(),
    campaignId: id.optional(),
    cohortId: id.optional(),
    channel: z.enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']).optional(),
    timeZone: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const outreachOptimizerInputSchema = z
  .object({
    workspaceId: id,
    optimizerInput: z
      .object({
        referenceTime: instant,
        contact: z
          .object({
            id,
            timeZone: z.string().trim().min(1).max(100),
            consentStatus: z.enum(['OPTED_IN', 'IMPLIED', 'UNKNOWN', 'OPTED_OUT']),
            suppressed: z.boolean(),
            organizationId: id.optional(),
            cohortId: id.optional(),
            preferredChannel: z
              .enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER'])
              .optional(),
            quietHours: z.array(optimizerQuietHoursSchema).max(20).optional(),
          })
          .strict(),
        workspace: z
          .object({
            id,
            timeZone: z.string().trim().min(1).max(100),
            quietHours: z.array(optimizerQuietHoursSchema).max(20),
          })
          .strict(),
        userSchedule: z
          .object({
            timeZone: z.string().trim().min(1).max(100),
            quietHours: z.array(optimizerQuietHoursSchema).max(20),
          })
          .strict()
          .optional(),
        campaign: z
          .object({
            id,
            channel: z.enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
            sequenceStage: z.number().int().min(1).optional(),
            deadline: instant.optional(),
          })
          .strict(),
        historicalOutcomes: z.array(historicalOutcomeSchema).max(500).optional(),
        recentContactOutreach: z
          .array(z.object({ sentAt: instant, respondedAt: instant.nullable().optional() }).strict())
          .max(100)
          .optional(),
        lastInteractionAt: instant.optional(),
        frequencyPolicy: z
          .object({
            minimumHoursBetweenAttempts: z
              .number()
              .nonnegative()
              .max(24 * 365)
              .optional(),
            lookbackDays: z.number().int().min(1).max(365).optional(),
            maximumAttemptsInLookback: z.number().int().min(1).max(100).optional(),
            maximumUnansweredAttempts: z.number().int().min(1).max(100).optional(),
          })
          .strict()
          .optional(),
        options: z
          .object({
            horizonDays: z.number().int().min(1).max(31).optional(),
            intervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
            alternativeCount: z.union([z.literal(2), z.literal(3)]).optional(),
            minimumAlternativeSpacingMinutes: z.number().int().min(15).max(1_440).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

const dueFollowupOutputSchema = z
  .array(
    z
      .object({
        id,
        contactId: id,
        campaignId: id,
        dueAt: instant,
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        reason: z.string().trim().min(1).max(2_000),
        recommendedNextAction: z.string().trim().max(2_000).optional(),
        bobStatus: z
          .enum([
            'NOT_REQUESTED',
            'AWAITING_BOB',
            'PROCESSING',
            'DRAFT_READY',
            'FAILED',
            'CANCELLED',
          ])
          .optional(),
      })
      .strict(),
  )
  .max(100);
const generationRequestOutputSchema = z
  .object({
    id,
    workspaceId: id,
    contactId: id,
    campaignId: id,
    followUpTaskId: id.nullable(),
    type: z.enum(['OUTREACH_DRAFT', 'RESPONSE_ANALYSIS', 'RECOMMENDATION_EXPLANATION']),
    status: z.enum(['AWAITING_BOB', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
    promptVersion: id,
    promptText: z.string().min(1).max(MAX_OUTREACH_DRAFT_PROMPT_CHARS),
    approvedSourceRecordIds: z.array(id).min(1).max(100),
    contextVersion: z.number().int().min(1),
    requestedAt: instant,
    startedAt: instant.nullable(),
  })
  .strict();
const contactOutputSchema = z
  .object({
    id,
    firstName: z.string().trim().max(200).optional(),
    lastName: z.string().trim().max(200).optional(),
    title: z.string().trim().max(300).optional(),
    organizationId: id.optional(),
    timezone: z.string().trim().max(100).optional(),
    preferredChannel: z.string().trim().max(100).optional(),
    consentStatus: z.string().trim().min(1).max(100),
    suppressed: z.boolean(),
  })
  .strict();
const organizationOutputSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(300),
    type: z.string().trim().max(100).optional(),
    industry: z.string().trim().max(300).optional(),
    sponsorshipStage: z.string().trim().max(200).optional(),
    interestAreas: z.array(z.string().trim().min(1).max(300)).max(50),
  })
  .strict();
const campaignOutputSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(2_000),
    status: z.string().trim().min(1).max(100),
    defaultTone: z.string().trim().max(100).optional(),
    deadlineAt: instant.nullable().optional(),
  })
  .strict();
const interactionOutputSchema = z
  .array(
    z
      .object({
        id,
        direction: z.enum(['INBOUND', 'OUTBOUND']),
        channel: z.string().trim().min(1).max(100),
        subject: z.string().trim().max(1_000).optional(),
        bodyText: z.string().trim().max(12_000).optional(),
        occurredAt: instant,
      })
      .strict(),
  )
  .max(20);

const outreachDraftJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: [
    'subject',
    'bodyText',
    'rationale',
    'recommendedNextAction',
    'suggestedFollowUpAt',
    'confidence',
    'riskFlags',
    'sourceRecordIds',
  ],
  properties: {
    subject: { type: 'string' as const, minLength: 1, maxLength: 998 },
    bodyText: { type: 'string' as const, minLength: 1, maxLength: 20_000 },
    rationale: { type: 'string' as const, minLength: 1, maxLength: 4_000 },
    recommendedNextAction: { type: 'string' as const, minLength: 1, maxLength: 1_000 },
    suggestedFollowUpAt: {
      anyOf: [{ type: 'string' as const, format: 'date-time' }, { type: 'null' as const }],
    },
    confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
    riskFlags: {
      type: 'array' as const,
      maxItems: 30,
      items: { type: 'string' as const, minLength: 1, maxLength: 200 },
    },
    sourceRecordIds: {
      type: 'array' as const,
      minItems: 1,
      maxItems: 100,
      items: { type: 'string' as const, minLength: 1, maxLength: 160 },
    },
  },
};

const responseAnalysisJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: [
    'classification',
    'sentiment',
    'urgency',
    'keyQuestionOrObjection',
    'recommendedNextAction',
    'suggestedFollowUpAt',
    'confidence',
    'riskFlags',
    'sourceRecordIds',
  ],
  properties: {
    classification: {
      type: 'string' as const,
      enum: [
        'INTERESTED',
        'NEEDS_MORE_INFORMATION',
        'MEETING_REQUESTED',
        'REFERRED',
        'FOLLOW_UP_LATER',
        'DECLINED',
        'OUT_OF_OFFICE',
        'UNSUBSCRIBE',
        'NO_ACTIONABLE_INTENT',
        'AMBIGUOUS',
      ],
    },
    sentiment: {
      type: 'string' as const,
      enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED'],
    },
    urgency: { type: 'string' as const, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
    keyQuestionOrObjection: {
      anyOf: [{ type: 'string' as const, maxLength: 2_000 }, { type: 'null' as const }],
    },
    recommendedNextAction: { type: 'string' as const, minLength: 1, maxLength: 1_000 },
    suggestedFollowUpAt: {
      anyOf: [{ type: 'string' as const, format: 'date-time' }, { type: 'null' as const }],
    },
    confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
    riskFlags: {
      type: 'array' as const,
      maxItems: 30,
      items: { type: 'string' as const, minLength: 1, maxLength: 200 },
    },
    sourceRecordIds: {
      type: 'array' as const,
      minItems: 1,
      maxItems: 100,
      items: { type: 'string' as const, minLength: 1, maxLength: 160 },
    },
  },
};

export const FARO_TOOL_DEFINITIONS = [
  {
    name: 'faro_get_due_followups',
    description: 'List a bounded set of due follow-ups in the authorized Faro workspace.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'dueBefore'],
      properties: {
        workspaceId: { type: 'string' },
        dueBefore: { type: 'string', format: 'date-time' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: 'faro_get_generation_request',
    description: 'Read one governed IBM Bob generation request without claiming it.',
    inputSchema: requestJsonSchema('requestId'),
  },
  {
    name: 'faro_claim_generation_request',
    description: 'Claim one awaiting request for IBM Bob processing.',
    inputSchema: requestJsonSchema('requestId'),
  },
  {
    name: 'faro_get_contact_context',
    description: 'Read minimized, consent-aware contact context; email and phone are omitted.',
    inputSchema: contextJsonSchema('contactId'),
  },
  {
    name: 'faro_get_organization_context',
    description: 'Read minimized organization context for a governed generation request.',
    inputSchema: contextJsonSchema('organizationId'),
  },
  {
    name: 'faro_get_campaign_context',
    description: 'Read minimized campaign context in the authorized workspace.',
    inputSchema: contextJsonSchema('campaignId'),
  },
  {
    name: 'faro_get_interaction_history',
    description: 'Read at most 20 recent interactions as untrusted context.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'requestId', 'contactId'],
      properties: {
        workspaceId: { type: 'string' },
        requestId: { type: 'string' },
        contactId: { type: 'string' },
        campaignId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
      },
    },
  },
  {
    name: 'faro_calculate_outreach_window',
    description:
      'Run Faro deterministic outreach-window scoring with consent, suppression, quiet-hour, and frequency guards.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'optimizerInput'],
      properties: {
        workspaceId: { type: 'string' },
        optimizerInput: {
          type: 'object',
          additionalProperties: false,
          required: ['referenceTime', 'contact', 'workspace', 'campaign'],
          properties: {
            referenceTime: { type: 'string', format: 'date-time' },
            contact: { type: 'object', description: 'Consent-aware target contact inputs.' },
            workspace: { type: 'object', description: 'Authorized workspace schedule inputs.' },
            userSchedule: { type: 'object' },
            campaign: { type: 'object', description: 'Campaign channel and deadline inputs.' },
            historicalOutcomes: { type: 'array', maxItems: 500, items: { type: 'object' } },
            recentContactOutreach: { type: 'array', maxItems: 100, items: { type: 'object' } },
            lastInteractionAt: { type: 'string', format: 'date-time' },
            frequencyPolicy: { type: 'object' },
            options: { type: 'object' },
          },
        },
      },
    },
  },
  {
    name: 'faro_save_bob_draft',
    description: 'Validate and save an IBM Bob draft for human review; this never sends outreach.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'requestId', 'providerOperationId', 'generatedAt', 'draft'],
      properties: {
        workspaceId: { type: 'string' },
        requestId: { type: 'string' },
        providerOperationId: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
        draft: outreachDraftJsonSchema,
      },
    },
  },
  {
    name: 'faro_save_response_analysis',
    description: 'Validate and save IBM Bob response analysis for later human review.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'requestId', 'providerOperationId', 'generatedAt', 'analysis'],
      properties: {
        workspaceId: { type: 'string' },
        requestId: { type: 'string' },
        providerOperationId: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
        analysis: responseAnalysisJsonSchema,
      },
    },
  },
  {
    name: 'faro_mark_generation_failed',
    description: 'Mark one IBM Bob generation request failed with a non-sensitive error code.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'requestId', 'errorCode'],
      properties: {
        workspaceId: { type: 'string' },
        requestId: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
] as const;

function requestJsonSchema(entityField: string) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['workspaceId', entityField],
    properties: {
      workspaceId: { type: 'string' as const },
      [entityField]: { type: 'string' as const },
    },
  };
}

function contextJsonSchema(entityField: string) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['workspaceId', 'requestId', entityField],
    properties: {
      workspaceId: { type: 'string' as const },
      requestId: { type: 'string' as const },
      [entityField]: { type: 'string' as const },
    },
  };
}

export class FaroMcpToolError extends Error {
  constructor(
    readonly code: 'UNKNOWN_TOOL' | 'NOT_FOUND' | 'TOOL_EXECUTION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'FaroMcpToolError';
  }
}

export interface FaroToolDependencies {
  authorizer: WorkspaceAuthorizer;
  audit: McpAuditSink;
  backend: FaroMcpBackend;
  now?: () => Date;
}

function getWorkspaceId(rawInput: unknown): string {
  if (!rawInput || typeof rawInput !== 'object' || !('workspaceId' in rawInput)) return 'unknown';
  const value = (rawInput as { workspaceId?: unknown }).workspaceId;
  return typeof value === 'string' ? value : 'unknown';
}

export async function executeFaroTool(
  toolName: string,
  rawInput: unknown,
  dependencies: FaroToolDependencies,
): Promise<unknown> {
  const capability =
    toolName.startsWith('faro_save_') || toolName.includes('claim') || toolName.includes('mark_')
      ? 'WRITE_BOB_RESULT'
      : 'READ_CONTEXT';
  const workspaceId = getWorkspaceId(rawInput);
  let actorId = 'unauthorized';
  let actorType: McpAuditEvent['actorType'] = 'SERVICE_ACCOUNT';
  let entityType: string | null = null;
  let entityId: string | null = null;
  const now = dependencies.now ?? (() => new Date());

  try {
    const actor = await dependencies.authorizer.authorize(workspaceId, capability);
    actorId = actor.actorId;
    actorType = actor.actorType;
    let result: unknown;
    switch (toolName as FaroToolName) {
      case 'faro_get_due_followups': {
        const input = dueFollowupsInput.parse(rawInput);
        entityType = 'FollowUpTask';
        result = dueFollowupOutputSchema.parse(
          await dependencies.backend.getDueFollowups(
            input.workspaceId,
            input.dueBefore,
            input.limit,
          ),
        );
        break;
      }
      case 'faro_get_generation_request': {
        const input = generationRequestInput.parse(rawInput);
        entityType = 'BobGenerationRequest';
        entityId = input.requestId;
        const request = await dependencies.backend.getGenerationRequest(
          input.workspaceId,
          input.requestId,
        );
        if (request === null)
          throw new FaroMcpToolError('NOT_FOUND', 'Generation request not found');
        result = generationRequestOutputSchema.parse(request);
        break;
      }
      case 'faro_claim_generation_request': {
        const input = generationRequestInput.parse(rawInput);
        entityType = 'BobGenerationRequest';
        entityId = input.requestId;
        result = generationRequestOutputSchema.parse(
          await dependencies.backend.claimGenerationRequest(input.workspaceId, input.requestId),
        );
        break;
      }
      case 'faro_get_contact_context': {
        const input = contactInput.parse(rawInput);
        entityType = 'Contact';
        entityId = input.contactId;
        const contact = await dependencies.backend.getContactContext(
          input.workspaceId,
          input.requestId,
          input.contactId,
        );
        if (contact === null) throw new FaroMcpToolError('NOT_FOUND', 'Contact not found');
        result = contactOutputSchema.parse(contact);
        break;
      }
      case 'faro_get_organization_context': {
        const input = organizationInput.parse(rawInput);
        entityType = 'Organization';
        entityId = input.organizationId;
        const organization = await dependencies.backend.getOrganizationContext(
          input.workspaceId,
          input.requestId,
          input.organizationId,
        );
        if (organization === null)
          throw new FaroMcpToolError('NOT_FOUND', 'Organization not found');
        result = organizationOutputSchema.parse(organization);
        break;
      }
      case 'faro_get_campaign_context': {
        const input = campaignInput.parse(rawInput);
        entityType = 'Campaign';
        entityId = input.campaignId;
        const campaign = await dependencies.backend.getCampaignContext(
          input.workspaceId,
          input.requestId,
          input.campaignId,
        );
        if (campaign === null) throw new FaroMcpToolError('NOT_FOUND', 'Campaign not found');
        result = campaignOutputSchema.parse(campaign);
        break;
      }
      case 'faro_get_interaction_history': {
        const input = interactionInput.parse(rawInput);
        entityType = 'Interaction';
        entityId = input.contactId;
        result = interactionOutputSchema.parse(
          await dependencies.backend.getInteractionHistory(
            input.workspaceId,
            input.requestId,
            input.contactId,
            input.campaignId,
            input.limit,
          ),
        );
        break;
      }
      case 'faro_calculate_outreach_window': {
        const input = outreachOptimizerInputSchema.parse(rawInput);
        if (input.optimizerInput.workspace.id !== input.workspaceId) {
          throw new FaroMcpToolError(
            'TOOL_EXECUTION_FAILED',
            'Optimizer workspace must match the authorized MCP workspace',
          );
        }
        entityType = 'OutreachRecommendation';
        entityId = input.optimizerInput.contact.id;
        result = optimizeOutreachWindow(input.optimizerInput as OutreachOptimizerInput);
        break;
      }
      case 'faro_save_bob_draft': {
        const input = saveDraftInput.parse(rawInput);
        entityType = 'BobGenerationRequest';
        entityId = input.requestId;
        await dependencies.backend.saveBobDraft(
          input.workspaceId,
          input.requestId,
          input.draft,
          input.generatedAt,
          {
            resultProvenance: 'IBM_BOB',
            providerOperationId: input.providerOperationId,
            completedBy: actor.actorId,
          },
        );
        result = {
          requestId: input.requestId,
          status: 'COMPLETED',
          approvalStatus: 'PENDING_REVIEW',
          externalOutreachSent: false,
        };
        break;
      }
      case 'faro_save_response_analysis': {
        const input = saveAnalysisInput.parse(rawInput);
        entityType = 'BobGenerationRequest';
        entityId = input.requestId;
        await dependencies.backend.saveResponseAnalysis(
          input.workspaceId,
          input.requestId,
          input.analysis,
          input.generatedAt,
          {
            resultProvenance: 'IBM_BOB',
            providerOperationId: input.providerOperationId,
            completedBy: actor.actorId,
          },
        );
        result = {
          requestId: input.requestId,
          status: 'COMPLETED',
          humanReviewed: false,
        };
        break;
      }
      case 'faro_mark_generation_failed': {
        const input = failInput.parse(rawInput);
        entityType = 'BobGenerationRequest';
        entityId = input.requestId;
        await dependencies.backend.markGenerationFailed(
          input.workspaceId,
          input.requestId,
          input.errorCode,
        );
        result = { requestId: input.requestId, status: 'FAILED', errorCode: input.errorCode };
        break;
      }
      default:
        throw new FaroMcpToolError('UNKNOWN_TOOL', `Unknown Faro MCP tool: ${toolName}`);
    }

    await dependencies.audit.record({
      workspaceId,
      actorId,
      actorType,
      toolName: toolName as FaroToolName,
      outcome: 'SUCCEEDED',
      entityType,
      entityId,
      occurredAt: now().toISOString(),
    });
    return result;
  } catch (error) {
    const errorCode =
      error instanceof FaroMcpToolError
        ? error.code
        : error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'TOOL_EXECUTION_FAILED';
    await dependencies.audit.record({
      workspaceId,
      actorId,
      actorType,
      toolName: toolName as FaroToolName,
      outcome: actorId === 'unauthorized' ? 'DENIED' : 'FAILED',
      entityType,
      entityId,
      occurredAt: now().toISOString(),
      errorCode,
    });
    throw error;
  }
}
