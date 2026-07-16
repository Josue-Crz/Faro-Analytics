import type { AuthorizedSheetsActor, SheetsWorkspaceAuthorizer } from './contracts.js';

export class SheetsMcpAuthorizationError extends Error {
  readonly code = 'SHEETS_MCP_WORKSPACE_ACCESS_DENIED';

  constructor() {
    super('The scoped Sheets MCP principal cannot access this workspace or operation');
    this.name = 'SheetsMcpAuthorizationError';
  }
}

export class ScopedSheetsEnvironmentAuthorizer implements SheetsWorkspaceAuthorizer {
  private readonly actor: AuthorizedSheetsActor;

  constructor(input: {
    workspaceId: string;
    actorId: string;
    tokenConfigured: boolean;
    capabilities?: AuthorizedSheetsActor['capabilities'];
  }) {
    if (!input.workspaceId.trim() || !input.actorId.trim() || !input.tokenConfigured) {
      throw new Error('A workspace, actor, and configured scoped MCP token are required');
    }
    this.actor = {
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      capabilities: input.capabilities ?? new Set(['READ_SHEETS' as const, 'SYNC_SHEETS' as const]),
    };
  }

  async authorize(
    workspaceId: string,
    capability: 'READ_SHEETS' | 'SYNC_SHEETS',
  ): Promise<AuthorizedSheetsActor> {
    if (workspaceId !== this.actor.workspaceId || !this.actor.capabilities.has(capability)) {
      throw new SheetsMcpAuthorizationError();
    }
    return this.actor;
  }
}
