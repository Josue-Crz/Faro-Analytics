import { prisma, type Prisma } from '@faro/database';
import { optimizeOutreachWindow, type OutreachOptimizerResult } from '@faro/optimizer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { writeContactScheduleToGoogleSheet } from './contact-sheet-writeback';

const isoInstantSchema = z.string().datetime({ offset: true });

export const contactOutreachScheduleRequestSchema = z.discriminatedUnion('mode', [
  z
    .object({
      campaignId: z.string().trim().min(1).max(160),
      mode: z.literal('OPTIMIZE'),
    })
    .strict(),
  z
    .object({
      campaignId: z.string().trim().min(1).max(160),
      followUpAt: isoInstantSchema,
      initialAt: isoInstantSchema,
      mode: z.literal('MANUAL'),
    })
    .strict(),
]);

export type ContactOutreachScheduleRequest = z.infer<typeof contactOutreachScheduleRequestSchema>;

export class ContactOutreachScheduleError extends Error {
  constructor(
    readonly code:
      | 'CAMPAIGN_NOT_FOUND'
      | 'CONTACT_NOT_FOUND'
      | 'FOLLOW_UP_AFTER_CAMPAIGN'
      | 'FOLLOW_UP_MUST_BE_FUTURE'
      | 'FOLLOW_UP_MUST_FOLLOW_INITIAL'
      | 'OPTIMIZER_COULD_NOT_SCHEDULE'
      | 'OUTREACH_NOT_ALLOWED',
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'ContactOutreachScheduleError';
  }
}

interface OptimizerScheduleContext {
  campaign: {
    endAt: Date | null;
    id: string;
  };
  contact: {
    consentStatus: 'OPTED_IN' | 'IMPLIED' | 'UNKNOWN' | 'OPTED_OUT';
    id: string;
    interactions: ReadonlyArray<{
      campaignId: string | null;
      direction: 'OUTBOUND' | 'INBOUND';
      occurredAt: Date;
    }>;
    organizationId: string | null;
    preferredChannel: 'EMAIL' | 'PHONE' | 'SMS' | 'MEETING' | 'SOCIAL' | 'OTHER';
    suppressedAt: Date | null;
    timezone: string;
  };
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  workspace: {
    id: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    timeZone: string;
  };
}

export interface OptimizedContactSchedule {
  followUp: Extract<OutreachOptimizerResult, { status: 'RECOMMENDED' }>;
  followUpAt: Date;
  initial: Extract<OutreachOptimizerResult, { status: 'RECOMMENDED' }>;
  initialAt: Date;
}

function optimizerInput(
  context: OptimizerScheduleContext,
  referenceTime: Date,
  sequenceStage: 1 | 2,
  extraOutreach: ReadonlyArray<{ respondedAt: null; sentAt: string }> = [],
) {
  const outbound = context.contact.interactions.filter(
    (interaction) => interaction.direction === 'OUTBOUND',
  );
  const latestInteraction = context.contact.interactions.reduce<Date | null>(
    (latest, interaction) =>
      !latest || interaction.occurredAt.getTime() > latest.getTime()
        ? interaction.occurredAt
        : latest,
    null,
  );
  const deadline = context.campaign.endAt?.toISOString();
  return {
    campaign: {
      channel: context.contact.preferredChannel,
      deadline,
      id: context.campaign.id,
      priority: context.priority,
      sequenceStage,
    },
    contact: {
      consentStatus: context.contact.consentStatus,
      id: context.contact.id,
      organizationId: context.contact.organizationId ?? undefined,
      preferredChannel: context.contact.preferredChannel,
      suppressed: Boolean(context.contact.suppressedAt),
      timeZone: context.contact.timezone,
    },
    historicalOutcomes: outbound.map((interaction) => ({
      campaignId: interaction.campaignId ?? undefined,
      channel: context.contact.preferredChannel,
      contactId: context.contact.id,
      organizationId: context.contact.organizationId ?? undefined,
      respondedAt: null,
      sentAt: interaction.occurredAt.toISOString(),
      timeZone: context.contact.timezone,
    })),
    lastInteractionAt: latestInteraction?.toISOString(),
    options: {
      alternativeCount: 3 as const,
      horizonDays: 31,
      intervalMinutes: 30 as const,
      minimumAlternativeSpacingMinutes: 120,
    },
    recentContactOutreach: [
      ...outbound.map((interaction) => ({
        respondedAt: null,
        sentAt: interaction.occurredAt.toISOString(),
      })),
      ...extraOutreach,
    ],
    referenceTime: referenceTime.toISOString(),
    workspace: {
      id: context.workspace.id,
      quietHours: [
        {
          end: context.workspace.quietHoursEnd,
          start: context.workspace.quietHoursStart,
        },
      ],
      timeZone: context.workspace.timeZone,
    },
  };
}

export function optimizeContactSchedule(
  context: OptimizerScheduleContext,
  now: Date,
): OptimizedContactSchedule {
  if (
    context.contact.suppressedAt ||
    (context.contact.consentStatus !== 'OPTED_IN' && context.contact.consentStatus !== 'IMPLIED')
  ) {
    throw new ContactOutreachScheduleError('OUTREACH_NOT_ALLOWED');
  }
  const initial = optimizeOutreachWindow(optimizerInput(context, now, 1));
  if (initial.status !== 'RECOMMENDED') {
    throw new ContactOutreachScheduleError('OPTIMIZER_COULD_NOT_SCHEDULE', {
      blockers: initial.blockers.map((blocker) => blocker.code),
      stage: 'INITIAL_OUTREACH',
    });
  }
  const initialAt = new Date(initial.primary.recommendedAt);
  const followUp = optimizeOutreachWindow(
    optimizerInput(context, initialAt, 2, [
      {
        respondedAt: null,
        sentAt: initialAt.toISOString(),
      },
    ]),
  );
  if (followUp.status !== 'RECOMMENDED') {
    throw new ContactOutreachScheduleError('OPTIMIZER_COULD_NOT_SCHEDULE', {
      blockers: followUp.blockers.map((blocker) => blocker.code),
      stage: 'FOLLOW_UP',
    });
  }
  return {
    followUp,
    followUpAt: new Date(followUp.primary.recommendedAt),
    initial,
    initialAt,
  };
}

function customFieldsWithSchedule(
  existing: unknown,
  campaignId: string,
  initialAt: Date,
  followUpAt: Date,
  mode: ContactOutreachScheduleRequest['mode'],
  now: Date,
): Prisma.InputJsonValue {
  const current =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return {
    ...current,
    importedFollowUpActivatedAtValue: followUpAt.toISOString(),
    importedFollowUpAt: followUpAt.toISOString(),
    importedFollowUpInitialAt: initialAt.toISOString(),
    importedFollowUpPending: false,
    outreachScheduleCampaignId: campaignId,
    outreachScheduleSource: mode,
    outreachScheduleUpdatedAt: now.toISOString(),
  } as Prisma.InputJsonValue;
}

export async function saveContactOutreachSchedule(input: {
  actorId: string;
  actorType?: 'SYSTEM' | 'USER' | 'WORKER';
  contactId: string;
  focusedCampaignId?: string | null;
  now?: Date;
  request: ContactOutreachScheduleRequest;
  workspaceId: string;
}) {
  const now = input.now ?? new Date();
  const campaignId = input.request.campaignId;
  if (input.focusedCampaignId && input.focusedCampaignId !== campaignId) {
    throw new ContactOutreachScheduleError('CAMPAIGN_NOT_FOUND');
  }
  const [campaign, contact, workspace, membership] = await Promise.all([
    prisma.campaign.findFirst({
      select: { endAt: true, id: true, ownerId: true, status: true },
      where: {
        archivedAt: null,
        id: campaignId,
        status: { notIn: ['ARCHIVED', 'COMPLETED'] },
        workspaceId: input.workspaceId,
      },
    }),
    prisma.contact.findFirst({
      select: {
        consentStatus: true,
        customFields: true,
        id: true,
        interactions: {
          orderBy: { occurredAt: 'desc' },
          select: { campaignId: true, direction: true, occurredAt: true },
          take: 100,
        },
        organizationId: true,
        preferredChannel: true,
        source: true,
        suppressedAt: true,
        timezone: true,
      },
      where: { deletedAt: null, id: input.contactId, workspaceId: input.workspaceId },
    }),
    prisma.workspace.findUnique({
      select: {
        defaultTimezone: true,
        id: true,
        quietHoursEnd: true,
        quietHoursStart: true,
      },
      where: { id: input.workspaceId },
    }),
    prisma.campaignContact.findUnique({
      select: { assignedUserId: true, priority: true },
      where: {
        workspaceId_campaignId_contactId: {
          campaignId,
          contactId: input.contactId,
          workspaceId: input.workspaceId,
        },
      },
    }),
  ]);
  if (!campaign || !workspace) throw new ContactOutreachScheduleError('CAMPAIGN_NOT_FOUND');
  if (!contact) throw new ContactOutreachScheduleError('CONTACT_NOT_FOUND');
  if (
    contact.suppressedAt ||
    (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED')
  ) {
    throw new ContactOutreachScheduleError('OUTREACH_NOT_ALLOWED');
  }

  let initialAt: Date;
  let followUpAt: Date;
  let optimized: OptimizedContactSchedule | null = null;
  if (input.request.mode === 'OPTIMIZE') {
    optimized = optimizeContactSchedule(
      {
        campaign,
        contact,
        priority: membership?.priority ?? 'MEDIUM',
        workspace: {
          id: workspace.id,
          quietHoursEnd: workspace.quietHoursEnd,
          quietHoursStart: workspace.quietHoursStart,
          timeZone: workspace.defaultTimezone,
        },
      },
      now,
    );
    initialAt = optimized.initialAt;
    followUpAt = optimized.followUpAt;
  } else {
    initialAt = new Date(input.request.initialAt);
    followUpAt = new Date(input.request.followUpAt);
    if (followUpAt.getTime() <= now.getTime()) {
      throw new ContactOutreachScheduleError('FOLLOW_UP_MUST_BE_FUTURE');
    }
    if (followUpAt.getTime() <= initialAt.getTime()) {
      throw new ContactOutreachScheduleError('FOLLOW_UP_MUST_FOLLOW_INITIAL');
    }
    if (campaign.endAt && followUpAt.getTime() > campaign.endAt.getTime()) {
      throw new ContactOutreachScheduleError('FOLLOW_UP_AFTER_CAMPAIGN');
    }
  }

  const sheetWriteBack = await writeContactScheduleToGoogleSheet({
    actorUserId: !input.actorType || input.actorType === 'USER' ? input.actorId : undefined,
    contact,
    followUpAt,
    initialOutreachAt: initialAt,
    workspaceId: input.workspaceId,
  });
  const assignedUserId = membership?.assignedUserId ?? campaign.ownerId;
  const nextActionAt = initialAt.getTime() > now.getTime() ? initialAt : followUpAt;
  const nextActionType = initialAt.getTime() > now.getTime() ? 'INITIAL_OUTREACH' : 'FOLLOW_UP';

  const saved = await prisma.$transaction(async (database) => {
    const existingTasks = await database.followUpTask.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, recommendationId: true },
      take: 25,
      where: {
        campaignId,
        contactId: contact.id,
        status: { in: ['OPEN', 'SNOOZED'] },
        workspaceId: input.workspaceId,
      },
    });
    const existingTask = existingTasks[0];
    let recommendationId = existingTask?.recommendationId ?? null;
    if (optimized) {
      recommendationId = randomUUID();
      const recommendation = await database.outreachRecommendation.upsert({
        create: {
          algorithmVersion: optimized.initial.algorithmVersion,
          alternativeWindows: optimized.initial.alternatives.map(
            (alternative) => new Date(alternative.recommendedAt),
          ),
          campaignId,
          confidence: optimized.initial.confidence,
          contactId: contact.id,
          dataSufficiency: optimized.initial.dataSufficiency,
          explanation: `${optimized.initial.explanation} Follow-up: ${optimized.followUp.explanation}`,
          id: recommendationId,
          idempotencyKey: `optimizer-schedule:${campaignId}:${contact.id}`,
          reasonCodes: [
            ...new Set([...optimized.initial.reasonCodes, ...optimized.followUp.reasonCodes]),
          ],
          recommendedAt: initialAt,
          score: optimized.initial.primary.score,
          status: 'ACCEPTED',
          acceptedAt: now,
          workspaceId: input.workspaceId,
        },
        update: {
          acceptedAt: now,
          algorithmVersion: optimized.initial.algorithmVersion,
          alternativeWindows: optimized.initial.alternatives.map(
            (alternative) => new Date(alternative.recommendedAt),
          ),
          confidence: optimized.initial.confidence,
          dataSufficiency: optimized.initial.dataSufficiency,
          dismissedAt: null,
          explanation: `${optimized.initial.explanation} Follow-up: ${optimized.followUp.explanation}`,
          reasonCodes: [
            ...new Set([...optimized.initial.reasonCodes, ...optimized.followUp.reasonCodes]),
          ],
          recommendedAt: initialAt,
          score: optimized.initial.primary.score,
          status: 'ACCEPTED',
          userAdjustedAt: null,
        },
        where: {
          workspaceId_idempotencyKey: {
            idempotencyKey: `optimizer-schedule:${campaignId}:${contact.id}`,
            workspaceId: input.workspaceId,
          },
        },
      });
      recommendationId = recommendation.id;
    } else if (recommendationId) {
      await database.outreachRecommendation.update({
        data: { status: 'EDITED', userAdjustedAt: now },
        where: {
          id_workspaceId: { id: recommendationId, workspaceId: input.workspaceId },
        },
      });
    }

    const taskData = {
      assignedUserId,
      dueAt: followUpAt,
      initialAt,
      priority: membership?.priority ?? ('MEDIUM' as const),
      reason:
        input.request.mode === 'OPTIMIZE'
          ? 'Optimizer-assigned initial outreach and follow-up schedule'
          : 'Manually assigned initial outreach and follow-up schedule',
      recommendationId,
      snoozedUntil: null,
      status: 'OPEN' as const,
    };
    const task = existingTask
      ? await database.followUpTask.update({
          data: taskData,
          where: {
            id_workspaceId: { id: existingTask.id, workspaceId: input.workspaceId },
          },
        })
      : await database.followUpTask.upsert({
          create: {
            ...taskData,
            campaignId,
            contactId: contact.id,
            id: randomUUID(),
            idempotencyKey: `contact-schedule:${campaignId}:${contact.id}`,
            workspaceId: input.workspaceId,
          },
          update: taskData,
          where: {
            workspaceId_idempotencyKey: {
              idempotencyKey: `contact-schedule:${campaignId}:${contact.id}`,
              workspaceId: input.workspaceId,
            },
          },
        });
    const duplicateTaskIds = existingTasks
      .filter((candidate) => candidate.id !== task.id)
      .map((candidate) => candidate.id);
    if (duplicateTaskIds.length) {
      await database.followUpTask.updateMany({
        data: { snoozedUntil: null, status: 'CANCELLED' },
        where: { id: { in: duplicateTaskIds }, workspaceId: input.workspaceId },
      });
    }
    await database.notification.updateMany({
      data: { errorCode: 'FOLLOW_UP_RESCHEDULED', status: 'CANCELLED' },
      where: {
        followUpTaskId: { in: [task.id, ...duplicateTaskIds] },
        status: 'SCHEDULED',
        workspaceId: input.workspaceId,
      },
    });
    await database.campaignContact.upsert({
      create: {
        assignedUserId,
        campaignId,
        contactId: contact.id,
        nextActionAt,
        priority: membership?.priority ?? 'MEDIUM',
        stage: 'Scheduled',
        workspaceId: input.workspaceId,
      },
      update: { assignedUserId, nextActionAt, stage: 'Scheduled' },
      where: {
        workspaceId_campaignId_contactId: {
          campaignId,
          contactId: contact.id,
          workspaceId: input.workspaceId,
        },
      },
    });
    await database.contact.update({
      data: {
        customFields: customFieldsWithSchedule(
          contact.customFields,
          campaignId,
          initialAt,
          followUpAt,
          input.request.mode,
          now,
        ),
        nextActionAt,
        nextActionType,
      },
      where: { id_workspaceId: { id: contact.id, workspaceId: input.workspaceId } },
    });
    await database.auditEvent.create({
      data: {
        action: 'CONTACT_OUTREACH_SCHEDULE_SAVED',
        actorId: input.actorId,
        actorType: input.actorType ?? 'USER',
        entityId: task.id,
        entityType: 'FollowUpTask',
        id: randomUUID(),
        metadata: {
          algorithmVersion: optimized?.initial.algorithmVersion ?? 'manual',
          campaignId,
          contactId: contact.id,
          followUpAt: followUpAt.toISOString(),
          initialAt: initialAt.toISOString(),
          mode: input.request.mode,
          sheetWriteBack,
        },
        workspaceId: input.workspaceId,
      },
    });
    return task;
  });

  return {
    data: {
      algorithmVersion: optimized?.initial.algorithmVersion ?? 'manual',
      campaignId,
      contactId: contact.id,
      dueAt: saved.dueAt,
      id: saved.id,
      initialAt: saved.initialAt,
      reason: saved.reason,
      status: saved.status,
    },
    sheetWriteBack,
  };
}

export async function assignMissingOptimizedContactSchedules(now: Date = new Date(), limit = 100) {
  const assignmentLimit = Math.min(Math.max(limit, 1), 250);
  const results: Array<{
    campaignId: string;
    contactId: string;
    status: string;
  }> = [];
  let cursor:
    | {
        campaignId: string;
        contactId: string;
        workspaceId: string;
      }
    | undefined;
  let scanned = 0;
  while (results.length < assignmentLimit && scanned < 10_000) {
    const memberships = await prisma.campaignContact.findMany({
      ...(cursor
        ? {
            cursor: { workspaceId_campaignId_contactId: cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ workspaceId: 'asc' }, { campaignId: 'asc' }, { contactId: 'asc' }],
      select: {
        campaign: { select: { ownerId: true } },
        campaignId: true,
        contactId: true,
        workspaceId: true,
      },
      take: 250,
      where: {
        campaign: { archivedAt: null, status: { in: ['ACTIVE', 'DRAFT'] } },
        contact: {
          consentStatus: { in: ['OPTED_IN', 'IMPLIED'] },
          deletedAt: null,
          suppressedAt: null,
        },
      },
    });
    if (!memberships.length) break;
    scanned += memberships.length;
    const last = memberships.at(-1)!;
    cursor = {
      campaignId: last.campaignId,
      contactId: last.contactId,
      workspaceId: last.workspaceId,
    };
    const activeTasks = await prisma.followUpTask.findMany({
      select: { campaignId: true, contactId: true, workspaceId: true },
      where: {
        OR: memberships.map((membership) => ({
          campaignId: membership.campaignId,
          contactId: membership.contactId,
          workspaceId: membership.workspaceId,
        })),
        status: { in: ['OPEN', 'SNOOZED'] },
      },
    });
    const scheduledKeys = new Set(
      activeTasks.map(
        (task) => `${task.workspaceId}\u0000${task.campaignId}\u0000${task.contactId}`,
      ),
    );
    for (const membership of memberships) {
      if (results.length >= assignmentLimit) break;
      if (
        scheduledKeys.has(
          `${membership.workspaceId}\u0000${membership.campaignId}\u0000${membership.contactId}`,
        )
      ) {
        continue;
      }
      try {
        await saveContactOutreachSchedule({
          actorId: membership.campaign.ownerId,
          actorType: 'WORKER',
          contactId: membership.contactId,
          now,
          request: { campaignId: membership.campaignId, mode: 'OPTIMIZE' },
          workspaceId: membership.workspaceId,
        });
        results.push({
          campaignId: membership.campaignId,
          contactId: membership.contactId,
          status: 'ASSIGNED',
        });
      } catch (error) {
        results.push({
          campaignId: membership.campaignId,
          contactId: membership.contactId,
          status: error instanceof Error ? error.message : 'ASSIGNMENT_FAILED',
        });
      }
    }
    if (memberships.length < 250) break;
  }
  return {
    assigned: results.filter((result) => result.status === 'ASSIGNED').length,
    attempted: results.length,
    results,
    scanned,
  };
}
