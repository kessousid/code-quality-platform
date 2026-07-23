import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { IsolationTarget, PluginRunResult, WorkerResponseMessage } from './types.js';

/**
 * Always resolves to the compiled dist/worker-entry.js, regardless of
 * whether *this* file is currently executing as src/runtime.ts (Vitest and
 * tsx both run TS source directly, never dist — see docs/adr/0011) or as
 * dist/runtime.js (production). Either way, the current file is exactly
 * one directory below the package root, so going up one level and back
 * down into `dist` lands on the same compiled worker file in both cases.
 * This is why the package's `pretest` script builds first: it's what makes
 * dist/worker-entry.js exist on disk even when tests never load dist/runtime.js.
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER_ENTRY_PATH = join(packageRoot, 'dist', 'worker-entry.js');

export function runIsolated<TInput, TOutput>(
  target: IsolationTarget,
  input: TInput,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<PluginRunResult<TOutput>> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_ENTRY_PATH, {
      workerData: {
        modulePath: target.modulePath,
        exportName: target.exportName ?? 'default',
        input,
      },
    });

    let settled = false;
    const settle = (result: PluginRunResult<TOutput>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      void worker.terminate();
      resolve(result);
    };

    // Cancelling a scan (see docs/adr/0023) has to actually kill the
    // in-flight plugin, not just stop waiting on it — otherwise the worker
    // thread (and whatever child process it spawned, e.g. Semgrep) keeps
    // burning CPU after the scan is reported as cancelled.
    const onAbort = () => {
      settle({ status: 'error', message: 'aborted' });
    };
    options.signal?.addEventListener('abort', onAbort);

    const timer = setTimeout(() => {
      settle({ status: 'timeout' });
    }, options.timeoutMs);

    worker.once('message', (message: WorkerResponseMessage<TOutput>) => {
      settle(
        message.status === 'success'
          ? { status: 'success', result: message.result }
          : { status: 'error', message: message.message },
      );
    });

    worker.once('error', (error: Error) => {
      settle({ status: 'error', message: error.message });
    });
  });
}
