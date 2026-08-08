import type { Page } from 'playwright';

export interface PortalAutomationTestResult {
  passed: boolean;
  details: string;
}

/** See docs/adr/0035. Every registered test runs together on every scheduled tick. */
export interface PortalAutomationTest {
  id: string;
  name: string;
  run(page: Page): Promise<PortalAutomationTestResult>;
}

export interface PortalCredentials {
  email: string;
  password: string;
}
