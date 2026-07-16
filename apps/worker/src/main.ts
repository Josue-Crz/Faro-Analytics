import {
  InMemoryNotificationAuditSink,
  InMemoryNotificationDeduplicator,
  NotificationDispatcher,
  PreviewNotificationAdapter,
} from '@faro/notifications';

import { InMemoryWorkerJobRepository } from './in-memory-repository.js';
import { FaroWorker } from './worker.js';

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
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Faro worker failed');
  process.exitCode = 1;
});
