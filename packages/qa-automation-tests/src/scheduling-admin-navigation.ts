import type { Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';
import { expandCollapsedAdminSidebar } from './portal-navigation.js';

const LOGIN_URL = 'https://portal.curatal.com/auth/curatal-users/login';
const TIMEOUT = 30000;

/**
 * Live-verified against production (docs/adr/0060). A third, distinct
 * login form/URL from both the candidate/employer portal
 * (portal-navigation.ts) and the recruiter/Platform Admin login
 * (candidate-search-navigation.ts, recruiter-navigation.ts) -- unlike
 * the recruiter flow, no promo modal appears here to dismiss. Same
 * collapsed icons-only sidebar as the recruiter dashboard though, so
 * this reuses expandCollapsedAdminSidebar.
 */
export async function loginToSchedulingAdminDashboard(
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
  await page.locator("button[type='submit']").first().click();

  await page.waitForURL('**/app/**', { timeout: TIMEOUT * 2 });
  await page.waitForTimeout(3000);

  await expandCollapsedAdminSidebar(page);
}
