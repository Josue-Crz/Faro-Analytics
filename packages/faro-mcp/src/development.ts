import type {
  FaroMcpBackend,
  GovernedCampaignContext,
  GovernedContactContext,
  GovernedInteractionContext,
  GovernedOrganizationContext,
  McpAuditEvent,
  McpAuditSink,
} from './contracts.js';

/** Empty, accurately labeled development backend. It does not claim database persistence. */
export class EmptyDevelopmentFaroMcpBackend implements FaroMcpBackend {
  async getDueFollowups(): Promise<unknown[]> {
    return [];
  }

  async getGenerationRequest(): Promise<null> {
    return null;
  }

  async claimGenerationRequest(): Promise<never> {
    throw new Error('No persisted generation requests are configured in development-empty mode');
  }

  async getContactContext(): Promise<GovernedContactContext | null> {
    return null;
  }

  async getOrganizationContext(): Promise<GovernedOrganizationContext | null> {
    return null;
  }

  async getCampaignContext(): Promise<GovernedCampaignContext | null> {
    return null;
  }

  async getInteractionHistory(): Promise<GovernedInteractionContext[]> {
    return [];
  }

  async saveBobDraft(): Promise<never> {
    throw new Error('Database-backed IBM Bob writes are not configured in development-empty mode');
  }

  async saveResponseAnalysis(): Promise<never> {
    throw new Error('Database-backed IBM Bob writes are not configured in development-empty mode');
  }

  async markGenerationFailed(): Promise<never> {
    throw new Error('Database-backed IBM Bob writes are not configured in development-empty mode');
  }
}

/** Stderr is protocol-safe for stdio MCP; event metadata intentionally excludes content. */
export class StderrMcpAuditSink implements McpAuditSink {
  async record(event: McpAuditEvent): Promise<void> {
    console.error(JSON.stringify({ component: 'faro-mcp-audit', ...event }));
  }
}

export class InMemoryMcpAuditSink implements McpAuditSink {
  readonly events: McpAuditEvent[] = [];

  async record(event: McpAuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}
