export * from './portal-automation-test.js';
export * from './portal-navigation.js';
export * from './candidate-search-navigation.js';
export * from './slot-listing-pricing.test-impl.js';
export * from './slot-availability-snapshot.test-impl.js';
export * from './slot-booking-flow.test-impl.js';
export * from './premium-upgrade.test-impl.js';
export * from './development-report-download.test-impl.js';
export * from './candidate-search-skill-filters.test-impl.js';
export * from './candidate-search-gender-breakdown.test-impl.js';
export * from './candidate-search-education-additive.test-impl.js';
export * from './recruiter-navigation.js';
export * from './recruiter-dashboard-navigation.test-impl.js';
export * from './scheduling-admin-navigation.js';
export * from './scheduling-admin-dashboard-navigation.test-impl.js';

import type { PortalAutomationTest, PortalCredentials } from './portal-automation-test.js';
import { SlotListingPricingTest } from './slot-listing-pricing.test-impl.js';
import { SlotAvailabilitySnapshotTest } from './slot-availability-snapshot.test-impl.js';
import { SlotBookingFlowTest } from './slot-booking-flow.test-impl.js';
import { PremiumUpgradeTest } from './premium-upgrade.test-impl.js';
import { DevelopmentReportDownloadTest } from './development-report-download.test-impl.js';
import { CandidateSearchSkillFiltersTest } from './candidate-search-skill-filters.test-impl.js';
import { CandidateSearchGenderBreakdownTest } from './candidate-search-gender-breakdown.test-impl.js';
import { CandidateSearchEducationAdditiveTest } from './candidate-search-education-additive.test-impl.js';
import { RecruiterDashboardNavigationTest } from './recruiter-dashboard-navigation.test-impl.js';
import { SchedulingAdminDashboardNavigationTest } from './scheduling-admin-dashboard-navigation.test-impl.js';

/**
 * The extensible registry (see docs/adr/0035) — adding a new check means
 * adding a class file and one entry here, no DB/UI change required.
 * Credentials aren't known until runtime (env vars), so this is a
 * factory rather than a plain constant array.
 *
 * `slotCheckCredentials` is a separate, optional login used only by the
 * three slot-related checks (listing/pricing, availability snapshot,
 * booking flow) — per the user, a dedicated account for slot checks
 * specifically, while every other check (premium upgrade, development
 * report) keeps using `credentials`. Defaults to `credentials` when
 * omitted, so a caller with just one account still works unchanged.
 *
 * `candidateSearchCredentials` is the same pattern for the three
 * Candidate Search checks — those need a Platform Admin account
 * specifically (the feature is on the recruiter/admin side of the app,
 * not the candidate/employer side `credentials` normally logs into).
 * Also defaults to `credentials` when omitted for the same reason.
 *
 * `recruiterCredentials` is the same pattern again for the recruiter
 * persona checks (docs/adr/0059) — a real Master Recruiter account, the
 * first of several planned per-persona dashboard checks. Also defaults
 * to `credentials` when omitted, though in practice `credentials` is a
 * candidate/employer account and this check needs a real recruiter
 * login to mean anything.
 *
 * `schedulingAdminCredentials` is the same pattern for the Scheduling
 * Admin persona check (docs/adr/0060) — a real Scheduling Admin account,
 * logging into yet a third distinct login form/URL.
 */
export function createPortalAutomationTests(
  credentials: PortalCredentials,
  slotCheckCredentials: PortalCredentials = credentials,
  candidateSearchCredentials: PortalCredentials = credentials,
  recruiterCredentials: PortalCredentials = credentials,
  schedulingAdminCredentials: PortalCredentials = credentials,
): PortalAutomationTest[] {
  return [
    new SlotListingPricingTest(slotCheckCredentials),
    new SlotAvailabilitySnapshotTest(slotCheckCredentials),
    new SlotBookingFlowTest(slotCheckCredentials),
    new PremiumUpgradeTest(credentials),
    new DevelopmentReportDownloadTest(credentials),
    new CandidateSearchSkillFiltersTest(candidateSearchCredentials),
    new CandidateSearchGenderBreakdownTest(candidateSearchCredentials),
    new CandidateSearchEducationAdditiveTest(candidateSearchCredentials),
    new RecruiterDashboardNavigationTest(recruiterCredentials),
    new SchedulingAdminDashboardNavigationTest(schedulingAdminCredentials),
  ];
}
