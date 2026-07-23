import { createHash } from 'node:crypto';
import type { AnalysisCategory } from '@cqp/core';

/**
 * Deterministic dedup key for "is this the same finding as last scan?" —
 * see docs/adr/0012. Deliberately excludes line numbers: an unrelated edit
 * above a finding in the same file shifts its line without changing the
 * finding, and fingerprinting on line number would create a duplicate
 * Finding row instead of recognizing it.
 */
export interface FingerprintInput {
  category: AnalysisCategory;
  source: string;
  ruleId: string;
  primaryFilePath: string;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function computeFingerprint(input: FingerprintInput): string {
  const normalized = [
    input.category,
    input.source,
    input.ruleId,
    normalizeFilePath(input.primaryFilePath),
  ].join('|');

  return createHash('sha256').update(normalized).digest('hex');
}
