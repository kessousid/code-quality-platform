import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import {
  isDateBookable,
  loginAndReachBookingScreen,
  readSlotTimes,
  retryOnMissingSlot,
  selectCalendarDate,
  upcomingDates,
  type SlotTime,
} from './portal-navigation.js';

const SEVEN_AM = 7 * 60;
const NINE_AM = 9 * 60;
const SEVEN_PM = 19 * 60;
const NINE_PM = 21 * 60;
/** The site only ever makes today and tomorrow bookable — see upcomingDates(). */
export const DAYS_TO_CHECK = 2;

/**
 * Paid-only windows on a weekday: 7–9 AM and 7–9 PM (both ends
 * inclusive) — updated per the user from the original "everything
 * before 9 AM or after 7 PM is paid" rule. Free Slots cover the rest of
 * the day, including overnight (after 9 PM through before 7 AM), not
 * just the 9 AM–7 PM daytime window.
 */
export function isPaidWindow(minutesSinceMidnight: number): boolean {
  return (
    (minutesSinceMidnight >= SEVEN_AM && minutesSinceMidnight <= NINE_AM) ||
    (minutesSinceMidnight >= SEVEN_PM && minutesSinceMidnight <= NINE_PM)
  );
}

export function formatSlotList(slots: SlotTime[]): string {
  return slots.length > 0 ? slots.map((s) => s.label).join(', ') : 'none';
}

export function dateLabel(date: Date): string {
  return date.toDateString();
}

/**
 * See docs/adr/0035. Cheap, no real-world side effect — safe to run on
 * every scheduled tick. Checks the business rule directly against real
 * production data: Sunday must be all-paid (no Free Slots); every other
 * day, only 7–9 AM and 7–9 PM are paid-only windows — Free Slots cover
 * the rest of the day, including overnight after 9 PM through before
 * 7 AM (updated per the user from the original "everything before 9 AM
 * or after 7 PM is paid" rule, which was flagging real overnight free
 * slots as violations when they were actually correct). Only ever
 * looks at today and tomorrow — per the user, that's the entire real
 * bookable window on the site; reaching any further (an earlier 3-day
 * window, and before that "the next Sunday" up to 6 days out) hit
 * calendar cells the site hadn't made bookable at all.
 *
 * Every checked day is evaluated (not stopped at the first failure) and
 * its real date, weekday, and full Free/Priority slot lists are always
 * included in `details` — per the user, the date and which slots were
 * actually visible should be captured for every day checked, not just
 * summarized as a single pass/fail.
 */
export class SlotListingPricingTest implements PortalAutomationTest {
  readonly id = 'slot-listing-pricing';
  readonly name = 'Slot listing pricing matches Sunday/weekday business rule';
  readonly frequency = 'every-run' as const;

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachBookingScreen(page, this.credentials);

    const dayResults: PortalAutomationTestResult[] = [];
    for (const date of upcomingDates(DAYS_TO_CHECK)) {
      dayResults.push(
        date.getDay() === 0
          ? await this.checkSunday(page, date)
          : await this.checkWeekday(page, date),
      );
    }

    return {
      passed: dayResults.every((r) => r.passed),
      details: dayResults.map((r) => r.details).join('\n'),
    };
  }

  /**
   * Explicitly checks whether Sunday can be selected at all before
   * checking its pricing — per the user: a candidate booking earlier in
   * the week (e.g. on a Monday) may not get the option to pick a Sunday
   * slot in the first place if the site hasn't opened that date for
   * booking yet, which is itself worth surfacing distinctly from a
   * pricing-rule violation.
   */
  private async checkSunday(page: Page, date: Date): Promise<PortalAutomationTestResult> {
    if (!(await isDateBookable(page, date))) {
      return {
        passed: false,
        details: `${dateLabel(date)}: not open for booking — a candidate would not get the option to select this date at all.`,
      };
    }

    await selectCalendarDate(page, date);
    const free = await readSlotTimes(page, 'Free Slots');
    let priority = await readSlotTimes(page, 'Priority Flexible Slots');

    // Per the user: a Priority slot can be genuinely present one moment
    // and briefly gone the next (confirmed directly against production),
    // so an empty read is retried — with every attempt recorded — before
    // it's trusted as a real violation rather than a momentary gap.
    const retryOutcome =
      priority.length > 0
        ? undefined
        : await retryOnMissingSlot(page, date, 'Priority Flexible Slots', async () => {
            priority = await readSlotTimes(page, 'Priority Flexible Slots');
            return priority.length > 0;
          });
    const auditNote = retryOutcome ? ` [${retryOutcome.auditTrail.join(' ')}]` : '';

    const summary = `${dateLabel(date)}: Free Slots = [${formatSlotList(free)}], Priority Slots = [${formatSlotList(priority)}]`;

    if (free.length > 0) {
      return { passed: false, details: `${summary} — expected zero Free Slots on Sunday` };
    }
    if (priority.length === 0) {
      return {
        passed: false,
        details: `${summary} — expected Priority Flexible Slots to be non-empty${auditNote}`,
      };
    }
    return { passed: true, details: `${summary} — correctly all-paid${auditNote}` };
  }

  private async checkWeekday(page: Page, date: Date): Promise<PortalAutomationTestResult> {
    await selectCalendarDate(page, date);
    const free = await readSlotTimes(page, 'Free Slots');
    const priority = await readSlotTimes(page, 'Priority Flexible Slots');
    const summary = `${dateLabel(date)}: Free Slots = [${formatSlotList(free)}], Priority Slots = [${formatSlotList(priority)}]`;

    const badFree = free.filter((s) => isPaidWindow(s.minutesSinceMidnight));
    if (badFree.length > 0) {
      return {
        passed: false,
        details: `${summary} — Free Slots inside a paid window (7–9 AM or 7–9 PM): ${formatSlotList(badFree)}`,
      };
    }
    const badPriority = priority.filter((s) => !isPaidWindow(s.minutesSinceMidnight));
    if (badPriority.length > 0) {
      return {
        passed: false,
        details: `${summary} — Priority Slots outside the paid windows (7–9 AM or 7–9 PM): ${formatSlotList(badPriority)}`,
      };
    }
    return { passed: true, details: `${summary} — correctly split` };
  }
}
