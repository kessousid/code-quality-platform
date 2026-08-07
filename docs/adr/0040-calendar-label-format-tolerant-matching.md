# ADR-0040: Match either calendar aria-label format, not one exact string

## Status

Accepted

## Context

The user reported the same "not open for booking yet" false negative
recurring across several real production reports, despite an earlier fix
(the "Candidate Verification Details" modal race, docs/adr/0037)
verifying correctly when tested manually. Every real scheduled run kept
failing anyway.

**Root-caused via live diagnostics, not another guess.** Rather than
patch the modal logic again on a hunch, this time the actual container
was instrumented (timing around the modal wait, and a full aria-label
dump whenever a calendar cell lookup finds zero matches), deployed, and
a real job was enqueued directly onto the production Redis queue so the
actual deployed worker processed it — not a local re-run of the same
code, which is what "verified" the modal fix previously and had been
silently proving nothing about the real container's behavior.

The logs were unambiguous: the modal appeared and was dismissed in
**23–32ms** every time — nowhere near the 8s (then 20s) timeout budget.
The real cause was elsewhere entirely: `isDateBookable` searched for an
aria-label of `"7 August 2026"` (`{Day} {Month} {Year}`), but the actual
label rendered on the page was `"August 7, 2026"` (`{Month} {Day},
{Year}`) — the _other_ format, the one an earlier fix (docs/adr/0035)
had already once replaced after the site changed away from it. The site
is evidently not on a single stable format; it has now been observed
rendering both, with no code change or deploy on either the site's or
this platform's side marking the transition.

## Decision

**Match a pattern that accepts either known format, not one exact
string.** `calendarCellLabelPattern(date)` returns a `RegExp` matching
both `"{Day} {Month} {Year}"` and `"{Month} {Day}, {Year}"` for the
given date, anchored (`^...$`) so it still only matches that one date,
never a different day sharing a number. `isDateBookable` and
`selectCalendarDate` both use this pattern via `page.getByLabel(regex)`
instead of a `{ exact: true }` string match. `formatCalendarCellLabel`
(a single, canonical string) is kept only for human-readable error
messages and log lines — never for actually locating an element again.

This is deliberately more defensive than "figure out which format is
current and fix the string" — that would only survive until the next
flip. A pattern tolerant of every format actually observed live doesn't
care which one the site happens to render on a given run.

**The diagnostic logging stays.** Both the modal-wait timing log and the
zero-match aria-label dump (added while chasing this) remain in place —
cheap, and exactly what made this root cause findable in minutes instead
of another round of guessing. If the label format changes to a third
shape someday, the same dump will show it immediately in the logs rather
than requiring another live-diagnosis cycle from scratch.

## Consequences

- No behavior change for a genuinely closed/not-yet-bookable date — the
  pattern still requires the exact day/month/year to match; it only
  tolerates which of the two known _orderings/punctuation_ the site
  chooses to render.
- If the site introduces a genuinely new third format, this pattern
  needs a third alternative added — but the zero-match diagnostic dump
  means that's now a five-minute log read, not another multi-report
  investigation.
- `calendarCellLabelPattern` is now exported and directly unit-tested
  (`portal-navigation.spec.ts`) against both known live formats plus a
  couple of negative cases — this is the first time this specific piece
  of matching logic has had a real regression test, given it was
  previously "verify by re-reading the aria-label off a live screenshot"
  only.
