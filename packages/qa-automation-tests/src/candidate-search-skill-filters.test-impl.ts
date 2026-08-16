import type { Page } from 'playwright';
import type {
  PortalAutomationTest,
  PortalAutomationTestResult,
  PortalCredentials,
} from './portal-automation-test.js';
import {
  CandidateSearchPanel,
  loginAndReachCandidateSearch,
} from './candidate-search-navigation.js';

/**
 * Ported from the staging pytest suite's TC_CANDSEARCH_001
 * (curatal_tests repo, feature/candidate-search-filter-tests branch) —
 * confirmed live on staging. Selecting an exact-match Primary Skill
 * (Java, 3-star) plus two Secondary Skills (SpringBoot, Microservices,
 * both 3-star) and clicking Apply should show a real "Showing X out of
 * Y" on both tabs, with 0 <= X <= Y. Counts aren't asserted against
 * fixed numbers — the real candidate pool changes over time.
 */
export class CandidateSearchSkillFiltersTest implements PortalAutomationTest {
  readonly id = 'candidate-search-skill-filters';
  readonly name = 'Candidate Search: Primary + Secondary skill filters return real results';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachCandidateSearch(page, this.credentials);
    const search = new CandidateSearchPanel(page);

    await search.selectSkillWithRating('Primary Skill', 'Java', 3);
    await search.selectSkillWithRating('Secondary Skills', 'SpringBoot', 3);
    await search.selectSkillWithRating('Secondary Skills', 'Microservices', 3);
    await search.clickApply();

    const tabSummaries: string[] = [];
    for (const tab of ['Interviewed Candidates', 'Not Interviewed Candidates']) {
      const [shown, total] = await search.getShownAndTotal(tab);
      if (total <= 0) {
        return { passed: false, details: `${tab}: expected a positive total, got ${total}` };
      }
      if (!(shown >= 0 && shown <= total)) {
        return {
          passed: false,
          details: `${tab}: shown (${shown}) should be between 0 and total (${total})`,
        };
      }
      tabSummaries.push(`${tab}: Showing ${shown} out of ${total}`);
    }
    return { passed: true, details: tabSummaries.join('; ') };
  }
}
