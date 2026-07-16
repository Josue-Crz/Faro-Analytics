#!/usr/bin/env node
import { DevelopmentSheetsMcpBackend, StderrSheetsMcpAuditSink } from './development.js';
import { ScopedSheetsEnvironmentAuthorizer } from './security.js';
import { startGoogleSheetsMcpServer } from './server.js';

async function main(): Promise<void> {
  const workspaceId = process.env.FARO_WORKSPACE_ID?.trim();
  const token = process.env.FARO_MCP_TOKEN?.trim();
  if (!workspaceId || !token || token.startsWith('replace-with-') || token.length < 24) {
    throw new Error(
      'FARO_WORKSPACE_ID and a non-placeholder FARO_MCP_TOKEN of at least 24 characters are required',
    );
  }
  console.error(
    JSON.stringify({
      component: 'faro-google-sheets-mcp',
      mode: 'DEVELOPMENT_EMPTY',
      detail: 'No Google OAuth connection or persisted sync adapter is configured.',
    }),
  );
  await startGoogleSheetsMcpServer({
    authorizer: new ScopedSheetsEnvironmentAuthorizer({
      workspaceId,
      actorId: 'ibm-bob-sheets-stdio',
      tokenConfigured: true,
    }),
    audit: new StderrSheetsMcpAuditSink(),
    backend: new DevelopmentSheetsMcpBackend(),
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Google Sheets MCP failed to start');
  process.exitCode = 1;
});
