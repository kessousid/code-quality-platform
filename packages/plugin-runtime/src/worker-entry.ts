import { parentPort, workerData } from 'node:worker_threads';
import type { WorkerRequestMessage, WorkerResponseMessage } from './types.js';

/**
 * Runs inside the worker thread spawned by runtime.ts. This file must be
 * compiled JS at runtime (dist/worker-entry.js) — see docs/adr/0011 and
 * this package's `pretest` script.
 */
async function main() {
  const { modulePath, exportName, input } = workerData as WorkerRequestMessage<unknown>;

  try {
    const mod = (await import(modulePath)) as Record<string, unknown>;
    const target = mod[exportName];
    if (typeof target !== 'function') {
      throw new Error(`Export "${exportName}" of ${modulePath} is not a function`);
    }

    const result = await (target as (input: unknown) => unknown)(input);
    const response: WorkerResponseMessage<unknown> = { status: 'success', result };
    parentPort?.postMessage(response);
  } catch (error) {
    const response: WorkerResponseMessage<unknown> = {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    parentPort?.postMessage(response);
  }
}

main();
