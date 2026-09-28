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
import { loginToRecruiterDashboard } from './recruiter-navigation.js';

const BASE = 'https://portal.curatal.com';

/** Ported from Prod_Automation's test_interviewer_smoke_flow (docs/adr/0070). */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Interviewer Dashboard', expectedUrl: `${BASE}/app/interviewer/dashboard` },
  { label: 'Set Available Slots', expectedUrl: `${BASE}/app/interviewer/set-available-slots` },
  { label: 'Report', expectedUrl: `${BASE}/app/interviewer/report` },
  { label: 'Interviews for Feedback', expectedUrl: `${BASE}/app/interviewer/pending-feedback` },
];

export class InterviewerDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'interviewer-dashboard-navigation';
  readonly name = 'Interviewer dashboard shows and navigates the expected sidebar items';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    // Interviewers sign in through the same auth/recruiter/login form as recruiters.
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
        details: `Missing expected sidebar navigation item(s) for Interviewer: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(
      page,
      `${BASE}/app/interviewer/dashboard`,
      NAV_TARGETS,
    );
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Interviewer: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${NAV_TARGETS.length} expected sidebar navigation items were visible and navigated to their expected pages for Interviewer`,
    };
  }
}
