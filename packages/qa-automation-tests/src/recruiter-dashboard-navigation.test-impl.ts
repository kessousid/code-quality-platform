import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { isSidebarNavItemVisible, loginToRecruiterDashboard } from './recruiter-navigation.js';

/**
 * The full recruiter sidebar, live-verified against production for the
 * Master Recruiter role (docs/adr/0059) — the first of several planned
 * per-persona "does this role see the right dashboard" checks. Order
 * matches the real sidebar top-to-bottom, though this test doesn't
 * assert on order, only presence.
 */
const EXPECTED_NAV_ITEMS = [
  'Dashboard',
  'Create Job',
  'JD List',
  'Candidate Search',
  'Unlocked Candidates',
  'User Management',
  'Vendor Management',
  'Reports',
  'Assessments',
  'Events',
  'Billing and Subscription',
  'Netting',
];

export class RecruiterDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'recruiter-dashboard-navigation';
  readonly name = 'Master Recruiter dashboard shows the expected sidebar navigation';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginToRecruiterDashboard(page, this.credentials);

    const loggedInAsVisible = await page
      .getByText(/Logged In As\s*Master Recruiter/i)
      .last()
      .isVisible()
      .catch(() => false);
    if (!loggedInAsVisible) {
      return {
        passed: false,
        details: 'Did not see "Logged In As Master Recruiter" in the top bar after login',
      };
    }

    const missing: string[] = [];
    for (const item of EXPECTED_NAV_ITEMS) {
      if (!(await isSidebarNavItemVisible(page, item))) {
        missing.push(item);
      }
    }

    if (missing.length > 0) {
      return {
        passed: false,
        details: `Missing expected sidebar navigation item(s) for Master Recruiter: ${missing.join(', ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${EXPECTED_NAV_ITEMS.length} expected sidebar navigation items were visible for Master Recruiter`,
    };
  }
}
