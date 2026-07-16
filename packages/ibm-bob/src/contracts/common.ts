import { z } from 'zod';

export const bobIdentifierSchema = z.string().trim().min(1).max(160);
export const boundedTextSchema = z.string().trim().min(1).max(20_000);
export const optionalBoundedTextSchema = z.string().trim().max(20_000).optional();
export const isoInstantSchema = z.string().datetime({ offset: true });

export const bobToneSchema = z.enum([
  'PROFESSIONAL',
  'WARM',
  'CONCISE',
  'CONSULTATIVE',
  'PARTNERSHIP_FOCUSED',
  'SPONSORSHIP_FOCUSED',
]);

export const bobObjectiveSchema = z.enum([
  'INITIAL_INTRODUCTION',
  'FOLLOW_UP',
  'REQUEST_INFORMATION',
  'SCHEDULE_MEETING',
  'PRESENT_SPONSORSHIP_OPPORTUNITY',
  'RESPOND_TO_INTEREST',
  'RESPOND_TO_CONCERN',
  'RE_ENGAGE',
  'CLOSE_THE_LOOP',
]);

export const consentStatusSchema = z.enum([
  'OPTED_IN',
  'IMPLIED',
  'UNKNOWN',
  'OPTED_OUT',
  'SUPPRESSED',
]);

export type BobTone = z.infer<typeof bobToneSchema>;
export type BobObjective = z.infer<typeof bobObjectiveSchema>;
export type ConsentStatus = z.infer<typeof consentStatusSchema>;
