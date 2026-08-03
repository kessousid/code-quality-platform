import { describe, expect, it } from 'vitest';
import { isPaidWindow } from './slot-listing-pricing.test-impl.js';
import { parseSlotTime } from './portal-navigation.js';

describe('isPaidWindow', () => {
  it('treats 7-9 AM as paid, both ends inclusive', () => {
    expect(isPaidWindow(parseSlotTime('07:00 AM'))).toBe(true);
    expect(isPaidWindow(parseSlotTime('08:00 AM'))).toBe(true);
    expect(isPaidWindow(parseSlotTime('09:00 AM'))).toBe(true);
  });

  it('treats 7-9 PM as paid, both ends inclusive', () => {
    expect(isPaidWindow(parseSlotTime('07:00 PM'))).toBe(true);
    expect(isPaidWindow(parseSlotTime('08:00 PM'))).toBe(true);
    expect(isPaidWindow(parseSlotTime('09:00 PM'))).toBe(true);
  });

  it('treats the 9 AM-7 PM daytime window as free', () => {
    expect(isPaidWindow(parseSlotTime('10:00 AM'))).toBe(false);
    expect(isPaidWindow(parseSlotTime('01:00 PM'))).toBe(false);
    expect(isPaidWindow(parseSlotTime('06:00 PM'))).toBe(false);
  });

  it('treats overnight (after 9 PM through before 7 AM) as free, not paid', () => {
    expect(isPaidWindow(parseSlotTime('10:00 PM'))).toBe(false);
    expect(isPaidWindow(0)).toBe(false); // midnight
    expect(isPaidWindow(parseSlotTime('02:30 AM'))).toBe(false);
    expect(isPaidWindow(parseSlotTime('06:00 AM'))).toBe(false);
  });
});
