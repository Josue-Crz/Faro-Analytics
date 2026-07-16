import { createHash } from 'node:crypto';

import { bobIdentifierSchema, isoInstantSchema } from '../contracts/common';
import { outreachDraftInputSchema, type OutreachDraftInput } from '../contracts/outreach';
import {
  OUTREACH_DRAFT_PROMPT_VERSION,
  renderOutreachDraftPrompt,
} from '../prompts/outreach-draft';
import { validateOutreachDraftResult } from '../validation/output';
import type {
  BobCompletionEvidence,
  BobGenerationRequest,
  BobGenerationRequestStore,
} from '../workflows/request-store';

export interface AwaitingBobResult {
  status: 'AWAITING_BOB';
  request: BobGenerationRequest;
  workflowPrompt: string;
}

export interface OutreachDraftRequestMetadata {
  followUpTaskId?: string | null;
  idempotencyKey?: string;
}

/**
 * Queues governed requests for IBM Bob to retrieve and complete through Faro MCP. It is not a
 * network model adapter and therefore does not implement IbmBobService.
 */
export class IbmBobMcpAdapter {
  constructor(
    private readonly store: BobGenerationRequestStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestOutreachDraft(
    rawInput: OutreachDraftInput,
    requestedBy: string,
    metadata: OutreachDraftRequestMetadata = {},
  ): Promise<AwaitingBobResult> {
    const input = outreachDraftInputSchema.parse(rawInput);
    const actorId = bobIdentifierSchema.parse(requestedBy);
    const promptText = renderOutreachDraftPrompt(input);
    const request = await this.store.create({
      workspaceId: input.workspaceId,
      contactId: input.contact.id,
      campaignId: input.campaign.id,
      followUpTaskId: metadata.followUpTaskId ?? null,
      type: 'OUTREACH_DRAFT',
      promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
      promptText,
      approvedSourceRecordIds: input.approvedSourceRecordIds,
      contextVersion: 1,
      idempotencyKey:
        metadata.idempotencyKey ??
        createHash('sha256')
          .update(
            JSON.stringify({
              workspaceId: input.workspaceId,
              followUpTaskId: metadata.followUpTaskId ?? null,
              requestedBy: actorId,
              promptText,
            }),
          )
          .digest('hex'),
      requestedBy: actorId,
    });

    return {
      status: 'AWAITING_BOB',
      request,
      workflowPrompt: `Use Faro MCP to retrieve generation request ${request.id} in workspace ${input.workspaceId}, claim it with faro_claim_generation_request, retrieve only its approved context, then save the validated result for human review.`,
    };
  }

  async claimRequest(workspaceId: string, requestId: string): Promise<BobGenerationRequest> {
    bobIdentifierSchema.parse(workspaceId);
    bobIdentifierSchema.parse(requestId);
    return this.store.markProcessing(workspaceId, requestId, this.now().toISOString());
  }

  async saveOutreachDraft(
    workspaceId: string,
    requestId: string,
    rawResult: unknown,
    evidence: BobCompletionEvidence,
    generatedAt = this.now().toISOString(),
  ): Promise<BobGenerationRequest> {
    bobIdentifierSchema.parse(workspaceId);
    bobIdentifierSchema.parse(requestId);
    isoInstantSchema.parse(generatedAt);
    const request = await this.store.get(workspaceId, requestId);
    if (!request || request.type !== 'OUTREACH_DRAFT') {
      throw new Error('Outreach generation request not found');
    }
    const result = validateOutreachDraftResult(rawResult);
    const approvedSources = new Set(request.approvedSourceRecordIds);
    if (result.sourceRecordIds.some((recordId) => !approvedSources.has(recordId))) {
      throw new Error(
        'IBM Bob result cites a source record that was not approved for this request',
      );
    }
    return this.store.complete(workspaceId, requestId, result, generatedAt, evidence);
  }

  async markFailed(
    workspaceId: string,
    requestId: string,
    errorCode: string,
  ): Promise<BobGenerationRequest> {
    bobIdentifierSchema.parse(workspaceId);
    bobIdentifierSchema.parse(requestId);
    const safeErrorCode = bobIdentifierSchema.parse(errorCode);
    return this.store.fail(workspaceId, requestId, safeErrorCode, this.now().toISOString());
  }
}
