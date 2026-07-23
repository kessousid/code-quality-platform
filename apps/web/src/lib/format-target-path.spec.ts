import { describe, expect, it } from 'vitest';
import { formatTargetPath } from './format-target-path.js';

describe('formatTargetPath', () => {
  it('renders the whole-repo marker as a readable label instead of a bare dot', () => {
    expect(formatTargetPath('.')).toBe('whole repo');
  });

  it('leaves every other path untouched', () => {
    expect(formatTargetPath('src/math.ts')).toBe('src/math.ts');
    expect(formatTargetPath('helpers')).toBe('helpers');
  });
});
