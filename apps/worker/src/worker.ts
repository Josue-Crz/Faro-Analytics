import {
  nextAllowedNotificationAt,
  notificationRetryAt,
  notificationScheduledAtOrAfter,
  type NotificationDispatcher,
} from '@faro/notifications';

import type { WorkerJob, WorkerJobRepository } from './contracts.js';

export interface WorkerRunSummary {
  claimed: number;
  completed: number;
  deferred: number;
  retried: number;
  failed: number;
}

export interface WorkerOptions {
  workerId: string;
  batchSize?: number;
  leaseMs?: number;
  now?: () => Date;
}

export class FaroWorker {
  private readonly now: () => Date;
  private readonly batchSize: number;
  private readonly leaseMs: number;

  constructor(
    private readonly repository: WorkerJobRepository,
    private readonly notifications: NotificationDispatcher,
    private readonly options: WorkerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.batchSize = options.batchSize ?? 25;
    this.leaseMs = options.leaseMs ?? 60_000;
  }

  async runOnce(): Promise<WorkerRunSummary> {
    const jobs = await this.repository.claimDue({
      workerId: this.options.workerId,
      now: this.now().toISOString(),
      limit: this.batchSize,
      leaseMs: this.leaseMs,
    });
    const summary: WorkerRunSummary = {
      claimed: jobs.length,
      completed: 0,
      deferred: 0,
      retried: 0,
      failed: 0,
    };

    for (const job of jobs) {
      const now = this.now();
      const scheduledFor = new Date(job.payload.scheduledFor);
      const desiredAt = notificationScheduledAtOrAfter(scheduledFor, now);
      const eligibleAt = job.quietHours
        ? nextAllowedNotificationAt(desiredAt, job.quietHours)
        : desiredAt;
      if (eligibleAt.getTime() > now.getTime()) {
        await this.repository.defer(
          job.id,
          job.workspaceId,
          this.options.workerId,
          eligibleAt.toISOString(),
        );
        summary.deferred += 1;
        continue;
      }
      try {
        await this.handleJob(job);
        await this.repository.complete(job.id, job.workspaceId, this.options.workerId);
        summary.completed += 1;
      } catch (error) {
        const errorCode =
          error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'WORKER_JOB_FAILED';
        if (job.attempts < job.maxAttempts) {
          await this.repository.retry({
            jobId: job.id,
            workspaceId: job.workspaceId,
            workerId: this.options.workerId,
            runAt: notificationRetryAt(this.now(), job.attempts).toISOString(),
            errorCode,
          });
          summary.retried += 1;
        } else {
          await this.repository.fail(job.id, job.workspaceId, this.options.workerId, errorCode);
          summary.failed += 1;
        }
      }
    }
    return summary;
  }

  private async handleJob(job: WorkerJob): Promise<void> {
    switch (job.type) {
      case 'DELIVER_INTERNAL_NOTIFICATION': {
        const result = await this.notifications.dispatch(job.payload);
        if (result.status === 'FAILED') {
          throw Object.assign(new Error(result.detail), {
            code: result.errorCode ?? 'NOTIFICATION_DELIVERY_FAILED',
          });
        }
        return;
      }
    }
  }
}
