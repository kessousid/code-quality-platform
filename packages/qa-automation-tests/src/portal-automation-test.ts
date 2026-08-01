import type { Page } from 'playwright';

export interface PortalAutomationTestResult {
  passed: boolean;
  details: string;
}

/**
 * See docs/adr/0035. `frequency` decides how often
 * RunQaAutomationSuiteUseCase actually executes this test on a scheduled
 * tick — `'daily'` is for tests with a real-world side effect (e.g.
 * opening a real payment checkout) that shouldn't repeat every interval.
 * A manual "Run now" trigger always runs every test regardless.
 */
export interface PortalAutomationTest {
  id: string;
  name: string;
  frequency: 'every-run' | 'daily';
  run(page: Page): Promise<PortalAutomationTestResult>;
}

export interface PortalCredentials {
  email: string;
  password: string;
}
