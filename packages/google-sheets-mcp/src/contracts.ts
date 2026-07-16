import type { ExistingContactIdentity, GoogleSheetsClient, SheetScope } from '@faro/google-sheets';

export type SheetsToolName =
  | 'sheets_list_connections'
  | 'sheets_get_schema'
  | 'sheets_preview_mapping'
  | 'sheets_validate_rows'
  | 'sheets_sync_contacts'
  | 'sheets_get_sync_status';

export interface AuthorizedSheetsActor {
  actorId: string;
  workspaceId: string;
  capabilities: ReadonlySet<'READ_SHEETS' | 'SYNC_SHEETS'>;
}

export interface SheetsWorkspaceAuthorizer {
  authorize(
    workspaceId: string,
    capability: 'READ_SHEETS' | 'SYNC_SHEETS',
  ): Promise<AuthorizedSheetsActor>;
}

export interface SheetsMcpAuditEvent {
  workspaceId: string;
  actorId: string;
  toolName: SheetsToolName;
  connectionId: string | null;
  outcome: 'SUCCEEDED' | 'DENIED' | 'FAILED';
  errorCode?: string;
  occurredAt: string;
}

export interface SheetsMcpAuditSink {
  record(event: SheetsMcpAuditEvent): Promise<void>;
}

export interface SheetMcpConnection {
  id: string;
  workspaceId: string;
  displayName: string;
  scope: SheetScope;
  client: GoogleSheetsClient;
  existingContacts: ExistingContactIdentity[];
  mode: 'GOOGLE_OAUTH' | 'DEVELOPMENT_FIXTURE';
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
}

export interface SheetSyncStatus {
  connectionId: string;
  status: 'NEVER_SYNCED' | 'SUCCEEDED' | 'FAILED' | 'RUNNING';
  lastSyncedAt: string | null;
  cursor: { offset: number; revision?: string } | null;
  errorCode: string | null;
}

export interface SheetsMcpBackend {
  listConnections(workspaceId: string): Promise<SheetMcpConnection[]>;
  getConnection(workspaceId: string, connectionId: string): Promise<SheetMcpConnection | null>;
  getSyncStatus(workspaceId: string, connectionId: string): Promise<SheetSyncStatus>;
}
