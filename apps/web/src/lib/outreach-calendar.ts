import {
  optimizeOutreachWindow,
  type HistoricalOutreachOutcome,
  type OutreachOptimizerResult,
} from '@faro/optimizer';

export interface OutreachCalendarInteraction {
  contactId: string;
  direction: string;
  occurredAt: string;
}

export interface GeneralCompanyPlanInput {
  campaign?: { endAt: string | null; id: string } | null;
  companyContactIds: readonly string[];
  interactions: readonly OutreachCalendarInteraction[];
  referenceTime: string;
  workspace: {
    id: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    timeZone: string;
  };
}

export interface CalendarDay {
  date: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  quarterMarker: string | null;
  trackedEmails: number;
}

export interface OutreachDaySignal {
  date: string;
  label: 'Lower fit' | 'Limited fit' | 'Moderate fit' | 'Strong fit' | 'Best fit';
  level: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
  score: number;
}

export function dateInTimeZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * Keeps a browser planning session from using an older server snapshot after time has advanced.
 * The server reference remains the floor so a slow or incorrect client clock cannot move planning
 * backward.
 */
export function currentPlanningReferenceTime(
  serverReferenceTime: string,
  observedCurrentTime: string | Date,
): string {
  const serverTime = new Date(serverReferenceTime);
  const currentTime = new Date(observedCurrentTime);
  if (Number.isNaN(serverTime.getTime())) {
    throw new Error('serverReferenceTime must be a valid instant');
  }
  if (Number.isNaN(currentTime.getTime())) {
    throw new Error('observedCurrentTime must be a valid instant');
  }
  return new Date(Math.max(serverTime.getTime(), currentTime.getTime())).toISOString();
}

export function isFuturePlanningInstant(
  candidateTime: string,
  currentTime: string | Date,
): boolean {
  const candidate = new Date(candidateTime).getTime();
  const current = new Date(currentTime).getTime();
  return Number.isFinite(candidate) && Number.isFinite(current) && candidate > current;
}

export function companyOutreachHistory(
  interactions: readonly OutreachCalendarInteraction[],
  companyContactIds: readonly string[],
  timeZone: string,
): HistoricalOutreachOutcome[] {
  const companyContacts = new Set(companyContactIds);
  const byContact = new Map<string, OutreachCalendarInteraction[]>();
  interactions
    .filter((interaction) => companyContacts.has(interaction.contactId))
    .forEach((interaction) => {
      const current = byContact.get(interaction.contactId) ?? [];
      current.push(interaction);
      byContact.set(interaction.contactId, current);
    });

  return [...byContact.entries()].flatMap(([contactId, contactInteractions]) => {
    const ordered = contactInteractions
      .slice()
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    return ordered.flatMap((interaction, index) => {
      if (interaction.direction !== 'OUTBOUND') return [];
      const nextOutboundIndex = ordered.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && candidate.direction === 'OUTBOUND',
      );
      const response = ordered.find(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          (nextOutboundIndex === -1 || candidateIndex < nextOutboundIndex) &&
          candidate.direction === 'INBOUND',
      );
      return [
        {
          channel: 'EMAIL' as const,
          contactId,
          respondedAt: response?.occurredAt ?? null,
          sentAt: interaction.occurredAt,
          timeZone,
        },
      ];
    });
  });
}

export function generalCompanyOutreachPlan(
  input: GeneralCompanyPlanInput,
): OutreachOptimizerResult {
  const campaignDeadline =
    input.campaign?.endAt && Date.parse(input.campaign.endAt) > Date.parse(input.referenceTime)
      ? input.campaign.endAt
      : undefined;
  return optimizeOutreachWindow({
    campaign: {
      channel: 'EMAIL',
      deadline: campaignDeadline,
      id: input.campaign?.id ?? 'general-company-planning',
      priority: 'MEDIUM',
      sequenceStage: 1,
    },
    contact: {
      cohortId: 'general-companies',
      consentStatus: 'IMPLIED',
      id: 'general-company-planning',
      preferredChannel: 'EMAIL',
      quietHours: [{ end: '08:00', start: '20:00' }],
      suppressed: false,
      timeZone: input.workspace.timeZone,
    },
    historicalOutcomes: companyOutreachHistory(
      input.interactions,
      input.companyContactIds,
      input.workspace.timeZone,
    ),
    options: {
      alternativeCount: 3,
      horizonDays: 31,
      intervalMinutes: 30,
      minimumAlternativeSpacingMinutes: 1_440,
    },
    referenceTime: input.referenceTime,
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
}

const WEEKDAY_BASELINE = [
  { label: 'Sunday', score: 22 },
  { label: 'Monday', score: 65 },
  { label: 'Tuesday', score: 78 },
  { label: 'Wednesday', score: 80 },
  { label: 'Thursday', score: 76 },
  { label: 'Friday', score: 58 },
  { label: 'Saturday', score: 24 },
] as const;

function quarterBudgetSignal(date: string) {
  const current = new Date(`${date}T12:00:00.000Z`);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const quarterIndex = Math.floor(month / 3);
  const currentStart = new Date(Date.UTC(year, quarterIndex * 3, 1, 12));
  const nextStart =
    quarterIndex === 3
      ? new Date(Date.UTC(year + 1, 0, 1, 12))
      : new Date(Date.UTC(year, (quarterIndex + 1) * 3, 1, 12));
  const daysSinceStart = Math.round((current.getTime() - currentStart.getTime()) / 86_400_000);
  const daysUntilNext = Math.round((nextStart.getTime() - current.getTime()) / 86_400_000);
  const currentQuarter = `Q${quarterIndex + 1}`;
  const nextQuarter = `Q${quarterIndex === 3 ? 1 : quarterIndex + 2}`;

  if (daysSinceStart === 0) {
    return {
      adjustment: 14,
      reason: `${currentQuarter} begins on this date, so Faro treats it as a useful new-quarter budget-planning cue.`,
    };
  }
  if (daysSinceStart <= 10) {
    return {
      adjustment: 10,
      reason: `This is day ${daysSinceStart + 1} of ${currentQuarter}, when a new-quarter introduction may align with fresh planning conversations.`,
    };
  }
  if (daysUntilNext >= 7 && daysUntilNext <= 21) {
    return {
      adjustment: 12,
      reason: `This is ${daysUntilNext} days before ${nextQuarter} begins, giving a company time to consider the request during pre-quarter planning.`,
    };
  }
  if (daysUntilNext < 7) {
    return {
      adjustment: 7,
      reason: `${nextQuarter} begins in ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}, so the date receives a smaller near-quarter planning boost.`,
    };
  }
  return {
    adjustment: 0,
    reason:
      'This date is outside Faro’s pre-quarter and early-quarter planning windows, so no budget-timing boost was added.',
  };
}

function signalLevel(score: number): Pick<OutreachDaySignal, 'label' | 'level'> {
  if (score >= 85) return { label: 'Best fit', level: 5 };
  if (score >= 70) return { label: 'Strong fit', level: 4 };
  if (score >= 55) return { label: 'Moderate fit', level: 3 };
  if (score >= 40) return { label: 'Limited fit', level: 2 };
  return { label: 'Lower fit', level: 1 };
}

export function companyOutreachDaySignals(
  dates: readonly string[],
  input: GeneralCompanyPlanInput,
  plan: OutreachOptimizerResult,
): OutreachDaySignal[] {
  const history = companyOutreachHistory(
    input.interactions,
    input.companyContactIds,
    input.workspace.timeZone,
  );
  const referenceDate = dateInTimeZone(input.referenceTime, input.workspace.timeZone);
  const deadlineDate = input.campaign?.endAt
    ? dateInTimeZone(input.campaign.endAt, input.workspace.timeZone)
    : null;
  const recommendedWindows =
    plan.status === 'RECOMMENDED' ? [plan.primary, ...plan.alternatives] : [];

  return dates.map((date) => {
    if (date < referenceDate) {
      return {
        date,
        label: 'Lower fit',
        level: 1,
        reasons: ['This date has passed, so it is shown only as historical calendar context.'],
        score: 8,
      };
    }
    if (deadlineDate && date > deadlineDate) {
      return {
        date,
        label: 'Lower fit',
        level: 1,
        reasons: ['This date falls after the selected campaign deadline.'],
        score: 8,
      };
    }

    const calendarDate = new Date(`${date}T12:00:00.000Z`);
    const weekday = WEEKDAY_BASELINE[calendarDate.getUTCDay()] ?? WEEKDAY_BASELINE[0];
    let score = weekday.score;
    const reasons = [
      `${weekday.label} starts at ${weekday.score}/100 in Faro’s conservative general-company weekday baseline.`,
    ];

    const sameWeekdayHistory = history.filter(
      (outcome) =>
        new Date(
          `${dateInTimeZone(outcome.sentAt, outcome.timeZone ?? input.workspace.timeZone)}T12:00:00.000Z`,
        ).getUTCDay() === calendarDate.getUTCDay(),
    );
    if (sameWeekdayHistory.length) {
      const replies = sameWeekdayHistory.filter((outcome) => outcome.respondedAt).length;
      const responseRate = replies / sameWeekdayHistory.length;
      const historyWeight = Math.min(16, 4 + sameWeekdayHistory.length * 2);
      const historyAdjustment = Math.round((responseRate - 0.35) * historyWeight);
      score += historyAdjustment;
      reasons.push(
        `${replies} of ${sameWeekdayHistory.length} tracked company outreach attempt${
          sameWeekdayHistory.length === 1 ? '' : 's'
        } on ${weekday.label}s received a later reply, changing the day score by ${
          historyAdjustment >= 0 ? '+' : ''
        }${historyAdjustment}.`,
      );
    } else {
      reasons.push(
        `There is no tracked ${weekday.label} company reply history yet, so Faro keeps the weekday baseline instead of inventing a response pattern.`,
      );
    }

    const budgetSignal = quarterBudgetSignal(date);
    score += budgetSignal.adjustment;
    reasons.push(budgetSignal.reason);

    const recommendedRank = recommendedWindows.findIndex(
      (window) => window.contactLocal.date === date,
    );
    if (recommendedRank === 0) {
      score += 28;
      reasons.push(
        'Faro’s quiet-hour, timezone, history, and campaign-deadline optimizer selected its best send window on this date.',
      );
    } else if (recommendedRank > 0) {
      const adjustment = Math.max(6, 14 - recommendedRank * 2);
      score += adjustment;
      reasons.push(
        `The optimizer selected this as alternative day ${recommendedRank}, adding ${adjustment} points.`,
      );
    }

    const normalizedScore = Math.max(1, Math.min(100, Math.round(score)));
    return {
      date,
      ...signalLevel(normalizedScore),
      reasons,
      score: normalizedScore,
    };
  });
}

export function quarterMarker(date: string): string | null {
  const [, rawMonth, rawDay] = date.split('-');
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const quarterStart = new Map([
    [1, 'Q1 begins'],
    [4, 'Q2 begins'],
    [7, 'Q3 begins'],
    [10, 'Q4 begins'],
  ]);
  if (day === 1 && quarterStart.has(month)) return quarterStart.get(month) ?? null;
  const quarterEnd = new Map([
    [3, 'Q1 ends'],
    [6, 'Q2 ends'],
    [9, 'Q3 ends'],
    [12, 'Q4 ends'],
  ]);
  if (quarterEnd.has(month)) {
    const year = Number(date.slice(0, 4));
    const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day === finalDay) return quarterEnd.get(month) ?? null;
  }
  return null;
}

export function calendarMonth(
  year: number,
  month: number,
  interactions: readonly OutreachCalendarInteraction[],
  timeZone: string,
): CalendarDay[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - mondayOffset));
  const activity = new Map<string, number>();
  interactions.forEach((interaction) => {
    const date = dateInTimeZone(interaction.occurredAt, timeZone);
    activity.set(date, (activity.get(date) ?? 0) + 1);
  });

  return Array.from({ length: 42 }, (_, offset) => {
    const current = new Date(start.getTime() + offset * 86_400_000);
    const date = current.toISOString().slice(0, 10);
    return {
      date,
      dayOfMonth: current.getUTCDate(),
      inCurrentMonth: current.getUTCMonth() === month,
      quarterMarker: quarterMarker(date),
      trackedEmails: activity.get(date) ?? 0,
    };
  });
}
