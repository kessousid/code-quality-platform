import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { loginAndReachJobsPage } from './portal-navigation.js';

const RAZORPAY_IFRAME_SELECTOR = 'iframe[src*="razorpay.com/v1/checkout"]';

/**
 * See docs/adr/0035. Has a real-world side effect (opens a real Razorpay
 * checkout session) so it only runs automatically once per day — see
 * RunQaAutomationSuiteUseCase's frequency gating. Never completes
 * payment — reaching the payment screen is itself the pass signal, per
 * the user. Uses the cheapest (7-day) plan to minimize any residual
 * footprint from repeatedly opening a real checkout session.
 *
 * Live-verified: the "I Agree to the Terms of Conditions" text is not
 * itself the clickable control — the real `input[type=checkbox]` next
 * to it must be clicked directly (with `force: true`, since the input
 * has no visible dimensions of its own) or "Proceed to Payment" stays
 * disabled forever.
 */
export class PremiumUpgradeTest implements PortalAutomationTest {
  readonly id = 'premium-upgrade';
  readonly name = 'Premium job-upgrade payment screen is reachable';
  readonly frequency = 'daily' as const;

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachJobsPage(page, this.credentials);

    const upgradeButton = page.getByRole('button', { name: 'Upgrade to Premium' });
    if (!(await upgradeButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No "Upgrade to Premium" option was visible on the Jobs page',
      };
    }
    await upgradeButton.click();
    await page.waitForTimeout(2000);

    const planButton = page.getByRole('button', { name: /^Get 7 Days Plan for/ });
    if (!(await planButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No 7-day plan option was visible after clicking "Upgrade to Premium"',
      };
    }
    await planButton.click();
    await page.waitForTimeout(2000);

    const confirmDialogVisible = await page
      .getByText('Confirm Your Subscription')
      .isVisible()
      .catch(() => false);
    if (!confirmDialogVisible) {
      return {
        passed: false,
        details: 'The "Confirm Your Subscription" dialog did not appear after selecting a plan',
      };
    }

    await page.locator('input[type=checkbox]').first().click({ force: true });
    await page.waitForTimeout(500);

    const proceedButton = page.getByRole('button', { name: 'Proceed to Payment' });
    if (!(await proceedButton.isEnabled().catch(() => false))) {
      return {
        passed: false,
        details:
          '"Proceed to Payment" was still disabled after accepting the Terms & Conditions checkbox',
      };
    }
    await proceedButton.click();
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
        details: `Premium upgrade payment screen did not show expected content (Payment Options: ${sawPaymentOptions}, Price Summary: ${sawPriceSummary})`,
      };
    }
    return {
      passed: true,
      details:
        'Premium upgrade payment screen showed Payment Options and Price Summary as expected',
    };
  }
}
