import { prisma } from '@faro/database';
import {
  nextAllowedNotificationAt,
  notificationRetryAt,
  notificationScheduledAtOrAfter,
  PreviewNotificationAdapter,
  type InternalNotification,
  type NotificationDeliveryResult,
} from '@faro/notifications';
import { randomUUID } from 'node:crypto';

import { followUpNotificationPolicy } from './follow-up-notification-policy';
import {
  refreshExpiredContactNextActions,
  rollForwardNotifiedFollowUps,
} from './contact-next-action';
import { notificationPreferences } from './notification-preferences';
import { createTwilioSmsAdapter, smsAdapterMode } from './twilio';

interface NotificationRunSummary {
  accepted: number;
  cancelled: number;
  createdEmailPreviews: number;
  createdInApp: number;
  failed: number;
  previewed: number;
  retried: number;
  rescheduledFollowUps: number;
  scheduledSms: number;
  skipped: number;
  smsUnavailable: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function reminderInstant(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
  }).format(value);
}

function reminderText(
  reason: string,
  campaignName: string,
  initialAt: Date,
  dueAt: Date,
  timeZone: string,
): string {
  const normalized = reason.replace(/\s+/g, ' ').trim().slice(0, 220);
  return `${campaignName} · Initial date: ${reminderInstant(initialAt, timeZone)} · Follow-up date: ${reminderInstant(dueAt, timeZone)} · ${normalized}`;
}

function retryable(errorCode: string | null): boolean {
  if (!errorCode?.startsWith('TWILIO_HTTP_')) return false;
  const status = Number(errorCode.slice('TWILIO_HTTP_'.length));
  return status === 429 || status >= 500;
}

function deliveryStatus(
  result: NotificationDeliveryResult,
): 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'PREVIEWED' {
  return result.status;
}

/**
 * Creates one workspace-scoped reminder per follow-up/channel/due instant, including an SMS record
 * for every due follow-up. SMS delivery still requires a verified, consenting internal assignee.
 * The database row is claimed before a provider call so overlapping cron runs cannot double-send.
 */
export async function runFollowUpNotifications(
  now: Date = new Date(),
): Promise<NotificationRunSummary> {
  const summary: NotificationRunSummary = {
    accepted: 0,
    cancelled: 0,
    createdEmailPreviews: 0,
    createdInApp: 0,
    failed: 0,
    previewed: 0,
    retried: 0,
    rescheduledFollowUps: 0,
    scheduledSms: 0,
    skipped: 0,
    smsUnavailable: 0,
  };
  const workspaceScopes = await prisma.workspace.findMany({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  for (const scope of workspaceScopes) {
    await refreshExpiredContactNextActions(scope.id, now);
  }
  const upcoming = (
    await Promise.all(
      workspaceScopes.map((scope) =>
        prisma.followUpTask.findMany({
          include: {
            assignedUser: {
              select: {
                id: true,
                notificationPreferences: true,
                smsConsentAt: true,
                smsOptedOutAt: true,
                smsPhone: true,
                smsVerifiedAt: true,
                timezone: true,
              },
            },
            campaign: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
            workspace: {
              select: {
                defaultTimezone: true,
                quietHoursEnd: true,
                quietHoursStart: true,
              },
            },
          },
          orderBy: { dueAt: 'asc' },
          take: 250,
          where: {
            dueAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1_000) },
            status: 'OPEN',
            workspaceId: scope.id,
          },
        }),
      ),
    )
  )
    .flat()
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())
    .slice(0, 250);

  for (const followUp of upcoming) {
    const preferences = notificationPreferences(
      followUp.assignedUser.notificationPreferences,
      followUp.workspace,
    );
    const policy = followUpNotificationPolicy(
      preferences,
      followUp.priority,
      followUp.assignedUser,
    );
    const desiredAt = new Date(followUp.dueAt.getTime() - preferences.followUpLeadMinutes * 60_000);
    const readyAt = notificationScheduledAtOrAfter(desiredAt, now);
    const scheduledFor = notificationScheduledAtOrAfter(
      nextAllowedNotificationAt(readyAt, {
        end: preferences.quietHoursEnd,
        start: preferences.quietHoursStart,
        timeZone: followUp.assignedUser.timezone || followUp.workspace.defaultTimezone,
      }),
      now,
    );
    if (scheduledFor.getTime() > now.getTime()) {
      summary.skipped += 1;
      continue;
    }

    const contactName = `${followUp.contact.firstName} ${followUp.contact.lastName}`.trim();
    const title = `Follow-up due: ${contactName}`;
    const assigneeTimeZone = followUp.assignedUser.timezone || followUp.workspace.defaultTimezone;
    const message = reminderText(
      followUp.reason,
      followUp.campaign.name,
      followUp.initialAt,
      followUp.dueAt,
      assigneeTimeZone,
    );
    const actionUrl = `/follow-ups?task=${encodeURIComponent(followUp.id)}`;
    let createdAny = false;

    if (policy.inApp) {
      try {
        await prisma.notification.create({
          data: {
            channel: 'IN_APP',
            deduplicationKey: `${followUp.id}:in-app:${followUp.dueAt.toISOString()}`,
            followUpTaskId: followUp.id,
            id: randomUUID(),
            message,
            payload: { href: actionUrl, internalOnly: true, kind: 'FOLLOW_UP' },
            provider: 'faro-in-app',
            scheduledFor,
            sentAt: now,
            status: 'SENT',
            title,
            userId: followUp.assignedUser.id,
            workspaceId: followUp.workspaceId,
          },
        });
        summary.createdInApp += 1;
        createdAny = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (policy.emailPreview) {
      try {
        await prisma.notification.create({
          data: {
            channel: 'EMAIL',
            deduplicationKey: `${followUp.id}:email-preview:${followUp.dueAt.toISOString()}`,
            followUpTaskId: followUp.id,
            id: randomUUID(),
            message: `Development preview only. ${message}`,
            payload: {
              href: actionUrl,
              internalOnly: true,
              kind: 'FOLLOW_UP',
              previewOnly: true,
            },
            provider: 'faro-development-preview',
            scheduledFor,
            sentAt: now,
            status: 'PREVIEWED',
            title: `Preview: ${title}`,
            userId: followUp.assignedUser.id,
            workspaceId: followUp.workspaceId,
          },
        });
        summary.createdEmailPreviews += 1;
        createdAny = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    try {
      await prisma.notification.create({
        data: {
          channel: 'SMS',
          deduplicationKey: `${followUp.id}:sms:${followUp.dueAt.toISOString()}`,
          errorCode: policy.sms ? null : 'SMS_RECIPIENT_NOT_READY',
          followUpTaskId: followUp.id,
          id: randomUUID(),
          message,
          payload: { href: actionUrl, internalOnly: true, kind: 'FOLLOW_UP' },
          scheduledFor,
          status: policy.sms ? 'SCHEDULED' : 'CANCELLED',
          title,
          userId: followUp.assignedUser.id,
          workspaceId: followUp.workspaceId,
        },
      });
      if (policy.sms) {
        summary.scheduledSms += 1;
      } else {
        summary.smsUnavailable += 1;
      }
      createdAny = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    if (createdAny) {
      await prisma.followUpTask.updateMany({
        data: { lastNotificationAt: now },
        where: { id: followUp.id, workspaceId: followUp.workspaceId },
      });
    }
  }

  const dueSms = (
    await Promise.all(
      workspaceScopes.map((scope) =>
        prisma.notification.findMany({
          include: {
            user: {
              select: {
                notificationPreferences: true,
                smsConsentAt: true,
                smsOptedOutAt: true,
                smsPhone: true,
                smsVerifiedAt: true,
                timezone: true,
              },
            },
            workspace: {
              select: {
                defaultTimezone: true,
                quietHoursEnd: true,
                quietHoursStart: true,
              },
            },
          },
          orderBy: { scheduledFor: 'asc' },
          take: 50,
          where: {
            channel: 'SMS',
            scheduledFor: { lte: now },
            status: 'SCHEDULED',
            workspaceId: scope.id,
          },
        }),
      ),
    )
  )
    .flat()
    .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime())
    .slice(0, 50);
  const twilio = createTwilioSmsAdapter();
  const provider = twilio ?? new PreviewNotificationAdapter();

  for (const notification of dueSms) {
    const preferences = notificationPreferences(
      notification.user.notificationPreferences,
      notification.workspace,
    );
    const allowedAt = notificationScheduledAtOrAfter(
      nextAllowedNotificationAt(now, {
        end: preferences.quietHoursEnd,
        start: preferences.quietHoursStart,
        timeZone: notification.user.timezone || notification.workspace.defaultTimezone,
      }),
      now,
    );
    if (allowedAt.getTime() > now.getTime()) {
      await prisma.notification.updateMany({
        data: { scheduledFor: allowedAt },
        where: {
          id: notification.id,
          status: 'SCHEDULED',
          workspaceId: notification.workspaceId,
        },
      });
      summary.skipped += 1;
      continue;
    }

    const claimed = await prisma.notification.updateMany({
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: now,
        provider: provider.name,
        status: 'PROCESSING',
      },
      where: {
        id: notification.id,
        status: 'SCHEDULED',
        workspaceId: notification.workspaceId,
      },
    });
    if (claimed.count !== 1) continue;

    if (
      !notification.user.smsPhone ||
      !notification.user.smsVerifiedAt ||
      !notification.user.smsConsentAt ||
      notification.user.smsOptedOutAt
    ) {
      await prisma.notification.updateMany({
        data: {
          errorCode: 'SMS_PREFERENCE_DISABLED',
          status: 'CANCELLED',
        },
        where: { id: notification.id, workspaceId: notification.workspaceId },
      });
      summary.cancelled += 1;
      continue;
    }

    const payload =
      typeof notification.payload === 'object' &&
      notification.payload !== null &&
      !Array.isArray(notification.payload)
        ? notification.payload
        : {};
    const href = typeof payload.href === 'string' ? payload.href : null;
    const internalNotification: InternalNotification = {
      actionUrl: href,
      bodyText: notification.message,
      channel: 'SMS',
      deduplicationKey: notification.deduplicationKey,
      followUpTaskId: notification.followUpTaskId,
      id: notification.id,
      kind: 'FOLLOW_UP',
      purpose: 'INTERNAL_REMINDER',
      recipientPhone: notification.user.smsPhone,
      scheduledFor: notification.scheduledFor.toISOString(),
      title: notification.title,
      userId: notification.userId,
      workspaceId: notification.workspaceId,
    };
    const result = await provider.deliver(internalNotification);
    const attempts = notification.attempts + 1;
    await prisma.auditEvent.create({
      data: {
        action: 'NOTIFICATION_DELIVERY_ATTEMPTED',
        actorId: null,
        actorType: 'WORKER',
        entityId: notification.id,
        entityType: 'Notification',
        id: randomUUID(),
        metadata: {
          adapter: smsAdapterMode(),
          channel: 'SMS',
          errorCode: result.errorCode,
          outcome: result.status,
        },
        workspaceId: notification.workspaceId,
      },
    });
    if (result.status === 'FAILED' && retryable(result.errorCode) && attempts < 3) {
      await prisma.notification.updateMany({
        data: {
          errorCode: result.errorCode,
          providerMessageId: result.providerMessageId,
          scheduledFor: notificationRetryAt(now, attempts),
          status: 'SCHEDULED',
        },
        where: { id: notification.id, workspaceId: notification.workspaceId },
      });
      summary.retried += 1;
      continue;
    }

    await prisma.notification.updateMany({
      data: {
        errorCode: result.errorCode,
        providerMessageId: result.providerMessageId,
        sentAt: result.status === 'FAILED' ? null : new Date(result.attemptedAt),
        status: deliveryStatus(result),
      },
      where: { id: notification.id, workspaceId: notification.workspaceId },
    });
    if (result.status === 'ACCEPTED' || result.status === 'DELIVERED') summary.accepted += 1;
    if (result.status === 'PREVIEWED') summary.previewed += 1;
    if (result.status === 'FAILED') summary.failed += 1;
  }

  summary.rescheduledFollowUps = await rollForwardNotifiedFollowUps(now);
  return summary;
}
