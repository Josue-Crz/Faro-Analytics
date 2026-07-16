import type { AuthorizedMcpActor, WorkspaceAuthorizer } from './contracts.js';

export class McpAuthorizationError extends Error {
  readonly code = 'MCP_WORKSPACE_ACCESS_DENIED';

  constructor() {
    super('The scoped MCP principal cannot access this workspace or operation');
    this.name = 'McpAuthorizationError';
  }
}

/** Authorizes one workspace-scoped stdio process configured by its launch environment. */
export class ScopedEnvironmentAuthorizer implements WorkspaceAuthorizer {
  private readonly actor: AuthorizedMcpActor;

  constructor(input: {
    workspaceId: string;
    actorId: string;
    actorType?: AuthorizedMcpActor['actorType'];
    tokenConfigured: boolean;
    capabilities?: AuthorizedMcpActor['capabilities'];
  }) {
    if (!input.workspaceId.trim() || !input.actorId.trim() || !input.tokenConfigured) {
      throw new Error('A workspace, actor, and configured scoped MCP token are required');
    }
    this.actor = {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorType: input.actorType ?? 'IBM_BOB_MCP',
      capabilities:
        input.capabilities ?? new Set(['READ_CONTEXT' as const, 'WRITE_BOB_RESULT' as const]),
    };
  }

  async authorize(
    workspaceId: string,
    capability: 'READ_CONTEXT' | 'WRITE_BOB_RESULT',
  ): Promise<AuthorizedMcpActor> {
    if (workspaceId !== this.actor.workspaceId || !this.actor.capabilities.has(capability)) {
      throw new McpAuthorizationError();
    }
    return this.actor;
  }
}
