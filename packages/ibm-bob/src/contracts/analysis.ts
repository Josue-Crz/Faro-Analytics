import { z } from 'zod';

import {
  bobIdentifierSchema,
  boundedTextSchema,
  isoInstantSchema,
  optionalBoundedTextSchema,
} from './common';

export const responseClassificationSchema = z.enum([
  'INTERESTED',
  'NEEDS_MORE_INFORMATION',
  'MEETING_REQUESTED',
  'REFERRED',
  'FOLLOW_UP_LATER',
  'DECLINED',
  'OUT_OF_OFFICE',
  'UNSUBSCRIBE',
  'NO_ACTIONABLE_INTENT',
  'AMBIGUOUS',
]);

export const responseAnalysisInputSchema = z
  .object({
    workspaceId: bobIdentifierSchema,
    responseId: bobIdentifierSchema,
    contactId: bobIdentifierSchema,
    campaignId: bobIdentifierSchema,
    responseBody: boundedTextSchema,
    responseOccurredAt: isoInstantSchema,
    campaignObjective: z.string().trim().min(1).max(2_000),
    precedingMessage: optionalBoundedTextSchema,
    approvedSourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict();

export const responseAnalysisResultSchema = z
  .object({
    classification: responseClassificationSchema,
    sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']),
    urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    keyQuestionOrObjection: z.string().trim().max(2_000).nullable(),
    recommendedNextAction: z.string().trim().min(1).max(1_000),
    suggestedFollowUpAt: isoInstantSchema.nullable(),
    confidence: z.number().min(0).max(1),
    riskFlags: z.array(z.string().trim().min(1).max(200)).max(30),
    sourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict();

export const recommendationExplanationInputSchema = z
  .object({
    workspaceId: bobIdentifierSchema,
    recommendationId: bobIdentifierSchema,
    contactId: bobIdentifierSchema,
    campaignId: bobIdentifierSchema,
    recommendedAt: isoInstantSchema,
    score: z.number().finite(),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
    deterministicExplanation: z.string().trim().min(1).max(4_000),
    approvedSourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict();

export const recommendationExplanationSchema = z
  .object({
    explanation: z.string().trim().min(1).max(4_000),
    caveats: z.array(z.string().trim().min(1).max(500)).max(20),
    sourceRecordIds: z.array(bobIdentifierSchema).min(1).max(100),
  })
  .strict();

export type ResponseAnalysisInput = z.infer<typeof responseAnalysisInputSchema>;
export type ResponseAnalysisResult = z.infer<typeof responseAnalysisResultSchema>;
export type RecommendationExplanationInput = z.infer<typeof recommendationExplanationInputSchema>;
export type RecommendationExplanation = z.infer<typeof recommendationExplanationSchema>;
