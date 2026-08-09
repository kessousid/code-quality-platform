# ADR-0045: Hard timeout on the staging pytest subprocess

## Status

Accepted

## Context

Right after docs/adr/0044 (live progress/streaming) shipped, a fresh
manual staging run was triggered to verify it. It confirmed the fix
worked — real-time output streamed correctly for the first ~14% of the
suite — then went completely silent for 2+ hours with zero new output,
even with `PYTHONUNBUFFERED=1` in place (which rules out buffering as
the explanation this time). The **first** run (the one docs/adr/0043
was written to reconcile) independently hung at almost the same point
— entering `tests/roles/admin/test_dashboard.py`, right after
`test_TC_ADMIN_004_dashboard_loads_with_metrics` started. Two separate
runs hanging at nearly the same spot is a strong signal of a real,
reproducible problem, not random flakiness.

Direct inspection of that test file and the `admin_page` fixture /
`_do_login()` it depends on found every wait properly bounded (worst
case ~3-4 minutes before raising a real error) — so the hang isn't an
obviously-missing timeout in that specific test's own code. Confirmed
via BullMQ that the job's lock was still being renewed throughout the
hang — the outer Node worker was never actually stuck, it was just
`await`ing a child process that had stopped producing any output at
all. That's the real gap: **BullMQ's own stall detection only proves
the Node event loop stayed responsive — it cannot detect that a spawned
child process itself has stopped making progress**, and nothing else in
this stack could either.

## Decision

**`runSubprocess` gains an optional `timeoutMs`.** When set, the child
is spawned `detached: true` (making it its own process-group leader) so
that on timeout, `process.kill(-child.pid, 'SIGKILL')` reaches the
_entire_ tree — necessary because `xvfb-run` itself spawns Xvfb and the
real `python` process as children that a plain `child.kill()` would
orphan, not terminate. Falls back to `child.kill()` if the negative-PID
form throws (e.g. on Windows, where POSIX process-group semantics don't
apply the same way — the production path is always Linux). Rejects with
a new `SubprocessTimeoutError`.

**`PytestStagingTestRunner` applies a 3-hour ceiling** to the pytest
invocation specifically (not the setup steps, which are fast and
already effectively bounded) — comfortably above every real full-suite
duration observed so far, while guaranteeing a hang can never block a
run indefinitely again. On timeout, the run fails with a clear message
pointing at this ADR, instead of leaving the DB stuck at `'running'`
for hours with no explanation (`RunStagingTestSuiteUseCase`'s existing
catch-and-alert path, docs/adr/0036, handles it exactly like any other
crash — no changes needed there).

## Consequences

- This bounds the _damage_ of a hang; it doesn't fix whatever is
  actually stalling in or around `test_dashboard.py`. That's the
  external repo's own code (or a resource/Chromium-context issue in the
  container that repeated real runs are exposing) — worth flagging to
  whoever maintains `curatal_tests`, separately from this fix.
- A genuinely slow-but-healthy run that happens to exceed 3 hours would
  also be killed. Revisit the constant if real full-suite runs
  routinely approach it once the actual average pace is known with
  confidence (today's data is still noisy — a fast ~5.5-minute stretch
  followed immediately by a 2+ hour hang isn't yet a reliable baseline).
- `detached: true` is only applied when `timeoutMs` is passed, so every
  existing caller of `runSubprocess` (gitleaks, semgrep, OSV-Scanner)
  is completely unaffected.
