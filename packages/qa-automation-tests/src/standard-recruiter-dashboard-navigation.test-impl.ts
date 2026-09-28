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

const BASE = 'https://portal.curatal.com';

/**
 * Ported from Prod_Automation's test_recruiter_smoke_flow (docs/adr/0070).
 * A plain (non-master) Recruiter sees a subset of Master Recruiter's
 * sidebar: no User Management, Vendor Management or Billing and
 * Subscription.
 */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Dashboard', expectedUrl: `${BASE}/app/recruiter/dashboard` },
  { label: 'Create Job', expectedUrl: `${BASE}/app/recruiter/job/create` },
  { label: 'JD List', expectedUrl: `${BASE}/app/recruiter/joblist` },
  { label: 'Candidate Search', expectedUrl: `${BASE}/app/recruiter/candidate/search` },
  { label: 'Unlocked Candidates', expectedUrl: `${BASE}/app/recruiter/unlock-candidate` },
  { label: 'Reports', expectedUrl: `${BASE}/app/recruiter/reports` },
  { label: 'Assessments', expectedUrl: `${BASE}/app/recruiter/assessments` },
  { label: 'Events', expectedUrl: `${BASE}/app/recruiter/events` },
  { label: 'Netting', expectedUrl: `${BASE}/app/netting` },
];

export class StandardRecruiterDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'standard-recruiter-dashboard-navigation';
  readonly name = 'Recruiter dashboard shows and navigates the expected sidebar items';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginToRecruiterDashboard(page, this.credentials);

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
        details: `Missing expected sidebar navigation item(s) for Recruiter: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(page, RECRUITER_DASHBOARD_URL, NAV_TARGETS);
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Recruiter: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${NAV_TARGETS.length} expected sidebar navigation items were visible and navigated to their expected pages for Recruiter`,
    };
  }
}
