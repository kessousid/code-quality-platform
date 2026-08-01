import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import {
  loginAndReachBookingScreen,
  nextNonSunday,
  nextSunday,
  readSlotTimes,
  selectCalendarDate,
} from './portal-navigation.js';

const NINE_AM = 9 * 60;
const SEVEN_PM = 19 * 60;

/**
 * See docs/adr/0035. Cheap, no real-world side effect — safe to run on
 * every scheduled tick. Checks the business rule directly against real
 * production data: Sunday must be all-paid (no Free Slots), every other
 * day must have Free Slots strictly within 9 AM–7 PM and Priority slots
 * at-or-outside that window.
 */
export class SlotListingPricingTest implements PortalAutomationTest {
  readonly id = 'slot-listing-pricing';
  readonly name = 'Slot listing pricing matches Sunday/weekday business rule';
  readonly frequency = 'every-run' as const;

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachBookingScreen(page, this.credentials);

    const sundayResult = await this.checkSunday(page);
    if (!sundayResult.passed) return sundayResult;

    const weekdayResult = await this.checkNonSunday(page);
    if (!weekdayResult.passed) return weekdayResult;

    return { passed: true, details: `${sundayResult.details}; ${weekdayResult.details}` };
  }

  private async checkSunday(page: Page): Promise<PortalAutomationTestResult> {
    const date = nextSunday();
    await selectCalendarDate(page, date);
    const free = await readSlotTimes(page, 'Free Slots');
    const priority = await readSlotTimes(page, 'Priority Flexible Slots');

    if (free.length > 0) {
      return {
        passed: false,
        details: `Sunday (${date.toDateString()}) expected zero Free Slots but found: ${free.map((s) => s.label).join(', ')}`,
      };
    }
    if (priority.length === 0) {
      return {
        passed: false,
        details: `Sunday (${date.toDateString()}) expected Priority Flexible Slots to be non-empty but it was empty`,
      };
    }
    return {
      passed: true,
      details: `Sunday (${date.toDateString()}) correctly all-paid: ${priority.length} priority slot(s), 0 free slots`,
    };
  }

  private async checkNonSunday(page: Page): Promise<PortalAutomationTestResult> {
    const date = nextNonSunday();
    await selectCalendarDate(page, date);
    const free = await readSlotTimes(page, 'Free Slots');
    const priority = await readSlotTimes(page, 'Priority Flexible Slots');

    const badFree = free.filter(
      (s) => s.minutesSinceMidnight <= NINE_AM || s.minutesSinceMidnight >= SEVEN_PM,
    );
    if (badFree.length > 0) {
      return {
        passed: false,
        details: `${date.toDateString()} has Free Slots outside 9 AM–7 PM: ${badFree.map((s) => s.label).join(', ')}`,
      };
    }
    const badPriority = priority.filter(
      (s) => s.minutesSinceMidnight > NINE_AM && s.minutesSinceMidnight < SEVEN_PM,
    );
    if (badPriority.length > 0) {
      return {
        passed: false,
        details: `${date.toDateString()} has Priority Slots inside the free window (9 AM–7 PM): ${badPriority.map((s) => s.label).join(', ')}`,
      };
    }
    return {
      passed: true,
      details: `${date.toDateString()} correctly split: ${free.length} free slot(s) within 9 AM–7 PM, ${priority.length} priority slot(s) at/outside the boundary`,
    };
  }
}
