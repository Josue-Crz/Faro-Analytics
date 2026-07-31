import { z } from 'zod';

const campaignDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Campaign date must be a real calendar date.');

const updateDetailsSchema = z
  .object({
    action: z.literal('UPDATE_DETAILS'),
    endDate: campaignDateSchema.nullable(),
    name: z.string().trim().min(1).max(160),
    objective: z.string().trim().min(1).max(2_000),
    startDate: campaignDateSchema.nullable(),
    type: z.enum([
      'SPONSORSHIP',
      'PARTICIPANT_OUTREACH',
      'PARTNERSHIP',
      'FUNDRAISING',
      'EVENT',
      'COMMUNITY',
    ]),
  })
  .strict()
  .superRefine(({ endDate, startDate }, context) => {
    if ((endDate === null) !== (startDate === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Start and end dates must both be provided or both be cleared.',
        path: ['endDate'],
      });
    }
    if (endDate && startDate && startDate > endDate) {
      context.addIssue({
        code: 'custom',
        message: 'Campaign end date cannot be before its start date.',
        path: ['endDate'],
      });
    }
  });

export const campaignManagementRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('UPDATE_SOURCE'),
      sheetConnectionId: z.string().trim().min(1).max(160).nullable(),
    })
    .strict(),
  z.object({ action: z.literal('COMPLETE') }).strict(),
  updateDetailsSchema,
]);

export type CampaignDetailsUpdate = Extract<
  z.infer<typeof campaignManagementRequestSchema>,
  { action: 'UPDATE_DETAILS' }
>;

export function campaignMutationConflictsWithFocus(input: {
  action: z.infer<typeof campaignManagementRequestSchema>['action'] | 'DELETE';
  focusedCampaignId: string | null;
  targetCampaignId: string;
}): boolean {
  return Boolean(
    input.focusedCampaignId &&
    input.focusedCampaignId !== input.targetCampaignId &&
    (input.action === 'UPDATE_SOURCE' || input.action === 'COMPLETE'),
  );
}

export function campaignDateRange(input: Pick<CampaignDetailsUpdate, 'endDate' | 'startDate'>): {
  endAt: Date | null;
  startAt: Date | null;
} {
  return {
    endAt: input.endDate ? new Date(`${input.endDate}T23:59:59.999Z`) : null,
    startAt: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
  };
}
