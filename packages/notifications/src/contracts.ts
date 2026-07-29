import { z } from 'zod';

export const notificationIdentifierSchema = z.string().trim().min(1).max(200);
export const notificationInstantSchema = z.string().datetime({ offset: true });
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const e164PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must use E.164 format');
const safeActionUrlSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (value) => value.startsWith('/') && !value.startsWith('//'),
    'Action URL must be a single-slash app-relative path',
  );

export const quietHoursSchema = z
  .object({
    start: localTimeSchema,
    end: localTimeSchema,
    timeZone: z.string().trim().min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format(new Date());
    } catch {
      context.addIssue({ code: 'custom', message: 'Unknown IANA time zone', path: ['timeZone'] });
    }
  });

export const internalNotificationSchema = z
  .object({
    id: notificationIdentifierSchema,
    workspaceId: notificationIdentifierSchema,
    userId: notificationIdentifierSchema,
    followUpTaskId: notificationIdentifierSchema.nullable(),
    purpose: z.literal('INTERNAL_REMINDER'),
    kind: z.enum(['FOLLOW_UP', 'DAILY_DIGEST', 'HIGH_PRIORITY_ALERT']),
    channel: z.enum(['IN_APP', 'EMAIL', 'WEB_PUSH', 'SMS']),
    title: z.string().trim().min(1).max(300),
    bodyText: z.string().trim().min(1).max(8_000),
    actionUrl: safeActionUrlSchema.nullable(),
    scheduledFor: notificationInstantSchema,
    deduplicationKey: notificationIdentifierSchema,
    recipientPhone: e164PhoneNumberSchema.optional(),
  })
  .strict()
  .superRefine((notification, context) => {
    if (notification.channel === 'SMS' && !notification.recipientPhone) {
      context.addIssue({
        code: 'custom',
        message: 'SMS notifications require a verified recipient phone number',
        path: ['recipientPhone'],
      });
    }
  });

export type QuietHours = z.infer<typeof quietHoursSchema>;
export type InternalNotification = z.infer<typeof internalNotificationSchema>;
export type NotificationChannel = InternalNotification['channel'];

export interface NotificationDeliveryResult {
  status: 'ACCEPTED' | 'DELIVERED' | 'PREVIEWED' | 'FAILED';
  provider: string;
  attemptedAt: string;
  providerMessageId: string | null;
  errorCode: string | null;
  detail: string;
}

/** Provider boundary for internal Faro reminders only—not external contact outreach. */
export interface InternalNotificationProvider {
  readonly name: string;
  readonly supportedChannels: ReadonlySet<NotificationChannel>;
  deliver(notification: InternalNotification): Promise<NotificationDeliveryResult>;
}
