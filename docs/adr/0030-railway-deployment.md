# ADR-0030: Railway deployment via Docker, with the web service proxying `/api`

## Status

Accepted

## Context

Everything up to this point ran as three `pnpm dev` processes on one
developer's machine (`start.ps1`). Hosting this centrally (a "Demo
server," or here, Railway, as a stand-in for testing that before a real
internal server is provisioned) needs an actual production build and
deploy path — none existed.

Two real constraints shaped the design, both already true of the
existing local setup and worth preserving rather than working around:

1. **This is a pnpm workspace monorepo.** Railway's Nixpacks
   auto-detection doesn't reliably resolve `workspace:*` dependencies
   when a service's root directory is a subpackage — the install needs
   to happen from the true repo root. Docker, with the repo root as
   build context, sidesteps this entirely: no auto-detection to get
   wrong.
2. **The session cookie is `SameSite=Strict`** (ADR-0014) — deliberately,
   so it's only ever sent on same-origin requests. `apps/web`'s own Vite
   dev server already proxies `/api/*` to the real API for exactly this
   reason (see `vite.config.ts`'s comment). Hosting the web app and API
   on two separate public Railway domains would make every request
   cross-origin, breaking that cookie outright — the "fix" of loosening
   the cookie to `SameSite=None` (requiring `Secure`, and enabling CORS)
   was rejected as a real security regression to work around a
   deployment topology choice, when the topology can just as easily
   preserve the existing same-origin design instead.

## Decision

**Three Dockerfiles, one per app** (`apps/api/Dockerfile`,
`apps/worker/Dockerfile`, `apps/web/Dockerfile`), each a two-stage build
that uses the **repo root as build context** — `COPY . .` then
`pnpm install --frozen-lockfile` at the root, then a scoped
`pnpm --filter @cqp/<app>... run build` (the `...` pulls in that app's
own workspace dependencies via turbo, so each image only builds what it
actually needs). The runtime stage reuses the same base image and just
carries the already-built `/repo` forward — simpler than a pruned
production-only `node_modules`, at the cost of a larger image; revisit
if image size ever actually matters here.

**The API runs its own migrations on boot**: `apps/api`'s Docker `CMD`
runs `pnpm --filter @cqp/db run migrate:deploy` before starting
`dist/main.js`. `prisma migrate deploy` is idempotent (no-ops on
already-applied migrations), which is safe given this deploys as a
single API instance — this would need a real release-phase step instead
if this ever scales to multiple concurrent API instances racing to
migrate on startup.

**The web service is the only one with a public domain, and it proxies
`/api/*` to the API's Railway-internal address** — `apps/web/server.mjs`
(a small Express app, replacing the Vite dev server in production)
serves the built static assets and proxies `/api` exactly like
`vite.config.ts`'s dev-time proxy does, via `http-proxy-middleware`
targeting `API_INTERNAL_URL` (a Railway private-network address,
`http://<service>.railway.internal:<port>`, never a public URL). The
API itself needs no public domain at all. This preserves the
same-origin illusion the cookie depends on without touching its
`SameSite` setting, and as a side effect keeps the API off the public
internet entirely — only reachable through the web service's proxy.

`apps/web/src/api/client.ts` already defaults to the relative path
`/api` when `VITE_API_BASE_URL` is unset, so no build-time API URL
needs to be baked into the web image at all — one less thing to
configure per environment.

**GitHub, not `railway up`, is the deploy trigger**: the repo is pushed
to a private GitHub repo (`kessousid/code-quality-platform`), and each
Railway service is connected to it directly, so every push to `main`
triggers a real build automatically — matching the explicit ask for a
commit-triggers-build pipeline, not a manually-invoked CLI deploy.

## Consequences

- Local dev is completely unaffected: `apps/web/vite.config.ts`'s own
  proxy already does the same job for `pnpm dev`; `server.mjs` only
  ever runs in the Docker image.
- A future second consumer of the API (a mobile app, a CI script) that
  isn't sitting behind this same reverse proxy will hit the
  `SameSite=Strict` wall exactly as it does today locally — unchanged,
  not a new limitation this deployment introduced.
- Every Railway service build re-runs `pnpm install` from scratch (no
  Docker layer cache reuse across the three separate images' identical
  install step) — a real, accepted cost for now in exchange for three
  independently simple Dockerfiles instead of one shared base image
  Railway would need extra config to build first.
