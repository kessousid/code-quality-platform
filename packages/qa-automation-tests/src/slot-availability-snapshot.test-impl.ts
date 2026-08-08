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
} from './portal-navigation.js';
import { DAYS_TO_CHECK, dateLabel, formatSlotList } from './slot-listing-pricing.test-impl.js';

/**
 * See docs/adr/0035. Per the user: the goal isn't only pass/fail against
 * the business rule (that's SlotListingPricingTest's job) — it's also
 * capturing exactly what's actually available on each checked day, as
 * its own distinct piece of data, regardless of whether that emptiness
 * is itself a rule violation. A day with zero Priority slots (or zero
 * Free slots) is real, valid data worth recording either way — not a
 * failure — so this test always passes as long as it can actually reach
 * and read the booking screen; a day the site hasn't opened for booking
 * yet is recorded as its own explicit state too, not treated as an error
 * that aborts the rest of the days being checked.
 */
export class SlotAvailabilitySnapshotTest implements PortalAutomationTest {
  readonly id = 'slot-availability-snapshot';
  readonly name = 'Slot availability snapshot (Free vs Priority, per day)';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachBookingScreen(page, this.credentials);

    const summaries: string[] = [];
    for (const date of upcomingDates(DAYS_TO_CHECK)) {
      if (!(await isDateBookable(page, date))) {
        summaries.push(`${dateLabel(date)}: not open for booking yet`);
        continue;
      }

      await selectCalendarDate(page, date);
      const free = await readSlotTimes(page, 'Free Slots');
      const priority = await readSlotTimes(page, 'Priority Flexible Slots');
      summaries.push(
        `${dateLabel(date)}: Free Slots = [${formatSlotList(free)}], Priority Slots = [${formatSlotList(priority)}]`,
      );
    }

    return { passed: true, details: summaries.join('\n') };
  }
}
