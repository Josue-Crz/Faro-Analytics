import { z } from 'zod';

import {
  bobIdentifierSchema,
  bobObjectiveSchema,
  bobToneSchema,
  boundedTextSchema,
  consentStatusSchema,
  isoInstantSchema,
  optionalBoundedTextSchema,
} from './common';

export const outreachContactContextSchema = z
  .object({
    id: bobIdentifierSchema,
    firstName: z.string().trim().max(200).optional(),
    lastName: z.string().trim().max(200).optional(),
    organizationName: z.string().trim().max(300).optional(),
    title: z.string().trim().max(300).optional(),
    timezone: z.string().trim().max(100).optional(),
    preferredChannel: z.enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']).optional(),
    consentStatus: consentStatusSchema,
    suppressedAt: isoInstantSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  })
  .strict();

export const outreachCampaignContextSchema = z
  .object({
    id: bobIdentifierSchema,
    name: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(2_000),
    description: z.string().trim().max(5_000).optional(),
    deadlineAt: isoInstantSchema.nullable().optional(),
  })
  .strict();

export const outreachInteractionSchema = z
  .object({
    id: bobIdentifierSchema,
    direction: z.enum(['INBOUND', 'OUTBOUND']),
    channel: z.enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']),
    occurredAt: isoInstantSchema,
    subject: z.string().trim().max(1_000).optional(),
    bodyText: z.string().trim().max(12_000).optional(),
  })
  .strict();

export const outreachDraftInputSchema = z
  .object({
    workspaceId: bobIdentifierSchema,
    contact: outreachContactContextSchema,
    campaign: outreachCampaignContextSchema,
    additionalContext: z.string().trim().max(6_000).optional(),
    interactionHistory: z.array(outreachInteractionSchema).max(20).default([]),
    latestResponse: optionalBoundedTextSchema,
    latestResponseSourceRecordId: bobIdentifierSchema.optional(),
    selectedTone: bobToneSchema,
    objective: bobObjectiveSchema,
    recommendedOutreachAt: isoInstantSchema.nullable().optional(),
    approvedSourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const approvedSources = new Set(input.approvedSourceRecordIds);
    const embeddedSourceIds = [
      input.contact.id,
      input.campaign.id,
      ...input.interactionHistory.map((interaction) => interaction.id),
      ...(input.latestResponseSourceRecordId ? [input.latestResponseSourceRecordId] : []),
    ];
    if (embeddedSourceIds.some((recordId) => !approvedSources.has(recordId))) {
      context.addIssue({
        code: 'custom',
        message: 'Every embedded context record must appear in approvedSourceRecordIds',
        path: ['approvedSourceRecordIds'],
      });
    }
    if (input.latestResponse && !input.latestResponseSourceRecordId) {
      context.addIssue({
        code: 'custom',
        message: 'latestResponseSourceRecordId is required when latestResponse is provided',
        path: ['latestResponseSourceRecordId'],
      });
    }
    if (!input.latestResponse && input.latestResponseSourceRecordId) {
      context.addIssue({
        code: 'custom',
        message: 'latestResponse is required when latestResponseSourceRecordId is provided',
        path: ['latestResponse'],
      });
    }
    if (
      input.contact.consentStatus === 'UNKNOWN' ||
      input.contact.consentStatus === 'OPTED_OUT' ||
      input.contact.consentStatus === 'SUPPRESSED'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'IBM Bob drafting requires opted-in or implied consent and a non-suppressed contact',
        path: ['contact', 'consentStatus'],
      });
    }
    if (input.contact.suppressedAt) {
      context.addIssue({
        code: 'custom',
        message: 'IBM Bob drafting is prohibited when suppressedAt is set',
        path: ['contact', 'suppressedAt'],
      });
    }
  });

export const outreachDraftResultSchema = z
  .object({
    subject: z.string().trim().min(1).max(998),
    bodyText: boundedTextSchema,
    rationale: z.string().trim().min(1).max(4_000),
    recommendedNextAction: z.string().trim().min(1).max(1_000),
    suggestedFollowUpAt: isoInstantSchema.nullable(),
    confidence: z.number().min(0).max(1),
    riskFlags: z.array(z.string().trim().min(1).max(200)).max(30),
    sourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict();

export type OutreachDraftInput = z.infer<typeof outreachDraftInputSchema>;
export type OutreachDraftResult = z.infer<typeof outreachDraftResultSchema>;
