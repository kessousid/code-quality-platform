import type { Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';
import { expandCollapsedAdminSidebar, submitLoginUntilAppLoads } from './portal-navigation.js';

const LOGIN_URL = 'https://portal.curatal.com/auth/curatal-users/login';
const TIMEOUT = 30000;

/**
 * Platform Admin via the `auth/curatal-users/login` form, landing on
 * the admin dashboard (docs/adr/0070), as Prod_Automation's
 * `test_platform_admin_smoke_flow` does. The Candidate Search checks sign
 * the same account in through the recruiter login instead
 * (candidate-search-navigation.ts), which jumps straight to one page
 * rather than the admin dashboard this check starts from.
 */
export async function loginToPlatformAdminDashboard(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: TIMEOUT });

  const emailInput = page
    .locator(
      "input[type='email'], input[name='email'], input[placeholder*='Email' i], input[placeholder*='mail' i], input[type='text']",
    )
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: TIMEOUT });
  await emailInput.fill(credentials.email);
  await page.locator("input[type='password']").first().fill(credentials.password);
  await submitLoginUntilAppLoads(page, TIMEOUT * 2);
  await page.waitForTimeout(3000);

  await expandCollapsedAdminSidebar(page);
}
