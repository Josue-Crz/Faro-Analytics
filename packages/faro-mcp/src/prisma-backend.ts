import { randomUUID } from 'node:crypto';

import type {
  BobCompletionEvidence,
  BobGenerationRequest,
  BobGenerationRequestStore,
  BobValidatedResult,
  CreateBobGenerationRequest,
  OutreachDraftResult,
} from '@faro/ibm-bob';
import type { PrismaClient } from '@faro/database';

import { BobWorkflowFaroMcpBackend, type FaroMcpContextRepository } from './bob-backend.js';
import type {
  GovernedCampaignContext,
  GovernedContactContext,
  GovernedInteractionContext,
  GovernedOrganizationContext,
  McpAuditEvent,
  McpAuditSink,
} from './contracts.js';

export class PrismaBobStoreError extends Error {
  constructor(
    readonly code:
      | 'BOB_REQUEST_NOT_FOUND'
      | 'BOB_REQUEST_INVALID_TRANSITION'
      | 'BOB_REQUEST_CONTEXT_INVALID'
      | 'BOB_REQUEST_IDEMPOTENCY_CONFLICT'
      | 'BOB_REQUEST_TYPE_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'PrismaBobStoreError';
  }
}

export interface PrismaBobStoreOptions {
  now?: () => Date;
  createId?: () => string;
}

/** Shared PostgreSQL lifecycle store used by both the Next route and the stdio MCP process. */
export class PrismaBobGenerationRequestStore implements BobGenerationRequestStore {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly client: PrismaClient,
    options: PrismaBobStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async create(input: CreateBobGenerationRequest): Promise<BobGenerationRequest> {
    if (input.type !== 'OUTREACH_DRAFT') {
      throw new PrismaBobStoreError(
        'BOB_REQUEST_TYPE_UNSUPPORTED',
        'This database adapter currently persists outreach-draft requests only',
      );
    }
    if (
      !input.approvedSourceRecordIds.includes(input.contactId) ||
      !input.approvedSourceRecordIds.includes(input.campaignId) ||
      (input.followUpTaskId !== null &&
        !input.approvedSourceRecordIds.includes(input.followUpTaskId))
    ) {
      throw new PrismaBobStoreError(
        'BOB_REQUEST_CONTEXT_INVALID',
        'Contact, campaign, and follow-up IDs must be explicitly approved sources',
      );
    }

    const requestId = await this.client.$transaction(async (transaction) => {
      const existing = await transaction.bobGenerationRequest.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        const samePayload =
          existing.contactId === input.contactId &&
          existing.campaignId === input.campaignId &&
          existing.followUpTaskId === input.followUpTaskId &&
          existing.type === input.type &&
          existing.promptVersion === input.promptVersion &&
          existing.promptText === input.promptText &&
          existing.requestedById === input.requestedBy;
        if (!samePayload) {
          throw new PrismaBobStoreError(
            'BOB_REQUEST_IDEMPOTENCY_CONFLICT',
            'Bob request idempotency key is already bound to different input',
          );
        }
        return existing.id;
      }

      const [membership, contact, campaign, followUp] = await Promise.all([
        transaction.membership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: input.workspaceId,
              userId: input.requestedBy,
            },
          },
          select: { userId: true },
        }),
        transaction.contact.findFirst({
          where: { id: input.contactId, workspaceId: input.workspaceId, deletedAt: null },
          select: { id: true, consentStatus: true, suppressedAt: true },
        }),
        transaction.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: input.workspaceId, archivedAt: null },
          select: { id: true },
        }),
        input.followUpTaskId === null
          ? Promise.resolve(null)
          : transaction.followUpTask.findFirst({
              where: {
                id: input.followUpTaskId,
                workspaceId: input.workspaceId,
                contactId: input.contactId,
                campaignId: input.campaignId,
              },
              select: { id: true },
            }),
      ]);
      if (!membership || !contact || !campaign || (input.followUpTaskId !== null && !followUp)) {
        throw new PrismaBobStoreError(
          'BOB_REQUEST_CONTEXT_INVALID',
          'Workspace-scoped request context or membership was not found',
        );
      }
      if (
        contact.suppressedAt !== null ||
        (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED')
      ) {
        throw new PrismaBobStoreError(
          'BOB_REQUEST_CONTEXT_INVALID',
          'Drafting requires opted-in or implied consent and a non-suppressed contact',
        );
      }

      const id = this.createId();
      const requestedAt = this.now();
      await transaction.bobGenerationRequest.create({
        data: {
          id,
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          campaignId: input.campaignId,
          followUpTaskId: input.followUpTaskId,
          type: input.type,
          promptVersion: input.promptVersion,
          promptText: input.promptText,
          approvedSourceRecordIds: input.approvedSourceRecordIds,
          contextVersion: input.contextVersion,
          status: 'AWAITING_BOB',
          requestedById: input.requestedBy,
          requestedAt,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await transaction.auditEvent.create({
        data: {
          id: this.createId(),
          workspaceId: input.workspaceId,
          actorType: 'USER',
          actorId: input.requestedBy,
          action: 'BOB_GENERATION_REQUEST_CREATED',
          entityType: 'BobGenerationRequest',
          entityId: id,
          metadata: { promptVersion: input.promptVersion, contextVersion: input.contextVersion },
          occurredAt: requestedAt,
        },
      });
      return id;
    });

    return this.requireDomainRequest(input.workspaceId, requestId);
  }

  async get(workspaceId: string, requestId: string): Promise<BobGenerationRequest | null> {
    const record = await this.client.bobGenerationRequest.findFirst({
      where: { id: requestId, workspaceId },
      include: { draft: true },
    });
    return record ? this.toDomain(record) : null;
  }

  async listAwaiting(workspaceId: string, limit: number): Promise<BobGenerationRequest[]> {
    const records = await this.client.bobGenerationRequest.findMany({
      where: { workspaceId, status: 'AWAITING_BOB' },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(0, limit)),
      include: { draft: true },
    });
    return records.map((record) => this.toDomain(record));
  }

  async markProcessing(
    workspaceId: string,
    requestId: string,
    at: string,
  ): Promise<BobGenerationRequest> {
    const startedAt = new Date(at);
    const updated = await this.client.bobGenerationRequest.updateMany({
      where: { id: requestId, workspaceId, status: 'AWAITING_BOB' },
      data: { status: 'PROCESSING', startedAt },
    });
    if (updated.count !== 1) return this.throwTransition(workspaceId, requestId, 'start');
    return this.requireDomainRequest(workspaceId, requestId);
  }

  async complete(
    workspaceId: string,
    requestId: string,
    rawResult: BobValidatedResult,
    at: string,
    evidence: BobCompletionEvidence,
  ): Promise<BobGenerationRequest> {
    const request = await this.client.bobGenerationRequest.findFirst({
      where: { id: requestId, workspaceId },
      select: {
        type: true,
        status: true,
        approvedSourceRecordIds: true,
        draft: { select: { providerOperationId: true } },
      },
    });
    if (!request) {
      throw new PrismaBobStoreError('BOB_REQUEST_NOT_FOUND', 'Generation request not found');
    }
    if (request.type !== 'OUTREACH_DRAFT') {
      throw new PrismaBobStoreError(
        'BOB_REQUEST_TYPE_UNSUPPORTED',
        'Response analysis persistence requires a response-linked schema adapter',
      );
    }
    if (
      request.status === 'COMPLETED' &&
      request.draft?.providerOperationId === evidence.providerOperationId
    ) {
      return this.requireDomainRequest(workspaceId, requestId);
    }
    if (request.status !== 'PROCESSING') {
      throw new PrismaBobStoreError(
        'BOB_REQUEST_INVALID_TRANSITION',
        `Cannot complete a request in ${request.status} status`,
      );
    }
    const result = rawResult as OutreachDraftResult;
    const approvedSources = new Set(request.approvedSourceRecordIds);
    if (result.sourceRecordIds.some((recordId) => !approvedSources.has(recordId))) {
      throw new PrismaBobStoreError(
        'BOB_REQUEST_CONTEXT_INVALID',
        'IBM Bob result cites a source record that was not approved for this request',
      );
    }

    const completedAt = new Date(at);
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.bobGenerationRequest.updateMany({
        where: { id: requestId, workspaceId, status: 'PROCESSING' },
        data: { status: 'COMPLETED', completedAt, errorCode: null, errorMessage: null },
      });
      if (updated.count !== 1) {
        throw new PrismaBobStoreError(
          'BOB_REQUEST_INVALID_TRANSITION',
          'Generation request was no longer processing',
        );
      }
      await transaction.bobDraft.create({
        data: {
          id: this.createId(),
          workspaceId,
          generationRequestId: requestId,
          subject: result.subject,
          bodyText: result.bodyText,
          bodyHtml: null,
          rationale: result.rationale,
          recommendedNextAction: result.recommendedNextAction,
          suggestedFollowUpAt: result.suggestedFollowUpAt
            ? new Date(result.suggestedFollowUpAt)
            : null,
          confidence: result.confidence,
          riskFlags: result.riskFlags,
          sourceRecordIds: result.sourceRecordIds,
          generatedAt: completedAt,
          provenance: evidence.resultProvenance,
          providerOperationId: evidence.providerOperationId,
          approvalStatus: 'PENDING_REVIEW',
        },
      });
    });
    return this.requireDomainRequest(workspaceId, requestId);
  }

  async fail(
    workspaceId: string,
    requestId: string,
    errorCode: string,
    at: string,
  ): Promise<BobGenerationRequest> {
    const updated = await this.client.bobGenerationRequest.updateMany({
      where: { id: requestId, workspaceId, status: { in: ['AWAITING_BOB', 'PROCESSING'] } },
      data: { status: 'FAILED', completedAt: new Date(at), errorCode, errorMessage: null },
    });
    if (updated.count !== 1) return this.throwTransition(workspaceId, requestId, 'fail');
    return this.requireDomainRequest(workspaceId, requestId);
  }

  private async requireDomainRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<BobGenerationRequest> {
    const request = await this.get(workspaceId, requestId);
    if (!request) {
      throw new PrismaBobStoreError('BOB_REQUEST_NOT_FOUND', 'Generation request not found');
    }
    return request;
  }

  private async throwTransition(
    workspaceId: string,
    requestId: string,
    operation: string,
  ): Promise<never> {
    const request = await this.client.bobGenerationRequest.findFirst({
      where: { id: requestId, workspaceId },
      select: { status: true },
    });
    if (!request) {
      throw new PrismaBobStoreError('BOB_REQUEST_NOT_FOUND', 'Generation request not found');
    }
    throw new PrismaBobStoreError(
      'BOB_REQUEST_INVALID_TRANSITION',
      `Cannot ${operation} a request in ${request.status} status`,
    );
  }

  private toDomain(
    record: Awaited<ReturnType<typeof this.findDomainRecord>>,
  ): BobGenerationRequest {
    if (!record) throw new Error('Cannot map an absent Bob generation request');
    const verifiedBobDraft = record.draft?.provenance === 'IBM_BOB' ? record.draft : null;
    const result: OutreachDraftResult | null = verifiedBobDraft
      ? {
          subject: verifiedBobDraft.subject,
          bodyText: verifiedBobDraft.bodyText,
          rationale: verifiedBobDraft.rationale,
          recommendedNextAction: verifiedBobDraft.recommendedNextAction,
          suggestedFollowUpAt: verifiedBobDraft.suggestedFollowUpAt?.toISOString() ?? null,
          confidence: verifiedBobDraft.confidence,
          riskFlags: verifiedBobDraft.riskFlags,
          sourceRecordIds: verifiedBobDraft.sourceRecordIds,
        }
      : null;
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      contactId: record.contactId,
      campaignId: record.campaignId,
      followUpTaskId: record.followUpTaskId,
      type: record.type,
      status: record.status,
      promptVersion: record.promptVersion,
      promptText: record.promptText,
      approvedSourceRecordIds: record.approvedSourceRecordIds,
      contextVersion: record.contextVersion,
      idempotencyKey: record.idempotencyKey,
      requestedBy: record.requestedById,
      requestedAt: record.requestedAt.toISOString(),
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      errorCode: record.errorCode,
      result,
      resultProvenance: verifiedBobDraft ? 'IBM_BOB' : null,
      providerOperationId: verifiedBobDraft?.providerOperationId ?? null,
    };
  }

  private findDomainRecord(workspaceId: string, requestId: string) {
    return this.client.bobGenerationRequest.findFirst({
      where: { id: requestId, workspaceId },
      include: { draft: true },
    });
  }
}

/** Workspace-filtered, minimized context reads for the request-bound MCP backend. */
export class PrismaFaroMcpContextRepository implements FaroMcpContextRepository {
  constructor(private readonly client: PrismaClient) {}

  async getDueFollowups(workspaceId: string, dueBefore: string, limit: number): Promise<unknown[]> {
    const rows = await this.client.followUpTask.findMany({
      where: {
        workspaceId,
        status: 'OPEN',
        dueAt: { lte: new Date(dueBefore) },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, limit)),
      include: {
        bobRequests: { orderBy: { requestedAt: 'desc' }, take: 1, select: { status: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      contactId: row.contactId,
      campaignId: row.campaignId,
      dueAt: row.dueAt.toISOString(),
      priority: row.priority,
      reason: row.reason,
      ...(row.recommendedNextAction
        ? { recommendedNextAction: row.recommendedNextAction.slice(0, 2_000) }
        : {}),
      bobStatus:
        row.bobRequests[0]?.status === 'COMPLETED'
          ? 'DRAFT_READY'
          : (row.bobRequests[0]?.status ?? 'NOT_REQUESTED'),
    }));
  }

  async getContactContext(
    workspaceId: string,
    contactId: string,
  ): Promise<GovernedContactContext | null> {
    const contact = await this.client.contact.findFirst({
      where: { id: contactId, workspaceId, deletedAt: null },
    });
    return contact
      ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          ...(contact.title ? { title: contact.title } : {}),
          ...(contact.organizationId ? { organizationId: contact.organizationId } : {}),
          timezone: contact.timezone,
          preferredChannel: contact.preferredChannel,
          consentStatus: contact.consentStatus,
          suppressed: contact.suppressedAt !== null,
        }
      : null;
  }

  async getOrganizationContext(
    workspaceId: string,
    organizationId: string,
  ): Promise<GovernedOrganizationContext | null> {
    const organization = await this.client.organization.findFirst({
      where: { id: organizationId, workspaceId, deletedAt: null },
      include: { sponsorshipStage: { select: { name: true } } },
    });
    return organization
      ? {
          id: organization.id,
          name: organization.name,
          type: organization.type,
          ...(organization.industry ? { industry: organization.industry } : {}),
          ...(organization.sponsorshipStage
            ? { sponsorshipStage: organization.sponsorshipStage.name }
            : {}),
          interestAreas: organization.interestAreas,
        }
      : null;
  }

  async getCampaignContext(
    workspaceId: string,
    campaignId: string,
  ): Promise<GovernedCampaignContext | null> {
    const campaign = await this.client.campaign.findFirst({
      where: { id: campaignId, workspaceId, archivedAt: null },
    });
    return campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          defaultTone: campaign.defaultTone,
          deadlineAt: campaign.endAt?.toISOString() ?? null,
        }
      : null;
  }

  async getInteractionHistory(
    workspaceId: string,
    contactId: string,
    campaignId: string | undefined,
    limit: number,
  ): Promise<GovernedInteractionContext[]> {
    const rows = await this.client.interaction.findMany({
      where: { workspaceId, contactId, ...(campaignId ? { campaignId } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: Math.min(20, Math.max(1, limit)),
    });
    return rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      channel: row.channel,
      ...(row.subject ? { subject: row.subject.slice(0, 1_000) } : {}),
      bodyText: row.bodyText.slice(0, 12_000),
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}

export class PrismaMcpAuditSink implements McpAuditSink {
  constructor(
    private readonly client: PrismaClient,
    private readonly createId: () => string = randomUUID,
    private readonly scopedWorkspaceId?: string,
  ) {}

  async record(event: McpAuditEvent): Promise<void> {
    const workspaceId = this.scopedWorkspaceId ?? event.workspaceId;
    if (workspaceId === 'unknown') return;
    await this.client.auditEvent.create({
      data: {
        id: this.createId(),
        workspaceId,
        actorType: 'MCP',
        actorId: event.actorId === 'unauthorized' ? null : event.actorId,
        action: event.toolName,
        entityType: event.entityType ?? 'McpTool',
        entityId: event.entityId ?? event.toolName,
        metadata: {
          outcome: event.outcome,
          ...(workspaceId !== event.workspaceId ? { requestedWorkspaceId: event.workspaceId } : {}),
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        },
        occurredAt: new Date(event.occurredAt),
      },
    });
  }
}

export function createPrismaFaroMcpServices(
  client: PrismaClient,
  options: PrismaBobStoreOptions & { auditWorkspaceId?: string } = {},
) {
  const requestStore = new PrismaBobGenerationRequestStore(client, options);
  const contextRepository = new PrismaFaroMcpContextRepository(client);
  return {
    requestStore,
    contextRepository,
    backend: new BobWorkflowFaroMcpBackend(requestStore, contextRepository, options.now),
    audit: new PrismaMcpAuditSink(client, options.createId, options.auditWorkspaceId),
  };
}
