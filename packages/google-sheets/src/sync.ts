import { createHash } from 'node:crypto';

import type { SheetCursor, SheetScope } from './contracts';

export function buildSheetSyncIdempotencyKey(
  scope: SheetScope,
  cursor: SheetCursor | null,
  mappingVersion: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        spreadsheetId: scope.spreadsheetId,
        worksheetId: scope.worksheetId,
        cursor,
        mappingVersion,
      }),
    )
    .digest('hex');
}

export interface RetryOptions {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  sleep?: (milliseconds: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
}

export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  const attempts = Math.max(1, options.attempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || (options.shouldRetry && !options.shouldRetry(error))) throw error;
      const delay = Math.min(options.maxDelayMs, options.initialDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw lastError;
}
