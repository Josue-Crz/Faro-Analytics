import {
  conflictBehaviorSchema,
  previewContactImport,
  sheetFieldMappingSchema,
  sheetRowSchema,
} from '@faro/google-sheets';
import { z } from 'zod';

import type {
  SheetMcpConnection,
  SheetsMcpAuditSink,
  SheetsMcpBackend,
  SheetsToolName,
  SheetsWorkspaceAuthorizer,
} from './contracts.js';

const id = z.string().trim().min(1).max(300);
const base = { workspaceId: id };
const connectionInput = z.object({ ...base, connectionId: id }).strict();
const mappingInputFields = {
  ...base,
  connectionId: id,
  mappings: z.array(sheetFieldMappingSchema).min(1).max(100),
  conflictBehavior: conflictBehaviorSchema.default('SKIP'),
  limit: z.number().int().min(1).max(100).default(50),
};
const previewInput = z.object(mappingInputFields).strict();
const syncInput = z.object({ ...mappingInputFields, dryRun: z.literal(true) }).strict();
const validateRowsInput = z
  .object({
    ...base,
    headers: z.array(z.string().trim().min(1).max(300)).min(1).max(300),
    rows: z.array(sheetRowSchema).max(100),
    mappings: z.array(sheetFieldMappingSchema).min(1).max(100),
  })
  .strict();

function connectionJsonSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['workspaceId', 'connectionId'],
    properties: {
      workspaceId: { type: 'string' as const },
      connectionId: { type: 'string' as const },
    },
  };
}

const fieldMappingJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['sourceColumn', 'targetField'],
  properties: {
    sourceColumn: { type: 'string' as const, minLength: 1, maxLength: 300 },
    targetField: { type: 'string' as const, minLength: 1, maxLength: 100 },
    required: { type: 'boolean' as const, default: false },
    transformation: {
      type: 'string' as const,
      enum: ['NONE', 'TRIM', 'LOWERCASE', 'UPPERCASE', 'SPLIT_COMMA'],
      default: 'TRIM',
    },
  },
};

export const SHEETS_TOOL_DEFINITIONS = [
  {
    name: 'sheets_list_connections',
    description:
      'List sheet connections in the authorized workspace without exposing OAuth tokens.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId'],
      properties: { workspaceId: { type: 'string' } },
    },
  },
  {
    name: 'sheets_get_schema',
    description: 'Read worksheet headers and read-only/source metadata for one connection.',
    inputSchema: connectionJsonSchema(),
  },
  {
    name: 'sheets_preview_mapping',
    description: 'Dry-run a bounded contact mapping against current sheet rows.',
    inputSchema: mappingJsonSchema(false),
  },
  {
    name: 'sheets_validate_rows',
    description: 'Validate supplied rows and mappings without reading or writing Google Sheets.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'headers', 'rows', 'mappings'],
      properties: {
        workspaceId: { type: 'string' },
        headers: { type: 'array', maxItems: 300, items: { type: 'string' } },
        rows: { type: 'array', maxItems: 100, items: { type: 'object' } },
        mappings: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: fieldMappingJsonSchema,
        },
      },
    },
  },
  {
    name: 'sheets_sync_contacts',
    description:
      'Run a contact sync preview. This slice requires dryRun=true and performs no writes.',
    inputSchema: mappingJsonSchema(true),
  },
  {
    name: 'sheets_get_sync_status',
    description: 'Read the last persisted sync status and cursor for one connection.',
    inputSchema: connectionJsonSchema(),
  },
] as const;

function mappingJsonSchema(includeDryRun: boolean) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['workspaceId', 'connectionId', 'mappings', ...(includeDryRun ? ['dryRun'] : [])],
    properties: {
      workspaceId: { type: 'string' as const },
      connectionId: { type: 'string' as const },
      mappings: {
        type: 'array' as const,
        minItems: 1,
        maxItems: 100,
        items: fieldMappingJsonSchema,
      },
      conflictBehavior: { type: 'string' as const, enum: ['SKIP', 'UPDATE', 'ERROR'] },
      limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 50 },
      ...(includeDryRun ? { dryRun: { type: 'boolean' as const, const: true } } : {}),
    },
  };
}

export interface SheetsToolDependencies {
  authorizer: SheetsWorkspaceAuthorizer;
  audit: SheetsMcpAuditSink;
  backend: SheetsMcpBackend;
  now?: () => Date;
}

export class SheetsMcpToolError extends Error {
  constructor(
    readonly code: 'UNKNOWN_TOOL' | 'CONNECTION_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'SheetsMcpToolError';
  }
}

function rawWorkspaceId(input: unknown): string {
  if (!input || typeof input !== 'object' || !('workspaceId' in input)) return 'unknown';
  const value = (input as { workspaceId?: unknown }).workspaceId;
  return typeof value === 'string' ? value : 'unknown';
}

function rawConnectionId(input: unknown): string | null {
  if (!input || typeof input !== 'object' || !('connectionId' in input)) return null;
  const value = (input as { connectionId?: unknown }).connectionId;
  return typeof value === 'string' ? value : null;
}

export async function executeSheetsTool(
  toolName: string,
  rawInput: unknown,
  dependencies: SheetsToolDependencies,
): Promise<unknown> {
  const workspaceId = rawWorkspaceId(rawInput);
  const connectionId = rawConnectionId(rawInput);
  const capability = toolName === 'sheets_sync_contacts' ? 'SYNC_SHEETS' : 'READ_SHEETS';
  let actorId = 'unauthorized';
  const now = dependencies.now ?? (() => new Date());

  try {
    const actor = await dependencies.authorizer.authorize(workspaceId, capability);
    actorId = actor.actorId;
    let result: unknown;
    switch (toolName as SheetsToolName) {
      case 'sheets_list_connections': {
        z.object(base).strict().parse(rawInput);
        const connections = await dependencies.backend.listConnections(workspaceId);
        connections.forEach((connection) =>
          assertConnectionScope(connection, workspaceId, connection.id),
        );
        result = connections.map((connection) => ({
          id: connection.id,
          displayName: connection.displayName,
          spreadsheetId: connection.scope.spreadsheetId,
          worksheetId: connection.scope.worksheetId,
          mode: connection.mode,
          status: connection.status,
        }));
        break;
      }
      case 'sheets_get_schema': {
        const input = connectionInput.parse(rawInput);
        const connection = await requireConnection(
          dependencies.backend,
          input.workspaceId,
          input.connectionId,
        );
        const metadata = await connection.client.getWorksheetMetadata(connection.scope);
        result = {
          spreadsheetId: metadata.spreadsheetId,
          worksheetId: metadata.worksheetId,
          title: metadata.title,
          headers: metadata.headers,
          readOnly: metadata.readOnly,
          source: metadata.source,
        };
        break;
      }
      case 'sheets_preview_mapping': {
        const input = previewInput.parse(rawInput);
        result = await previewConnection(dependencies.backend, input);
        break;
      }
      case 'sheets_validate_rows': {
        const input = validateRowsInput.parse(rawInput);
        result = previewContactImport({
          headers: input.headers,
          rows: input.rows,
          mappings: input.mappings,
          conflictBehavior: 'ERROR',
        });
        break;
      }
      case 'sheets_sync_contacts': {
        const input = syncInput.parse(rawInput);
        const preview = await previewConnection(dependencies.backend, input);
        result = { ...preview, writePerformed: false, reason: 'DRY_RUN_REQUIRED' };
        break;
      }
      case 'sheets_get_sync_status': {
        const input = connectionInput.parse(rawInput);
        const status = await dependencies.backend.getSyncStatus(
          input.workspaceId,
          input.connectionId,
        );
        result = {
          connectionId: status.connectionId,
          status: status.status,
          lastSyncedAt: status.lastSyncedAt,
          cursor: status.cursor,
          errorCode: status.errorCode,
        };
        break;
      }
      default:
        throw new SheetsMcpToolError('UNKNOWN_TOOL', `Unknown Sheets MCP tool: ${toolName}`);
    }
    await dependencies.audit.record({
      workspaceId,
      actorId,
      toolName: toolName as SheetsToolName,
      connectionId,
      outcome: 'SUCCEEDED',
      occurredAt: now().toISOString(),
    });
    return result;
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'SHEETS_TOOL_EXECUTION_FAILED';
    await dependencies.audit.record({
      workspaceId,
      actorId,
      toolName: toolName as SheetsToolName,
      connectionId,
      outcome: actorId === 'unauthorized' ? 'DENIED' : 'FAILED',
      errorCode,
      occurredAt: now().toISOString(),
    });
    throw error;
  }
}

async function requireConnection(
  backend: SheetsMcpBackend,
  workspaceId: string,
  connectionId: string,
) {
  const connection = await backend.getConnection(workspaceId, connectionId);
  if (!connection)
    throw new SheetsMcpToolError('CONNECTION_NOT_FOUND', 'Sheet connection not found');
  assertConnectionScope(connection, workspaceId, connectionId);
  return connection;
}

function assertConnectionScope(
  connection: SheetMcpConnection,
  workspaceId: string,
  connectionId: string,
): void {
  if (
    connection.workspaceId !== workspaceId ||
    connection.id !== connectionId ||
    connection.scope.workspaceId !== workspaceId ||
    connection.scope.connectionId !== connectionId
  ) {
    throw new SheetsMcpToolError(
      'CONNECTION_NOT_FOUND',
      'Sheet connection not found in the authorized workspace',
    );
  }
}

async function previewConnection(backend: SheetsMcpBackend, input: z.infer<typeof previewInput>) {
  const connection = await requireConnection(backend, input.workspaceId, input.connectionId);
  const metadata = await connection.client.getWorksheetMetadata(connection.scope);
  const page = await connection.client.readRows({ scope: connection.scope, limit: input.limit });
  const preview = previewContactImport({
    headers: metadata.headers,
    rows: page.rows,
    mappings: input.mappings,
    existingContacts: connection.existingContacts,
    conflictBehavior: input.conflictBehavior,
  });
  return {
    ...preview,
    page: { nextCursor: page.nextCursor, revision: page.revision ?? null },
    partial: page.nextCursor !== null,
  };
}
