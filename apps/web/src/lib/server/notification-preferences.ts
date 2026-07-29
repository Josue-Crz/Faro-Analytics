import { localTimeSchema } from '@faro/notifications';
import { z } from 'zod';

export const notificationPreferencesSchema = z
  .object({
    dailyDigest: z.boolean(),
    email: z.boolean(),
    followUpLeadMinutes: z.number().int().min(0).max(1_440),
    highPriorityOnly: z.boolean(),
    inApp: z.boolean(),
    quietHoursEnd: localTimeSchema,
    quietHoursStart: localTimeSchema,
    sms: z.boolean(),
  })
  .strict();

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export function notificationPreferences(
  raw: unknown,
  workspace: { quietHoursEnd: string; quietHoursStart: string },
): NotificationPreferences {
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
  const source = parsed.success ? parsed.data : {};
  return notificationPreferencesSchema.parse({
    dailyDigest: typeof source.dailyDigest === 'boolean' ? source.dailyDigest : true,
    email: typeof source.email === 'boolean' ? source.email : true,
    followUpLeadMinutes:
      typeof source.followUpLeadMinutes === 'number' ? source.followUpLeadMinutes : 30,
    highPriorityOnly:
      typeof source.highPriorityOnly === 'boolean' ? source.highPriorityOnly : false,
    inApp: typeof source.inApp === 'boolean' ? source.inApp : true,
    quietHoursEnd:
      typeof source.quietHoursEnd === 'string' ? source.quietHoursEnd : workspace.quietHoursEnd,
    quietHoursStart:
      typeof source.quietHoursStart === 'string'
        ? source.quietHoursStart
        : workspace.quietHoursStart,
    sms: typeof source.sms === 'boolean' ? source.sms : false,
  });
}

export function maskPhoneNumber(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, Math.max(2, phone.length - 4)).replace(/\d/g, '•')}${phone.slice(-4)}`;
}
