import {
  recommendationExplanationSchema,
  responseAnalysisResultSchema,
  type RecommendationExplanation,
  type ResponseAnalysisResult,
} from '../contracts/analysis';
import { outreachDraftResultSchema, type OutreachDraftResult } from '../contracts/outreach';

export function validateOutreachDraftResult(value: unknown): OutreachDraftResult {
  return outreachDraftResultSchema.parse(value);
}

export function validateResponseAnalysisResult(value: unknown): ResponseAnalysisResult {
  return responseAnalysisResultSchema.parse(value);
}

export function validateRecommendationExplanation(value: unknown): RecommendationExplanation {
  return recommendationExplanationSchema.parse(value);
}
