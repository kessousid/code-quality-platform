# ADR-0008: Frontend stack — React Router, TanStack Query, Tailwind + shadcn/ui primitives, React Flow, Recharts

## Status

Accepted

## Context

React + TypeScript + Vite is fixed by the brief and already scaffolded and
build-verified in Phase 2. What remained open: routing, server-state
management, styling/component system, and — specifically — how to render a
dependency graph, which is a node-link diagram, not a conventional chart.

## Decision

- **Routing**: React Router. Standard choice, no real alternative debate
  needed at this scale (a handful of top-level views).
- **Server state**: TanStack Query, not hand-rolled `useEffect`/`useState`
  fetching. The dashboard is fundamentally "fetch scan/finding data, cache
  it, refetch on demand" — exactly TanStack Query's model — and it removes
  an entire class of stale-closure/race-condition bugs a hand-rolled
  fetcher would accumulate across ~7 dashboard views.
- **Styling/components**: Tailwind CSS + shadcn/ui-style primitives (Radix
  primitives, owned in-repo, not a vendored component library). Rejected
  MUI/Ant Design: both are excellent but impose their own design language
  and larger bundles; owning the primitives gives full control over the
  score-tile/severity-badge visual language this specific product needs,
  and composes cleanly with Tailwind's dark-mode utilities.
- **Dependency graph visualization**: React Flow. This is the one place a
  conventional charting library is the wrong tool — a module dependency
  graph is nodes and edges with custom layout, which is React Flow's
  purpose-built use case, not a bar/line chart's.
- **Trend charts** (score-over-time, finding-count-over-time): Recharts,
  used for genuinely time-series/quantitative views — kept clearly separate
  from React Flow's structural-graph role so the two aren't reached for
  interchangeably.

## Consequences

- Four new categories of frontend dependency (router, query, styling,
  visualization) land now in Phase 3 so Phase 10 is "build the views," not
  "also pick the stack while building the views."
- Tailwind's utility classes are the styling default; component-local CSS
  modules are the escape hatch for anything Tailwind genuinely can't
  express cleanly, not the default.
- React Flow and Recharts are both React-idiomatic (no imperative D3
  wrapper-fighting), keeping the component layer consistent.
