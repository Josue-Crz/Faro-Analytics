import { IbmBobMcpAdapter, type BobGenerationRequestStore } from '@faro/ibm-bob';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_OUTPUT_BYTES = 80_000;
const TIMEOUT_MS = 120_000;
const KNOWN_FAILURE_CODES = new Set([
  'BOB_SHELL_AUTH_FAILED',
  'BOB_SHELL_FAILED',
  'BOB_SHELL_INVALID_RESULT',
  'BOB_SHELL_KEY_MISSING',
  'BOB_SHELL_NOT_INSTALLED',
  'BOB_SHELL_TIMEOUT',
]);

function failureCode(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return KNOWN_FAILURE_CODES.has(code) ? code : 'BOB_SHELL_INVALID_RESULT';
}

function parseJsonObject(output: string): unknown {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Bob may still surround an otherwise valid object with a Markdown fence. Accept only the
    // object inside that fence; never attempt to repair or invent a draft.
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced) as unknown;
      } catch {
        // Fall through to the safe, generic error below.
      }
    }
    throw new Error('BOB_SHELL_INVALID_RESULT');
  }
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('BOB_SHELL_TIMEOUT'));
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_BYTES) output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorOutput.length < 1_000) errorOutput += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('BOB_SHELL_NOT_INSTALLED'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else
        reject(
          new Error(
            errorOutput.includes('authentication') ? 'BOB_SHELL_AUTH_FAILED' : 'BOB_SHELL_FAILED',
          ),
        );
    });
  });
}

/** Runs a real IBM Bob Shell request locally; it never sends external outreach. */
export async function completeWithLocalBobShell(
  store: BobGenerationRequestStore,
  workspaceId: string,
  requestId: string,
) {
  const apiKey = process.env.BOBSHELL_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith('replace-with-')) throw new Error('BOB_SHELL_KEY_MISSING');

  const adapter = new IbmBobMcpAdapter(store);
  const request = await adapter.claimRequest(workspaceId, requestId);
  const requiredSourceRecordIds = JSON.stringify(request.approvedSourceRecordIds);
  try {
    const output = await run(
      'bob',
      [
        '--auth-method',
        'api-key',
        '--chat-mode',
        'ask',
        '--hide-intermediary-output',
        '--max-coins',
        '2',
        `${request.promptText}

Return one JSON object only. Include every required field in FARO_OUTPUT_SCHEMA. Use null (not a
string) for suggestedFollowUpAt when no specific follow-up time is justified. Use a number between
0 and 1 for confidence. Use an array for riskFlags. For sourceRecordIds, use exactly this approved
array and no other IDs: ${requiredSourceRecordIds}. Do not include Markdown, commentary, or extra
keys. Do not call tools, send email, or access any additional data.`,
      ],
      { ...process.env, BOBSHELL_API_KEY: apiKey },
    );
    const result = parseJsonObject(output);
    return await adapter.saveOutreachDraft(workspaceId, requestId, result, {
      completedBy: 'bob-shell-local',
      providerOperationId: `bob-shell:${createHash('sha256').update(`${requestId}:${Date.now()}`).digest('hex').slice(0, 24)}`,
      resultProvenance: 'IBM_BOB',
    });
  } catch (error) {
    const code = failureCode(error);
    await adapter.markFailed(workspaceId, requestId, code);
    throw new Error(code);
  }
}
