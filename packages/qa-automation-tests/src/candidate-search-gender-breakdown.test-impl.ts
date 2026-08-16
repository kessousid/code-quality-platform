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

const GENDERS = ['Male', 'Female', 'Others'] as const;

/**
 * Ported from the staging pytest suite's TC_CANDSEARCH_002
 * (curatal_tests repo, feature/candidate-search-filter-tests branch).
 * With the same skill filters applied (Java/SpringBoot/Microservices,
 * all 3-star), the Male + Female + Others counts (applied one at a time
 * on top of the skill filters) should sum to the no-gender-filter total.
 *
 * Confirmed live on staging (2026-08-16) that the app currently violates
 * this invariant — this test documents/tracks that real bug and is NOT
 * expected to pass until the backend is fixed. Per the user: kept as a
 * normal (not conditionally-skipped) failure so it shows up as a real
 * failure in every report, the same as any other tracked bug, rather
 * than being silently accepted.
 */
export class CandidateSearchGenderBreakdownTest implements PortalAutomationTest {
  readonly id = 'candidate-search-gender-breakdown';
  readonly name = 'Candidate Search: Gender breakdown sums to the unfiltered total';

  constructor(private readonly credentials: PortalCredentials) {}

  async run(page: Page): Promise<PortalAutomationTestResult> {
    await loginAndReachCandidateSearch(page, this.credentials);
    const search = new CandidateSearchPanel(page);

    await search.selectSkillWithRating('Primary Skill', 'Java', 3);
    await search.selectSkillWithRating('Secondary Skills', 'SpringBoot', 3);
    await search.selectSkillWithRating('Secondary Skills', 'Microservices', 3);
    await search.clickApply();

    const [baselineShown] = await search.getShownAndTotal('Interviewed Candidates');

    const counts: Record<(typeof GENDERS)[number], number> = { Male: 0, Female: 0, Others: 0 };
    let previousGender: string | undefined;
    for (const gender of GENDERS) {
      await search.setGenderFilter(gender, previousGender);
      await search.clickApply();
      const [shown] = await search.getShownAndTotal('Interviewed Candidates');
      counts[gender] = shown;
      previousGender = gender;
    }

    const summed = counts.Male + counts.Female + counts.Others;
    return {
      passed: summed === baselineShown,
      details:
        `Male (${counts.Male}) + Female (${counts.Female}) + Others (${counts.Others}) = ` +
        `${summed}, expected to equal the no-gender-filter total (${baselineShown}).`,
    };
  }
}
