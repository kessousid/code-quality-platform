/** See docs/adr/0025. Per-run child records: one row per changed file, with which of its changed lines Istanbul saw executed. */

export type CoverageFileStatus = 'covered' | 'uncovered';

export interface CoverageFileResult {
  id: string;
  runId: string;
  /** Relative to the repo's localPath. */
  filePath: string;
  /** Every coverable line the working tree added/modified relative to baseRef, in the new (working-tree) numbering. */
  changedLines: number[];
  /** Subset of changedLines with zero Istanbul hits — empty array means this file is fully covered. */
  uncoveredLines: number[];
  status: CoverageFileStatus;
}

export interface CoverageFileResultRepository {
  saveMany(
    runId: string,
    results: Omit<CoverageFileResult, 'id' | 'runId'>[],
  ): Promise<CoverageFileResult[]>;
  listByRun(runId: string): Promise<CoverageFileResult[]>;
}
