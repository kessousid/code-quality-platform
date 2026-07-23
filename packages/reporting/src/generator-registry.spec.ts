import { describe, expect, it } from 'vitest';
import type { ReportFormat } from '@cqp/core';
import { getReportGenerator } from './generator-registry.js';

describe('getReportGenerator', () => {
  it.each<ReportFormat>(['json', 'sarif', 'html', 'pdf'])('resolves the %s generator', (format) => {
    const generator = getReportGenerator(format);
    expect(generator.format).toBe(format);
  });
});
