import {
  InMemoryNotificationAuditSink,
  InMemoryNotificationDeduplicator,
  NotificationDispatcher,
  PreviewNotificationAdapter,
} from '@faro/notifications';
import { describe, expect, it } from 'vitest';

import type { WorkerJob } from './contracts.js';
import { InMemoryWorkerJobRepository } from './in-memory-repository.js';
import { FaroWorker } from './worker.js';

const job: WorkerJob = {
  id: 'job-one',
  workspaceId: 'ws-one',
  type: 'DELIVER_INTERNAL_NOTIFICATION',
  payload: {
    id: 'notification-one',
    workspaceId: 'ws-one',
    userId: 'user-one',
    followUpTaskId: 'followup-one',
    purpose: 'INTERNAL_REMINDER',
    kind: 'FOLLOW_UP',
    channel: 'EMAIL',
    title: 'Fictional follow-up due',
    bodyText: 'Review this follow-up in Faro.',
    actionUrl: '/follow-ups/followup-one',
    scheduledFor: '2026-07-10T12:00:00.000Z',
    deduplicationKey: 'followup-one:email',
  },
  quietHours: null,
  runAt: '2026-07-10T12:00:00.000Z',
  status: 'PENDING',
  attempts: 0,
  maxAttempts: 3,
  leaseOwner: null,
  leaseExpiresAt: null,
  lastErrorCode: null,
};

describe('Faro worker', () => {
  it('leases and completes a preview notification job without claiming external delivery', async () => {
    const repository = new InMemoryWorkerJobRepository([job]);
    const provider = new PreviewNotificationAdapter(
      () => new Date('2026-07-10T12:00:00.000Z'),
      () => 'delivery-one',
    );
    const worker = new FaroWorker(
      repository,
      new NotificationDispatcher(
        provider,
        new InMemoryNotificationDeduplicator(),
        new InMemoryNotificationAuditSink(),
        () => new Date('2026-07-10T12:00:00.000Z'),
      ),
      { workerId: 'worker-one', now: () => new Date('2026-07-10T12:00:00.000Z') },
    );

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      deferred: 0,
      retried: 0,
      failed: 0,
    });
    expect(repository.list()[0]).toMatchObject({ status: 'COMPLETED', attempts: 1 });
    expect(provider.list()[0]?.result.status).toBe('PREVIEWED');
  });

  it('keeps workspace in lease completion predicates', async () => {
    const repository = new InMemoryWorkerJobRepository([job]);
    await repository.claimDue({
      workerId: 'worker-one',
      now: '2026-07-10T12:00:00.000Z',
      limit: 1,
      leaseMs: 60_000,
    });
    await expect(repository.complete('job-one', 'ws-two', 'worker-one')).rejects.toThrow(
      'Worker job lease not found',
    );
  });

  it('rejects a cross-workspace notification payload before enqueueing', () => {
    expect(
      () =>
        new InMemoryWorkerJobRepository([
          { ...job, payload: { ...job.payload, workspaceId: 'ws-two' } },
        ]),
    ).toThrow(/same workspace/i);
  });

  it('does not redeliver a final attempt after its worker lease expires', async () => {
    const repository = new InMemoryWorkerJobRepository([
      {
        ...job,
        status: 'LEASED',
        attempts: 3,
        maxAttempts: 3,
        leaseOwner: 'crashed-worker',
        leaseExpiresAt: '2026-07-10T11:59:00.000Z',
      },
    ]);

    await expect(
      repository.claimDue({
        workerId: 'replacement-worker',
        now: '2026-07-10T12:00:00.000Z',
        limit: 1,
        leaseMs: 60_000,
      }),
    ).resolves.toEqual([]);
    expect(repository.list()[0]).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastErrorCode: 'WORKER_ATTEMPTS_EXHAUSTED',
    });
  });

  it('rejects jobs that could deliver before the notification schedule', () => {
    expect(
      () =>
        new InMemoryWorkerJobRepository([
          {
            ...job,
            runAt: '2026-07-10T11:00:00.000Z',
            payload: { ...job.payload, scheduledFor: '2026-07-10T12:00:00.000Z' },
          },
        ]),
    ).toThrow(/cannot precede/i);
  });

  it('defers a due job until user quiet hours end without consuming an attempt', async () => {
    const repository = new InMemoryWorkerJobRepository([
      {
        ...job,
        quietHours: {
          start: '21:00',
          end: '08:00',
          timeZone: 'America/Los_Angeles',
        },
      },
    ]);
    const provider = new PreviewNotificationAdapter();
    const worker = new FaroWorker(
      repository,
      new NotificationDispatcher(
        provider,
        new InMemoryNotificationDeduplicator(),
        new InMemoryNotificationAuditSink(),
      ),
      { workerId: 'worker-one', now: () => new Date('2026-07-10T12:00:00.000Z') },
    );

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      deferred: 1,
      retried: 0,
      failed: 0,
    });
    expect(repository.list()[0]).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      runAt: '2026-07-10T15:00:00.000Z',
    });
    expect(provider.list()).toHaveLength(0);
  });
});
