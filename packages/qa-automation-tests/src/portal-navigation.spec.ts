import { describe, expect, it } from 'vitest';
import { nextNonSunday, nextSunday, parseSlotTime } from './portal-navigation.js';

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

describe('nextSunday', () => {
  it('returns a real Sunday strictly after the given date', () => {
    const from = new Date(2026, 6, 17); // Friday, July 17 2026
    const result = nextSunday(from);
    expect(result.getDay()).toBe(0);
    expect(result.getTime()).toBeGreaterThan(from.getTime());
    expect(result.getDate()).toBe(19);
  });

  it('skips forward a full week when starting from a Sunday', () => {
    const from = new Date(2026, 6, 19); // Sunday, July 19 2026
    const result = nextSunday(from);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(26);
  });
});

describe('nextNonSunday', () => {
  it('returns tomorrow when tomorrow is not a Sunday', () => {
    const from = new Date(2026, 6, 17); // Friday, July 17 2026
    const result = nextNonSunday(from);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDate()).toBe(18);
  });

  it('skips Sunday when starting from a Saturday', () => {
    const from = new Date(2026, 6, 18); // Saturday, July 18 2026
    const result = nextNonSunday(from);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDate()).toBe(20);
  });
});
