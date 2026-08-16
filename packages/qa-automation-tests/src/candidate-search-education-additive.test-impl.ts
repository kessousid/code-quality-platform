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
 * Ported from the staging pytest suite's TC_CANDSEARCH_003
 * (curatal_tests repo, feature/candidate-search-filter-tests branch).
 * With the same skill filters applied (Java/SpringBoot/Microservices,
 * all 3-star), selecting "Bachelor of Engineering" in the Education
 * filter and applying should show a real "Showing X out of Y".
 * Additionally selecting "Bachelor of Technology" too (on top of, not
 * instead of, Bachelor of Engineering) and re-applying should show the
 * EXACT SAME count.
 *
 * Confirmed live on staging (2026-08-16) that the app currently
 * violates this invariant — this test documents/tracks that real bug,
 * same as the Gender breakdown test.
 */
export class CandidateSearchEducationAdditiveTest implements PortalAutomationTest {
  readonly id = 'candidate-search-education-additive';
  readonly name = 'Candidate Search: additive Education selection keeps count stable';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachCandidateSearch(page, this.credentials);
    const search = new CandidateSearchPanel(page);

    await search.selectSkillWithRating('Primary Skill', 'Java', 3);
    await search.selectSkillWithRating('Secondary Skills', 'SpringBoot', 3);
    await search.selectSkillWithRating('Secondary Skills', 'Microservices', 3);

    await search.checkFilterOption('Education', 'Bachelor of Engineering');
    await search.clickApply();
    const [beOnlyShown] = await search.getShownAndTotal('Interviewed Candidates');

    await search.checkFilterOption('Education', 'Bachelor of Technology');
    await search.clickApply();
    const [beAndBtechShown] = await search.getShownAndTotal('Interviewed Candidates');

    return {
      passed: beAndBtechShown === beOnlyShown,
      details:
        `Adding 'Bachelor of Technology' alongside 'Bachelor of Engineering' changed the ` +
        `shown count from ${beOnlyShown} to ${beAndBtechShown} -- expected it to stay the same.`,
    };
  }
}
