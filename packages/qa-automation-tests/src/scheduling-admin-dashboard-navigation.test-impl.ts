import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { isAdminSidebarNavItemVisible } from './portal-navigation.js';
import {
  clickThroughSidebar,
  ensureSidebarOpen,
  type SidebarNavTarget,
} from './sidebar-click-through.js';
import { loginToSchedulingAdminDashboard } from './scheduling-admin-navigation.js';

/** Live-verified against production for the Scheduling Admin role (docs/adr/0060). */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Dashboard', expectedUrl: 'https://portal.curatal.com/app/scheduling/dashboard' },
  { label: 'User Management', expectedUrl: 'https://portal.curatal.com/app/scheduling/users' },
  {
    label: 'Candidate Interview Management',
    expectedUrl: 'https://portal.curatal.com/app/scheduling/candidate-interview-management',
  },
  { label: 'Netting', expectedUrl: 'https://portal.curatal.com/app/netting' },
];

export class SchedulingAdminDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'scheduling-admin-dashboard-navigation';
  readonly name = 'Scheduling Admin dashboard shows and navigates the expected sidebar items';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginToSchedulingAdminDashboard(page, this.credentials);

    const loggedInAsVisible = await page
      .getByText(/Logged In As\s*Scheduling Admin/i)
      .last()
      .isVisible()
      .catch(() => false);
    if (!loggedInAsVisible) {
      return {
        passed: false,
        details: 'Did not see "Logged In As Scheduling Admin" in the top bar after login',
      };
    }

    // The login helpers' one-shot expand click can land before the page is
    // ready (seen live for Interviewer), leaving the sidebar icons-only.
    await ensureSidebarOpen(page);

    const missing: string[] = [];
    for (const { label } of NAV_TARGETS) {
      if (!(await isAdminSidebarNavItemVisible(page, label))) {
        missing.push(label);
      }
    }

    if (missing.length > 0) {
      return {
        passed: false,
        details: `Missing expected sidebar navigation item(s) for Scheduling Admin: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(
      page,
      'https://portal.curatal.com/app/scheduling/dashboard',
      NAV_TARGETS,
    );
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Scheduling Admin: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${NAV_TARGETS.length} expected sidebar navigation items were visible and navigated to their expected pages for Scheduling Admin`,
    };
  }
}
