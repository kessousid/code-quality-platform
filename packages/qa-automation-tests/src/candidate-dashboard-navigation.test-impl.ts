import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import { isAdminSidebarNavItemVisible, loginAndExpandSidebar } from './portal-navigation.js';
import {
  clickThroughSidebar,
  ensureSidebarOpen,
  type SidebarNavTarget,
} from './sidebar-click-through.js';

const BASE = 'https://portal.curatal.com';

/** Ported from Prod_Automation's test_candidate_smoke_flow (docs/adr/0070). */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Dashboard', expectedUrl: `${BASE}/app/dashboard` },
  { label: 'Jobs', expectedUrl: `${BASE}/app/jobs/recommended` },
  { label: 'My Interviews', expectedUrl: `${BASE}/app/my-interviews/schedule-interview` },
  { label: 'Coaching', expectedUrl: `${BASE}/app/candidate/coaching` },
  { label: 'Resume Builder', expectedUrl: `${BASE}/app/resume-builder` },
  { label: 'Refer Your Friends', expectedUrl: `${BASE}/app/refer-your-friends` },
  { label: 'Assessments', expectedUrl: `${BASE}/app/assessments` },
  { label: 'Mentoring', expectedUrl: `${BASE}/app/mentoring` },
  { label: 'Mock Interview', expectedUrl: `${BASE}/app/mock-interview` },
  { label: 'Recruitment Events', expectedUrl: `${BASE}/app/recruitment-events` },
];

export class CandidateDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'candidate-dashboard-navigation';
  readonly name = 'Candidate dashboard shows and navigates the expected sidebar items';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndExpandSidebar(page, this.credentials);

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
        details: `Missing expected sidebar navigation item(s) for Candidate: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(page, `${BASE}/app/dashboard`, NAV_TARGETS);
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Candidate: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${NAV_TARGETS.length} expected sidebar navigation items were visible and navigated to their expected pages for Candidate`,
    };
  }
}
