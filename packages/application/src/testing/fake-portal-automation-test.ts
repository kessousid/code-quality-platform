import type { PortalAutomationTest, PortalAutomationTestResult } from '@cqp/qa-automation-tests';

/** Configurable fake — never opens a real browser/page, unlike the real Playwright-backed tests. */
export class FakePortalAutomationTest implements PortalAutomationTest {
  result: PortalAutomationTestResult = { passed: true, details: 'ok' };
  readonly runCalls: unknown[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
    readonly frequency: 'every-run' | 'daily' = 'every-run',
  ) {}

  async run(page: unknown): Promise<PortalAutomationTestResult> {
    this.runCalls.push(page);
    return this.result;
  }
}
