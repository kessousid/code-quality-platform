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

import type { PortalAutomationTest, PortalCredentials } from './portal-automation-test.js';
import { SlotListingPricingTest } from './slot-listing-pricing.test-impl.js';
import { SlotAvailabilitySnapshotTest } from './slot-availability-snapshot.test-impl.js';
import { SlotBookingFlowTest } from './slot-booking-flow.test-impl.js';
import { PremiumUpgradeTest } from './premium-upgrade.test-impl.js';
import { DevelopmentReportDownloadTest } from './development-report-download.test-impl.js';
import { CandidateSearchSkillFiltersTest } from './candidate-search-skill-filters.test-impl.js';
import { CandidateSearchGenderBreakdownTest } from './candidate-search-gender-breakdown.test-impl.js';
import { CandidateSearchEducationAdditiveTest } from './candidate-search-education-additive.test-impl.js';

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
 */
export function createPortalAutomationTests(
  credentials: PortalCredentials,
  slotCheckCredentials: PortalCredentials = credentials,
  candidateSearchCredentials: PortalCredentials = credentials,
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
  ];
}
