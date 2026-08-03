import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import {
  findSlotPanel,
  loginAndReachBookingScreen,
  nextNonSunday,
  selectCalendarDate,
} from './portal-navigation.js';

const RAZORPAY_IFRAME_SELECTOR = 'iframe[src*="razorpay.com/v1/checkout"]';

/**
 * See docs/adr/0035. Has a real-world side effect (opens a real Razorpay
 * checkout session) so it only runs automatically once per day — see
 * RunQaAutomationSuiteUseCase's frequency gating. Never completes payment
 * and never clicks "Schedule Interview" — reaching the payment screen /
 * seeing the schedule button is itself the pass signal, per the user.
 */
export class SlotBookingFlowTest implements PortalAutomationTest {
  readonly id = 'slot-booking-flow';
  readonly name = 'Priority payment screen and free-slot scheduling option are reachable';
  readonly frequency = 'daily' as const;

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachBookingScreen(page, this.credentials);
    const date = nextNonSunday();
    await selectCalendarDate(page, date);

    // Free Slots first, deliberately — checkPriorityPaymentScreen ends by
    // opening the real Razorpay iframe, which then covers the rest of the
    // page and blocks any further interaction with it (confirmed by a
    // real production failure: the Free Slots button was still visible
    // but its click was rejected because the iframe intercepted the
    // pointer event). Nothing needs to happen on this page after the
    // payment screen is confirmed, so that check is safe to run last.
    const freeResult = await this.checkFreeScheduleOption(page, date);
    if (!freeResult.passed) return freeResult;

    const priorityResult = await this.checkPriorityPaymentScreen(page, date);
    if (!priorityResult.passed) return priorityResult;

    return { passed: true, details: `${freeResult.details}; ${priorityResult.details}` };
  }

  private async checkPriorityPaymentScreen(
    page: Page,
    date: Date,
  ): Promise<PortalAutomationTestResult> {
    const panel = await findSlotPanel(page, 'Priority Flexible Slots');
    const timeButton = panel
      .getByRole('button')
      .filter({ hasText: /^\d{1,2}:\d{2}\s*(AM|PM)$/i })
      .first();
    if (!(await timeButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: `${date.toDateString()}: no Priority Flexible Slots time button was available to test the payment flow`,
      };
    }
    const timeLabel = (await timeButton.innerText()).trim();
    await timeButton.click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Pay & Schedule' }).click();
    await page.waitForTimeout(1500);
    await page.getByText('I agree to the Terms & Conditions').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Confirm & Schedule' }).click();
    await page.waitForTimeout(3000);

    const razorpayFrame = page.frameLocator(RAZORPAY_IFRAME_SELECTOR);
    const sawPaymentOptions = await razorpayFrame
      .getByText('Payment Options')
      .isVisible()
      .catch(() => false);
    const sawPriceSummary = await razorpayFrame
      .getByText('Price Summary')
      .isVisible()
      .catch(() => false);

    if (!sawPaymentOptions || !sawPriceSummary) {
      return {
        passed: false,
        details: `${date.toDateString()} (${timeLabel}): payment screen did not show expected content (Payment Options: ${sawPaymentOptions}, Price Summary: ${sawPriceSummary})`,
      };
    }
    return {
      passed: true,
      details: `${date.toDateString()} (${timeLabel}): priority slot payment screen showed Payment Options and Price Summary as expected`,
    };
  }

  private async checkFreeScheduleOption(
    page: Page,
    date: Date,
  ): Promise<PortalAutomationTestResult> {
    const panel = await findSlotPanel(page, 'Free Slots');
    const timeButton = panel
      .getByRole('button')
      .filter({ hasText: /^\d{1,2}:\d{2}\s*(AM|PM)$/i })
      .first();
    if (!(await timeButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: `${date.toDateString()}: no Free Slots time button was available to test the scheduling option`,
      };
    }
    const timeLabel = (await timeButton.innerText()).trim();
    await timeButton.click();
    await page.waitForTimeout(1000);

    const scheduleButtonVisible = await page
      .getByRole('button', { name: 'Schedule Interview' })
      .isVisible()
      .catch(() => false);
    if (!scheduleButtonVisible) {
      return {
        passed: false,
        details: `${date.toDateString()} (${timeLabel}): Free Slots did not reveal a "Schedule Interview" button — never clicked, only checked visibility`,
      };
    }
    return {
      passed: true,
      details: `${date.toDateString()} (${timeLabel}): "Schedule Interview" button visible for a Free Slots time, as expected (not clicked)`,
    };
  }
}
