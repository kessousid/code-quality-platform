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
  selectCalendarDate,
  upcomingDates,
  type SlotTime,
} from './portal-navigation.js';

const NINE_AM = 9 * 60;
const SEVEN_PM = 19 * 60;
const DAYS_TO_CHECK = 3;

function formatSlotList(slots: SlotTime[]): string {
  return slots.length > 0 ? slots.map((s) => s.label).join(', ') : 'none';
}

function dateLabel(date: Date): string {
  return date.toDateString();
}

/**
 * See docs/adr/0035. Cheap, no real-world side effect — safe to run on
 * every scheduled tick. Checks the business rule directly against real
 * production data: Sunday must be all-paid (no Free Slots), every other
 * day must have Free Slots strictly within 9 AM–7 PM and Priority slots
 * at-or-outside that window. Only ever looks at the next 2–3 days — a
 * real production run hit a date the site hadn't made bookable yet when
 * reaching further ahead for "the next Sunday", so per the user this
 * stays within the near-term window instead.
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
    const priority = await readSlotTimes(page, 'Priority Flexible Slots');
    const summary = `${dateLabel(date)}: Free Slots = [${formatSlotList(free)}], Priority Slots = [${formatSlotList(priority)}]`;

    if (free.length > 0) {
      return { passed: false, details: `${summary} — expected zero Free Slots on Sunday` };
    }
    if (priority.length === 0) {
      return {
        passed: false,
        details: `${summary} — expected Priority Flexible Slots to be non-empty`,
      };
    }
    return { passed: true, details: `${summary} — correctly all-paid` };
  }

  private async checkWeekday(page: Page, date: Date): Promise<PortalAutomationTestResult> {
    await selectCalendarDate(page, date);
    const free = await readSlotTimes(page, 'Free Slots');
    const priority = await readSlotTimes(page, 'Priority Flexible Slots');
    const summary = `${dateLabel(date)}: Free Slots = [${formatSlotList(free)}], Priority Slots = [${formatSlotList(priority)}]`;

    const badFree = free.filter(
      (s) => s.minutesSinceMidnight <= NINE_AM || s.minutesSinceMidnight >= SEVEN_PM,
    );
    if (badFree.length > 0) {
      return {
        passed: false,
        details: `${summary} — Free Slots outside 9 AM–7 PM: ${formatSlotList(badFree)}`,
      };
    }
    const badPriority = priority.filter(
      (s) => s.minutesSinceMidnight > NINE_AM && s.minutesSinceMidnight < SEVEN_PM,
    );
    if (badPriority.length > 0) {
      return {
        passed: false,
        details: `${summary} — Priority Slots inside the free window (9 AM–7 PM): ${formatSlotList(badPriority)}`,
      };
    }
    return { passed: true, details: `${summary} — correctly split` };
  }
}
