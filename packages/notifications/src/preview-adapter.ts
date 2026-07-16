import { randomUUID } from 'node:crypto';

import {
  internalNotificationSchema,
  type InternalNotification,
  type InternalNotificationProvider,
  type NotificationChannel,
  type NotificationDeliveryResult,
} from './contracts.js';

export interface PreviewDelivery {
  notification: InternalNotification;
  result: NotificationDeliveryResult;
}

/** Records a truthful local preview. It never reports external provider delivery. */
export class PreviewNotificationAdapter implements InternalNotificationProvider {
  readonly name = 'faro-development-preview';
  readonly supportedChannels: ReadonlySet<NotificationChannel> = new Set([
    'IN_APP',
    'EMAIL',
    'WEB_PUSH',
    'SMS',
  ]);
  private readonly deliveries: PreviewDelivery[] = [];

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async deliver(rawNotification: InternalNotification): Promise<NotificationDeliveryResult> {
    const notification = internalNotificationSchema.parse(rawNotification);
    const result: NotificationDeliveryResult = {
      status: 'PREVIEWED',
      provider: this.name,
      attemptedAt: this.now().toISOString(),
      providerMessageId: `preview-${this.createId()}`,
      errorCode: null,
      detail: 'Stored in the Faro development preview; no email, push, or SMS provider was called.',
    };
    this.deliveries.push({ notification: structuredClone(notification), result: { ...result } });
    return result;
  }

  list(): PreviewDelivery[] {
    return structuredClone(this.deliveries);
  }
}
