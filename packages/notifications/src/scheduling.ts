import { quietHoursSchema, type QuietHours } from './contracts.js';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, created);
  return created;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function timeToMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Returns the desired instant or the first quiet-hour boundary in the user's IANA time zone. */
export function nextAllowedNotificationAt(
  desiredAt: string | Date,
  rawQuietHours: QuietHours,
): Date {
  const quietHours = quietHoursSchema.parse(rawQuietHours);
  const desired = typeof desiredAt === 'string' ? new Date(desiredAt) : new Date(desiredAt);
  if (Number.isNaN(desired.getTime())) throw new Error('desiredAt must be a valid instant');

  const startMinutes = timeToMinutes(quietHours.start);
  const endMinutes = timeToMinutes(quietHours.end);
  if (startMinutes === endMinutes) return desired;

  const spansMidnight = startMinutes > endMinutes;
  const isQuiet = (instant: Date): boolean => {
    const parts = zonedParts(instant, quietHours.timeZone);
    const localMinutes = parts.hour * 60 + parts.minute;
    return spansMidnight
      ? localMinutes >= startMinutes || localMinutes < endMinutes
      : localMinutes >= startMinutes && localMinutes < endMinutes;
  };
  if (!isQuiet(desired)) return desired;

  // Search absolute minutes so nonexistent local times are skipped and repeated local times remain
  // quiet until the later occurrence reaches the configured boundary.
  let candidateMs = Math.ceil(desired.getTime() / 60_000) * 60_000;
  if (candidateMs === desired.getTime()) candidateMs += 60_000;
  for (let minute = 0; minute <= 26 * 60; minute += 1) {
    const candidate = new Date(candidateMs + minute * 60_000);
    if (!isQuiet(candidate)) return candidate;
  }
  throw new Error('Unable to find a non-quiet notification instant within 26 hours');
}

export function notificationRetryAt(
  attemptedAt: string | Date,
  attempt: number,
  baseDelayMs = 30_000,
  maxDelayMs = 3_600_000,
): Date {
  const timestamp = new Date(attemptedAt).getTime();
  if (Number.isNaN(timestamp)) throw new Error('attemptedAt must be a valid instant');
  const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return new Date(timestamp + delay);
}
