import type { Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';

const LOGIN_URL = 'https://portal.curatal.com/auth/recruiter/login';
export const RECRUITER_DASHBOARD_URL = 'https://portal.curatal.com/app/recruiter/dashboard';
const TIMEOUT = 30000;

/**
 * Live-verified against production (docs/adr/0059). Same login form as
 * candidate-search-navigation.ts's Platform Admin flow (same LOGIN_URL,
 * same field/submit selectors), but this flow diverges right after
 * login: a first-time-per-session "Introducing Curatal's AI Assessment"
 * promo modal appears that the Platform Admin flow never hit. Its
 * dismiss button reads "Skip", not "Cancel" -- confirmed live rather
 * than assumed, since a wrong button name here would just time out
 * waiting for content the modal is still covering.
 */
export async function loginToRecruiterDashboard(
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

  const skipButton = page.getByRole('button', { name: /^Skip$/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(1500);
  }

  // The sidebar loads collapsed to icons-only, same as the candidate
  // portal's own sidebar (portal-navigation.ts's loginAndExpandSidebar) --
  // the expand control is icon-only with no discoverable accessible name,
  // so this is the same real fragility point documented there: if the
  // layout changes, this coordinate click is the first thing to re-verify.
  await page.mouse.click(76, 109);
  await page.waitForTimeout(1000);
}

/**
 * Every sidebar label renders as TWO same-text elements: the real visible
 * nav item, and a second, zero-width one earlier in the DOM (confirmed
 * live -- a leftover tooltip/label counterpart for the collapsed
 * icon-only state, `boundingBox().width === 0`). `getByText(...).first()`
 * silently resolves to the hidden one and reports "not visible" even
 * when the item is plainly on screen, so every caller must check the
 * last match, not the first.
 */
export async function isSidebarNavItemVisible(page: Page, label: string): Promise<boolean> {
  return page
    .getByText(label, { exact: true })
    .last()
    .isVisible()
    .catch(() => false);
}
