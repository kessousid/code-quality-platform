# ADR-0049: Retry Gemini's transient API errors with exponential backoff

## Status

Accepted

## Context

Live-testing unit-test generation hit a real failure:

```
{"error":{"code":503,"message":"This model is currently experiencing
high demand. Spikes in demand are usually temporary. Please try again
later.","status":"UNAVAILABLE"}}
```

`GeminiJestTestGenerator` made exactly one call to
`this.client.models.generateContent()` with no retry at all — Gemini's
own message says the condition is transient, but the platform failed
the entire generation run outright on the first hiccup, with no
self-healing.

## Decision

New `withGeminiRetry()` (`packages/gemini-test-generator/src/retry.ts`)
wraps the `generateContent` call with exponential backoff (1s, 2s, 4s,
... — 4 attempts by default), but only for `@google/genai`'s own
`ApiError` with a genuinely transient HTTP status: `429` (rate limited),
`500`, or `503` (server-side overload/failure). Anything else — a bad
request, an auth failure, `EmptyGeminiResponseError` — propagates on the
first attempt, since retrying those would just fail identically again.
Duck-types `error.name === 'ApiError'` rather than importing the SDK's
class, keeping the retry helper itself a small, dependency-free,
independently-testable function. `sleep` is an injectable option purely
for fast, deterministic tests — every real caller gets a genuine
`setTimeout`-based wait.

## Consequences

- A transient Gemini overload now self-heals within a few seconds
  instead of failing the whole run — matches what Gemini's own error
  message already tells the caller to expect ("usually temporary").
- Scoped to Gemini generation only; the deterministic script generator
  has no external API call and nothing to retry.
- A sustained outage (4 failed attempts) still surfaces as a real
  failure — this bounds retry time, it doesn't paper over Gemini being
  genuinely down.
