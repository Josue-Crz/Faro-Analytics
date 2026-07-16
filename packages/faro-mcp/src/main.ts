#!/usr/bin/env node
import { EmptyDevelopmentFaroMcpBackend, StderrMcpAuditSink } from './development.js';
import { createPrismaFaroMcpServices } from './prisma-backend.js';
import { ScopedEnvironmentAuthorizer } from './security.js';
import { startFaroMcpServer } from './server.js';

async function main(): Promise<void> {
  const workspaceId = process.env.FARO_WORKSPACE_ID?.trim();
  const token = process.env.FARO_MCP_TOKEN?.trim();
  if (!workspaceId || !token || token.startsWith('replace-with-') || token.length < 24) {
    throw new Error(
      'FARO_WORKSPACE_ID and a non-placeholder FARO_MCP_TOKEN of at least 24 characters are required',
    );
  }

  const database = process.env.DATABASE_URL?.trim() ? await import('@faro/database') : null;
  const prismaServices = database
    ? createPrismaFaroMcpServices(database.prisma, { auditWorkspaceId: workspaceId })
    : null;
  console.error(
    JSON.stringify(
      prismaServices
        ? {
            component: 'faro-mcp',
            mode: 'DATABASE',
            detail: 'Bob requests, drafts, and MCP audit events use workspace-scoped PostgreSQL.',
          }
        : {
            component: 'faro-mcp',
            mode: 'DEVELOPMENT_EMPTY',
            detail: 'DATABASE_URL is absent; persisted request reads and writes are unavailable.',
          },
    ),
  );

  await startFaroMcpServer({
    authorizer: new ScopedEnvironmentAuthorizer({
      workspaceId,
      actorId: 'ibm-bob-stdio',
      tokenConfigured: true,
    }),
    audit: prismaServices?.audit ?? new StderrMcpAuditSink(),
    backend: prismaServices?.backend ?? new EmptyDevelopmentFaroMcpBackend(),
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Faro MCP failed to start');
  process.exitCode = 1;
});
