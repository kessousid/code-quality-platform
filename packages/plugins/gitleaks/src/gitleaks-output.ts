/** The subset of gitleaks' `--report-format json` output this adapter consumes. */
export interface GitleaksFinding {
  RuleID: string;
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Secret: string;
  File: string;
  Entropy: number;
}

/** gitleaks emits a bare JSON array, not an object wrapper. */
export type GitleaksOutput = GitleaksFinding[];
