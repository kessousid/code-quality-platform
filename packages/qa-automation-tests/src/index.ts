export * from './portal-automation-test.js';
export * from './portal-navigation.js';
export * from './slot-listing-pricing.test-impl.js';
export * from './slot-availability-snapshot.test-impl.js';
export * from './slot-booking-flow.test-impl.js';
export * from './premium-upgrade.test-impl.js';
export * from './development-report-download.test-impl.js';

import type { PortalAutomationTest, PortalCredentials } from './portal-automation-test.js';
import { SlotListingPricingTest } from './slot-listing-pricing.test-impl.js';
import { SlotAvailabilitySnapshotTest } from './slot-availability-snapshot.test-impl.js';
import { SlotBookingFlowTest } from './slot-booking-flow.test-impl.js';
import { PremiumUpgradeTest } from './premium-upgrade.test-impl.js';
import { DevelopmentReportDownloadTest } from './development-report-download.test-impl.js';

/**
 * The extensible registry (see docs/adr/0035) — adding a new check means
 * adding a class file and one entry here, no DB/UI change required.
 * Credentials aren't known until runtime (env vars), so this is a
 * factory rather than a plain constant array.
 */
export function createPortalAutomationTests(
  credentials: PortalCredentials,
): PortalAutomationTest[] {
  return [
    new SlotListingPricingTest(credentials),
    new SlotAvailabilitySnapshotTest(credentials),
    new SlotBookingFlowTest(credentials),
    new PremiumUpgradeTest(credentials),
    new DevelopmentReportDownloadTest(credentials),
  ];
}
