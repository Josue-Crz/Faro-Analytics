import {
  internalNotificationSchema,
  quietHoursSchema,
  type InternalNotification,
} from '@faro/notifications';
import { z } from 'zod';

export const workerJobSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    workspaceId: z.string().trim().min(1).max(200),
    type: z.literal('DELIVER_INTERNAL_NOTIFICATION'),
    payload: internalNotificationSchema,
    quietHours: quietHoursSchema.nullable(),
    runAt: z.string().datetime({ offset: true }),
    status: z.enum(['PENDING', 'LEASED', 'COMPLETED', 'FAILED']),
    attempts: z.number().int().min(0),
    maxAttempts: z.number().int().min(1).max(20),
    leaseOwner: z.string().nullable(),
    leaseExpiresAt: z.string().datetime({ offset: true }).nullable(),
    lastErrorCode: z.string().nullable(),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.payload.workspaceId !== job.workspaceId) {
      context.addIssue({
        code: 'custom',
        message: 'Job and notification payload must belong to the same workspace',
        path: ['payload', 'workspaceId'],
      });
    }
    if (job.attempts > job.maxAttempts) {
      context.addIssue({
        code: 'custom',
        message: 'Job attempts cannot exceed maxAttempts',
        path: ['attempts'],
      });
    }
    if (new Date(job.runAt).getTime() < new Date(job.payload.scheduledFor).getTime()) {
      context.addIssue({
        code: 'custom',
        message: 'Job runAt cannot precede the notification scheduledFor instant',
        path: ['runAt'],
      });
    }
  });

export interface WorkerJob extends Omit<z.infer<typeof workerJobSchema>, 'payload'> {
  payload: InternalNotification;
}

export interface ClaimJobsInput {
  workerId: string;
  now: string;
  limit: number;
  leaseMs: number;
}

export interface RetryJobInput {
  jobId: string;
  workspaceId: string;
  workerId: string;
  runAt: string;
  errorCode: string;
}

export interface WorkerJobRepository {
  claimDue(input: ClaimJobsInput): Promise<WorkerJob[]>;
  complete(jobId: string, workspaceId: string, workerId: string): Promise<void>;
  defer(jobId: string, workspaceId: string, workerId: string, runAt: string): Promise<void>;
  retry(input: RetryJobInput): Promise<void>;
  fail(jobId: string, workspaceId: string, workerId: string, errorCode: string): Promise<void>;
}

/**
 * Persistence port for a database implementation. A production adapter should claim rows in one
 * transaction using a lease/compare-and-set and keep workspaceId in every predicate.
 */
export type DatabaseNotificationJobStore = WorkerJobRepository;

export class DatabaseJobRepository implements WorkerJobRepository {
  constructor(private readonly store: DatabaseNotificationJobStore) {}

  claimDue(input: ClaimJobsInput): Promise<WorkerJob[]> {
    return this.store.claimDue(input);
  }

  complete(jobId: string, workspaceId: string, workerId: string): Promise<void> {
    return this.store.complete(jobId, workspaceId, workerId);
  }

  defer(jobId: string, workspaceId: string, workerId: string, runAt: string): Promise<void> {
    return this.store.defer(jobId, workspaceId, workerId, runAt);
  }

  retry(input: RetryJobInput): Promise<void> {
    return this.store.retry(input);
  }

  fail(jobId: string, workspaceId: string, workerId: string, errorCode: string): Promise<void> {
    return this.store.fail(jobId, workspaceId, workerId, errorCode);
  }
}
