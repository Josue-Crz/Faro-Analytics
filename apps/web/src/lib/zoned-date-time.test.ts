import { describe, expect, it } from 'vitest';

import {
  googleSheetDateTimeToInstant,
  instantToZonedDateTimeLocal,
  zonedDateTimeLocalToInstant,
} from './zoned-date-time';

describe('zoned date-time input conversion', () => {
  it('renders an instant in the contact timezone and restores the same instant', () => {
    const instant = '2026-07-30T17:30:00.000Z';
    const local = instantToZonedDateTimeLocal(instant, 'America/Los_Angeles');
    expect(local).toBe('2026-07-30T10:30');
    expect(zonedDateTimeLocalToInstant(local, 'America/Los_Angeles')).toBe(instant);
  });

  it('rejects a nonexistent daylight-saving wall time', () => {
    expect(() => zonedDateTimeLocalToInstant('2026-03-08T02:30', 'America/Los_Angeles')).toThrow(
      'does not exist',
    );
  });

  it('restores an unformatted Google date serial using the spreadsheet timezone', () => {
    const serial = Date.parse('2026-07-30T10:30:00.000Z') / 86_400_000 + 25_569;
    expect(googleSheetDateTimeToInstant(String(serial), 'America/Los_Angeles')).toBe(
      '2026-07-30T17:30:00.000Z',
    );
  });
});
