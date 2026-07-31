import type { NotificationPreferences } from './notification-preferences';

type FollowUpPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SmsRecipientState {
  smsConsentAt: Date | null;
  smsOptedOutAt: Date | null;
  smsPhone: string | null;
  smsVerifiedAt: Date | null;
}

export function hasRequiredFollowUpSmsRecipient(recipient: SmsRecipientState): boolean {
  return Boolean(
    recipient.smsPhone &&
    recipient.smsVerifiedAt &&
    recipient.smsConsentAt &&
    !recipient.smsOptedOutAt,
  );
}

/**
 * Every due follow-up enters the SMS path once the assignee has a verified, consenting recipient.
 * Priority filtering applies only to optional in-app and email-preview channels.
 */
export function followUpNotificationPolicy(
  preferences: NotificationPreferences,
  priority: FollowUpPriority,
  recipient: SmsRecipientState,
) {
  const optionalChannelAllowed =
    !preferences.highPriorityOnly || priority === 'HIGH' || priority === 'URGENT';
  return {
    emailPreview: optionalChannelAllowed && preferences.email,
    inApp: optionalChannelAllowed && preferences.inApp,
    sms: hasRequiredFollowUpSmsRecipient(recipient),
  };
}
