import { randomUUID } from 'node:crypto';

import type { RecommendationExplanation, ResponseAnalysisResult } from '../contracts/analysis';
import type { OutreachDraftResult } from '../contracts/outreach';

export type BobGenerationRequestType =
  'OUTREACH_DRAFT' | 'RESPONSE_ANALYSIS' | 'RECOMMENDATION_EXPLANATION';
export type BobGenerationRequestStatus =
  'AWAITING_BOB' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type BobValidatedResult =
  OutreachDraftResult | ResponseAnalysisResult | RecommendationExplanation;

export interface BobCompletionEvidence {
  resultProvenance: 'IBM_BOB';
  providerOperationId: string;
  completedBy: string;
}

export interface BobGenerationRequest {
  id: string;
  workspaceId: string;
  contactId: string;
  campaignId: string;
  followUpTaskId: string | null;
  type: BobGenerationRequestType;
  status: BobGenerationRequestStatus;
  promptVersion: string;
  promptText: string;
  approvedSourceRecordIds: string[];
  contextVersion: number;
  idempotencyKey: string;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  result: BobValidatedResult | null;
  resultProvenance: 'IBM_BOB' | null;
  providerOperationId: string | null;
}

export interface CreateBobGenerationRequest {
  workspaceId: string;
  contactId: string;
  campaignId: string;
  followUpTaskId: string | null;
  type: BobGenerationRequestType;
  promptVersion: string;
  promptText: string;
  approvedSourceRecordIds: string[];
  contextVersion: number;
  idempotencyKey: string;
  requestedBy: string;
}

export interface BobGenerationRequestStore {
  create(input: CreateBobGenerationRequest): Promise<BobGenerationRequest>;
  get(workspaceId: string, requestId: string): Promise<BobGenerationRequest | null>;
  listAwaiting(workspaceId: string, limit: number): Promise<BobGenerationRequest[]>;
  markProcessing(workspaceId: string, requestId: string, at: string): Promise<BobGenerationRequest>;
  complete(
    workspaceId: string,
    requestId: string,
    result: BobValidatedResult,
    at: string,
    evidence: BobCompletionEvidence,
  ): Promise<BobGenerationRequest>;
  fail(
    workspaceId: string,
    requestId: string,
    errorCode: string,
    at: string,
  ): Promise<BobGenerationRequest>;
}

export class BobRequestTransitionError extends Error {
  constructor(
    readonly code: 'BOB_REQUEST_NOT_FOUND' | 'BOB_REQUEST_INVALID_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'BobRequestTransitionError';
  }
}

function cloneRequest(request: BobGenerationRequest): BobGenerationRequest {
  return structuredClone(request);
}

export class InMemoryBobGenerationRequestStore implements BobGenerationRequestStore {
  private readonly records = new Map<string, BobGenerationRequest>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async create(input: CreateBobGenerationRequest): Promise<BobGenerationRequest> {
    const existing = [...this.records.values()].find(
      (request) =>
        request.workspaceId === input.workspaceId &&
        request.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      const samePayload =
        existing.type === input.type &&
        existing.contactId === input.contactId &&
        existing.campaignId === input.campaignId &&
        existing.followUpTaskId === input.followUpTaskId &&
        existing.promptVersion === input.promptVersion &&
        existing.promptText === input.promptText &&
        existing.requestedBy === input.requestedBy;
      if (!samePayload) {
        throw new Error('Bob request idempotency key is already bound to different input');
      }
      return cloneRequest(existing);
    }
    const request: BobGenerationRequest = {
      ...input,
      id: this.createId(),
      status: 'AWAITING_BOB',
      requestedAt: this.now().toISOString(),
      startedAt: null,
      completedAt: null,
      errorCode: null,
      result: null,
      resultProvenance: null,
      providerOperationId: null,
    };
    this.records.set(request.id, request);
    return cloneRequest(request);
  }

  async get(workspaceId: string, requestId: string): Promise<BobGenerationRequest | null> {
    const request = this.records.get(requestId);
    return request?.workspaceId === workspaceId ? cloneRequest(request) : null;
  }

  async listAwaiting(workspaceId: string, limit: number): Promise<BobGenerationRequest[]> {
    return [...this.records.values()]
      .filter((request) => request.workspaceId === workspaceId && request.status === 'AWAITING_BOB')
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .slice(0, Math.max(0, limit))
      .map(cloneRequest);
  }

  async markProcessing(
    workspaceId: string,
    requestId: string,
    at: string,
  ): Promise<BobGenerationRequest> {
    const request = this.requireRequest(workspaceId, requestId);
    if (request.status !== 'AWAITING_BOB') {
      throw new BobRequestTransitionError(
        'BOB_REQUEST_INVALID_TRANSITION',
        `Cannot start a request in ${request.status} status`,
      );
    }
    request.status = 'PROCESSING';
    request.startedAt = at;
    return cloneRequest(request);
  }

  async complete(
    workspaceId: string,
    requestId: string,
    result: BobValidatedResult,
    at: string,
    evidence: BobCompletionEvidence,
  ): Promise<BobGenerationRequest> {
    const request = this.requireRequest(workspaceId, requestId);
    if (
      request.status === 'COMPLETED' &&
      request.providerOperationId === evidence.providerOperationId &&
      JSON.stringify(request.result) === JSON.stringify(result)
    ) {
      return cloneRequest(request);
    }
    if (request.status !== 'PROCESSING') {
      throw new BobRequestTransitionError(
        'BOB_REQUEST_INVALID_TRANSITION',
        `Cannot complete a request in ${request.status} status`,
      );
    }
    request.status = 'COMPLETED';
    request.result = structuredClone(result);
    request.resultProvenance = evidence.resultProvenance;
    request.providerOperationId = evidence.providerOperationId;
    request.completedAt = at;
    return cloneRequest(request);
  }

  async fail(
    workspaceId: string,
    requestId: string,
    errorCode: string,
    at: string,
  ): Promise<BobGenerationRequest> {
    const request = this.requireRequest(workspaceId, requestId);
    if (request.status !== 'AWAITING_BOB' && request.status !== 'PROCESSING') {
      throw new BobRequestTransitionError(
        'BOB_REQUEST_INVALID_TRANSITION',
        `Cannot fail a request in ${request.status} status`,
      );
    }
    request.status = 'FAILED';
    request.errorCode = errorCode;
    request.completedAt = at;
    return cloneRequest(request);
  }

  private requireRequest(workspaceId: string, requestId: string): BobGenerationRequest {
    const request = this.records.get(requestId);
    if (!request || request.workspaceId !== workspaceId) {
      throw new BobRequestTransitionError('BOB_REQUEST_NOT_FOUND', 'Generation request not found');
    }
    return request;
  }
}
