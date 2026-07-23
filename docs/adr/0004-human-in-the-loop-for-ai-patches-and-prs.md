# ADR-0004: Human-in-the-loop for AI-generated patches and pull requests

## Status

Accepted

## Context

The brief asks the AI layer to "generate code patches and pull requests."
Taken literally, this means an LLM would autonomously write and push a patch
to a real branch and open a PR against it, on a tool whose entire purpose is
catching quality/security regressions.

## Decision

The AI engine drafts a suggested patch (a diff) and attaches it to the
relevant `Finding`. The platform never commits, pushes, or opens a pull
request on its own. Creating a PR from a suggested patch is a distinct,
explicit user action ("Create PR from this suggestion"), gated behind the
same auth used for the rest of the write API — never a background job
outcome.

This mirrors how this session treats any write to a shared external system
(git remotes, GitHub/GitLab, CI config): propose, then require a human to
confirm before it becomes real.

## Consequences

- Slightly more manual steps between "AI suggests a fix" and "fix is live,"
  by design.
- Avoids a class of incidents this kind of tool is uniquely positioned to
  cause: an AI-authored patch that is subtly wrong, introduces a new
  vulnerability, or breaks a build, landing without review because it came
  from the "security tool" and was trusted by default.
- Also avoids noisy, low-trust bot PRs that get muted/ignored, which would
  undermine the platform's credibility faster than not offering the feature
  at all.
- If a future customer explicitly wants a fully autonomous mode, that is a
  deliberate opt-in per-repo setting reviewed on its own merits, not the
  default behavior.
