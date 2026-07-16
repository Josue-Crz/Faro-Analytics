/**
 * Faro's deterministic outreach-window optimizer.
 *
 * The optimizer deliberately has no clock, network, database, or AI dependency.
 * Callers must provide a reference instant and all observations so the same input
 * and algorithm version always produce the same result.
 */

export const OUTREACH_OPTIMIZER_ALGORITHM_VERSION = 'faro-window-v1.0.0';

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ConsentStatus = 'OPTED_IN' | 'IMPLIED' | 'UNKNOWN' | 'OPTED_OUT';

export type OutreachChannel = 'EMAIL' | 'PHONE' | 'SMS' | 'MEETING' | 'SOCIAL' | 'OTHER';

export type CampaignPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DataSufficiency = 'INSUFFICIENT' | 'LOW' | 'MEDIUM' | 'HIGH';

export type OptimizerReasonCode =
  | 'CAMPAIGN_DEADLINE'
  | 'CAMPAIGN_HISTORY'
  | 'COHORT_HISTORY'
  | 'CONTACT_HISTORY'
  | 'CONTACT_TIMEZONE'
  | 'DEFAULT_BUSINESS_WINDOW'
  | 'FREQUENCY_COOLDOWN'
  | 'FREQUENCY_ROLLING_CAP'
  | 'GLOBAL_HISTORY'
  | 'HIGH_PRIORITY'
  | 'ORGANIZATION_HISTORY'
  | 'PREFERRED_CHANNEL'
  | 'QUIET_HOURS_RESPECTED'
  | 'RECENT_UNANSWERED_OUTREACH'
  | 'RESPONSE_TIME_PATTERN'
  | 'SEQUENCE_STAGE'
  | 'TIME_SINCE_LAST_INTERACTION';

export type OptimizerBlockerCode =
  | 'CAMPAIGN_DEADLINE_PASSED'
  | 'CONSENT_NOT_GRANTED'
  | 'FREQUENCY_CAP_REACHED'
  | 'NO_ELIGIBLE_WINDOW'
  | 'SUPPRESSED_CONTACT'
  | 'UNANSWERED_OUTREACH_CAP_REACHED';

export type OptimizerWarningCode =
  | 'DEADLINE_LIMITED_OPTIONS'
  | 'DEFAULT_CONTACT_QUIET_HOURS_APPLIED'
  | 'LIMITED_ALTERNATIVE_WINDOWS'
  | 'NO_HISTORICAL_DATA'
  | 'SPARSE_HISTORICAL_DATA';

/**
 * A half-open local-time range: start is included and end is excluded. Equal
 * start and end values intentionally represent a full quiet day.
 */
export interface QuietHours {
  /** Local wall-clock time in HH:mm format. */
  readonly start: string;
  /** Local wall-clock time in HH:mm format. */
  readonly end: string;
  /** ISO weekdays on which the range starts. Omit for every day. */
  readonly days?: readonly IsoWeekday[];
}

export interface OptimizerContact {
  readonly id: string;
  readonly timeZone: string;
  readonly consentStatus: ConsentStatus;
  readonly suppressed: boolean;
  readonly organizationId?: string;
  readonly cohortId?: string;
  readonly preferredChannel?: OutreachChannel;
  /** Omit to use Faro's conservative 20:00-08:00 default; pass [] for no contact rule. */
  readonly quietHours?: readonly QuietHours[];
}

export interface OptimizerWorkspace {
  readonly id: string;
  readonly timeZone: string;
  readonly quietHours: readonly QuietHours[];
}

export interface OptimizerUserSchedule {
  readonly timeZone: string;
  readonly quietHours: readonly QuietHours[];
}

export interface OptimizerCampaign {
  readonly id: string;
  readonly channel: OutreachChannel;
  readonly priority?: CampaignPriority;
  /** One-based sequence stage. */
  readonly sequenceStage?: number;
  /** An ISO-8601 instant with an explicit offset. */
  readonly deadline?: string;
}

/**
 * A completed historical attempt used for cohort and temporal scoring. Include
 * identifiers when known; unmatched events become a weak global fallback.
 */
export interface HistoricalOutreachOutcome {
  readonly sentAt: string;
  readonly respondedAt?: string | null;
  readonly contactId?: string;
  readonly organizationId?: string;
  readonly campaignId?: string;
  readonly cohortId?: string;
  readonly channel?: OutreachChannel;
  /** The observed contact's IANA timezone; defaults to the target contact timezone. */
  readonly timeZone?: string;
}

/** An outbound attempt for the target contact, used only for frequency safety. */
export interface RecentContactOutreach {
  readonly sentAt: string;
  readonly respondedAt?: string | null;
}

export interface FrequencyPolicy {
  /** Minimum time after the latest attempt before another may be recommended. */
  readonly minimumHoursBetweenAttempts?: number;
  /** Rolling window used by both attempt and unanswered-message caps. */
  readonly lookbackDays?: number;
  /** Maximum attempts allowed inside the rolling window. */
  readonly maximumAttemptsInLookback?: number;
  /** Hard stop when this many recent attempts remain unanswered. */
  readonly maximumUnansweredAttempts?: number;
}

export interface OptimizerOptions {
  /** Search horizon from referenceTime. Defaults to 14 and is capped at 31. */
  readonly horizonDays?: number;
  /** Local candidate granularity. Supported values are 15, 30, and 60. */
  readonly intervalMinutes?: 15 | 30 | 60;
  /** Number of alternatives to return when available. Defaults to 3. */
  readonly alternativeCount?: 2 | 3;
  /** Keeps top-ranked alternatives from merely being adjacent slots. Defaults to 120. */
  readonly minimumAlternativeSpacingMinutes?: number;
}

export interface OutreachOptimizerInput {
  /** Required instead of reading Date.now(), making evaluation reproducible. */
  readonly referenceTime: string;
  readonly contact: OptimizerContact;
  readonly workspace: OptimizerWorkspace;
  readonly userSchedule?: OptimizerUserSchedule;
  readonly campaign: OptimizerCampaign;
  readonly historicalOutcomes?: readonly HistoricalOutreachOutcome[];
  readonly recentContactOutreach?: readonly RecentContactOutreach[];
  readonly lastInteractionAt?: string;
  readonly frequencyPolicy?: FrequencyPolicy;
  readonly options?: OptimizerOptions;
}

export interface LocalWindow {
  readonly date: string;
  readonly time: string;
  readonly weekday: string;
  readonly timeZone: string;
}

export interface RecommendedWindow {
  readonly recommendedAt: string;
  readonly contactLocal: LocalWindow;
  readonly score: number;
  readonly reasonCodes: readonly OptimizerReasonCode[];
}

export interface ReasonDetail {
  readonly code: OptimizerReasonCode;
  readonly message: string;
}

export interface BlockerDetail {
  readonly code: OptimizerBlockerCode;
  readonly message: string;
}

export interface ReproducibilityMetadata {
  readonly algorithmVersion: typeof OUTREACH_OPTIMIZER_ALGORITHM_VERSION;
  readonly inputHash: string;
  readonly referenceTime: string;
  readonly intervalMinutes: 15 | 30 | 60;
  readonly evaluatedCandidates: number;
}

interface OptimizationResultBase {
  readonly algorithmVersion: typeof OUTREACH_OPTIMIZER_ALGORITHM_VERSION;
  readonly warnings: readonly OptimizerWarningCode[];
  readonly explanation: string;
  readonly reproducibility: ReproducibilityMetadata;
}

export interface OutreachRecommendation extends OptimizationResultBase {
  readonly status: 'RECOMMENDED';
  readonly primary: RecommendedWindow;
  readonly alternatives: readonly RecommendedWindow[];
  readonly confidence: number;
  readonly dataSufficiency: DataSufficiency;
  readonly historicalObservationCount: number;
  readonly effectiveHistoricalObservationCount: number;
  readonly reasonCodes: readonly OptimizerReasonCode[];
  readonly reasons: readonly ReasonDetail[];
}

export interface BlockedOutreachRecommendation extends OptimizationResultBase {
  readonly status: 'BLOCKED';
  readonly blockers: readonly BlockerDetail[];
  readonly nextEligibleAt: string | null;
}

export type OutreachOptimizerResult = OutreachRecommendation | BlockedOutreachRecommendation;

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly isoWeekday: IsoWeekday;
  readonly weekday: string;
}

interface NormalizedHistoricalOutcome {
  readonly sentAtMs: number;
  readonly respondedAtMs: number | null;
  readonly sentLocal: LocalParts;
  readonly respondedLocal: LocalParts | null;
  readonly contactId?: string;
  readonly organizationId?: string;
  readonly campaignId?: string;
  readonly cohortId?: string;
  readonly channel?: OutreachChannel;
  readonly timeZone: string;
}

interface NormalizedRecentOutreach {
  readonly sentAtMs: number;
  readonly respondedAtMs: number | null;
}

interface Candidate {
  readonly atMs: number;
  readonly contactLocal: LocalParts;
  readonly score: number;
}

interface HistoryProfile {
  readonly contact: readonly NormalizedHistoricalOutcome[];
  readonly campaign: readonly NormalizedHistoricalOutcome[];
  readonly organization: readonly NormalizedHistoricalOutcome[];
  readonly cohort: readonly NormalizedHistoricalOutcome[];
  readonly global: readonly NormalizedHistoricalOutcome[];
  readonly effectiveCount: number;
  readonly sufficiency: DataSufficiency;
}

interface FrequencyEvaluation {
  readonly blocked: BlockerDetail | null;
  readonly earliestAtMs: number;
  readonly nextEligibleAt: string | null;
  readonly cooldownApplied: boolean;
  readonly rollingCapApplied: boolean;
  readonly recentUnanswered: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SCAN_RESOLUTION_MINUTES = 15;

export const DEFAULT_CONTACT_QUIET_HOURS: readonly QuietHours[] = Object.freeze([
  Object.freeze({ start: '20:00', end: '08:00' }),
]);

const DEFAULT_FREQUENCY_POLICY = Object.freeze({
  minimumHoursBetweenAttempts: 48,
  lookbackDays: 7,
  maximumAttemptsInLookback: 3,
  maximumUnansweredAttempts: 3,
});

const DEFAULT_OPTIONS = Object.freeze({
  horizonDays: 14,
  intervalMinutes: 30 as const,
  alternativeCount: 3 as const,
  minimumAlternativeSpacingMinutes: 120,
});

const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const WEEKDAY_TO_ISO: Readonly<Record<string, IsoWeekday>> = Object.freeze({
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
});

const WEEKDAY_LONG: Readonly<Record<string, string>> = Object.freeze({
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
});

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Calculate a safe, explainable outreach window or an explicit hard-stop result.
 * Invalid inputs throw TypeError at this package boundary.
 */
export function optimizeOutreachWindow(input: OutreachOptimizerInput): OutreachOptimizerResult {
  const normalized = normalizeAndValidateInput(input);
  const makeReproducibility = (evaluatedCandidates: number): ReproducibilityMetadata => ({
    algorithmVersion: OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
    inputHash: fingerprint({ algorithmVersion: OUTREACH_OPTIMIZER_ALGORITHM_VERSION, input }),
    referenceTime: new Date(normalized.referenceTimeMs).toISOString(),
    intervalMinutes: normalized.options.intervalMinutes,
    evaluatedCandidates,
  });

  if (input.contact.suppressed) {
    return blockedResult(
      [
        {
          code: 'SUPPRESSED_CONTACT',
          message: 'This contact is suppressed; outreach is not allowed.',
        },
      ],
      null,
      'No window was calculated because suppression is an unconditional safety stop.',
      normalized.warnings,
      makeReproducibility(0),
    );
  }

  if (input.contact.consentStatus !== 'OPTED_IN' && input.contact.consentStatus !== 'IMPLIED') {
    return blockedResult(
      [
        {
          code: 'CONSENT_NOT_GRANTED',
          message:
            input.contact.consentStatus === 'OPTED_OUT'
              ? 'The contact has opted out; outreach is not allowed.'
              : 'Consent is unverified; outreach requires a confirmed lawful basis.',
        },
      ],
      null,
      'No window was calculated because consent or another lawful basis has not been confirmed.',
      normalized.warnings,
      makeReproducibility(0),
    );
  }

  if (normalized.deadlineMs !== null && normalized.deadlineMs <= normalized.referenceTimeMs) {
    return blockedResult(
      [
        {
          code: 'CAMPAIGN_DEADLINE_PASSED',
          message: 'The campaign deadline has already passed.',
        },
      ],
      null,
      'No future outreach window exists before the supplied campaign deadline.',
      normalized.warnings,
      makeReproducibility(0),
    );
  }

  const frequency = evaluateFrequency(
    normalized.referenceTimeMs,
    normalized.recentOutreach,
    normalized.frequencyPolicy,
  );

  if (frequency.blocked !== null) {
    return blockedResult(
      [frequency.blocked],
      frequency.nextEligibleAt,
      'No window was calculated because the contact-level frequency policy is currently a hard stop.',
      normalized.warnings,
      makeReproducibility(0),
    );
  }

  if (input.contact.quietHours === undefined) {
    normalized.warnings.push('DEFAULT_CONTACT_QUIET_HOURS_APPLIED');
  }

  const historyProfile = createHistoryProfile(normalized.history, input);
  if (historyProfile.sufficiency === 'INSUFFICIENT') {
    normalized.warnings.push('NO_HISTORICAL_DATA');
  } else if (historyProfile.sufficiency === 'LOW') {
    normalized.warnings.push('SPARSE_HISTORICAL_DATA');
  }

  const horizonEndMs = normalized.referenceTimeMs + normalized.options.horizonDays * DAY_MS;
  const searchEndMs =
    normalized.deadlineMs === null ? horizonEndMs : Math.min(horizonEndMs, normalized.deadlineMs);

  if (normalized.deadlineMs !== null && normalized.deadlineMs < horizonEndMs) {
    normalized.warnings.push('DEADLINE_LIMITED_OPTIONS');
  }

  const quietContexts = [
    {
      timeZone: input.contact.timeZone,
      quietHours: normalized.contactQuietHours,
    },
    {
      timeZone: input.workspace.timeZone,
      quietHours: input.workspace.quietHours,
    },
    ...(input.userSchedule === undefined
      ? []
      : [
          {
            timeZone: input.userSchedule.timeZone,
            quietHours: input.userSchedule.quietHours,
          },
        ]),
  ];

  const scanStartMs = ceilToResolution(
    Math.max(normalized.referenceTimeMs + 1, frequency.earliestAtMs),
    SCAN_RESOLUTION_MINUTES,
  );
  const candidates: Candidate[] = [];

  for (
    let candidateMs = scanStartMs;
    candidateMs <= searchEndMs;
    candidateMs += SCAN_RESOLUTION_MINUTES * MINUTE_MS
  ) {
    const contactLocal = getLocalParts(candidateMs, input.contact.timeZone);
    if (contactLocal.minute % normalized.options.intervalMinutes !== 0) {
      continue;
    }
    if (
      quietContexts.some((context) => isQuietAt(candidateMs, context.timeZone, context.quietHours))
    ) {
      continue;
    }

    candidates.push({
      atMs: candidateMs,
      contactLocal,
      score: scoreCandidate(
        candidateMs,
        contactLocal,
        normalized.referenceTimeMs,
        searchEndMs,
        historyProfile,
        input,
        frequency.recentUnanswered,
        normalized.lastInteractionAtMs,
      ),
    });
  }

  if (candidates.length === 0) {
    const frequencyPreventsEligibility = frequency.earliestAtMs > searchEndMs;
    const blockers: BlockerDetail[] = frequencyPreventsEligibility
      ? [
          {
            code: 'FREQUENCY_CAP_REACHED',
            message: 'Frequency protection extends beyond the available search horizon.',
          },
        ]
      : [
          {
            code: 'NO_ELIGIBLE_WINDOW',
            message: 'Every candidate was outside the horizon or inside configured quiet hours.',
          },
        ];
    return blockedResult(
      blockers,
      frequency.nextEligibleAt,
      'No compliant candidate instant was available within the configured search horizon.',
      unique(normalized.warnings),
      makeReproducibility(0),
    );
  }

  candidates.sort((left, right) => right.score - left.score || left.atMs - right.atMs);
  const selected = selectSeparatedCandidates(
    candidates,
    normalized.options.alternativeCount + 1,
    normalized.options.minimumAlternativeSpacingMinutes,
  );
  if (selected.length < normalized.options.alternativeCount + 1) {
    normalized.warnings.push('LIMITED_ALTERNATIVE_WINDOWS');
  }

  const primaryCandidate = selected[0];
  if (primaryCandidate === undefined) {
    throw new Error(
      'Optimizer invariant failed: a non-empty candidate set had no primary candidate.',
    );
  }

  const reasonCodes = deriveReasonCodes(
    primaryCandidate,
    historyProfile,
    input,
    frequency,
    normalized.deadlineMs,
  );
  const reasons = reasonCodes.map((code) => ({ code, message: reasonMessage(code) }));
  const windows = selected.map((candidate) =>
    toRecommendedWindow(candidate, input.contact.timeZone, reasonCodes),
  );
  const primary = windows[0];
  if (primary === undefined) {
    throw new Error('Optimizer invariant failed: selected candidates could not be formatted.');
  }

  const confidence = calculateConfidence(historyProfile.sufficiency, candidates);
  const explanation = buildExplanation(
    primary,
    historyProfile,
    input,
    frequency,
    confidence,
    normalized.contactQuietHours === DEFAULT_CONTACT_QUIET_HOURS,
  );

  return {
    status: 'RECOMMENDED',
    primary,
    alternatives: windows.slice(1),
    confidence,
    dataSufficiency: historyProfile.sufficiency,
    historicalObservationCount: historyProfile.global.length,
    effectiveHistoricalObservationCount: round(historyProfile.effectiveCount, 2),
    reasonCodes,
    reasons,
    warnings: unique(normalized.warnings),
    explanation,
    algorithmVersion: OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
    reproducibility: makeReproducibility(candidates.length),
  };
}

function normalizeAndValidateInput(input: OutreachOptimizerInput): {
  referenceTimeMs: number;
  deadlineMs: number | null;
  history: NormalizedHistoricalOutcome[];
  recentOutreach: NormalizedRecentOutreach[];
  lastInteractionAtMs: number | null;
  contactQuietHours: readonly QuietHours[];
  frequencyPolicy: Required<FrequencyPolicy>;
  options: Required<OptimizerOptions>;
  warnings: OptimizerWarningCode[];
} {
  if (
    input.contact.id.trim() === '' ||
    input.workspace.id.trim() === '' ||
    input.campaign.id.trim() === ''
  ) {
    throw new TypeError('Contact, workspace, and campaign identifiers must be non-empty.');
  }
  assertTimeZone(input.contact.timeZone, 'contact.timeZone');
  assertTimeZone(input.workspace.timeZone, 'workspace.timeZone');
  if (input.userSchedule !== undefined) {
    assertTimeZone(input.userSchedule.timeZone, 'userSchedule.timeZone');
  }

  const referenceTimeMs = parseInstant(input.referenceTime, 'referenceTime');
  const deadlineMs =
    input.campaign.deadline === undefined
      ? null
      : parseInstant(input.campaign.deadline, 'campaign.deadline');

  const contactQuietHours = input.contact.quietHours ?? DEFAULT_CONTACT_QUIET_HOURS;
  validateQuietHours(contactQuietHours, 'contact.quietHours');
  validateQuietHours(input.workspace.quietHours, 'workspace.quietHours');
  if (input.userSchedule !== undefined) {
    validateQuietHours(input.userSchedule.quietHours, 'userSchedule.quietHours');
  }

  if (
    input.campaign.sequenceStage !== undefined &&
    (!Number.isInteger(input.campaign.sequenceStage) || input.campaign.sequenceStage < 1)
  ) {
    throw new TypeError('campaign.sequenceStage must be a positive integer.');
  }

  const options: Required<OptimizerOptions> = {
    horizonDays: input.options?.horizonDays ?? DEFAULT_OPTIONS.horizonDays,
    intervalMinutes: input.options?.intervalMinutes ?? DEFAULT_OPTIONS.intervalMinutes,
    alternativeCount: input.options?.alternativeCount ?? DEFAULT_OPTIONS.alternativeCount,
    minimumAlternativeSpacingMinutes:
      input.options?.minimumAlternativeSpacingMinutes ??
      DEFAULT_OPTIONS.minimumAlternativeSpacingMinutes,
  };
  if (
    !Number.isInteger(options.horizonDays) ||
    options.horizonDays < 1 ||
    options.horizonDays > 31
  ) {
    throw new TypeError('options.horizonDays must be an integer from 1 through 31.');
  }
  if (![15, 30, 60].includes(options.intervalMinutes)) {
    throw new TypeError('options.intervalMinutes must be 15, 30, or 60.');
  }
  if (![2, 3].includes(options.alternativeCount)) {
    throw new TypeError('options.alternativeCount must be 2 or 3.');
  }
  if (
    !Number.isInteger(options.minimumAlternativeSpacingMinutes) ||
    options.minimumAlternativeSpacingMinutes < options.intervalMinutes
  ) {
    throw new TypeError(
      'options.minimumAlternativeSpacingMinutes must be an integer at least as large as intervalMinutes.',
    );
  }

  const frequencyPolicy: Required<FrequencyPolicy> = {
    minimumHoursBetweenAttempts:
      input.frequencyPolicy?.minimumHoursBetweenAttempts ??
      DEFAULT_FREQUENCY_POLICY.minimumHoursBetweenAttempts,
    lookbackDays: input.frequencyPolicy?.lookbackDays ?? DEFAULT_FREQUENCY_POLICY.lookbackDays,
    maximumAttemptsInLookback:
      input.frequencyPolicy?.maximumAttemptsInLookback ??
      DEFAULT_FREQUENCY_POLICY.maximumAttemptsInLookback,
    maximumUnansweredAttempts:
      input.frequencyPolicy?.maximumUnansweredAttempts ??
      DEFAULT_FREQUENCY_POLICY.maximumUnansweredAttempts,
  };
  for (const [name, value] of Object.entries(frequencyPolicy)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`frequencyPolicy.${name} must be greater than zero.`);
    }
  }
  if (
    !Number.isInteger(frequencyPolicy.maximumAttemptsInLookback) ||
    !Number.isInteger(frequencyPolicy.maximumUnansweredAttempts)
  ) {
    throw new TypeError('Frequency caps must be integers.');
  }

  const history = (input.historicalOutcomes ?? []).map((outcome, index) => {
    const sentAtMs = parseInstant(outcome.sentAt, `historicalOutcomes[${index}].sentAt`);
    const respondedAtMs =
      outcome.respondedAt === undefined || outcome.respondedAt === null
        ? null
        : parseInstant(outcome.respondedAt, `historicalOutcomes[${index}].respondedAt`);
    if (sentAtMs > referenceTimeMs) {
      throw new TypeError(`historicalOutcomes[${index}].sentAt cannot be in the future.`);
    }
    if (respondedAtMs !== null && (respondedAtMs < sentAtMs || respondedAtMs > referenceTimeMs)) {
      throw new TypeError(
        `historicalOutcomes[${index}].respondedAt must be between sentAt and referenceTime.`,
      );
    }
    const timeZone = outcome.timeZone ?? input.contact.timeZone;
    assertTimeZone(timeZone, `historicalOutcomes[${index}].timeZone`);
    return {
      sentAtMs,
      respondedAtMs,
      sentLocal: getLocalParts(sentAtMs, timeZone),
      respondedLocal: respondedAtMs === null ? null : getLocalParts(respondedAtMs, timeZone),
      ...(outcome.contactId === undefined ? {} : { contactId: outcome.contactId }),
      ...(outcome.organizationId === undefined ? {} : { organizationId: outcome.organizationId }),
      ...(outcome.campaignId === undefined ? {} : { campaignId: outcome.campaignId }),
      ...(outcome.cohortId === undefined ? {} : { cohortId: outcome.cohortId }),
      ...(outcome.channel === undefined ? {} : { channel: outcome.channel }),
      timeZone,
    } satisfies NormalizedHistoricalOutcome;
  });
  history.sort((left, right) => left.sentAtMs - right.sentAtMs);

  const recentOutreach = (input.recentContactOutreach ?? []).map((outreach, index) => {
    const sentAtMs = parseInstant(outreach.sentAt, `recentContactOutreach[${index}].sentAt`);
    const respondedAtMs =
      outreach.respondedAt === undefined || outreach.respondedAt === null
        ? null
        : parseInstant(outreach.respondedAt, `recentContactOutreach[${index}].respondedAt`);
    if (sentAtMs > referenceTimeMs) {
      throw new TypeError(`recentContactOutreach[${index}].sentAt cannot be in the future.`);
    }
    if (respondedAtMs !== null && (respondedAtMs < sentAtMs || respondedAtMs > referenceTimeMs)) {
      throw new TypeError(
        `recentContactOutreach[${index}].respondedAt must be between sentAt and referenceTime.`,
      );
    }
    return { sentAtMs, respondedAtMs };
  });
  recentOutreach.sort((left, right) => left.sentAtMs - right.sentAtMs);

  const lastInteractionAtMs =
    input.lastInteractionAt === undefined
      ? null
      : parseInstant(input.lastInteractionAt, 'lastInteractionAt');
  if (lastInteractionAtMs !== null) {
    if (lastInteractionAtMs > referenceTimeMs) {
      throw new TypeError('lastInteractionAt cannot be in the future.');
    }
  }

  return {
    referenceTimeMs,
    deadlineMs,
    history,
    recentOutreach,
    lastInteractionAtMs,
    contactQuietHours,
    frequencyPolicy,
    options,
    warnings: [],
  };
}

function evaluateFrequency(
  referenceTimeMs: number,
  recentOutreach: readonly NormalizedRecentOutreach[],
  policy: Required<FrequencyPolicy>,
): FrequencyEvaluation {
  const lookbackStartMs = referenceTimeMs - policy.lookbackDays * DAY_MS;
  const inLookback = recentOutreach.filter(
    (outreach) => outreach.sentAtMs > lookbackStartMs && outreach.sentAtMs <= referenceTimeMs,
  );
  const unanswered = inLookback.filter((outreach) => outreach.respondedAtMs === null);
  const latest = recentOutreach.at(-1);
  const cooldownAtMs =
    latest === undefined
      ? referenceTimeMs + 1
      : latest.sentAtMs + policy.minimumHoursBetweenAttempts * HOUR_MS;

  if (unanswered.length >= policy.maximumUnansweredAttempts) {
    return {
      blocked: {
        code: 'UNANSWERED_OUTREACH_CAP_REACHED',
        message: `${unanswered.length} recent attempts remain unanswered; human review is required before more outreach.`,
      },
      earliestAtMs: Number.POSITIVE_INFINITY,
      nextEligibleAt: null,
      cooldownApplied: latest !== undefined && cooldownAtMs > referenceTimeMs,
      rollingCapApplied: inLookback.length >= policy.maximumAttemptsInLookback,
      recentUnanswered: unanswered.length,
    };
  }

  let capEligibilityMs = referenceTimeMs + 1;
  if (inLookback.length >= policy.maximumAttemptsInLookback) {
    const expiringAttemptIndex = inLookback.length - policy.maximumAttemptsInLookback;
    const expiringAttempt = inLookback[expiringAttemptIndex];
    if (expiringAttempt !== undefined) {
      capEligibilityMs = expiringAttempt.sentAtMs + policy.lookbackDays * DAY_MS;
    }
  }

  const earliestAtMs = Math.max(referenceTimeMs + 1, cooldownAtMs, capEligibilityMs);
  return {
    blocked: null,
    earliestAtMs,
    nextEligibleAt:
      earliestAtMs > referenceTimeMs + 1 ? new Date(earliestAtMs).toISOString() : null,
    cooldownApplied: latest !== undefined && cooldownAtMs > referenceTimeMs,
    rollingCapApplied: capEligibilityMs > referenceTimeMs + 1,
    recentUnanswered: unanswered.length,
  };
}

function createHistoryProfile(
  history: readonly NormalizedHistoricalOutcome[],
  input: OutreachOptimizerInput,
): HistoryProfile {
  const contact = history.filter((outcome) => outcome.contactId === input.contact.id);
  const campaign = history.filter((outcome) => outcome.campaignId === input.campaign.id);
  const organization =
    input.contact.organizationId === undefined
      ? []
      : history.filter((outcome) => outcome.organizationId === input.contact.organizationId);
  const cohort =
    input.contact.cohortId === undefined
      ? []
      : history.filter((outcome) => outcome.cohortId === input.contact.cohortId);

  const effectiveCount = history.reduce((total, outcome) => {
    if (outcome.contactId === input.contact.id) return total + 1;
    if (outcome.campaignId === input.campaign.id) return total + 0.7;
    if (
      input.contact.organizationId !== undefined &&
      outcome.organizationId === input.contact.organizationId
    ) {
      return total + 0.55;
    }
    if (input.contact.cohortId !== undefined && outcome.cohortId === input.contact.cohortId) {
      return total + 0.45;
    }
    return total + 0.2;
  }, 0);

  const sufficiency: DataSufficiency =
    history.length === 0
      ? 'INSUFFICIENT'
      : effectiveCount < 8
        ? 'LOW'
        : effectiveCount < 25
          ? 'MEDIUM'
          : 'HIGH';

  return { contact, campaign, organization, cohort, global: history, effectiveCount, sufficiency };
}

function scoreCandidate(
  candidateMs: number,
  local: LocalParts,
  referenceTimeMs: number,
  searchEndMs: number,
  profile: HistoryProfile,
  input: OutreachOptimizerInput,
  recentUnanswered: number,
  lastInteractionAtMs: number | null,
): number {
  const businessQuality = businessWindowScore(local);
  const scopeSignals: Array<{ value: number; weight: number }> = [];

  addScopeSignal(
    scopeSignals,
    profile.global,
    0.35,
    30,
    candidateMs,
    local,
    referenceTimeMs,
    input,
  );
  addScopeSignal(
    scopeSignals,
    profile.cohort,
    0.55,
    18,
    candidateMs,
    local,
    referenceTimeMs,
    input,
  );
  addScopeSignal(
    scopeSignals,
    profile.organization,
    0.65,
    15,
    candidateMs,
    local,
    referenceTimeMs,
    input,
  );
  addScopeSignal(
    scopeSignals,
    profile.campaign,
    0.75,
    15,
    candidateMs,
    local,
    referenceTimeMs,
    input,
  );
  addScopeSignal(scopeSignals, profile.contact, 1, 8, candidateMs, local, referenceTimeMs, input);

  const signalWeight = scopeSignals.reduce((total, signal) => total + signal.weight, 0);
  const historicalQuality =
    signalWeight === 0
      ? businessQuality
      : scopeSignals.reduce((total, signal) => total + signal.value * signal.weight, 0) /
        signalWeight;
  const historyBlend = clamp(profile.effectiveCount / (profile.effectiveCount + 15), 0, 0.62);
  const timingQuality = businessQuality * (1 - historyBlend) + historicalQuality * historyBlend;

  const elapsedFraction = clamp(
    (candidateMs - referenceTimeMs) / Math.max(searchEndMs - referenceTimeMs, HOUR_MS),
    0,
    1,
  );
  const freshness = 1 - elapsedFraction;
  const priority = input.campaign.priority ?? 'MEDIUM';
  const priorityDelayWeight: Readonly<Record<CampaignPriority, number>> = {
    LOW: 0.04,
    MEDIUM: 0.08,
    HIGH: 0.16,
    URGENT: 0.24,
  };
  const deadlineDays =
    input.campaign.deadline === undefined
      ? Number.POSITIVE_INFINITY
      : (parseInstant(input.campaign.deadline, 'campaign.deadline') - referenceTimeMs) / DAY_MS;
  const deadlineDelayWeight = deadlineDays <= 1 ? 0.16 : deadlineDays <= 3 ? 0.1 : 0;
  const stageDelayWeight = Math.min(
    Math.max((input.campaign.sequenceStage ?? 1) - 1, 0) * 0.015,
    0.06,
  );
  const delayWeight = clamp(
    priorityDelayWeight[priority] + deadlineDelayWeight + stageDelayWeight,
    0,
    0.45,
  );

  const preferredChannelAdjustment =
    input.contact.preferredChannel === undefined
      ? 0
      : input.contact.preferredChannel === input.campaign.channel
        ? 0.025
        : -0.025;
  const unansweredPenalty = Math.min(recentUnanswered * 0.015, 0.045);
  const hoursSinceLastInteraction =
    lastInteractionAtMs === null
      ? Number.POSITIVE_INFINITY
      : Math.max((candidateMs - lastInteractionAtMs) / HOUR_MS, 0);
  const recentInteractionPenalty =
    hoursSinceLastInteraction >= 48 ? 0 : (1 - hoursSinceLastInteraction / 48) * 0.05;
  const value =
    timingQuality * (1 - delayWeight) +
    freshness * delayWeight +
    preferredChannelAdjustment -
    unansweredPenalty -
    recentInteractionPenalty;
  return round(clamp(value, 0, 1) * 100, 2);
}

function addScopeSignal(
  signals: Array<{ value: number; weight: number }>,
  outcomes: readonly NormalizedHistoricalOutcome[],
  importance: number,
  fullReliabilityAt: number,
  candidateMs: number,
  candidateLocal: LocalParts,
  referenceTimeMs: number,
  input: OutreachOptimizerInput,
): void {
  if (outcomes.length === 0) return;
  signals.push({
    value: historicalSignal(
      outcomes,
      candidateMs,
      candidateLocal,
      referenceTimeMs,
      input.campaign.channel,
    ),
    weight: importance * Math.min(outcomes.length / fullReliabilityAt, 1),
  });
}

function historicalSignal(
  outcomes: readonly NormalizedHistoricalOutcome[],
  _candidateMs: number,
  candidateLocal: LocalParts,
  referenceTimeMs: number,
  channel: OutreachChannel,
): number {
  let attempts = 0;
  let replies = 0;
  let localAttempts = 0;
  let localReplies = 0;
  let responseAffinityTotal = 0;
  let responseAffinityWeight = 0;

  for (const outcome of outcomes) {
    const ageDays = Math.max((referenceTimeMs - outcome.sentAtMs) / DAY_MS, 0);
    const recencyWeight = 0.35 + 0.65 * Math.max(0, 1 - ageDays / 365);
    const channelWeight = outcome.channel === undefined || outcome.channel === channel ? 1 : 0.7;
    const observationWeight = recencyWeight * channelWeight;
    const affinity = weeklyAffinity(candidateLocal, outcome.sentLocal);
    attempts += observationWeight;
    localAttempts += observationWeight * affinity;
    if (outcome.respondedAtMs !== null) {
      replies += observationWeight;
      localReplies += observationWeight * affinity;
      if (outcome.respondedLocal === null) {
        throw new Error('Optimizer invariant failed: a response instant had no local-time parts.');
      }
      responseAffinityTotal +=
        weeklyAffinity(candidateLocal, outcome.respondedLocal) * observationWeight;
      responseAffinityWeight += observationWeight;
    }
  }

  const overallRate = (replies + 2) / (attempts + 8);
  const localRate = (localReplies + overallRate * 4) / (localAttempts + 4);
  const responseAffinity =
    responseAffinityWeight === 0 ? overallRate : responseAffinityTotal / responseAffinityWeight;
  return clamp(localRate * 0.55 + responseAffinity * 0.25 + overallRate * 0.2, 0, 1);
}

function weeklyAffinity(candidate: LocalParts, observed: LocalParts): number {
  const dayDifference = Math.abs(candidate.isoWeekday - observed.isoWeekday);
  const cyclicDayDifference = Math.min(dayDifference, 7 - dayDifference);
  const candidateMinutes = candidate.hour * 60 + candidate.minute;
  const observedMinutes = observed.hour * 60 + observed.minute;
  const hourDifference = Math.abs(candidateMinutes - observedMinutes) / 60;

  if (cyclicDayDifference === 0 && hourDifference <= 1) return 1;
  if (cyclicDayDifference === 0 && hourDifference <= 2.5) return 0.75;
  if (cyclicDayDifference === 1 && hourDifference <= 2) return 0.55;
  if (hourDifference <= 1.5) return 0.35;
  if (cyclicDayDifference <= 1) return 0.2;
  return 0.08;
}

function businessWindowScore(local: LocalParts): number {
  const minuteOfDay = local.hour * 60 + local.minute;
  const weekday = local.isoWeekday <= 5;
  if (!weekday) {
    if (minuteOfDay >= 10 * 60 && minuteOfDay < 14 * 60) return 0.38;
    if (minuteOfDay >= 8 * 60 && minuteOfDay < 18 * 60) return 0.24;
    return 0.08;
  }
  if (minuteOfDay >= 9 * 60 && minuteOfDay < 11 * 60 + 30) return 1;
  if (minuteOfDay >= 13 * 60 && minuteOfDay < 16 * 60) return 0.92;
  if (minuteOfDay >= 8 * 60 && minuteOfDay < 18 * 60) return 0.68;
  return 0.18;
}

function selectSeparatedCandidates(
  candidates: readonly Candidate[],
  desiredCount: number,
  spacingMinutes: number,
): Candidate[] {
  const selected: Candidate[] = [];
  const spacingMs = spacingMinutes * MINUTE_MS;
  for (const candidate of candidates) {
    if (selected.every((existing) => Math.abs(existing.atMs - candidate.atMs) >= spacingMs)) {
      selected.push(candidate);
      if (selected.length === desiredCount) break;
    }
  }
  return selected;
}

function deriveReasonCodes(
  _primary: Candidate,
  profile: HistoryProfile,
  input: OutreachOptimizerInput,
  frequency: FrequencyEvaluation,
  deadlineMs: number | null,
): OptimizerReasonCode[] {
  const codes: OptimizerReasonCode[] = ['CONTACT_TIMEZONE', 'QUIET_HOURS_RESPECTED'];
  if (profile.sufficiency === 'INSUFFICIENT') codes.push('DEFAULT_BUSINESS_WINDOW');
  if (profile.global.length > 0) codes.push('GLOBAL_HISTORY');
  if (profile.cohort.length > 0) codes.push('COHORT_HISTORY');
  if (profile.organization.length > 0) codes.push('ORGANIZATION_HISTORY');
  if (profile.campaign.length > 0) codes.push('CAMPAIGN_HISTORY');
  if (profile.contact.length > 0) codes.push('CONTACT_HISTORY');
  if (profile.global.some((outcome) => outcome.respondedAtMs !== null)) {
    codes.push('RESPONSE_TIME_PATTERN');
  }
  if (
    input.contact.preferredChannel !== undefined &&
    input.contact.preferredChannel === input.campaign.channel
  ) {
    codes.push('PREFERRED_CHANNEL');
  }
  if (frequency.cooldownApplied) codes.push('FREQUENCY_COOLDOWN');
  if (frequency.rollingCapApplied) codes.push('FREQUENCY_ROLLING_CAP');
  if (frequency.recentUnanswered > 0) codes.push('RECENT_UNANSWERED_OUTREACH');
  if (deadlineMs !== null) codes.push('CAMPAIGN_DEADLINE');
  if (input.campaign.priority === 'HIGH' || input.campaign.priority === 'URGENT') {
    codes.push('HIGH_PRIORITY');
  }
  if ((input.campaign.sequenceStage ?? 1) > 1) codes.push('SEQUENCE_STAGE');
  if (input.lastInteractionAt !== undefined) codes.push('TIME_SINCE_LAST_INTERACTION');

  // Stabilize reason ordering while keeping the two universal constraints first.
  return unique(codes);
}

function reasonMessage(code: OptimizerReasonCode): string {
  const messages: Readonly<Record<OptimizerReasonCode, string>> = {
    CAMPAIGN_DEADLINE:
      'Earlier eligible windows received more weight before the campaign deadline.',
    CAMPAIGN_HISTORY: 'Campaign-level reply outcomes contributed a smoothed timing signal.',
    COHORT_HISTORY: 'Similar-contact history was used as a fallback signal.',
    CONTACT_HISTORY: 'The contact has relevant prior outreach behavior.',
    CONTACT_TIMEZONE: 'The instant is presented and scored in the contact timezone.',
    DEFAULT_BUSINESS_WINDOW:
      'A weekday daytime fallback was used because historical data was unavailable.',
    FREQUENCY_COOLDOWN: 'Candidates before the frequency cooldown expired were excluded.',
    FREQUENCY_ROLLING_CAP:
      'The search began after enough prior attempts aged out of the rolling frequency window.',
    GLOBAL_HISTORY: 'Workspace-provided historical outcomes contributed a weak baseline.',
    HIGH_PRIORITY: 'Campaign priority increased the value of earlier compliant windows.',
    ORGANIZATION_HISTORY: 'Organization-level reply outcomes contributed a smoothed timing signal.',
    PREFERRED_CHANNEL: 'The campaign channel matches the contact preference.',
    QUIET_HOURS_RESPECTED: 'Contact, workspace, and user quiet-hour rules were enforced.',
    RECENT_UNANSWERED_OUTREACH:
      'Recent unanswered attempts reduced the score without exceeding the hard cap.',
    RESPONSE_TIME_PATTERN: 'Observed response timestamps influenced day-and-hour affinity.',
    SEQUENCE_STAGE: 'Sequence stage slightly increased the value of timely follow-up.',
    TIME_SINCE_LAST_INTERACTION:
      'Very recent interactions were down-weighted to avoid an unnecessarily fast follow-up.',
  };
  return messages[code];
}

function buildExplanation(
  primary: RecommendedWindow,
  profile: HistoryProfile,
  input: OutreachOptimizerInput,
  frequency: FrequencyEvaluation,
  confidence: number,
  defaultQuietHoursApplied: boolean,
): string {
  const historyText =
    profile.sufficiency === 'INSUFFICIENT'
      ? 'No usable history was supplied, so a conservative weekday business-hours fallback drove the score.'
      : `${profile.global.length} historical outcomes (${round(profile.effectiveCount, 2)} effective after scope weighting) were hierarchically smoothed across contact, campaign, organization, cohort, and global signals.`;
  const frequencyText =
    frequency.cooldownApplied || frequency.rollingCapApplied
      ? ' The search began only after contact-level frequency protections allowed another attempt.'
      : '';
  const quietText = defaultQuietHoursApplied
    ? " Faro's default 20:00-08:00 contact quiet period was applied alongside configured workspace and user rules."
    : ' Configured contact, workspace, and user quiet-hour rules were applied.';
  const channelText =
    input.contact.preferredChannel === input.campaign.channel
      ? ` The selected ${input.campaign.channel.toLowerCase()} channel matches the contact preference.`
      : '';
  return `Recommend ${primary.contactLocal.weekday} ${primary.contactLocal.date} at ${primary.contactLocal.time} (${primary.contactLocal.timeZone}), score ${primary.score}/100. ${historyText}${frequencyText}${quietText}${channelText} Confidence is ${confidence}.`;
}

function calculateConfidence(
  sufficiency: DataSufficiency,
  sortedCandidates: readonly Candidate[],
): number {
  const base: Readonly<Record<DataSufficiency, number>> = {
    INSUFFICIENT: 0.25,
    LOW: 0.39,
    MEDIUM: 0.62,
    HIGH: 0.8,
  };
  const first = sortedCandidates[0];
  const second = sortedCandidates[1];
  const separation =
    first === undefined || second === undefined
      ? 0
      : Math.min((first.score - second.score) / 100, 0.08);
  return round(clamp(base[sufficiency] + separation, 0, 0.9), 3);
}

function toRecommendedWindow(
  candidate: Candidate,
  timeZone: string,
  reasonCodes: readonly OptimizerReasonCode[],
): RecommendedWindow {
  return {
    recommendedAt: new Date(candidate.atMs).toISOString(),
    contactLocal: {
      date: `${candidate.contactLocal.year.toString().padStart(4, '0')}-${candidate.contactLocal.month.toString().padStart(2, '0')}-${candidate.contactLocal.day.toString().padStart(2, '0')}`,
      time: `${candidate.contactLocal.hour.toString().padStart(2, '0')}:${candidate.contactLocal.minute.toString().padStart(2, '0')}`,
      weekday: candidate.contactLocal.weekday,
      timeZone,
    },
    score: candidate.score,
    reasonCodes,
  };
}

function blockedResult(
  blockers: readonly BlockerDetail[],
  nextEligibleAt: string | null,
  explanation: string,
  warnings: readonly OptimizerWarningCode[],
  reproducibility: ReproducibilityMetadata,
): BlockedOutreachRecommendation {
  return {
    status: 'BLOCKED',
    blockers,
    nextEligibleAt,
    warnings: unique(warnings),
    explanation,
    algorithmVersion: OUTREACH_OPTIMIZER_ALGORITHM_VERSION,
    reproducibility,
  };
}

function getLocalParts(instantMs: number, timeZone: string): LocalParts {
  let formatter = formatterCache.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (part === undefined) throw new Error(`Intl formatter omitted ${type}.`);
    return part;
  };
  const weekdayShort = value('weekday');
  const isoWeekday = WEEKDAY_TO_ISO[weekdayShort];
  if (isoWeekday === undefined) throw new Error(`Unexpected weekday from Intl: ${weekdayShort}.`);
  const weekday = WEEKDAY_LONG[weekdayShort];
  if (weekday === undefined) throw new Error(`Unexpected weekday from Intl: ${weekdayShort}.`);
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    isoWeekday,
    weekday,
  };
}

function isQuietAt(instantMs: number, timeZone: string, schedules: readonly QuietHours[]): boolean {
  const local = getLocalParts(instantMs, timeZone);
  const minuteOfDay = local.hour * 60 + local.minute;
  return schedules.some((schedule) => {
    const start = localTimeToMinutes(schedule.start);
    const end = localTimeToMinutes(schedule.end);
    const days = schedule.days ?? ([1, 2, 3, 4, 5, 6, 7] as const);
    if (start === end) return days.includes(local.isoWeekday);
    if (start < end) {
      return days.includes(local.isoWeekday) && minuteOfDay >= start && minuteOfDay < end;
    }
    if (minuteOfDay >= start) return days.includes(local.isoWeekday);
    const previousDay = (local.isoWeekday === 1 ? 7 : local.isoWeekday - 1) as IsoWeekday;
    return minuteOfDay < end && days.includes(previousDay);
  });
}

function parseInstant(value: string, field: string): number {
  if (!ISO_INSTANT_PATTERN.test(value)) {
    throw new TypeError(`${field} must be an ISO-8601 instant with an explicit offset.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${field} is not a valid instant.`);
  }
  return parsed;
}

function assertTimeZone(timeZone: string, field: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new TypeError(`${field} must be a valid IANA timezone.`);
  }
}

function validateQuietHours(schedules: readonly QuietHours[], field: string): void {
  schedules.forEach((schedule, index) => {
    localTimeToMinutes(schedule.start, `${field}[${index}].start`);
    localTimeToMinutes(schedule.end, `${field}[${index}].end`);
    if (
      schedule.days !== undefined &&
      schedule.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    ) {
      throw new TypeError(`${field}[${index}].days must contain only ISO weekdays 1 through 7.`);
    }
  });
}

function localTimeToMinutes(value: string, field = 'quiet-hours time'): number {
  const match = LOCAL_TIME_PATTERN.exec(value);
  const hourText = match?.[1];
  const minuteText = match?.[2];
  if (hourText === undefined || minuteText === undefined) {
    throw new TypeError(`${field} must use HH:mm format.`);
  }
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) {
    throw new TypeError(`${field} must be a valid local wall-clock time.`);
  }
  return hour * 60 + minute;
}

function ceilToResolution(instantMs: number, resolutionMinutes: number): number {
  const resolutionMs = resolutionMinutes * MINUTE_MS;
  return Math.ceil(instantMs / resolutionMs) * resolutionMs;
}

function fingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `fnv1a64-${hash.toString(16).padStart(16, '0')}`;
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '"[undefined]"';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'bigint') return `"${value.toString()}n"`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
