import {
  internalNotificationSchema,
  type InternalNotification,
  type InternalNotificationProvider,
  type NotificationDeliveryResult,
} from './contracts.js';
import type { NotificationDeduplicator } from './deduplication.js';

export interface NotificationAuditEvent {
  workspaceId: string;
  notificationId: string;
  action: 'NOTIFICATION_DUPLICATE_SKIPPED' | 'NOTIFICATION_DELIVERY_ATTEMPTED';
  outcome: string;
  occurredAt: string;
}

export interface NotificationAuditSink {
  record(event: NotificationAuditEvent): Promise<void>;
}

export type DispatchResult =
  | NotificationDeliveryResult
  | {
      status: 'DUPLICATE';
      provider: string;
      attemptedAt: string;
      providerMessageId: null;
      errorCode: null;
      detail: string;
    };

export class NotificationDispatcher {
  constructor(
    private readonly provider: InternalNotificationProvider,
    private readonly deduplicator: NotificationDeduplicator,
    private readonly audit: NotificationAuditSink,
    private readonly now: () => Date = () => new Date(),
    private readonly deduplicationTtlMs = 7 * 24 * 60 * 60 * 1_000,
  ) {}

  async dispatch(rawNotification: InternalNotification): Promise<DispatchResult> {
    const notification = internalNotificationSchema.parse(rawNotification);
    const now = this.now();
    if (!this.provider.supportedChannels.has(notification.channel)) {
      const failed: NotificationDeliveryResult = {
        status: 'FAILED',
        provider: this.provider.name,
        attemptedAt: now.toISOString(),
        providerMessageId: null,
        errorCode: 'NOTIFICATION_CHANNEL_UNSUPPORTED',
        detail: `${this.provider.name} does not support ${notification.channel}`,
      };
      await this.record(notification, 'NOTIFICATION_DELIVERY_ATTEMPTED', failed.status, now);
      return failed;
    }

    const claimed = await this.deduplicator.claim(
      notification.workspaceId,
      notification.deduplicationKey,
      now,
      this.deduplicationTtlMs,
    );
    if (!claimed) {
      await this.record(notification, 'NOTIFICATION_DUPLICATE_SKIPPED', 'DUPLICATE', now);
      return {
        status: 'DUPLICATE',
        provider: this.provider.name,
        attemptedAt: now.toISOString(),
        providerMessageId: null,
        errorCode: null,
        detail: 'A notification with this workspace-scoped deduplication key was already handled.',
      };
    }

    let result: NotificationDeliveryResult;
    try {
      result = await this.provider.deliver(notification);
    } catch {
      await this.deduplicator.release(notification.workspaceId, notification.deduplicationKey);
      result = {
        status: 'FAILED',
        provider: this.provider.name,
        attemptedAt: now.toISOString(),
        providerMessageId: null,
        errorCode: 'NOTIFICATION_PROVIDER_ERROR',
        detail: 'Notification provider failed; inspect provider logs for the underlying error.',
      };
    }
    if (result.status === 'FAILED') {
      await this.deduplicator.release(notification.workspaceId, notification.deduplicationKey);
    }
    // A successful provider call keeps its deduplication claim even if audit persistence fails.
    // Retrying the job can then reconcile as DUPLICATE without contacting the provider twice.
    await this.record(notification, 'NOTIFICATION_DELIVERY_ATTEMPTED', result.status, now);
    return result;
  }

  private async record(
    notification: InternalNotification,
    action: NotificationAuditEvent['action'],
    outcome: string,
    at: Date,
  ): Promise<void> {
    await this.audit.record({
      workspaceId: notification.workspaceId,
      notificationId: notification.id,
      action,
      outcome,
      occurredAt: at.toISOString(),
    });
  }
}

export class InMemoryNotificationAuditSink implements NotificationAuditSink {
  readonly events: NotificationAuditEvent[] = [];

  async record(event: NotificationAuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}
