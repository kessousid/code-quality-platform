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
import { loginToRecruiterDashboard, RECRUITER_DASHBOARD_URL } from './recruiter-navigation.js';

/**
 * The full recruiter sidebar, live-verified against production for the
 * Master Recruiter role (docs/adr/0059) — the first of several planned
 * per-persona "does this role see the right dashboard" checks. Order
 * matches the real sidebar top-to-bottom, though this test doesn't
 * assert on order, only presence.
 */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Dashboard', expectedUrl: 'https://portal.curatal.com/app/recruiter/dashboard' },
  { label: 'Create Job', expectedUrl: 'https://portal.curatal.com/app/recruiter/job/create' },
  { label: 'JD List', expectedUrl: 'https://portal.curatal.com/app/recruiter/joblist' },
  {
    label: 'Candidate Search',
    expectedUrl: 'https://portal.curatal.com/app/recruiter/candidate/search',
  },
  {
    label: 'Unlocked Candidates',
    expectedUrl: 'https://portal.curatal.com/app/recruiter/unlock-candidate',
  },
  { label: 'User Management', expectedUrl: 'https://portal.curatal.com/app/recruiter/user' },
  {
    label: 'Vendor Management',
    expectedUrl: 'https://portal.curatal.com/app/recruiter/vendor-management',
  },
  { label: 'Reports', expectedUrl: 'https://portal.curatal.com/app/recruiter/reports' },
  { label: 'Assessments', expectedUrl: 'https://portal.curatal.com/app/recruiter/assessments' },
  { label: 'Events', expectedUrl: 'https://portal.curatal.com/app/recruiter/events' },
  {
    label: 'Billing and Subscription',
    expectedUrl: 'https://portal.curatal.com/app/recruiter/billing',
  },
  { label: 'Netting', expectedUrl: 'https://portal.curatal.com/app/netting' },
];

export class RecruiterDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'recruiter-dashboard-navigation';
  readonly name = 'Master Recruiter dashboard shows and navigates the expected sidebar items';

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
        details: `Missing expected sidebar navigation item(s) for Master Recruiter: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(page, RECRUITER_DASHBOARD_URL, NAV_TARGETS);
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Master Recruiter: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${NAV_TARGETS.length} expected sidebar navigation items were visible and navigated to their expected pages for Master Recruiter`,
    };
  }
}
