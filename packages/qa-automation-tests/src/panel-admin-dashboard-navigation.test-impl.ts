import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { isAdminSidebarNavItemVisible } from './portal-navigation.js';
import { loginToPanelAdminDashboard } from './panel-admin-navigation.js';

/** Live-verified against production for the Panel Admin role (docs/adr/0061). */
const EXPECTED_NAV_ITEMS = [
  'Dashboard',
  'User Management',
  'Interviewer Search',
  'Add Interviewer',
  'Reports',
  'Candidate Interview Management',
  'Netting',
];

export class PanelAdminDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'panel-admin-dashboard-navigation';
  readonly name = 'Panel Admin dashboard shows the expected sidebar navigation';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginToPanelAdminDashboard(page, this.credentials);

    const loggedInAsVisible = await page
      .getByText(/Logged In As\s*Panel Admin/i)
      .last()
      .isVisible()
      .catch(() => false);
    if (!loggedInAsVisible) {
      return {
        passed: false,
        details: 'Did not see "Logged In As Panel Admin" in the top bar after login',
      };
    }

    const missing: string[] = [];
    for (const item of EXPECTED_NAV_ITEMS) {
      if (!(await isAdminSidebarNavItemVisible(page, item))) {
        missing.push(item);
      }
    }

    if (missing.length > 0) {
      return {
        passed: false,
        details: `Missing expected sidebar navigation item(s) for Panel Admin: ${missing.join(', ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${EXPECTED_NAV_ITEMS.length} expected sidebar navigation items were visible for Panel Admin`,
    };
  }
}
