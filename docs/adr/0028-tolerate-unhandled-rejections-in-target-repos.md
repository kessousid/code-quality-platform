# ADR-0028: Downgrade unhandled promise rejections to warnings for the Jest subprocess

## Status

Accepted

## Context

Testing a real target repo (`C:\CuratalIT\assessment`) surfaced a class of
crash neither the coverage gate nor test generation caused: many of its
Sequelize model files call `someSchema.sync().then(() => ...)` at **module
load time**, with no `.catch()`. As soon as `.env` gave those files a real,
reachable `DB_HOST` (so an earlier blocker — a different module-scope crash
in `stripe.utils.js` from a missing `STRIPE_SECRET_KEY` — could be fixed),
Sequelize's connection attempt failed for an unrelated reason (the local
Postgres doesn't support the SSL handshake Sequelize attempted), and that
rejection, with nothing to catch it, took down the **entire Node process**
Jest was running in — since Node 15, an unhandled rejection is fatal by
default. One generated test file merely `require()`ing the target source
was enough to kill the whole Jest run before it could write any report.

This is a pre-existing gap in the target repo's own error handling, not
something this platform should try to fix by editing someone else's
source. But it's also not something a `.env` value can work around:
`NODE_OPTIONS` is read by the Node runtime at process startup, before any
of the target repo's own code — including its own `dotenv.config()` call
— ever runs. It can only be set from the _outside_, by whatever spawns the
`node` process in the first place.

## Decision

`runSubprocess` (`@cqp/plugin-shared`) gained an optional `env` field,
passed straight to `child_process.spawn`. A new `withUnhandledRejectionsAsWarnings(baseEnv)`
helper appends `--unhandled-rejections=warn` to `NODE_OPTIONS` (preserving
whatever was already there) and is passed at both places Jest is actually
invoked to run a target repo's code: `runJest` (`@cqp/unit-test-engine`,
the generation flow) and `runJestWithCoverage` (`@cqp/coverage-engine`,
the coverage gate). A rejection that would previously crash the process
now just prints a warning and the test run continues — which is exactly
what happens for the equivalent case of a _thrown_ exception inside a
test, so this makes unhandled rejections behave consistently with that,
rather than as a special case that kills everything.

Deliberately scoped to just these two Jest invocations, not applied
platform-wide (e.g. not added to this platform's own root `.env`, which
would also weaken crash-safety for the platform's own worker/API
processes and could mask a genuine bug in this codebase behind a
warning instead of a hard failure). Other subprocess calls (`npm install`,
gitleaks, semgrep, osv-scanner) are unaffected.

## Consequences

- A target repo whose tests currently rely on an unhandled rejection
  crashing the process (unusual, but possible) would see different
  behavior — this is considered acceptable, since that's not a pattern
  this platform can distinguish from the far more common "broken
  module-scope side effect" case, and no evidence of such reliance found.
- Errors from these rejections are still visible (printed as warnings on
  stderr), not silently swallowed — they show up in the run's output for
  a developer to actually go fix, same as before, they just no longer
  abort every other test in the same process.
