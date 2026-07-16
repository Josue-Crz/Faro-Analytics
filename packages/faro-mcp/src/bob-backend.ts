import {
  IbmBobMcpAdapter,
  validateResponseAnalysisResult,
  type BobGenerationRequest,
  type BobGenerationRequestStore,
  type BobCompletionEvidence,
  type OutreachDraftResult,
  type ResponseAnalysisResult,
} from '@faro/ibm-bob';

import type {
  FaroMcpBackend,
  GovernedCampaignContext,
  GovernedContactContext,
  GovernedInteractionContext,
  GovernedOrganizationContext,
} from './contracts.js';

export interface FaroMcpContextRepository {
  getDueFollowups(workspaceId: string, dueBefore: string, limit: number): Promise<unknown[]>;
  getContactContext(workspaceId: string, contactId: string): Promise<GovernedContactContext | null>;
  getOrganizationContext(
    workspaceId: string,
    organizationId: string,
  ): Promise<GovernedOrganizationContext | null>;
  getCampaignContext(
    workspaceId: string,
    campaignId: string,
  ): Promise<GovernedCampaignContext | null>;
  getInteractionHistory(
    workspaceId: string,
    contactId: string,
    campaignId: string | undefined,
    limit: number,
  ): Promise<GovernedInteractionContext[]>;
}

function governedRequest(request: BobGenerationRequest) {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    contactId: request.contactId,
    campaignId: request.campaignId,
    followUpTaskId: request.followUpTaskId,
    type: request.type,
    status: request.status,
    promptVersion: request.promptVersion,
    promptText: request.promptText,
    approvedSourceRecordIds: request.approvedSourceRecordIds,
    contextVersion: request.contextVersion,
    requestedAt: request.requestedAt,
    startedAt: request.startedAt,
  };
}

/** Composes the audited MCP tool layer with the IBM Bob request lifecycle and context repository. */
export class BobWorkflowFaroMcpBackend implements FaroMcpBackend {
  private readonly adapter: IbmBobMcpAdapter;

  constructor(
    private readonly requests: BobGenerationRequestStore,
    private readonly context: FaroMcpContextRepository,
    now: () => Date = () => new Date(),
  ) {
    this.adapter = new IbmBobMcpAdapter(requests, now);
  }

  getDueFollowups(workspaceId: string, dueBefore: string, limit: number): Promise<unknown[]> {
    return this.context.getDueFollowups(workspaceId, dueBefore, limit);
  }

  async getGenerationRequest(workspaceId: string, requestId: string): Promise<unknown | null> {
    const request = await this.requests.get(workspaceId, requestId);
    return request ? governedRequest(request) : null;
  }

  async claimGenerationRequest(workspaceId: string, requestId: string): Promise<unknown> {
    return governedRequest(await this.adapter.claimRequest(workspaceId, requestId));
  }

  getContactContext(
    workspaceId: string,
    requestId: string,
    contactId: string,
  ): Promise<GovernedContactContext | null> {
    return this.withApprovedRequest(workspaceId, requestId, [contactId], () =>
      this.context.getContactContext(workspaceId, contactId),
    );
  }

  getOrganizationContext(
    workspaceId: string,
    requestId: string,
    organizationId: string,
  ): Promise<GovernedOrganizationContext | null> {
    return this.withApprovedRequest(workspaceId, requestId, [organizationId], () =>
      this.context.getOrganizationContext(workspaceId, organizationId),
    );
  }

  getCampaignContext(
    workspaceId: string,
    requestId: string,
    campaignId: string,
  ): Promise<GovernedCampaignContext | null> {
    return this.withApprovedRequest(workspaceId, requestId, [campaignId], () =>
      this.context.getCampaignContext(workspaceId, campaignId),
    );
  }

  getInteractionHistory(
    workspaceId: string,
    requestId: string,
    contactId: string,
    campaignId: string | undefined,
    limit: number,
  ): Promise<GovernedInteractionContext[]> {
    return this.withApprovedRequest(
      workspaceId,
      requestId,
      [contactId, ...(campaignId ? [campaignId] : [])],
      async (approvedSources) => {
        const interactions = await this.context.getInteractionHistory(
          workspaceId,
          contactId,
          campaignId,
          limit,
        );
        if (interactions.some((interaction) => !approvedSources.has(interaction.id))) {
          throw new Error('Interaction history contains a record not approved for this request');
        }
        return interactions;
      },
    );
  }

  async saveBobDraft(
    workspaceId: string,
    requestId: string,
    draft: OutreachDraftResult,
    generatedAt: string,
    evidence: BobCompletionEvidence,
  ): Promise<unknown> {
    const saved = await this.adapter.saveOutreachDraft(
      workspaceId,
      requestId,
      draft,
      evidence,
      generatedAt,
    );
    return {
      requestId: saved.id,
      status: saved.status,
      resultProvenance: saved.resultProvenance,
      approvalStatus: 'PENDING_REVIEW',
      externalOutreachSent: false,
    };
  }

  async saveResponseAnalysis(
    workspaceId: string,
    requestId: string,
    rawAnalysis: ResponseAnalysisResult,
    generatedAt: string,
    evidence: BobCompletionEvidence,
  ): Promise<unknown> {
    const request = await this.requests.get(workspaceId, requestId);
    if (!request || request.type !== 'RESPONSE_ANALYSIS') {
      throw new Error('Response-analysis generation request not found');
    }
    const analysis = validateResponseAnalysisResult(rawAnalysis);
    const approvedSources = new Set(request.approvedSourceRecordIds);
    if (analysis.sourceRecordIds.some((recordId) => !approvedSources.has(recordId))) {
      throw new Error(
        'IBM Bob result cites a source record that was not approved for this request',
      );
    }
    const saved = await this.requests.complete(
      workspaceId,
      requestId,
      analysis,
      generatedAt,
      evidence,
    );
    return {
      requestId: saved.id,
      status: saved.status,
      resultProvenance: saved.resultProvenance,
      humanReviewed: false,
    };
  }

  async markGenerationFailed(
    workspaceId: string,
    requestId: string,
    errorCode: string,
  ): Promise<unknown> {
    const request = await this.adapter.markFailed(workspaceId, requestId, errorCode);
    return { requestId: request.id, status: request.status, errorCode: request.errorCode };
  }

  private async withApprovedRequest<T>(
    workspaceId: string,
    requestId: string,
    recordIds: string[],
    operation: (approvedSources: ReadonlySet<string>) => Promise<T>,
  ): Promise<T> {
    const request = await this.requests.get(workspaceId, requestId);
    if (!request || request.status !== 'PROCESSING') {
      throw new Error('A processing IBM Bob request is required for governed context access');
    }
    const approvedSources = new Set(request.approvedSourceRecordIds);
    if (recordIds.some((recordId) => !approvedSources.has(recordId))) {
      throw new Error('Requested context is not approved for this IBM Bob request');
    }
    return operation(approvedSources);
  }
}
