# ADR-0071: Name the real load-time error behind "jest found no tests"

## Status

Accepted

## Context

A "Generate unit tests" run against `C:\CuratalIT\accounts` (target
`src`) failed with the `NoTestsFoundError` message:

> jest ran but found no tests among the generated files — check the
> target project's Jest config (testMatch/testPathIgnorePatterns)
> actually includes `*.generated.test.*` files.

The Jest config was fine (the default `testMatch` matches
`*.generated.test.js`). Running the same Jest invocation by hand showed
all 5 generated suites failing to load:

```
Config validation error: "JWT_SECRET" is required
    at src/config/config.js:83
```

`accounts` validates its env with Joi when `config.js` is imported, and
the project had a `.env.example` but no `.env`. Every generated test
`require`s a controller/constant that imports the config, so each suite
threw before any `it()` registered. Jest then reported
`numTotalTests === 0`.

This is the third time the message has pointed the wrong way. ADR-0048
(bad relative import) and ADR-0051 (home-directory `localPath`) were also
load-time crashes, not testMatch problems. Jest's JSON report already
holds the real error in each suite's `testResults[].message`, but
`runJest` dropped it.

## Decision

- `runJest` collects every suite with a non-empty `message` when
  `numTotalTests === 0` and passes them to `NoTestsFoundError` (exposed
  as `suiteLoadFailures`). ANSI codes are stripped.
- If any suite failed to load, the message says how many crashed while
  loading and that the likely cause is the code under test throwing at
  import time. It then includes the first failure's file and Jest output,
  capped at 1500 characters. The testMatch wording is used only when no
  suite failed to load, which is the only case where it can be right.
- If the target has `.env.example` but no `.env`, the message ends with a
  hint to create `.env`. This is a cheap existence check and the exact
  case seen here.
- `UnitTestRunStatusPanel` renders the error with `whitespace-pre-wrap`
  so Jest's multi-line code frame stays readable.

Not done: generating `.env` automatically or injecting dummy env vars.
Which values a project needs, and whether its example values are safe to
use, is the project's decision, not ours.

## Consequences

- Load-time failures now show the real cause in the UI instead of
  sending people to their Jest config.
- Live-verified with the rebuilt `runJest` against the real `accounts`
  project. Without `.env`, the run fails with the new message, which
  names `"JWT_SECRET" is required` and adds the `.env` hint. With `.env`
  created from `.env.example` (plus dummy `RAZORPAY_KEY_ID` /
  `RAZORPAY_SECRET_KEY`, which `.env.example` lacks but
  `razorpay.service.js` needs at import), all 41 generated tests pass.
- New specs in `run-jest.spec.ts` cover the load-time crash message and
  the `.env` hint using real Jest.
