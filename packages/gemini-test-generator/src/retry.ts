/**
 * Gemini's own transient failures (confirmed live: a real 503 "This model
 * is currently experiencing high demand... Please try again later") had
 * zero retry — a single spike failed the whole generation run outright,
 * even though Gemini's own message says it's usually short-lived. Scoped
 * to exactly the class of error that's actually transient: rate limiting
 * (429) and server-side overload/failure (500, 503) — never a genuine
 * client error (bad request, auth, not found), which retrying would only
 * repeat identically.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_INITIAL_DELAY_MS = 1000;

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  /** Injectable for tests — real callers get a genuine `setTimeout`-based wait. */
  sleep?: (ms: number) => Promise<void>;
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `@google/genai`'s `ApiError` — duck-typed rather than imported so this stays a pure, dependency-free retry helper. */
function retryableStatus(error: unknown): number | undefined {
  if (!(error instanceof Error) || error.name !== 'ApiError') {
    return undefined;
  }
  const status = (error as Error & { status?: unknown }).status;
  return typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status) ? status : undefined;
}

/**
 * Retries `fn` with exponential backoff (1s, 2s, 4s, ... by default) only
 * for Gemini's own retryable API errors — any other error (a genuine bad
 * request, an auth failure, `EmptyGeminiResponseError`) propagates on the
 * first attempt, since retrying those would just fail identically again.
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const sleep = options.sleep ?? realSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = retryableStatus(error);
      if (status === undefined || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = initialDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[gemini-test-generator] transient error ${status} (attempt ${attempt}/${maxAttempts}) — retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
}
