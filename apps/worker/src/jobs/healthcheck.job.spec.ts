import { describe, expect, it } from 'vitest';
import { processHealthcheckJob } from './healthcheck.job.js';

describe('processHealthcheckJob', () => {
  it('echoes the ping back as pong with a processing timestamp', () => {
    const result = processHealthcheckJob({ ping: 'hello' });

    expect(result.pong).toBe('hello');
    expect(new Date(result.processedAt).toString()).not.toBe('Invalid Date');
  });
});
