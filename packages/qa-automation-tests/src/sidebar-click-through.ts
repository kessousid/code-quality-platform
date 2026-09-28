import type { Locator, Page } from 'playwright';

/**
 * One sidebar destination to click through to (docs/adr/0070). `parent`
 * is set for items nested under a collapsible group (Platform Admin's
 * "Customer" > "Create Customer" etc.) — the child only renders after the
 * parent is clicked. `expectedUrl` is omitted only where production has no
 * confirmed URL for the item yet; the click still has to land somewhere
 * that isn't the login page.
 */
export interface SidebarNavTarget {
  label: string;
  parent?: string;
  expectedUrl?: string;
}

const EXPANDED_SIDEBAR_MIN_WIDTH = 150;
const NAV_TIMEOUT = 30000;
const CLICK_TIMEOUT = 10000;

/**
 * Ported from the Prod_Automation pytest suite's `sidebar_locator`
 * (Saraswati0284/Prod_Automation, utils/sidebar_helper.py): the leaf
 * `div` whose whole text is `label`, scoped to `#sidebarMain` so a page
 * heading with the same text ("Dashboard") never matches. The same label
 * can still match more than once inside the sidebar (the zero-width
 * collapsed-state twin noted on `isAdminSidebarNavItemVisible`), so this
 * returns the first match that's actually visible, or null.
 */
async function findVisibleSidebarItem(page: Page, label: string): Promise<Locator | null> {
  return firstVisible(
    page.locator(`xpath=//div[@id="sidebarMain"]//div[not(*) and normalize-space(.)="${label}"]`),
  );
}

/**
 * Clicking a nav item can collapse the sidebar back to icons-only, so
 * every step re-checks. Width, not a toggle state, decides — the expand
 * control is a toggle, and clicking it on an already-open sidebar would
 * close it (same approach as Prod_Automation's `ensure_sidebar_open`).
 */
export async function ensureSidebarOpen(page: Page): Promise<void> {
  const sidebar = page.locator('#sidebarMain');
  await sidebar.waitFor({ state: 'attached', timeout: NAV_TIMEOUT });
  // The sidebar animates closed after some route changes, so a single
  // width reading can still say "open" just before it collapses (seen as
  // intermittent "parent menu not visible" failures on Platform Admin).
  // Wait for two matching readings first.
  let box = await sidebar.boundingBox();
  for (let i = 0; i < 15; i += 1) {
    await page.waitForTimeout(200);
    const next = await sidebar.boundingBox();
    const settled = next?.width === box?.width;
    box = next;
    if (settled) break;
  }
  if (box && box.width > EXPANDED_SIDEBAR_MIN_WIDTH) return;

  // The round arrow button pinned to the sidebar's right edge, confirmed
  // live to toggle it on both the admin and recruiter page shells. Not
  // `expandCollapsedAdminSidebar`'s fixed (76, 109) click: that point is
  // only the arrow while collapsed, and on an expanded sidebar it's the
  // "Dashboard" row, which silently navigated back to the dashboard and
  // derailed every later step. `force` covers the brief window where an
  // animation fails Playwright's actionability check.
  const toggle = page.locator('#sidebarMain > div.absolute').first();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await toggle
      .click({ timeout: 3000 })
      .catch(() => toggle.click({ force: true, timeout: CLICK_TIMEOUT }));
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(250);
      const expanded = await sidebar.boundingBox();
      if (expanded && expanded.width > EXPANDED_SIDEBAR_MIN_WIDTH) return;
    }
  }
}

/**
 * Some destinations open a MUI dialog on arrival (Create Job's intro
 * popup, the candidate "Verification Details" prompt) that covers the
 * sidebar for the next click. Checked lazily before each click rather
 * than waited for after every navigation, so pages without one cost
 * nothing.
 */
async function dismissOpenDialog(page: Page): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    const dialog = await firstVisible(page.locator('.MuiDialog-root'));
    if (!dialog) return;

    // Only ever a close/cancel control, never the dialog's own action
    // buttons (Create Job's "Which Hiring Service" modal offers
    // "Continue" into a real job-creation flow). That modal's close is a
    // back arrow labelled "close", with a hidden duplicate ahead of it in
    // the DOM, and it ignores Escape, so the first *visible* match matters.
    const close =
      (await firstVisible(dialog.locator('button[aria-label="close" i]'))) ??
      (await firstVisible(dialog.getByRole('button', { name: /^(Close|Cancel|Skip)$/i })));
    if (close) {
      await close.click({ timeout: CLICK_TIMEOUT }).catch(() => undefined);
    } else {
      await page.keyboard.press('Escape');
    }
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  }
}

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const match = locator.nth(i);
    if (await match.isVisible().catch(() => false)) return match;
  }
  return null;
}

/** First line of a Playwright error plus the locator it was waiting on, which the first line alone doesn't name. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const lines = error.message.split('\n');
  const waitingFor = lines.find((line) => line.includes('waiting for locator'));
  // eslint-disable-next-line no-control-regex
  return waitingFor ? `${lines[0]} (${waitingFor.replace(/\u001b\[\d+m/g, '').trim()})` : lines[0]!;
}

/**
 * Opens `target` through the sidebar from a freshly loaded `startUrl`.
 * Starting every target from a full page load, rather than chaining
 * clicks, was forced by live evidence (docs/adr/0070): after an in-app
 * route change from the admin shell into a recruiter-shell page
 * (Platform Admin > Candidates > Unlocked Candidates), the sidebar's
 * toggle stopped expanding it and instead navigated to the dashboard on
 * every click, failing every later step. The same toggle works after a
 * full load of that same page. A fresh load also resets open groups
 * (this sidebar doesn't scroll, so several open groups push items below
 * the viewport) and any popup the previous page opened.
 */
async function openFromSidebar(
  page: Page,
  startUrl: string,
  target: SidebarNavTarget,
): Promise<void> {
  await page.goto(startUrl, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  await dismissOpenDialog(page);
  await ensureSidebarOpen(page);

  let item = await findVisibleSidebarItem(page, target.label);
  if (!item && target.parent) {
    const parent = await findVisibleSidebarItem(page, target.parent);
    if (!parent) throw new Error('parent menu not visible');
    await parent.click({ timeout: CLICK_TIMEOUT });
    await page.waitForTimeout(500);
    item = await findVisibleSidebarItem(page, target.label);
  }
  if (!item) throw new Error('not visible in the sidebar');

  // A dialog can render just after the check above (Create Job's popup
  // did, intercepting the click); dismiss and retry once.
  const clicked = await item
    .click({ timeout: CLICK_TIMEOUT / 2 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await dismissOpenDialog(page);
    await item.click({ timeout: CLICK_TIMEOUT });
  }
}

/**
 * Opens every target and checks where each one lands. Runs them all
 * rather than stopping at the first failure, so one broken page doesn't
 * hide the rest; returns one line per failed target (empty means all
 * passed).
 */
export async function clickThroughSidebar(
  page: Page,
  startUrl: string,
  targets: readonly SidebarNavTarget[],
): Promise<string[]> {
  const failures: string[] = [];

  for (const target of targets) {
    const name = target.parent ? `${target.parent} > ${target.label}` : target.label;
    try {
      await openFromSidebar(page, startUrl, target);
      if (target.expectedUrl) {
        const landed = await page
          .waitForURL(target.expectedUrl, { timeout: NAV_TIMEOUT })
          .then(() => true)
          .catch(() => false);
        if (!landed) {
          failures.push(`${name}: expected ${target.expectedUrl}, landed on ${page.url()}`);
          continue;
        }
      } else {
        await page.waitForLoadState('load', { timeout: NAV_TIMEOUT });
      }
      if (page.url().includes('/auth/')) {
        failures.push(`${name}: redirected to login (${page.url()})`);
      }
    } catch (error) {
      failures.push(`${name}: ${describeError(error)}`);
    }
  }

  return failures;
}
