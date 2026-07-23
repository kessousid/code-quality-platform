import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's own auto-cleanup only registers itself when it finds a global
// `afterEach` in scope at import time — this project doesn't set
// `test.globals: true`, so that check silently fails and DOM from one
// test leaks into the next (multiple tests in the same file rendering
// similar content start colliding on `getByText`/`getByRole`). Wiring it
// explicitly here fixes that for every test file, without turning on
// vitest's globals mode project-wide just for this.
afterEach(cleanup);

// jsdom doesn't implement ResizeObserver; React Flow and Recharts'
// ResponsiveContainer both require it to mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
