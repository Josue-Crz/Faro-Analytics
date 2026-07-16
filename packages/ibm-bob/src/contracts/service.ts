import type {
  RecommendationExplanation,
  RecommendationExplanationInput,
  ResponseAnalysisInput,
  ResponseAnalysisResult,
} from './analysis';
import type { OutreachDraftInput, OutreachDraftResult } from './outreach';

/**
 * The only runtime AI boundary in Faro. Implementations must be backed by a verified IBM Bob
 * runtime. The MCP request workflow is intentionally separate because it is asynchronous.
 */
export interface IbmBobService {
  analyzeResponse(input: ResponseAnalysisInput): Promise<ResponseAnalysisResult>;
  generateOutreachDraft(input: OutreachDraftInput): Promise<OutreachDraftResult>;
  explainRecommendation(input: RecommendationExplanationInput): Promise<RecommendationExplanation>;
}
