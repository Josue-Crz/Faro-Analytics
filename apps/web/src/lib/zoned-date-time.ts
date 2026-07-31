interface DateTimeParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

function partsInTimeZone(value: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
    .formatToParts(value)
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== 'literal') result[part.type] = Number(part.value);
      return result;
    }, {});
  return {
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    month: parts.month!,
    year: parts.year!,
  };
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

export function instantToZonedDateTimeLocal(value: string | Date, timeZone: string): string {
  const parts = partsInTimeZone(typeof value === 'string' ? new Date(value) : value, timeZone);
  return `${parts.year}-${padded(parts.month)}-${padded(parts.day)}T${padded(parts.hour)}:${padded(
    parts.minute,
  )}`;
}

export function zonedDateTimeLocalToInstant(value: string, timeZone: string): string {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/.exec(value);
  if (!match?.groups) throw new TypeError('Enter a complete date and time');
  const desired: DateTimeParts = {
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
    month: Number(match.groups.month),
    year: Number(match.groups.year),
  };
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  let candidate = desiredAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = partsInTimeZone(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    candidate += desiredAsUtc - observedAsUtc;
  }
  const resolved = new Date(candidate);
  const observed = partsInTimeZone(resolved, timeZone);
  if (
    observed.year !== desired.year ||
    observed.month !== desired.month ||
    observed.day !== desired.day ||
    observed.hour !== desired.hour ||
    observed.minute !== desired.minute
  ) {
    throw new TypeError(`That local time does not exist in ${timeZone}`);
  }
  return resolved.toISOString();
}

export function googleSheetDateTimeToInstant(value: string, timeZone = 'UTC'): string | null {
  if (!value.trim()) return null;
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 0 && serial < 1_000_000) {
    const wallTime = new Date(
      Math.round((Date.UTC(1899, 11, 30) + serial * 86_400_000) / 60_000) * 60_000,
    );
    const local = `${wallTime.getUTCFullYear()}-${padded(
      wallTime.getUTCMonth() + 1,
    )}-${padded(wallTime.getUTCDate())}T${padded(wallTime.getUTCHours())}:${padded(
      wallTime.getUTCMinutes(),
    )}`;
    try {
      return zonedDateTimeLocalToInstant(local, timeZone);
    } catch {
      return null;
    }
  }
  const localMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/.exec(value.trim());
  if (localMatch) {
    try {
      return zonedDateTimeLocalToInstant(`${localMatch[1]}T${localMatch[2]}`, timeZone);
    } catch {
      return null;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
