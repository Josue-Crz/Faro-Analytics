import type { ClaimJobsInput, RetryJobInput, WorkerJob, WorkerJobRepository } from './contracts.js';
import { workerJobSchema } from './contracts.js';

export class InMemoryWorkerJobRepository implements WorkerJobRepository {
  private readonly jobs = new Map<string, WorkerJob>();

  constructor(jobs: WorkerJob[] = []) {
    for (const job of jobs) this.jobs.set(job.id, structuredClone(workerJobSchema.parse(job)));
  }

  async claimDue(input: ClaimJobsInput): Promise<WorkerJob[]> {
    const now = new Date(input.now);
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs).toISOString();
    for (const job of this.jobs.values()) {
      const leaseExpired =
        job.leaseExpiresAt !== null && new Date(job.leaseExpiresAt).getTime() <= now.getTime();
      if (
        job.attempts >= job.maxAttempts &&
        (job.status === 'PENDING' || (job.status === 'LEASED' && leaseExpired))
      ) {
        job.status = 'FAILED';
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        job.lastErrorCode = 'WORKER_ATTEMPTS_EXHAUSTED';
      }
    }
    const due = [...this.jobs.values()]
      .filter((job) => {
        const leaseExpired =
          job.leaseExpiresAt !== null && new Date(job.leaseExpiresAt).getTime() <= now.getTime();
        return (
          new Date(job.runAt).getTime() <= now.getTime() &&
          (job.status === 'PENDING' || (job.status === 'LEASED' && leaseExpired))
        );
      })
      .sort((left, right) => left.runAt.localeCompare(right.runAt))
      .slice(0, Math.max(0, input.limit));
    for (const job of due) {
      job.status = 'LEASED';
      job.leaseOwner = input.workerId;
      job.leaseExpiresAt = leaseExpiresAt;
      job.attempts += 1;
    }
    return structuredClone(due);
  }

  async complete(jobId: string, workspaceId: string, workerId: string): Promise<void> {
    const job = this.requireLease(jobId, workspaceId, workerId);
    job.status = 'COMPLETED';
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
  }

  async defer(jobId: string, workspaceId: string, workerId: string, runAt: string): Promise<void> {
    const job = this.requireLease(jobId, workspaceId, workerId);
    job.status = 'PENDING';
    job.runAt = runAt;
    job.attempts = Math.max(0, job.attempts - 1);
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
  }

  async retry(input: RetryJobInput): Promise<void> {
    const job = this.requireLease(input.jobId, input.workspaceId, input.workerId);
    job.status = 'PENDING';
    job.runAt = input.runAt;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.lastErrorCode = input.errorCode;
  }

  async fail(
    jobId: string,
    workspaceId: string,
    workerId: string,
    errorCode: string,
  ): Promise<void> {
    const job = this.requireLease(jobId, workspaceId, workerId);
    job.status = 'FAILED';
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.lastErrorCode = errorCode;
  }

  list(): WorkerJob[] {
    return structuredClone([...this.jobs.values()]);
  }

  private requireLease(jobId: string, workspaceId: string, workerId: string): WorkerJob {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      job.workspaceId !== workspaceId ||
      job.status !== 'LEASED' ||
      job.leaseOwner !== workerId
    ) {
      throw new Error('Worker job lease not found');
    }
    return job;
  }
}
