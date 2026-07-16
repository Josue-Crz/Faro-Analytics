import {
  FixtureGoogleSheetsClient,
  type SheetFieldMapping,
  type SheetScope,
} from '@faro/google-sheets';
import { describe, expect, it } from 'vitest';

import { DevelopmentSheetsMcpBackend, InMemorySheetsMcpAuditSink } from './development.js';
import { ScopedSheetsEnvironmentAuthorizer } from './security.js';
import { executeSheetsTool } from './tools.js';

const scope: SheetScope = {
  workspaceId: 'ws-one',
  connectionId: 'connection-one',
  spreadsheetId: 'sheet-one',
  worksheetId: 'contacts',
};
const client = new FixtureGoogleSheetsClient([
  {
    scope,
    title: 'Fictional sponsors',
    headers: ['Email', 'First name', 'Last name', 'Type', 'Timezone', 'Preferred channel'],
    rows: [
      {
        Email: 'avery@example.test',
        'First name': 'Avery',
        'Last name': 'Jordan',
        Type: 'SPONSOR',
        Timezone: 'UTC',
        'Preferred channel': 'EMAIL',
      },
      {
        Email: 'morgan@example.test',
        'First name': 'Morgan',
        'Last name': 'Lee',
        Type: 'PARTNER',
        Timezone: 'UTC',
        'Preferred channel': 'EMAIL',
      },
    ],
  },
]);
const backend = new DevelopmentSheetsMcpBackend([
  {
    id: 'connection-one',
    workspaceId: 'ws-one',
    displayName: 'Fictional sponsors fixture',
    scope,
    client,
    existingContacts: [],
    mode: 'DEVELOPMENT_FIXTURE',
    status: 'CONNECTED',
  },
]);
const mappings: SheetFieldMapping[] = [
  {
    sourceColumn: 'Email',
    targetField: 'email',
    required: true,
    transformation: 'LOWERCASE',
  },
  {
    sourceColumn: 'First name',
    targetField: 'firstName',
    required: true,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'Last name',
    targetField: 'lastName',
    required: true,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'Type',
    targetField: 'type',
    required: true,
    transformation: 'UPPERCASE',
  },
  {
    sourceColumn: 'Timezone',
    targetField: 'timezone',
    required: true,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'Preferred channel',
    targetField: 'preferredChannel',
    required: true,
    transformation: 'UPPERCASE',
  },
];

const authorizer = () =>
  new ScopedSheetsEnvironmentAuthorizer({
    workspaceId: 'ws-one',
    actorId: 'sheets-test',
    tokenConfigured: true,
  });

describe('Google Sheets MCP boundary', () => {
  it('previews a mapping without writing and audits the operation', async () => {
    const audit = new InMemorySheetsMcpAuditSink();
    const result = await executeSheetsTool(
      'sheets_sync_contacts',
      {
        workspaceId: 'ws-one',
        connectionId: 'connection-one',
        mappings,
        conflictBehavior: 'SKIP',
        limit: 1,
        dryRun: true,
      },
      { authorizer: authorizer(), audit, backend },
    );

    expect(result).toMatchObject({
      mode: 'DRY_RUN',
      writePerformed: false,
      partial: true,
      summary: { rowsCreate: 1 },
    });
    expect(audit.events[0]).toMatchObject({
      toolName: 'sheets_sync_contacts',
      outcome: 'SUCCEEDED',
    });
  });

  it('denies a cross-workspace schema read and audits denial', async () => {
    const audit = new InMemorySheetsMcpAuditSink();
    await expect(
      executeSheetsTool(
        'sheets_get_schema',
        { workspaceId: 'ws-two', connectionId: 'connection-one' },
        { authorizer: authorizer(), audit, backend },
      ),
    ).rejects.toMatchObject({ code: 'SHEETS_MCP_WORKSPACE_ACCESS_DENIED' });
    expect(audit.events[0]).toMatchObject({ workspaceId: 'ws-two', outcome: 'DENIED' });
  });

  it('rejects a connection whose nested client scope crosses the authorized workspace', async () => {
    const crossScope = { ...scope, workspaceId: 'ws-two' };
    const crossBackend = new DevelopmentSheetsMcpBackend([
      {
        id: 'connection-one',
        workspaceId: 'ws-one',
        displayName: 'Mismatched fixture',
        scope: crossScope,
        client: new FixtureGoogleSheetsClient([
          { scope: crossScope, title: 'Private workspace sheet', headers: ['Email'], rows: [] },
        ]),
        existingContacts: [],
        mode: 'DEVELOPMENT_FIXTURE',
        status: 'CONNECTED',
      },
    ]);
    const audit = new InMemorySheetsMcpAuditSink();

    await expect(
      executeSheetsTool(
        'sheets_get_schema',
        { workspaceId: 'ws-one', connectionId: 'connection-one' },
        { authorizer: authorizer(), audit, backend: crossBackend },
      ),
    ).rejects.toMatchObject({ code: 'CONNECTION_NOT_FOUND' });
  });
});
