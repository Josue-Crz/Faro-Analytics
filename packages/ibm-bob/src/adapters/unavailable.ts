import type {
  RecommendationExplanation,
  RecommendationExplanationInput,
  ResponseAnalysisInput,
  ResponseAnalysisResult,
} from '../contracts/analysis';
import type { OutreachDraftInput, OutreachDraftResult } from '../contracts/outreach';
import type { IbmBobService } from '../contracts/service';

export class IbmBobRuntimeUnavailableError extends Error {
  readonly code = 'IBM_BOB_RUNTIME_UNAVAILABLE';

  constructor() {
    super(
      'No verified IBM Bob runtime adapter is configured. Create an AWAITING_BOB request and use the Faro MCP workflow.',
    );
    this.name = 'IbmBobRuntimeUnavailableError';
  }
}

/** Never simulates an IBM Bob result and never falls back to another model provider. */
export class UnavailableIbmBobRuntimeAdapter implements IbmBobService {
  async analyzeResponse(_input: ResponseAnalysisInput): Promise<ResponseAnalysisResult> {
    throw new IbmBobRuntimeUnavailableError();
  }

  async generateOutreachDraft(_input: OutreachDraftInput): Promise<OutreachDraftResult> {
    throw new IbmBobRuntimeUnavailableError();
  }

  async explainRecommendation(
    _input: RecommendationExplanationInput,
  ): Promise<RecommendationExplanation> {
    throw new IbmBobRuntimeUnavailableError();
  }
}
