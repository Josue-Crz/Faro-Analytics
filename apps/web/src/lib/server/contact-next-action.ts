import { prisma, type Prisma } from '@faro/database';
import {
  OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
  optimizeOutreachWindow,
  type OutreachChannel,
} from '@faro/optimizer';
import { randomUUID } from 'node:crypto';

import { writeContactScheduleToGoogleSheet } from './contact-sheet-writeback';

export type ContactNextActionType =
  'INITIAL_OUTREACH' | 'FOLLOW_UP' | 'CONSENT_REVIEW' | 'SCHEDULE_REVIEW';

export interface ContactNextActionInput {
  campaign?: {
    endAt: Date | null;
    id: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  } | null;
  consentStatus: 'OPTED_IN' | 'IMPLIED' | 'UNKNOWN' | 'OPTED_OUT';
  contactId: string;
  hasFollowUpTask: boolean;
  importedFollowUpAt?: Date | null;
  interactions: ReadonlyArray<{
    campaignId: string | null;
    direction: 'OUTBOUND' | 'INBOUND';
    occurredAt: Date;
  }>;
  organizationId: string | null;
  preferredChannel: OutreachChannel;
  suppressed: boolean;
  timeZone: string;
  workspace: {
    id: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    timeZone: string;
  };
}

export interface ContactNextActionResult {
  algorithmVersion: string;
  nextActionAt: Date;
  nextActionType: ContactNextActionType;
  reason: string;
}

function guaranteedFuture(value: Date, now: Date): Date {
  return value.getTime() > now.getTime() ? value : new Date(now.getTime() + 60_000);
}

function reviewTomorrow(now: Date): Date {
  return new Date(now.getTime() + 24 * 60 * 60_000);
}

/**
 * Produces a future contact action from explicit relationship state. Past campaign deadlines are
 * intentionally omitted so an expired optimizer boundary is recalculated instead of reused.
 */
export function calculateContactNextAction(
  input: ContactNextActionInput,
  now: Date,
): ContactNextActionResult {
  if (
    input.suppressed ||
    input.consentStatus === 'UNKNOWN' ||
    input.consentStatus === 'OPTED_OUT'
  ) {
    return {
      algorithmVersion: 'faro-consent-review.v1',
      nextActionAt: reviewTomorrow(now),
      nextActionType: 'CONSENT_REVIEW',
      reason: input.suppressed ? 'CONTACT_SUPPRESSED' : 'CONSENT_REVIEW_REQUIRED',
    };
  }

  const outbound = input.interactions.filter((interaction) => interaction.direction === 'OUTBOUND');
  const isFollowUp =
    input.hasFollowUpTask || outbound.length > 0 || Boolean(input.importedFollowUpAt);
  if (input.importedFollowUpAt && input.importedFollowUpAt.getTime() > now.getTime()) {
    return {
      algorithmVersion: 'faro-imported-follow-up.v1',
      nextActionAt: input.importedFollowUpAt,
      nextActionType: 'FOLLOW_UP',
      reason: 'IMPORTED_FUTURE_FOLLOW_UP',
    };
  }

  const latestInteraction = input.interactions.reduce<Date | null>(
    (latest, interaction) =>
      !latest || interaction.occurredAt.getTime() > latest.getTime()
        ? interaction.occurredAt
        : latest,
    null,
  );
  const campaignDeadline =
    input.campaign?.endAt && input.campaign.endAt.getTime() > now.getTime()
      ? input.campaign.endAt.toISOString()
      : undefined;
  const result = optimizeOutreachWindow({
    campaign: {
      channel: input.preferredChannel,
      deadline: campaignDeadline,
      id: input.campaign?.id ?? 'contact-next-action',
      priority: input.campaign?.priority ?? 'MEDIUM',
      sequenceStage: isFollowUp ? 2 : 1,
    },
    contact: {
      consentStatus: input.consentStatus,
      id: input.contactId,
      organizationId: input.organizationId ?? undefined,
      preferredChannel: input.preferredChannel,
      suppressed: input.suppressed,
      timeZone: input.timeZone,
    },
    historicalOutcomes: outbound.map((interaction) => ({
      campaignId: interaction.campaignId ?? undefined,
      channel: input.preferredChannel,
      contactId: input.contactId,
      organizationId: input.organizationId ?? undefined,
      respondedAt: null,
      sentAt: interaction.occurredAt.toISOString(),
      timeZone: input.timeZone,
    })),
    lastInteractionAt: latestInteraction?.toISOString(),
    options: {
      alternativeCount: 3,
      horizonDays: 31,
      intervalMinutes: 30,
      minimumAlternativeSpacingMinutes: 120,
    },
    recentContactOutreach: outbound.map((interaction) => ({
      respondedAt: null,
      sentAt: interaction.occurredAt.toISOString(),
    })),
    referenceTime: now.toISOString(),
    workspace: {
      id: input.workspace.id,
      quietHours: [
        {
          end: input.workspace.quietHoursEnd,
          start: input.workspace.quietHoursStart,
        },
      ],
      timeZone: input.workspace.timeZone,
    },
  });

  if (result.status === 'RECOMMENDED') {
    return {
      algorithmVersion: result.algorithmVersion,
      nextActionAt: guaranteedFuture(new Date(result.primary.recommendedAt), now),
      nextActionType: isFollowUp ? 'FOLLOW_UP' : 'INITIAL_OUTREACH',
      reason:
        result.reasonCodes[0] ??
        (isFollowUp ? 'OPTIMIZED_FOLLOW_UP' : 'OPTIMIZED_INITIAL_OUTREACH'),
    };
  }

  if (result.nextEligibleAt) {
    return {
      algorithmVersion: result.algorithmVersion,
      nextActionAt: guaranteedFuture(new Date(result.nextEligibleAt), now),
      nextActionType: isFollowUp ? 'FOLLOW_UP' : 'INITIAL_OUTREACH',
      reason: result.blockers[0]?.code ?? 'NEXT_ELIGIBLE_TIME',
    };
  }

  return {
    algorithmVersion: OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
    nextActionAt: reviewTomorrow(now),
    nextActionType: 'SCHEDULE_REVIEW',
    reason: result.blockers[0]?.code ?? 'NO_ELIGIBLE_WINDOW',
  };
}

interface RecalculateOptions {
  actorId?: string | null;
  actorType?: 'SYSTEM' | 'USER' | 'WORKER';
  importedFollowUpAt?: Date | null;
  rollForwardFollowUpTaskIds?: readonly string[];
}

export async function recalculateContactNextActionInTransaction(
  database: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
  now: Date,
  options: RecalculateOptions = {},
): Promise<ContactNextActionResult | null> {
  const [contact, workspace] = await Promise.all([
    database.contact.findFirst({
      select: {
        _count: {
          select: { followUpTasks: { where: { status: { in: ['OPEN', 'SNOOZED'] } } } },
        },
        campaignContacts: {
          orderBy: { updatedAt: 'desc' },
          select: {
            campaign: {
              select: { archivedAt: true, endAt: true, id: true, status: true },
            },
            priority: true,
          },
          take: 10,
        },
        consentStatus: true,
        customFields: true,
        followUpTasks: {
          orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
          select: { dueAt: true, id: true, initialAt: true },
          take: 1,
          where: { status: { in: ['OPEN', 'SNOOZED'] } },
        },
        id: true,
        interactions: {
          orderBy: { occurredAt: 'desc' },
          select: { campaignId: true, direction: true, occurredAt: true },
          take: 100,
        },
        organizationId: true,
        preferredChannel: true,
        suppressedAt: true,
        timezone: true,
      },
      where: { deletedAt: null, id: contactId, workspaceId },
    }),
    database.workspace.findUnique({
      select: {
        defaultTimezone: true,
        id: true,
        quietHoursEnd: true,
        quietHoursStart: true,
      },
      where: { id: workspaceId },
    }),
  ]);
  if (!contact || !workspace) return null;

  const membership = contact.campaignContacts.find(
    ({ campaign }) =>
      !campaign.archivedAt && campaign.status !== 'COMPLETED' && campaign.status !== 'ARCHIVED',
  );
  const savedSchedule = contact.followUpTasks[0];
  const savedScheduleIsEligible =
    savedSchedule &&
    savedSchedule.dueAt.getTime() > now.getTime() &&
    !contact.suppressedAt &&
    (contact.consentStatus === 'OPTED_IN' || contact.consentStatus === 'IMPLIED');
  const result: ContactNextActionResult = savedScheduleIsEligible
    ? {
        algorithmVersion: 'faro-saved-outreach-schedule.v1',
        nextActionAt:
          savedSchedule.initialAt.getTime() > now.getTime()
            ? savedSchedule.initialAt
            : savedSchedule.dueAt,
        nextActionType:
          savedSchedule.initialAt.getTime() > now.getTime() ? 'INITIAL_OUTREACH' : 'FOLLOW_UP',
        reason:
          savedSchedule.initialAt.getTime() > now.getTime()
            ? 'SAVED_INITIAL_OUTREACH'
            : 'SAVED_FOLLOW_UP',
      }
    : calculateContactNextAction(
        {
          campaign: membership
            ? {
                endAt: membership.campaign.endAt,
                id: membership.campaign.id,
                priority: membership.priority,
              }
            : null,
          consentStatus: contact.consentStatus,
          contactId: contact.id,
          hasFollowUpTask: contact._count.followUpTasks > 0,
          importedFollowUpAt: options.importedFollowUpAt,
          interactions: contact.interactions,
          organizationId: contact.organizationId,
          preferredChannel: contact.preferredChannel,
          suppressed: Boolean(contact.suppressedAt),
          timeZone: contact.timezone,
          workspace: {
            id: workspace.id,
            quietHoursEnd: workspace.quietHoursEnd,
            quietHoursStart: workspace.quietHoursStart,
            timeZone: workspace.defaultTimezone,
          },
        },
        now,
      );
  const taskIds = [...new Set(options.rollForwardFollowUpTaskIds ?? [])];

  await database.contact.update({
    data: {
      nextActionAt: result.nextActionAt,
      nextActionType: result.nextActionType,
    },
    where: { id_workspaceId: { id: contact.id, workspaceId } },
  });
  await database.campaignContact.updateMany({
    data: { nextActionAt: result.nextActionAt },
    where: { contactId: contact.id, workspaceId },
  });
  if (taskIds.length > 0 && result.nextActionType === 'FOLLOW_UP') {
    await database.notification.updateMany({
      data: { errorCode: 'FOLLOW_UP_RESCHEDULED', status: 'CANCELLED' },
      where: {
        channel: 'SMS',
        followUpTaskId: { in: taskIds },
        status: 'SCHEDULED',
        workspaceId,
      },
    });
    await database.followUpTask.updateMany({
      data: { dueAt: result.nextActionAt },
      where: {
        dueAt: { lte: now },
        id: { in: taskIds },
        status: 'OPEN',
        workspaceId,
      },
    });
    const customFields =
      contact.customFields &&
      typeof contact.customFields === 'object' &&
      !Array.isArray(contact.customFields)
        ? (contact.customFields as Record<string, unknown>)
        : {};
    await database.contact.update({
      data: {
        customFields: {
          ...customFields,
          importedFollowUpActivatedAtValue: result.nextActionAt.toISOString(),
          importedFollowUpAt: result.nextActionAt.toISOString(),
          importedFollowUpPending: false,
          outreachScheduleUpdatedAt: now.toISOString(),
        },
      },
      where: { id_workspaceId: { id: contact.id, workspaceId } },
    });
  }
  await database.auditEvent.create({
    data: {
      action: 'CONTACT_NEXT_ACTION_RECALCULATED',
      actorId: options.actorId ?? null,
      actorType: options.actorType ?? 'SYSTEM',
      entityId: contact.id,
      entityType: 'Contact',
      id: randomUUID(),
      metadata: {
        algorithmVersion: result.algorithmVersion,
        nextActionAt: result.nextActionAt.toISOString(),
        nextActionType: result.nextActionType,
        reason: result.reason,
        rolledFollowUpCount: taskIds.length,
      },
      workspaceId,
    },
  });
  return result;
}

export async function recalculateContactNextAction(
  workspaceId: string,
  contactId: string,
  now: Date = new Date(),
  options: RecalculateOptions = {},
) {
  return prisma.$transaction((database) =>
    recalculateContactNextActionInTransaction(database, workspaceId, contactId, now, options),
  );
}

export async function refreshExpiredContactNextActions(
  workspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  let refreshed = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    const expired = await prisma.contact.findMany({
      orderBy: { nextActionAt: 'asc' },
      select: { id: true },
      take: 100,
      where: { deletedAt: null, nextActionAt: { lte: now }, workspaceId },
    });
    if (expired.length === 0) break;
    for (const contact of expired) {
      await recalculateContactNextAction(workspaceId, contact.id, now, { actorType: 'SYSTEM' });
      refreshed += 1;
    }
    if (expired.length < 100) break;
  }
  return refreshed;
}

export async function rollForwardNotifiedFollowUps(now: Date = new Date()): Promise<number> {
  const expired = await prisma.followUpTask.findMany({
    include: {
      notifications: {
        orderBy: { createdAt: 'desc' },
        select: { deduplicationKey: true, status: true },
        take: 20,
        where: { channel: 'SMS' },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 100,
    where: { dueAt: { lte: now }, status: 'OPEN' },
  });
  const terminal = new Set(['ACCEPTED', 'DELIVERED', 'FAILED', 'PREVIEWED', 'CANCELLED']);
  const notified = expired.filter((followUp) =>
    followUp.notifications.some(
      (notification) =>
        terminal.has(notification.status) &&
        notification.deduplicationKey === `${followUp.id}:sms:${followUp.dueAt.toISOString()}`,
    ),
  );
  const byContact = new Map<string, string[]>();
  for (const followUp of notified) {
    const taskIds = byContact.get(followUp.contactId) ?? [];
    taskIds.push(followUp.id);
    byContact.set(followUp.contactId, taskIds);
  }
  for (const [contactId, taskIds] of byContact) {
    const workspaceId = followUpWorkspace(expired, contactId);
    await recalculateContactNextAction(workspaceId, contactId, now, {
      actorType: 'WORKER',
      rollForwardFollowUpTaskIds: taskIds,
    });
    const updated = await prisma.followUpTask.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        contact: { select: { customFields: true, source: true } },
        dueAt: true,
        initialAt: true,
      },
      where: { id: { in: taskIds }, workspaceId },
    });
    if (updated) {
      try {
        await writeContactScheduleToGoogleSheet({
          contact: updated.contact,
          followUpAt: updated.dueAt,
          initialOutreachAt: updated.initialAt,
          workspaceId,
        });
      } catch (error) {
        await prisma.auditEvent.create({
          data: {
            action: 'GOOGLE_SHEET_SCHEDULE_WRITE_FAILED',
            actorType: 'WORKER',
            entityId: taskIds[0]!,
            entityType: 'FollowUpTask',
            id: randomUUID(),
            metadata: {
              errorCode: error instanceof Error ? error.message : 'UNKNOWN',
              operation: 'FOLLOW_UP_ROLL_FORWARD',
            },
            workspaceId,
          },
        });
      }
    }
  }
  return notified.length;
}

function followUpWorkspace(
  followUps: ReadonlyArray<{ contactId: string; workspaceId: string }>,
  contactId: string,
): string {
  const followUp = followUps.find((candidate) => candidate.contactId === contactId);
  if (!followUp) throw new Error('Follow-up workspace scope was not found');
  return followUp.workspaceId;
}
