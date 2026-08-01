import type { QaBrowser, QaBrowserFactory } from '../run-qa-automation-suite.use-case.js';

/** Never launches a real browser — mirrors InMemoryCronExecutor's role for the QA suite use case. */
export class FakeQaBrowser implements QaBrowser {
  closed = false;
  pagesOpened = 0;

  async newPage() {
    this.pagesOpened += 1;
    return {} as never;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function createFakeQaBrowserFactory(): {
  factory: QaBrowserFactory;
  browser: FakeQaBrowser;
} {
  const browser = new FakeQaBrowser();
  return { factory: async () => browser, browser };
}
