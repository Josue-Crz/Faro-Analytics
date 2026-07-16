import type {
  SheetMcpConnection,
  SheetsMcpAuditEvent,
  SheetsMcpAuditSink,
  SheetsMcpBackend,
  SheetSyncStatus,
} from './contracts.js';

export class DevelopmentSheetsMcpBackend implements SheetsMcpBackend {
  constructor(
    private readonly connections: SheetMcpConnection[] = [],
    private readonly statuses: SheetSyncStatus[] = [],
  ) {}

  async listConnections(workspaceId: string): Promise<SheetMcpConnection[]> {
    return this.connections
      .filter((connection) => connection.workspaceId === workspaceId)
      .map((connection) => ({ ...connection, scope: { ...connection.scope } }));
  }

  async getConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<SheetMcpConnection | null> {
    const connection = this.connections.find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.id === connectionId,
    );
    return connection ? { ...connection, scope: { ...connection.scope } } : null;
  }

  async getSyncStatus(workspaceId: string, connectionId: string): Promise<SheetSyncStatus> {
    const connection = await this.getConnection(workspaceId, connectionId);
    if (!connection) throw new Error('Sheet connection not found in this workspace');
    return (
      this.statuses.find((status) => status.connectionId === connectionId) ?? {
        connectionId,
        status: 'NEVER_SYNCED',
        lastSyncedAt: null,
        cursor: null,
        errorCode: null,
      }
    );
  }
}

export class InMemorySheetsMcpAuditSink implements SheetsMcpAuditSink {
  readonly events: SheetsMcpAuditEvent[] = [];

  async record(event: SheetsMcpAuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}

export class StderrSheetsMcpAuditSink implements SheetsMcpAuditSink {
  async record(event: SheetsMcpAuditEvent): Promise<void> {
    console.error(JSON.stringify({ component: 'faro-google-sheets-mcp-audit', ...event }));
  }
}
