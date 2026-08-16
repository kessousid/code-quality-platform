import type { Locator, Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';

const LOGIN_URL = 'https://portal.curatal.com/auth/recruiter/login';
const CANDIDATE_SEARCH_URL = 'https://portal.curatal.com/app/recruiter/candidate/search';
const TIMEOUT = 30000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Minimal shape for walking up the DOM to find a scrollable ancestor — avoids depending on lib.dom's HTMLElement (not in this package's tsconfig `lib`). */
interface ScrollableNode {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  parentElement: ScrollableNode | null;
}

/**
 * Ported from the staging pytest suite's proven login flow (curatal_tests
 * repo, conftest.py's `_do_login`, used by the Platform Admin role) and
 * CandidateSearchFilterPage.navigate() — same app/login form, only the
 * domain differs (portal.curatal.com instead of staging.curatal.com, per
 * the user). Direct URL navigation to Candidate Search (rather than
 * clicking through the sidebar like this package's other `loginAndReach*`
 * helpers) mirrors what the staging suite already does reliably.
 */
export async function loginAndReachCandidateSearch(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: TIMEOUT });

  const signInButton = page.getByRole('button', { name: /^Sign In$/i });
  if ((await signInButton.count()) > 0) {
    await signInButton.first().click();
  }

  const emailInput = page
    .locator(
      "input[type='email'], input[name='email'], input[placeholder*='Email' i], input[placeholder*='mail' i], input[type='text']",
    )
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: TIMEOUT });
  await emailInput.fill(credentials.email);
  await page.locator("input[type='password']").first().fill(credentials.password);

  const submitButton = page.locator("button[type='submit']");
  if ((await submitButton.count()) > 0) {
    await submitButton.first().click();
  } else {
    await page
      .getByRole('button', { name: /Sign In|Login|Submit/i })
      .last()
      .click();
  }

  await page.waitForURL('**/app/**', { timeout: TIMEOUT * 2 });

  await page.goto(CANDIDATE_SEARCH_URL, { waitUntil: 'load', timeout: TIMEOUT });
  const heading = page
    .locator('main')
    .first()
    .getByText(/^Candidate Search$/i)
    .first();
  await heading.waitFor({ state: 'visible', timeout: TIMEOUT });

  // Confirmed live on staging (2026-08-16): a filter-trigger click
  // immediately after load can silently no-op — the panel never opens —
  // almost certainly a hydration race (the SPA's own JS not fully
  // attached yet even though the static content is already visible).
  await page.waitForTimeout(1500);
}

/**
 * TypeScript port of the staging pytest suite's `CandidateSearchFilterPage`
 * (curatal_tests repo, automation/pages/candidate_search_filter_page.py) —
 * every selector and workaround here (virtualized-list scroll, plain
 * `.click()` instead of `.check()`/`force: true` on checkboxes, the
 * hydration-race retry on opening a filter, the 90s "Showing X out of Y"
 * wait) is copied from that file's live-confirmed behavior on staging, not
 * re-derived from scratch.
 */
export class CandidateSearchPanel {
  private readonly main: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main').first();
  }

  private async openFilter(filterLabel: string): Promise<void> {
    const trigger = this.main.getByText(new RegExp(`^${escapeRegExp(filterLabel)}`, 'i')).first();
    await trigger.waitFor({ state: 'visible', timeout: TIMEOUT });
    const searchBox = this.main.getByPlaceholder(/search/i).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.click();
      await this.page.waitForTimeout(500);
      if ((await searchBox.count()) > 0 && (await searchBox.isVisible())) {
        return;
      }
    }
    await searchBox.waitFor({ state: 'visible', timeout: TIMEOUT });
  }

  private async findExactSkillLabel(skillName: string): Promise<Locator> {
    const label = this.page.getByText(new RegExp(`^${escapeRegExp(skillName)}$`)).first();
    const checkbox = this.page.locator("input[type='checkbox']").first();
    await checkbox.waitFor({ state: 'visible', timeout: TIMEOUT });
    for (let i = 0; i < 25; i += 1) {
      if ((await label.count()) > 0 && (await label.isVisible())) {
        return label;
      }
      await checkbox.evaluate((el: ScrollableNode) => {
        let node: ScrollableNode | null = el;
        while (node) {
          if (node.scrollHeight > node.clientHeight + 5) {
            node.scrollTop += 250;
            break;
          }
          node = node.parentElement;
        }
      });
      await this.page.waitForTimeout(250);
    }
    return label;
  }

  private async rowFromLabel(label: Locator): Promise<Locator> {
    for (const depth of [1, 2, 3, 4]) {
      const row = label.locator(`xpath=ancestor::div[${depth}]`);
      if ((await row.count()) === 0) continue;
      const hasCheckbox = (await row.locator("input[type='checkbox']").count()) > 0;
      const hasRadio = (await row.getByRole('radio').count()) > 0;
      if (hasCheckbox && hasRadio) {
        return row.first();
      }
    }
    return label.locator('xpath=ancestor::div[2]').first();
  }

  async selectSkillWithRating(
    filterLabel: string,
    skillName: string,
    rating: number,
    searchQuery?: string,
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error(`rating must be 1-5, got ${rating}`);
    }
    const query = searchQuery ?? skillName;
    await this.openFilter(filterLabel);

    const searchBox = this.main.getByPlaceholder(/search/i).first();
    await searchBox.waitFor({ state: 'visible', timeout: TIMEOUT });
    await searchBox.fill(query);
    await this.page.waitForTimeout(1000);

    const label = await this.findExactSkillLabel(skillName);
    await label.waitFor({ state: 'visible', timeout: TIMEOUT });
    const row = await this.rowFromLabel(label);
    await row.waitFor({ state: 'visible', timeout: TIMEOUT });

    // Plain .click() (not .check()/force:true) — this list re-renders and
    // can pin a checked row to a new position, making the original
    // element reference stale by the time a built-in re-verification
    // reads it. Confirmed live on staging.
    const checkbox = row.locator("input[type='checkbox']").first();
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
      await this.page.waitForTimeout(300);
    }

    const ratingRadio = row
      .getByRole('radio', { name: new RegExp(`^${rating}\\s*Stars?$`, 'i') })
      .first();
    await ratingRadio.waitFor({ state: 'visible', timeout: TIMEOUT });
    await ratingRadio.click({ force: true });
    await this.page.waitForTimeout(300);

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  private async waitForEnabled(locator: Locator, timeout: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await locator.isEnabled().catch(() => false)) return;
      await this.page.waitForTimeout(200);
    }
    throw new Error('Timed out waiting for the Apply button to become enabled');
  }

  async clickApply(): Promise<void> {
    const applyBtn = this.main.getByRole('button', { name: /^Apply$/i }).first();
    await this.waitForEnabled(applyBtn, TIMEOUT);
    await applyBtn.click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Filtering the full candidate pool by multiple skill+rating criteria
   * can genuinely take longer than TIMEOUT to finish — confirmed live on
   * staging via the page's own loading indicator still showing real,
   * advancing progress. 90s wait for this one assertion only.
   */
  async getShownAndTotal(tab: string = 'Interviewed Candidates'): Promise<[number, number]> {
    const tabLocator = this.main.getByText(new RegExp(`^${escapeRegExp(tab)}$`, 'i')).first();
    await tabLocator.waitFor({ state: 'visible', timeout: TIMEOUT });
    await tabLocator.click();
    await this.page.waitForTimeout(1500);

    const showingText = this.main.getByText(/Showing\s+\d+\s+out of\s+\d+/i).first();
    await showingText.waitFor({ state: 'visible', timeout: 90000 });
    const text = await showingText.innerText();
    const match = /Showing\s+(\d+)\s+out of\s+(\d+)/i.exec(text);
    if (!match) {
      throw new Error(`Could not parse 'Showing X out of Y' from: ${text}`);
    }
    return [Number(match[1]), Number(match[2])];
  }

  private simpleFilterCheckbox(optionLabel: string): Locator {
    return this.page
      .locator('div.flex.items-center, label')
      .filter({ has: this.page.locator("input[type='checkbox']") })
      .filter({ hasText: new RegExp(`^${escapeRegExp(optionLabel)}$`, 'i') })
      .first()
      .locator("input[type='checkbox']")
      .first();
  }

  /** Opens Gender, unchecks `previous` (if given) and checks `gender`. Does not click Apply. */
  async setGenderFilter(gender: string, previous?: string): Promise<void> {
    await this.openFilter('Gender');

    if (previous !== undefined) {
      let cleared = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const prevCheckbox = this.simpleFilterCheckbox(previous);
        if ((await prevCheckbox.count()) === 0 || !(await prevCheckbox.isChecked())) {
          cleared = true;
          break;
        }
        await prevCheckbox.click();
        await this.page.waitForTimeout(300);
      }
      if (!cleared) {
        throw new Error(
          `Could not uncheck previous gender "${previous}" after 3 attempts -- it's ` +
            `still checked, which would silently contaminate the next gender's count.`,
        );
      }
    }

    const targetCheckbox = this.simpleFilterCheckbox(gender);
    await targetCheckbox.waitFor({ state: 'visible', timeout: TIMEOUT });
    if (!(await targetCheckbox.isChecked())) {
      await targetCheckbox.click();
      await this.page.waitForTimeout(200);
    }

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /** Opens `filterLabel` and additively checks `optionLabel`, without unchecking anything else. Does not click Apply. */
  async checkFilterOption(filterLabel: string, optionLabel: string): Promise<void> {
    await this.openFilter(filterLabel);
    const checkbox = this.simpleFilterCheckbox(optionLabel);
    await checkbox.waitFor({ state: 'visible', timeout: TIMEOUT });
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
      await this.page.waitForTimeout(300);
    }
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }
}
