import {
  InMemoryNotificationAuditSink,
  InMemoryNotificationDeduplicator,
  NotificationDispatcher,
  PreviewNotificationAdapter,
} from '@faro/notifications';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { InMemoryWorkerJobRepository } from './in-memory-repository.js';
import { FaroWorker } from './worker.js';

const rootEnvironmentPath = resolve(process.cwd(), '../..', '.env');
if (existsSync(rootEnvironmentPath)) process.loadEnvFile(rootEnvironmentPath);

function startSheetPolling(): void {
  const webUrl = process.env.FARO_WEB_URL?.trim();
  const secret = process.env.FARO_SYNC_CRON_SECRET?.trim();
  if (!webUrl || !secret) return;
  const requestedInterval = Number(process.env.FARO_SHEET_POLL_INTERVAL_MS ?? 30_000);
  const intervalMs = Math.min(Math.max(requestedInterval, 15_000), 900_000);
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const response = await fetch(new URL('/api/cron/google-sheets', webUrl), {
        headers: { authorization: `Bearer ${secret}` },
        method: 'POST',
      });
      console.info(
        JSON.stringify({
          component: 'faro-worker',
          operation: 'google-sheets-poll',
          status: response.ok ? 'SUCCEEDED' : `HTTP_${response.status}`,
        }),
      );
    } catch {
      console.error(
        JSON.stringify({
          component: 'faro-worker',
          operation: 'google-sheets-poll',
          status: 'REQUEST_FAILED',
        }),
      );
    } finally {
      running = false;
    }
  };
  void poll();
  setInterval(() => void poll(), intervalMs);
}

async function main(): Promise<void> {
  const mode = process.env.FARO_WORKER_MODE ?? 'preview';
  if (mode !== 'preview') {
    throw new Error(
      'A database notification-job store must be injected for non-preview worker mode; no delivery was attempted.',
    );
  }

  const worker = new FaroWorker(
    new InMemoryWorkerJobRepository(),
    new NotificationDispatcher(
      new PreviewNotificationAdapter(),
      new InMemoryNotificationDeduplicator(),
      new InMemoryNotificationAuditSink(),
    ),
    { workerId: `preview-worker-${process.pid}` },
  );
  const summary = await worker.runOnce();
  console.info(
    JSON.stringify({
      component: 'faro-worker',
      mode: 'DEVELOPMENT_PREVIEW',
      detail: 'No external notification providers are configured.',
      ...summary,
    }),
  );
  startSheetPolling();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Faro worker failed');
  process.exitCode = 1;
});
