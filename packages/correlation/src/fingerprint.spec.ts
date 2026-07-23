import { describe, expect, it } from 'vitest';
import { computeFingerprint } from './fingerprint.js';

describe('computeFingerprint', () => {
  const base = {
    category: 'security' as const,
    source: 'semgrep',
    ruleId: 'sql-injection',
    primaryFilePath: 'src/db.ts',
  };

  it('is deterministic for identical input', () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint({ ...base }));
  });

  it('normalizes backslashes and a leading ./ so path style does not create a new fingerprint', () => {
    const posix = computeFingerprint({ ...base, primaryFilePath: 'src/db.ts' });
    const windows = computeFingerprint({ ...base, primaryFilePath: 'src\\db.ts' });
    const relative = computeFingerprint({ ...base, primaryFilePath: './src/db.ts' });

    expect(windows).toBe(posix);
    expect(relative).toBe(posix);
  });

  it('differs when the rule differs', () => {
    expect(computeFingerprint({ ...base, ruleId: 'xss' })).not.toBe(computeFingerprint(base));
  });

  it('differs when the file differs', () => {
    expect(computeFingerprint({ ...base, primaryFilePath: 'src/other.ts' })).not.toBe(
      computeFingerprint(base),
    );
  });

  it('differs when the source engine differs, even with the same rule id', () => {
    expect(computeFingerprint({ ...base, source: 'custom-scanner' })).not.toBe(
      computeFingerprint(base),
    );
  });

  it('is stable regardless of an unrelated line-number shift (not part of the input at all)', () => {
    // Fingerprint input has no line number field — this test documents that
    // omission is deliberate, not an oversight (see ADR-0012).
    const fingerprint = computeFingerprint(base);
    expect(fingerprint).toHaveLength(64); // sha256 hex digest length
  });
});
