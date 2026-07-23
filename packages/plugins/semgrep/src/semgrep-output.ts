/** The subset of Semgrep's `--json` output this adapter actually consumes. */

export interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: 'INFO' | 'WARNING' | 'ERROR';
    metadata?: {
      category?: string;
      cwe?: string[];
      owasp?: string[];
      references?: string[];
      confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
  };
}

export interface SemgrepOutput {
  results: SemgrepResult[];
  errors: unknown[];
}
