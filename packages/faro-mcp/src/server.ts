import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';

import { McpAuthorizationError } from './security.js';
import {
  executeFaroTool,
  FARO_TOOL_DEFINITIONS,
  FaroMcpToolError,
  type FaroToolDependencies,
} from './tools.js';

export function createFaroMcpServer(dependencies: FaroToolDependencies): Server {
  const server = new Server(
    { name: 'faro-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: FARO_TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeFaroTool(
        request.params.name,
        request.params.arguments ?? {},
        dependencies,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, result }) }],
      };
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'TOOL_EXECUTION_FAILED';
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
  if (error instanceof McpAuthorizationError || error instanceof FaroMcpToolError) {
    return error.message;
  }
  if (error instanceof ZodError) return 'Tool input or IBM Bob output failed validation';
  return 'Faro MCP tool failed; review the server audit log';
}

export async function startFaroMcpServer(dependencies: FaroToolDependencies): Promise<void> {
  const server = createFaroMcpServer(dependencies);
  await server.connect(new StdioServerTransport());
}
