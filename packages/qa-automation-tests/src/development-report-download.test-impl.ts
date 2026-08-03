import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { loginAndReachCompletedInterviewsTab } from './portal-navigation.js';

const RAZORPAY_IFRAME_SELECTOR = 'iframe[src*="razorpay.com/v1/checkout"]';

/**
 * See docs/adr/0035. Has a real-world side effect (opens a real Razorpay
 * checkout session) so it only runs automatically once per day — see
 * RunQaAutomationSuiteUseCase's frequency gating. Never completes
 * payment — reaching the payment screen is itself the pass signal, per
 * the user.
 *
 * Live-verified: "Download Report" (on a completed interview row, My
 * Interviews > Completed tab) opens a "Candidate Development Report"
 * modal with a locked sample preview, a real payment summary (Subtotal /
 * GST / Total Payable), a single `input[type=checkbox]` for Terms &
 * Conditions, and an "Unlock Full Report" button. Playwright's own
 * actionability checks auto-scroll both the checkbox and the button into
 * view — no manual scrolling needed.
 */
export class DevelopmentReportDownloadTest implements PortalAutomationTest {
  readonly id = 'development-report-download';
  readonly name = 'Candidate Development Report unlock leads to the payment screen';
  readonly frequency = 'daily' as const;

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachCompletedInterviewsTab(page, this.credentials);

    const downloadReportButton = page.getByText('Download Report', { exact: false }).first();
    if (!(await downloadReportButton.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No "Download Report" option was visible on the Completed tab',
      };
    }
    await downloadReportButton.click();
    await page.waitForTimeout(2000);

    const checkbox = page.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isVisible().catch(() => false))) {
      return {
        passed: false,
        details: 'No Terms & Conditions checkbox appeared after clicking "Download Report"',
      };
    }
    await checkbox.check();
    await page.waitForTimeout(500);

    const unlockButton = page.getByRole('button', { name: 'Unlock Full Report' });
    if (!(await unlockButton.isEnabled().catch(() => false))) {
      return {
        passed: false,
        details:
          '"Unlock Full Report" was not available/enabled after accepting Terms & Conditions',
      };
    }
    await unlockButton.click();
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
        details: `Development report payment screen did not show expected content (Payment Options: ${sawPaymentOptions}, Price Summary: ${sawPriceSummary})`,
      };
    }
    return {
      passed: true,
      details:
        'Development report payment screen showed Payment Options and Price Summary as expected',
    };
  }
}
