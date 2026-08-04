import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCalendarCellLabel,
  nextNonSunday,
  parseSlotTime,
  upcomingDates,
} from './portal-navigation.js';

describe('formatCalendarCellLabel', () => {
  it('matches the real aria-label format observed in production (no zero-padding)', () => {
    expect(formatCalendarCellLabel(new Date(2026, 8, 2))).toBe('2 September 2026');
    expect(formatCalendarCellLabel(new Date(2026, 7, 31))).toBe('31 August 2026');
  });
});

describe('parseSlotTime', () => {
  it('parses AM times', () => {
    expect(parseSlotTime('09:00 AM')).toBe(9 * 60);
    expect(parseSlotTime('12:00 AM')).toBe(0);
  });

  it('parses PM times', () => {
    expect(parseSlotTime('07:00 PM')).toBe(19 * 60);
    expect(parseSlotTime('12:00 PM')).toBe(12 * 60);
  });

  it('rejects unrecognized text', () => {
    expect(() => parseSlotTime('not a time')).toThrow();
  });
});

describe('upcomingDates', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('returns the next N real calendar days, starting today, before the 3 PM IST cutoff', () => {
    const from = new Date('2026-07-17T05:00:00Z'); // 10:30 AM IST — before the cutoff
    const result = upcomingDates(3, from);
    expect(result.map((d) => d.getDate())).toEqual([17, 18, 19]);
  });

  it('shifts the window to start tomorrow once it is past 3 PM IST, per the user', () => {
    const from = new Date('2026-07-17T10:00:00Z'); // 3:30 PM IST — past the cutoff
    const result = upcomingDates(2, from);
    expect(result.map((d) => d.getDate())).toEqual([18, 19]);
  });

  it('does not yet shift the window right at 2:59 PM IST', () => {
    const from = new Date('2026-07-17T09:29:00Z'); // 2:59 PM IST
    const result = upcomingDates(2, from);
    expect(result.map((d) => d.getDate())).toEqual([17, 18]);
  });

  it('regression: advances to the real IST calendar day even when the container itself runs in UTC', () => {
    // A real production bug: Railway's container runs in UTC. At 12:54 AM
    // IST on August 4, it's still 7:24 PM UTC on August 3 — so a version
    // of this function that read/wrote dates via the container's own
    // local (UTC) day computed "today" as August 3, one full day behind
    // the real IST calendar day, and every date it produced landed a day
    // early. Forcing TZ=UTC here reproduces that exact container
    // environment regardless of whatever timezone actually runs this test.
    process.env.TZ = 'UTC';
    const from = new Date('2026-08-03T19:24:00Z'); // 12:54 AM IST, August 4
    const result = upcomingDates(2, from);
    expect(result.map((d) => [d.getFullYear(), d.getMonth(), d.getDate()])).toEqual([
      [2026, 7, 4], // August 4 (month is 0-indexed)
      [2026, 7, 5],
    ]);
  });
});

describe('nextNonSunday', () => {
  it('returns today when today is not a Sunday', () => {
    const from = new Date(2026, 6, 17); // Friday, July 17 2026
    const result = nextNonSunday(from);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDate()).toBe(17);
  });

  it('returns tomorrow when today is a Sunday', () => {
    const from = new Date(2026, 6, 19); // Sunday, July 19 2026
    const result = nextNonSunday(from);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDate()).toBe(20);
  });
});
