import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';

import { SheetsMcpAuthorizationError } from './security.js';
import {
  executeSheetsTool,
  SHEETS_TOOL_DEFINITIONS,
  SheetsMcpToolError,
  type SheetsToolDependencies,
} from './tools.js';

export function createGoogleSheetsMcpServer(dependencies: SheetsToolDependencies): Server {
  const server = new Server(
    { name: 'faro-google-sheets-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...SHEETS_TOOL_DEFINITIONS],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeSheetsTool(
        request.params.name,
        request.params.arguments ?? {},
        dependencies,
      );
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, result }) }] };
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'SHEETS_TOOL_EXECUTION_FAILED';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code,
                message: publicErrorMessage(error),
              },
            }),
          },
        ],
      };
    }
  });
  return server;
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof SheetsMcpAuthorizationError || error instanceof SheetsMcpToolError) {
    return error.message;
  }
  if (error instanceof ZodError) return 'Sheets tool input failed validation';
  return 'Sheets MCP tool failed; review the server audit log';
}

export async function startGoogleSheetsMcpServer(
  dependencies: SheetsToolDependencies,
): Promise<void> {
  await createGoogleSheetsMcpServer(dependencies).connect(new StdioServerTransport());
}
