import type {
  BobCompletionEvidence,
  OutreachDraftResult,
  ResponseAnalysisResult,
} from '@faro/ibm-bob';

export interface AuthorizedMcpActor {
  actorId: string;
  actorType: 'IBM_BOB_MCP' | 'SERVICE_ACCOUNT';
  workspaceId: string;
  capabilities: ReadonlySet<'READ_CONTEXT' | 'WRITE_BOB_RESULT'>;
}

export interface WorkspaceAuthorizer {
  authorize(
    workspaceId: string,
    capability: 'READ_CONTEXT' | 'WRITE_BOB_RESULT',
  ): Promise<AuthorizedMcpActor>;
}

export interface McpAuditEvent {
  workspaceId: string;
  actorId: string;
  actorType: AuthorizedMcpActor['actorType'];
  toolName: FaroToolName;
  outcome: 'SUCCEEDED' | 'DENIED' | 'FAILED';
  entityType: string | null;
  entityId: string | null;
  occurredAt: string;
  errorCode?: string;
}

export interface McpAuditSink {
  record(event: McpAuditEvent): Promise<void>;
}

export type FaroToolName =
  | 'faro_get_due_followups'
  | 'faro_get_generation_request'
  | 'faro_claim_generation_request'
  | 'faro_get_contact_context'
  | 'faro_get_organization_context'
  | 'faro_get_campaign_context'
  | 'faro_get_interaction_history'
  | 'faro_calculate_outreach_window'
  | 'faro_save_bob_draft'
  | 'faro_save_response_analysis'
  | 'faro_mark_generation_failed';

export interface GovernedContactContext {
  id: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  organizationId?: string;
  timezone?: string;
  preferredChannel?: string;
  consentStatus: string;
  nextActionAt: string;
  nextActionType: string;
  suppressed: boolean;
}

export interface GovernedOrganizationContext {
  id: string;
  name: string;
  type?: string;
  industry?: string;
  sponsorshipStage?: string;
  interestAreas: string[];
}

export interface GovernedCampaignContext {
  id: string;
  name: string;
  objective: string;
  status: string;
  defaultTone?: string;
  deadlineAt?: string | null;
}

export interface GovernedInteractionContext {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: string;
  subject?: string;
  bodyText?: string;
  occurredAt: string;
}

export interface FaroMcpBackend {
  getDueFollowups(workspaceId: string, dueBefore: string, limit: number): Promise<unknown[]>;
  getGenerationRequest(workspaceId: string, requestId: string): Promise<unknown | null>;
  claimGenerationRequest(workspaceId: string, requestId: string): Promise<unknown>;
  getContactContext(
    workspaceId: string,
    requestId: string,
    contactId: string,
  ): Promise<GovernedContactContext | null>;
  getOrganizationContext(
    workspaceId: string,
    requestId: string,
    organizationId: string,
  ): Promise<GovernedOrganizationContext | null>;
  getCampaignContext(
    workspaceId: string,
    requestId: string,
    campaignId: string,
  ): Promise<GovernedCampaignContext | null>;
  getInteractionHistory(
    workspaceId: string,
    requestId: string,
    contactId: string,
    campaignId: string | undefined,
    limit: number,
  ): Promise<GovernedInteractionContext[]>;
  saveBobDraft(
    workspaceId: string,
    requestId: string,
    draft: OutreachDraftResult,
    generatedAt: string,
    evidence: BobCompletionEvidence,
  ): Promise<unknown>;
  saveResponseAnalysis(
    workspaceId: string,
    requestId: string,
    analysis: ResponseAnalysisResult,
    generatedAt: string,
    evidence: BobCompletionEvidence,
  ): Promise<unknown>;
  markGenerationFailed(workspaceId: string, requestId: string, errorCode: string): Promise<unknown>;
}
