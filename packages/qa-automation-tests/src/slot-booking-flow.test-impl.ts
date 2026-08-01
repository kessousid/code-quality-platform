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
    await selectCalendarDate(page, nextNonSunday());

    const priorityResult = await this.checkPriorityPaymentScreen(page);
    if (!priorityResult.passed) return priorityResult;

    const freeResult = await this.checkFreeScheduleOption(page);
    if (!freeResult.passed) return freeResult;

    return { passed: true, details: `${priorityResult.details}; ${freeResult.details}` };
  }

  private async checkPriorityPaymentScreen(page: Page): Promise<PortalAutomationTestResult> {
    const panel = await findSlotPanel(page, 'Priority Flexible Slots');
    const timeButton = panel
      .getByRole('button')
      .filter({ hasText: /^\d{1,2}:\d{2}\s*(AM|PM)$/i })
      .first();
    if (!(await timeButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No Priority Flexible Slots time button was available to test the payment flow',
      };
    }
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
        details: `Priority slot payment screen did not show expected content (Payment Options: ${sawPaymentOptions}, Price Summary: ${sawPriceSummary})`,
      };
    }
    return {
      passed: true,
      details: 'Priority slot payment screen showed Payment Options and Price Summary as expected',
    };
  }

  private async checkFreeScheduleOption(page: Page): Promise<PortalAutomationTestResult> {
    const panel = await findSlotPanel(page, 'Free Slots');
    const timeButton = panel
      .getByRole('button')
      .filter({ hasText: /^\d{1,2}:\d{2}\s*(AM|PM)$/i })
      .first();
    if (!(await timeButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No Free Slots time button was available to test the scheduling option',
      };
    }
    await timeButton.click();
    await page.waitForTimeout(1000);

    const scheduleButtonVisible = await page
      .getByRole('button', { name: 'Schedule Interview' })
      .isVisible()
      .catch(() => false);
    if (!scheduleButtonVisible) {
      return {
        passed: false,
        details:
          'Free Slots did not reveal a "Schedule Interview" button — never clicked, only checked visibility',
      };
    }
    return {
      passed: true,
      details:
        '"Schedule Interview" button visible for a Free Slots time, as expected (not clicked)',
    };
  }
}
