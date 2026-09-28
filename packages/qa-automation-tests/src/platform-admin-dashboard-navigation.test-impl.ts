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
import { loginToPlatformAdminDashboard } from './platform-admin-navigation.js';

const BASE = 'https://portal.curatal.com';

/** Top-level groups; most expand to the submenus in NAV_TARGETS rather than navigating themselves. */
const TOP_LEVEL_ITEMS = [
  'Dashboard',
  'Analytics',
  'Customer',
  'Candidates',
  'Jobs',
  'Expert Network',
  'Platform Configuration',
  'Content',
  'Finance',
  'Assessments',
  'Alerts',
  'Support',
];

/**
 * Ported from Prod_Automation's test_platform_admin_smoke_flow
 * (docs/adr/0070). That suite left Vendor Management and Role Management
 * without a URL; both were confirmed live when this was ported.
 */
const NAV_TARGETS: SidebarNavTarget[] = [
  { label: 'Dashboard', expectedUrl: `${BASE}/app/admin/dashboard` },
  { parent: 'Analytics', label: 'Platform Analytics', expectedUrl: `${BASE}/app/admin/analytics` },
  {
    parent: 'Customer',
    label: 'Create Customer',
    expectedUrl: `${BASE}/app/admin/customer/create`,
  },
  { parent: 'Customer', label: 'Account Management', expectedUrl: `${BASE}/app/admin/accounts` },
  {
    parent: 'Customer',
    label: 'Commercial Approvals',
    expectedUrl: `${BASE}/app/admin/commercial`,
  },
  {
    parent: 'Customer',
    label: 'Vendor Management',
    expectedUrl: `${BASE}/app/admin/vendor-management`,
  },
  { parent: 'Customer', label: 'Role Management', expectedUrl: `${BASE}/app/rolemanagement` },
  {
    parent: 'Candidates',
    label: 'Candidate List',
    expectedUrl: `${BASE}/app/admin/candidate-list`,
  },
  {
    parent: 'Candidates',
    label: 'Candidate Search',
    expectedUrl: `${BASE}/app/recruiter/candidate/search`,
  },
  {
    parent: 'Candidates',
    label: 'Candidate Search by email',
    expectedUrl: `${BASE}/app/admin/candidate-search-by-email`,
  },
  { parent: 'Candidates', label: 'Candidate Feedback', expectedUrl: `${BASE}/app/admin/feedback` },
  {
    parent: 'Candidates',
    label: 'Unlocked Candidates',
    expectedUrl: `${BASE}/app/recruiter/unlock-candidate`,
  },
  {
    parent: 'Candidates',
    label: 'Profile as a Service',
    expectedUrl: `${BASE}/app/admin/profile-as-a-service`,
  },
  {
    parent: 'Candidates',
    label: 'Candidate Subscription',
    expectedUrl: `${BASE}/app/admin/candidate-subscription`,
  },
  { parent: 'Jobs', label: 'View Jobs', expectedUrl: `${BASE}/app/admin/job/list` },
  { parent: 'Jobs', label: 'Create Job', expectedUrl: `${BASE}/app/admin/job/create` },
  {
    parent: 'Expert Network',
    label: 'Coach Management',
    expectedUrl: `${BASE}/app/admin/coach-management`,
  },
  {
    parent: 'Expert Network',
    label: 'Mentor Management',
    expectedUrl: `${BASE}/app/admin/mentoring-management`,
  },
  {
    parent: 'Expert Network',
    label: 'Interviewer Subscription',
    expectedUrl: `${BASE}/app/admin/interviewer-subscription`,
  },
  {
    parent: 'Expert Network',
    label: 'Badge Management',
    expectedUrl: `${BASE}/app/admin/badge-management`,
  },
  { parent: 'Platform Configuration', label: 'Netting', expectedUrl: `${BASE}/app/netting` },
  {
    parent: 'Platform Configuration',
    label: 'Skill Taxonomy',
    expectedUrl: `${BASE}/app/admin/skill-taxonomy`,
  },
  {
    parent: 'Platform Configuration',
    label: 'Knowledge Base',
    expectedUrl: `${BASE}/app/admin/knowledge-base`,
  },
  {
    parent: 'Platform Configuration',
    label: 'On Platform Sales',
    expectedUrl: `${BASE}/app/admin/on-platform-sales`,
  },
  { parent: 'Content', label: 'Events', expectedUrl: `${BASE}/app/admin/events` },
  { parent: 'Content', label: 'News Letter', expectedUrl: `${BASE}/app/admin/news-letter` },
  { parent: 'Content', label: "What's New", expectedUrl: `${BASE}/app/admin/whats-new` },
  { parent: 'Finance', label: 'Reports', expectedUrl: `${BASE}/app/admin/reports` },
  { parent: 'Finance', label: 'Revenue Report', expectedUrl: `${BASE}/app/admin/revenue-report` },
  {
    parent: 'Assessments',
    label: 'Assessments Hub',
    expectedUrl: `${BASE}/app/recruiter/assessments`,
  },
  {
    parent: 'Assessments',
    label: 'AI Question Pool',
    expectedUrl: `${BASE}/app/admin/ai-question-pool`,
  },
  {
    parent: 'Assessments',
    label: 'Recruiter Question Pool',
    expectedUrl: `${BASE}/app/admin/recruiter-question-pool`,
  },
  { parent: 'Assessments', label: 'Skill Topics', expectedUrl: `${BASE}/app/admin/skill-topics` },
  { label: 'Alerts', expectedUrl: `${BASE}/app/admin/alerts` },
  { label: 'Support', expectedUrl: `${BASE}/app/admin/support` },
];

export class PlatformAdminDashboardNavigationTest implements PortalAutomationTest {
  readonly id = 'platform-admin-dashboard-navigation';
  readonly name = 'Platform Admin dashboard shows and navigates the expected sidebar items';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginToPlatformAdminDashboard(page, this.credentials);

    // The login helpers' one-shot expand click can land before the page is
    // ready (seen live for Interviewer), leaving the sidebar icons-only.
    await ensureSidebarOpen(page);

    const missing: string[] = [];
    for (const item of TOP_LEVEL_ITEMS) {
      if (!(await isAdminSidebarNavItemVisible(page, item))) {
        missing.push(item);
      }
    }
    if (missing.length > 0) {
      return {
        passed: false,
        details: `Missing expected sidebar navigation item(s) for Platform Admin: ${missing.join(', ')}`,
      };
    }

    const navFailures = await clickThroughSidebar(page, `${BASE}/app/admin/dashboard`, NAV_TARGETS);
    if (navFailures.length > 0) {
      return {
        passed: false,
        details: `${navFailures.length} of ${NAV_TARGETS.length} sidebar item(s) failed to navigate for Platform Admin: ${navFailures.join('; ')}`,
      };
    }

    return {
      passed: true,
      details: `All ${TOP_LEVEL_ITEMS.length} top-level sidebar groups were visible and all ${NAV_TARGETS.length} sidebar destinations navigated to their expected pages for Platform Admin`,
    };
  }
}
