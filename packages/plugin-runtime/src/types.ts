/**
 * Deliberately generic (see docs/adr/0011) — knows nothing about
 * AnalyzerPlugin or Finding. Phase 7's scan orchestrator wires real
 * plugins through this; this package only isolates and times out an
 * arbitrary function running in a worker thread.
 */

export interface IsolationTarget {
  /** Absolute file:// URL or resolvable module specifier for the worker to import(). */
  modulePath: string;
  /** Named export to call; defaults to 'default'. */
  exportName?: string;
}

export type PluginRunResult<TOutput> =
  | { status: 'success'; result: TOutput }
  | { status: 'timeout' }
  | { status: 'error'; message: string };

export interface WorkerRequestMessage<TInput> {
  modulePath: string;
  exportName: string;
  input: TInput;
}

export type WorkerResponseMessage<TOutput> =
  { status: 'success'; result: TOutput } | { status: 'error'; message: string };
