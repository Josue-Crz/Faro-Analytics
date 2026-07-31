'use client';

import { Calendar, ChevronLeft, ChevronRight, Launch, Time } from '@carbon/icons-react';
import { Button } from '@carbon/react';
import { useEffect, useMemo, useState } from 'react';

import {
  calendarMonth,
  companyOutreachDaySignals,
  companyOutreachHistory,
  currentPlanningReferenceTime,
  dateInTimeZone,
  generalCompanyOutreachPlan,
  OUTREACH_TIMING_BENCHMARK,
  outreachBenchmarkAlignment,
  type OutreachCalendarInteraction,
} from '@/lib/outreach-calendar';

interface OutreachPlanningCalendarProps {
  campaign?: { endAt: string | null; id: string; name: string } | null;
  companyContactIds: string[];
  interactions: OutreachCalendarInteraction[];
  referenceTime: string;
  schedules: Array<{
    campaignId: string;
    contactId: string;
    contactName: string;
    dueAt: string;
    id: string;
    initialAt: string;
  }>;
  workspace: {
    id: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    timeZone: string;
  };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function calendarDateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
    ...options,
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function timeLabel(time: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`1970-01-01T${time}:00.000Z`));
}

function timeRange(start: string, intervalMinutes: number) {
  const [rawHour, rawMinute] = start.split(':');
  const startMinutes = Number(rawHour) * 60 + Number(rawMinute);
  const endMinutes = (startMinutes + intervalMinutes) % (24 * 60);
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(
    endMinutes % 60,
  ).padStart(2, '0')}`;
  return `${timeLabel(start)}–${timeLabel(end)}`;
}

export function OutreachPlanningCalendar({
  campaign,
  companyContactIds,
  interactions,
  referenceTime,
  schedules,
  workspace,
}: OutreachPlanningCalendarProps) {
  const [observedCurrentTime, setObservedCurrentTime] = useState(() => Date.parse(referenceTime));
  useEffect(() => {
    const refreshClock = () => setObservedCurrentTime(Date.now());
    const initialRefresh = window.setTimeout(refreshClock, 0);
    const refreshInterval = window.setInterval(refreshClock, 30_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(refreshInterval);
    };
  }, []);
  const activeReferenceTime = currentPlanningReferenceTime(
    referenceTime,
    new Date(observedCurrentTime),
  );
  const planningInput = useMemo(
    () => ({
      campaign,
      companyContactIds,
      interactions,
      referenceTime: activeReferenceTime,
      workspace,
    }),
    [activeReferenceTime, campaign, companyContactIds, interactions, workspace],
  );
  const plan = useMemo(() => generalCompanyOutreachPlan(planningInput), [planningInput]);
  const historicalOutcomes = useMemo(
    () => companyOutreachHistory(interactions, companyContactIds, workspace.timeZone),
    [companyContactIds, interactions, workspace.timeZone],
  );
  const historicalReplies = historicalOutcomes.filter((outcome) => outcome.respondedAt).length;
  const benchmarkAlignment =
    plan.status === 'RECOMMENDED' ? outreachBenchmarkAlignment(plan.primary.contactLocal) : null;
  const initialDate =
    plan.status === 'RECOMMENDED'
      ? plan.primary.contactLocal.date
      : dateInTimeZone(activeReferenceTime, workspace.timeZone);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = initialDate.split('-').map(Number);
    return { month: (month ?? 1) - 1, year: year ?? new Date().getUTCFullYear() };
  });
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const days = useMemo(
    () => calendarMonth(visibleMonth.year, visibleMonth.month, interactions, workspace.timeZone),
    [interactions, visibleMonth, workspace.timeZone],
  );
  const currentDate = dateInTimeZone(activeReferenceTime, workspace.timeZone);
  const daySignals = useMemo(
    () =>
      companyOutreachDaySignals(
        days.map((day) => day.date),
        planningInput,
        plan,
      ),
    [days, plan, planningInput],
  );
  const signalsByDate = new Map(daySignals.map((signal) => [signal.date, signal]));
  const recommendedWindows =
    plan.status === 'RECOMMENDED' ? [plan.primary, ...plan.alternatives] : [];
  const windowsByDate = new Map<string, typeof recommendedWindows>();
  recommendedWindows.forEach((window) => {
    windowsByDate.set(window.contactLocal.date, [
      ...(windowsByDate.get(window.contactLocal.date) ?? []),
      window,
    ]);
  });
  const selectedDay = days.find((day) => day.date === selectedDate);
  const selectedSignal = signalsByDate.get(selectedDate);
  const selectedWindows = windowsByDate.get(selectedDate) ?? [];
  const scheduledEvents = schedules.flatMap((schedule) => [
    {
      at: schedule.initialAt,
      contactId: schedule.contactId,
      contactName: schedule.contactName,
      id: `${schedule.id}:initial`,
      kind: 'Initial contact' as const,
    },
    {
      at: schedule.dueAt,
      contactId: schedule.contactId,
      contactName: schedule.contactName,
      id: `${schedule.id}:follow-up`,
      kind: 'Follow-up' as const,
    },
  ]);
  const scheduleByDate = new Map<string, typeof scheduledEvents>();
  for (const event of scheduledEvents) {
    const date = dateInTimeZone(event.at, workspace.timeZone);
    scheduleByDate.set(date, [...(scheduleByDate.get(date) ?? []), event]);
  }
  const selectedScheduledEvents = scheduleByDate.get(selectedDate) ?? [];
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1)));

  function moveMonth(offset: number) {
    const target = new Date(Date.UTC(visibleMonth.year, visibleMonth.month + offset, 1));
    setVisibleMonth({ month: target.getUTCMonth(), year: target.getUTCFullYear() });
  }

  function showDate(date: string) {
    const [year, month] = date.split('-').map(Number);
    setVisibleMonth({ month: (month ?? 1) - 1, year: year ?? visibleMonth.year });
    setSelectedDate(date);
  }

  return (
    <div className="outreach-calendar">
      <div className="outreach-calendar__summary">
        <div className="outreach-calendar__summary-icon" aria-hidden>
          <Calendar size={24} />
        </div>
        <div>
          <p className="outreach-calendar__eyebrow">Optimized company outreach</p>
          {plan.status === 'RECOMMENDED' ? (
            <>
              <h3>
                {plan.primary.contactLocal.weekday},{' '}
                {calendarDateLabel(plan.primary.contactLocal.date, {
                  day: 'numeric',
                  month: 'short',
                  year: undefined,
                })}{' '}
                · {timeRange(plan.primary.contactLocal.time, plan.reproducibility.intervalMinutes)}
              </h3>
              <p>
                General company planning in {plan.primary.contactLocal.timeZone}
                {campaign ? ` for ${campaign.name}` : ''}. Select a day to inspect it.
              </p>
            </>
          ) : (
            <>
              <h3>No eligible planning window</h3>
              <p>{plan.explanation}</p>
            </>
          )}
        </div>
      </div>

      <div className="outreach-calendar__toolbar">
        <div>
          <p className="outreach-calendar__month" aria-live="polite">
            {monthLabel}
          </p>
          <p className="outreach-calendar__timezone">Workspace time · {workspace.timeZone}</p>
        </div>
        <div className="outreach-calendar__controls">
          <Button
            hasIconOnly
            iconDescription="Previous month"
            kind="ghost"
            onClick={() => moveMonth(-1)}
            renderIcon={ChevronLeft}
            size="sm"
          />
          <Button kind="ghost" onClick={() => showDate(currentDate)} size="sm">
            Today
          </Button>
          {plan.status === 'RECOMMENDED' ? (
            <Button kind="ghost" onClick={() => showDate(plan.primary.contactLocal.date)} size="sm">
              Best window
            </Button>
          ) : null}
          <Button
            hasIconOnly
            iconDescription="Next month"
            kind="ghost"
            onClick={() => moveMonth(1)}
            renderIcon={ChevronRight}
            size="sm"
          />
        </div>
      </div>

      <div className="outreach-calendar__signature">
        <div>
          <strong>Outreach day signature</strong>
          <span>Darker blue indicates a weaker fit; brighter blue indicates a stronger fit.</span>
        </div>
        <div
          aria-label="Opportunity scale from lower fit to best fit"
          className="outreach-calendar__signature-scale"
        >
          {[1, 2, 3, 4, 5].map((level) => (
            <i
              aria-hidden
              className={`outreach-calendar__signature-step outreach-calendar__signature-step--${level}`}
              key={level}
            />
          ))}
          <span>Lower fit</span>
          <span>Best fit</span>
        </div>
      </div>

      <div className="outreach-calendar__scroll" tabIndex={0}>
        <div
          aria-label={`${monthLabel} company outreach planning calendar`}
          className="outreach-calendar__calendar"
          role="grid"
        >
          <div className="outreach-calendar__weekdays" role="row">
            {WEEKDAYS.map((weekday) => (
              <div className="outreach-calendar__weekday" key={weekday} role="columnheader">
                {weekday}
              </div>
            ))}
          </div>
          <div className="outreach-calendar__grid" role="rowgroup">
            {Array.from({ length: 6 }, (_, rowIndex) => (
              <div className="outreach-calendar__row" key={rowIndex} role="row">
                {days.slice(rowIndex * 7, rowIndex * 7 + 7).map((day) => {
                  const signal = signalsByDate.get(day.date);
                  const dateWindows = windowsByDate.get(day.date) ?? [];
                  const dateSchedule = scheduleByDate.get(day.date) ?? [];
                  const primaryDay =
                    plan.status === 'RECOMMENDED' && day.date === plan.primary.contactLocal.date;
                  const alternativeRanks = dateWindows
                    .map((window) => recommendedWindows.indexOf(window))
                    .filter((rank) => rank > 0);
                  const details = [
                    calendarDateLabel(day.date, { weekday: 'long' }),
                    signal ? `${signal.label}, opportunity score ${signal.score} out of 100` : null,
                    primaryDay ? 'best outreach window' : null,
                    alternativeRanks.length ? `alternative ${alternativeRanks.join(', ')}` : null,
                    dateSchedule.length
                      ? `${dateSchedule.length} assigned outreach ${
                          dateSchedule.length === 1 ? 'event' : 'events'
                        }`
                      : null,
                    day.quarterMarker,
                    day.trackedEmails
                      ? `${day.trackedEmails} tracked email${day.trackedEmails === 1 ? '' : 's'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div className="outreach-calendar__gridcell" key={day.date} role="gridcell">
                      <button
                        aria-current={day.date === currentDate ? 'date' : undefined}
                        aria-label={details}
                        aria-pressed={selectedDate === day.date}
                        className={[
                          'outreach-calendar__day',
                          day.inCurrentMonth ? '' : 'outreach-calendar__day--outside',
                          selectedDate === day.date ? 'outreach-calendar__day--selected' : '',
                          primaryDay ? 'outreach-calendar__day--recommended' : '',
                          signal ? `outreach-calendar__day--signal-${signal.level}` : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSelectedDate(day.date)}
                        type="button"
                      >
                        <span className="outreach-calendar__date">{day.dayOfMonth}</span>
                        {signal ? (
                          <span className="outreach-calendar__score">{signal.score}</span>
                        ) : null}
                        {primaryDay ? (
                          <span className="outreach-calendar__tag">Best</span>
                        ) : alternativeRanks.length ? (
                          <span className="outreach-calendar__tag">
                            Alt {alternativeRanks.join('/')}
                          </span>
                        ) : null}
                        {dateSchedule.length ? (
                          <span className="outreach-calendar__schedule">
                            {dateSchedule.length} assigned
                          </span>
                        ) : null}
                        {day.quarterMarker ? (
                          <span className="outreach-calendar__quarter">{day.quarterMarker}</span>
                        ) : null}
                        {day.trackedEmails ? (
                          <span className="outreach-calendar__activity">
                            {day.trackedEmails} email{day.trackedEmails === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="outreach-calendar__legend" aria-label="Calendar legend">
        <span>Best / Alt tags · optimizer-selected send windows</span>
        <span>Assigned · saved initial contacts and follow-ups</span>
        <span>Q begins / Q ends · quarter boundary</span>
        <span>Email count · tracked activity</span>
      </div>

      <section aria-live="polite" className="outreach-calendar__selected">
        <h4>{calendarDateLabel(selectedDate, { weekday: 'long' })}</h4>
        {selectedSignal ? (
          <>
            <p className="outreach-calendar__selected-score">
              <strong>
                {selectedSignal.label} · {selectedSignal.score}/100
              </strong>
            </p>
            <ul>
              {selectedSignal.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </>
        ) : null}
        {selectedWindows.length ? (
          <ul>
            {selectedWindows.map((window) => {
              const rank = recommendedWindows.indexOf(window);
              return (
                <li key={window.recommendedAt}>
                  <Time aria-hidden size={16} />
                  <strong>{rank === 0 ? 'Best window' : `Alternative ${rank}`}:</strong>{' '}
                  {timeRange(window.contactLocal.time, plan.reproducibility.intervalMinutes)} ·
                  score {window.score}/100
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No optimized window is assigned to this day.</p>
        )}
        {selectedScheduledEvents.length ? (
          <>
            <h5>Assigned contact schedule</h5>
            <ul>
              {selectedScheduledEvents.map((event) => (
                <li key={event.id}>
                  <Time aria-hidden size={16} />
                  <strong>{event.kind}:</strong>{' '}
                  <a href={`#outreach-contact-${encodeURIComponent(event.contactId)}`}>
                    {event.contactName}
                  </a>{' '}
                  ·{' '}
                  <time dateTime={event.at}>
                    {new Intl.DateTimeFormat('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: workspace.timeZone,
                    }).format(new Date(event.at))}
                  </time>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>No saved contact outreach is assigned to this day.</p>
        )}
        <p>
          {selectedDay?.quarterMarker ? `${selectedDay.quarterMarker}. ` : ''}
          {selectedDay?.trackedEmails
            ? `${selectedDay.trackedEmails} tracked email ${
                selectedDay.trackedEmails === 1 ? 'event falls' : 'events fall'
              } on this date.`
            : 'No tracked email activity falls on this date.'}
        </p>
      </section>

      <section className="outreach-calendar__explanation">
        <h3>Why these dates are better for general company outreach</h3>
        {plan.status === 'RECOMMENDED' ? (
          <>
            <p>{plan.explanation}</p>
            <ul>
              {plan.reasons.map((reason) => (
                <li key={reason.code}>{reason.message}</li>
              ))}
            </ul>
            <dl className="outreach-calendar__evidence">
              <div>
                <dt>Evidence confidence</dt>
                <dd>{Math.round(plan.confidence * 100)}% · not reply probability</dd>
              </div>
              <div>
                <dt>Data sufficiency</dt>
                <dd>{plan.dataSufficiency.toLocaleLowerCase('en-US')}</dd>
              </div>
              <div>
                <dt>Tracked outcomes</dt>
                <dd>{plan.historicalObservationCount}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{plan.algorithmVersion}</dd>
              </div>
            </dl>
            <section
              aria-labelledby="outreach-evidence-title"
              className="outreach-calendar__source"
            >
              <div className="outreach-calendar__source-heading">
                <div>
                  <p className="eyebrow">Independent benchmark</p>
                  <h4 id="outreach-evidence-title">
                    Why this recommendation is evidence-supported
                  </h4>
                </div>
                <a
                  aria-label={`Read ${OUTREACH_TIMING_BENCHMARK.title} from ${OUTREACH_TIMING_BENCHMARK.publisher} (opens in a new tab)`}
                  href={OUTREACH_TIMING_BENCHMARK.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  View source
                  <Launch aria-hidden size={16} />
                </a>
              </div>
              <p>
                In <cite>{OUTREACH_TIMING_BENCHMARK.title}</cite>, Mailchimp’s system-wide analysis
                of engagement across billions of email addresses reports that Tuesday–Thursday
                commonly perform well and that the typical optimum clusters around 10:00 AM in the
                recipient’s own time zone. It also says no single day wins for every audience.
              </p>
              <ol className="outreach-calendar__reasoning">
                <li>
                  <strong>External prior.</strong> Faro starts with the same conservative pattern:
                  weekday business hours, with the strongest day colors in the mid-week range and
                  the optimizer’s highest default time quality around mid-morning.
                </li>
                <li>
                  <strong>Recommendation check.</strong>{' '}
                  <span
                    className={`status-badge status-badge--${
                      benchmarkAlignment?.dayAligned && benchmarkAlignment.timeAligned
                        ? 'clear'
                        : 'attention'
                    }`}
                  >
                    {benchmarkAlignment?.label}
                  </span>{' '}
                  The selected window is {plan.primary.contactLocal.weekday} at{' '}
                  {timeLabel(plan.primary.contactLocal.time)} in{' '}
                  {plan.primary.contactLocal.timeZone}. When it differs from the aggregate
                  benchmark, tracked reply timing, the current time, quiet hours, or the campaign
                  deadline explains the override.
                </li>
                <li>
                  <strong>Workspace evidence.</strong> Faro matched {historicalOutcomes.length}{' '}
                  tracked company send{historicalOutcomes.length === 1 ? '' : 's'} to{' '}
                  {historicalReplies} later repl{historicalReplies === 1 ? 'y' : 'ies'}. These
                  observations adjust the external baseline only with smoothed day-and-hour
                  evidence; missing history is shown as insufficient instead of being invented.
                </li>
                <li>
                  <strong>Feasibility check.</strong> Algorithm {plan.algorithmVersion} evaluated{' '}
                  {plan.reproducibility.evaluatedCandidates.toLocaleString('en-US')} future
                  half-hour candidates, excluded configured quiet hours
                  {campaign?.endAt ? ' and post-deadline times' : ''}, then returned the highest
                  deterministic score plus spaced alternatives.
                </li>
              </ol>
              <p className="outreach-calendar__accuracy-boundary">
                <strong>Accuracy boundary:</strong> this is an evidence-supported ranking, not a
                measured probability that a contact will reply. The cited source covers aggregate
                marketing-email engagement, not this workspace’s one-to-one sponsorship outreach.
                Faro’s quarter-boundary boost is a planning heuristic, not a Mailchimp finding.
                Validate the recommendation against your own reply outcomes or a controlled timing
                test as more data arrives.
              </p>
            </section>
          </>
        ) : (
          <>
            <p>{plan.explanation}</p>
            <ul>
              {plan.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          </>
        )}
        <p className="outreach-calendar__note">
          The blue day score combines Faro’s general-company weekday baseline, tracked company
          outreach and later replies, optimizer-selected dates, and calendar-quarter timing.
          Brighter dates have the stronger combined planning signal. Exact send times separately
          enforce the current time, workspace timezone, quiet hours, and an active campaign
          deadline. Faro refreshes this planning boundary while the page remains open, so an expired
          time cannot remain a Best or Alternative send window.
        </p>
        <p className="outreach-calendar__note">
          Dates from 7–21 days before a new quarter receive a pre-quarter planning boost, and the
          first 10 days of a quarter receive an early-quarter boost. This can leave time for a
          company to consider an ask before or as a new planning period begins. It is only a
          calendar-budget cue: companies may use different fiscal calendars, and Faro has not
          verified that any company has budget available.
        </p>
        <p className="outreach-calendar__note">
          This aggregate company view never grants outreach permission or sends email. Every contact
          still requires consent and suppression checks plus human review.
        </p>
      </section>
    </div>
  );
}
