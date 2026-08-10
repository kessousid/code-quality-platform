import { describe, expect, it } from 'vitest';
import { rewriteRelativeImportsForOutputLocation } from './rewrite-relative-imports.js';

describe('rewriteRelativeImportsForOutputLocation', () => {
  it('rewrites the module-under-test import for a nested source file (the live-reproduced bug)', () => {
    const content = `const { getHealth } = require('./health.controller');\nmodule.exports = {};\n`;

    const rewritten = rewriteRelativeImportsForOutputLocation(
      content,
      'src/controllers',
      'Unit tests/AI Based/src/controllers',
    );

    expect(rewritten).toContain("require('../../../../src/controllers/health.controller')");
  });

  it('rewrites a jest.mock() of a sibling dependency copied verbatim from the source file', () => {
    const content = `jest.mock('../utils/catchAsync', () => (fn) => fn);\n`;

    const rewritten = rewriteRelativeImportsForOutputLocation(
      content,
      'src/controllers',
      'Unit tests/AI Based/src/controllers',
    );

    expect(rewritten).toContain("jest.mock('../../../../src/utils/catchAsync'");
  });

  it('rewrites an ESM import statement the same way', () => {
    const content = `import { add } from './math';\n`;

    const rewritten = rewriteRelativeImportsForOutputLocation(content, '.', 'Unit tests/AI Based');

    expect(rewritten).toContain("from '../../math'");
  });

  it('rewrites correctly for a source file at repo root (2 levels up: "Unit tests" + generator folder)', () => {
    const content = `const { add } = require('./math');\n`;

    const rewritten = rewriteRelativeImportsForOutputLocation(
      content,
      '.',
      'Unit tests/Script based',
    );

    expect(rewritten).toContain("require('../../math')");
  });

  it('leaves non-relative imports (bare package specifiers) untouched', () => {
    const content = `import { z } from 'zod';\nconst lodash = require('lodash');\n`;

    const rewritten = rewriteRelativeImportsForOutputLocation(
      content,
      'src',
      'Unit tests/AI Based/src',
    );

    expect(rewritten).toBe(content);
  });
});
