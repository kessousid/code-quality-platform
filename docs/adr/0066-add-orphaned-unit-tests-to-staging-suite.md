# ADR-0066: `tests/unit` was never part of the scheduled staging suite

## Status

Accepted

## Context

Asked to confirm docs/adr/0065's `batch1b` split didn't drop or duplicate
any tests, verified every `BATCH1_SUB_BATCHES` path against a real
`pytest --collect-only` of the whole suite (the same method docs/adr/0063
already established as the only reliable way to check this, after its
own first-draft split missed a directory via rough estimation).

The full suite (everything except `test_paneladmin.py`) collects **423**
tests. The union of every sub-batch's own paths (`batch1a`, `batch1b1`,
`batch1b2`, `batch1b3`, `batch1c`) collected only **412** — an 11-test
gap, present both before and after the `batch1b` split (it isn't
something docs/adr/0065 introduced). The missing 11 were every test in
`tests/unit/test_gmail_client.py` (7) and `tests/unit/test_graph_client.py`
(4) — added by commit `b83ed99` ("...implement unit tests for
GmailClient and GraphClient with mocks for external dependencies") but
never added to any `BATCH1_SUB_BATCHES` entry. Since the runner lists
directories to include rather than running everything and excluding
`test_paneladmin.py`, a new top-level directory silently never runs
until someone notices — exactly the risk docs/adr/0063 already flagged
for renamed/moved files, just for an added one instead.

These 11 tests are genuine unit tests: mocked `GmailClient`/`GraphClient`
construction and parsing logic (`unittest.mock`), no `page: Page`
fixture, no staging credentials, no browser. Confirmed live: all 11 pass
in 0.29s standalone.

## Decision

Added `tests/unit` to `batch1b3` (`packages/staging-test-runner/src/pytest-staging-test-runner.ts`,
`BATCH1_SUB_BATCHES`) — the smallest sub-batch (29 → 40), matching this
array's existing policy of bundling small extras into whichever
sub-batch has the smallest count rather than by topical relevance (the
same policy already applied to `batch1a`'s loose debug files). A
dedicated sub-batch for 11 near-instant unit tests wasn't worth its own
clone/install cycle.

Re-verified after the change: the union of all `BATCH1_SUB_BATCHES`
paths now collects exactly 423 (135 + 76 + 35 + 40 + 137), matching the
full-suite ground truth exactly, with zero duplicate node IDs across
sub-batches. 423 + batch 2's 100 (`test_paneladmin.py`) = 523, matching
`pytest --collect-only tests` (no ignores) against the whole repo.

## Consequences

- `tests/unit`'s 11 tests will show up in staging run reports for the
  first time starting with the next scheduled run — expect the total
  test count to read 523 rather than whatever smaller number
  pre-existing dashboards/history show.
- Doesn't add any browser/staging-credential dependency to `batch1b3`
  since these are pure unit tests — negligible effect on its runtime.
- The underlying risk this exposed (new top-level `tests/` directories
  silently not running until someone manually diffs collect-only output)
  isn't fixed by this change, only this one instance of it. Worth
  reconsidering whether `BATCH1_SUB_BATCHES` should assert its own
  coverage against a full collect-only count at runtime rather than
  relying on someone re-checking by hand -- not done here to keep this
  fix scoped to the gap actually found.
