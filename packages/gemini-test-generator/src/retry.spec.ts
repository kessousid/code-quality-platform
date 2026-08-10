import { describe, expect, it, vi } from 'vitest';
import { withGeminiRetry } from './retry.js';

function apiError(status: number, message = 'boom'): Error {
  const error = new Error(message);
  error.name = 'ApiError';
  (error as Error & { status: number }).status = status;
  return error;
}

describe('withGeminiRetry', () => {
  it('returns the result immediately when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withGeminiRetry(fn, { sleep: vi.fn().mockResolvedValue(undefined) });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a real 503 (the live-reproduced Gemini overload) and succeeds on a later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(503, 'This model is currently experiencing high demand.'))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withGeminiRetry(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  it('retries rate limiting (429) and server errors (500) the same way', async () => {
    for (const status of [429, 500]) {
      const fn = vi.fn().mockRejectedValueOnce(apiError(status)).mockResolvedValue('ok');
      const result = await withGeminiRetry(fn, { sleep: vi.fn().mockResolvedValue(undefined) });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it('gives up and rethrows the last error after maxAttempts', async () => {
    const error = apiError(503);
    const fn = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withGeminiRetry(fn, { maxAttempts: 3, sleep })).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('never retries a non-retryable status (e.g. 400 bad request)', async () => {
    const error = apiError(400, 'bad prompt');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withGeminiRetry(fn, { sleep: vi.fn() })).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never retries an error that is not an ApiError at all (e.g. EmptyGeminiResponseError)', async () => {
    class EmptyGeminiResponseError extends Error {}
    const error = new EmptyGeminiResponseError('empty');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withGeminiRetry(fn, { sleep: vi.fn() })).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
