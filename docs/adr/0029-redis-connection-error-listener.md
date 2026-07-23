# ADR-0029: A shared Redis connection helper that doesn't crash the process on a transient error

## Status

Accepted

## Context

Across this session, the API and worker processes repeatedly crashed
with `Error: getaddrinfo ENOTFOUND <redis-host>` and stayed dead until
manually restarted — surfacing to the user as "most of the time, when I
go to localhost, I am getting... Failed to load repos." The DNS failure
itself was transient (resolving fine moments before and after), so a
one-off lookup hiccup shouldn't have been fatal at all.

Four separate places each constructed their own `new Redis(redisUrl, {
maxRetriesPerRequest: null })` — `scan.module.ts`, `unit-test.module.ts`,
and `coverage.module.ts` in `apps/api`, plus `apps/worker/src/main.ts` —
and none of them attached an `.on('error', ...)` listener. ioredis's
`Redis` class extends Node's `EventEmitter`, and Node has a special rule
for the `'error'` event specifically: if it's emitted with zero
listeners attached, the process crashes with an uncaught exception,
unlike every other event name. ioredis itself already retries connection
failures internally via its own `retryStrategy` — the crash was never
about giving up on reconnecting, only about nothing being there to
receive the event ioredis emits while it does.

## Decision

One shared `createRedisConnection(redisUrl)` in `@cqp/queue`
(`packages/queue/src/redis-connection.ts`), replacing all four inline
`new Redis(...)` call sites. It constructs the connection with the same
options as before and attaches a listener that logs and returns —
letting ioredis's own retry behavior continue underneath, instead of
letting the event reach Node with nothing there to catch it.

Placed in `@cqp/queue` specifically (not duplicated per-call-site, and
not in `@cqp/core` or a new package) because it's already the one shared
package both `apps/api` and `apps/worker` depend on for every
BullMQ-related concern — this is just one more thing they were
duplicating that belongs in the same place as the rest.

`ioredis` was a direct dependency of `apps/api` and `apps/worker` only
to support these four inline constructions; now that construction lives
in `@cqp/queue` (which already needed `ioredis` as a direct dependency
to make the type-checker happy on `createRedisConnection`'s own return
type), the now-unused direct dependency was removed from both apps.

## Consequences

- A genuinely persistent Redis outage (not a transient blip) still means
  every actual queue operation fails — this only stops a _momentary_
  failure from taking down the whole process; it doesn't make Redis
  optional or add a fallback.
- Verified for real, not just reasoned about: `apps/api`'s own test
  suite has no local Redis available in that environment, so every test
  run now visibly logs `[redis] connection error (ioredis will keep
retrying): ECONNREFUSED ...` on stderr — and, critically, all 67 tests
  still pass, where previously that same condition would have crashed
  the process outright.
