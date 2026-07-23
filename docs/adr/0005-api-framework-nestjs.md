# ADR-0005: REST API framework — NestJS on the Express adapter

## Status

Accepted

## Context

The brief requires "Clean Architecture," "modular services," and a REST API.
Candidates considered: Express (minimal, unopinionated), Fastify (faster,
plugin-based), NestJS (opinionated, DI-based, decorator-driven), and a
tRPC/Hono-style typed-RPC layer.

## Decision

NestJS, running on the Express platform adapter (not Fastify).

The deciding factor is not raw throughput — a code-scanning platform is
dominated by long-running worker jobs, not request-per-second API load — it's
that NestJS's module/provider/DI system maps directly onto Clean Architecture
layering without hand-built scaffolding:

| Clean Architecture layer | NestJS construct                                               |
| ------------------------ | -------------------------------------------------------------- |
| Entities / domain        | Plain TS classes in `packages/core`, no NestJS import          |
| Use cases / application  | `@Injectable()` services, framework-light (only the decorator) |
| Interface adapters       | Controllers, DTOs, guards, interceptors                        |
| Frameworks & drivers     | `main.ts` bootstrap, Express adapter, Prisma provider          |

The Express adapter is chosen over Fastify for MVP because middleware/plugin
maturity (auth libraries, logging, body parsing for varied CI webhook
payloads in a later phase) is broader and better documented; Nest abstracts
the HTTP adapter behind `NestFactory.create()`, so switching to Fastify later
if throughput becomes a real bottleneck is a contained change, not a rewrite.

## Guardrail

Business logic (use cases in `packages/core`, `packages/plugins/*`,
correlation/AI logic) must not import anything from `@nestjs/*`. Only
`apps/api`'s controllers/guards/interceptors and `main.ts` bootstrap touch
Nest directly. This keeps the domain layer testable and portable if the API
framework is ever swapped.

## Consequences

- More boilerplate per endpoint than Express (module + controller + DTO +
  service) — acceptable trade for structure that scales past a handful of
  routes into the full API surface Phase 6 defines.
- `@nestjs/swagger` gives OpenAPI generation "for free" off the same
  decorators used for routing/validation, directly feeding Phase 6.
- Requires `experimentalDecorators`/`emitDecoratorMetadata` in
  `apps/api/tsconfig.json` — an exception to the shared strict base config,
  scoped to that one app.
- **Refined in Phase 5 (ADR-0010)**: use cases turned out better as plain
  classes in a dedicated `packages/application`, not `@Injectable()`
  services directly in `apps/api` as this table originally sketched — NestJS
  wraps them via factory providers instead. The layer boundary this ADR
  describes still holds; ADR-0010 is more specific about where the line
  actually sits.

## Postmortem: `emitDecoratorMetadata` breaks under esbuild-based tools, silently

Discovered while live-verifying Phase 5's vertical slice: `tsx` (esbuild
transform) does not emit `design:paramtypes` metadata, which is what
NestJS's constructor-based DI uses to resolve untyped-looking dependencies.
Running the API via `tsx watch src/main.ts` **did not error** — it booted,
mapped routes, and served `/health` correctly — but every controller with an
injected dependency silently received `undefined` instead, only surfacing
as a `TypeError` on first real request. The `tsc`-compiled build (used for
`start`/production and already required for `apps/api`'s Vitest suite via
`unplugin-swc`, per Phase 3) does not have this problem.

Fixed by changing `apps/api`'s `dev` script from `tsx watch` to
`tsc -b --watch` + `node --watch dist/main.js` running concurrently — the
same compiler as production, at the cost of a compile step instead of
instant transform. `tsx` was removed from `apps/api`'s dependencies
entirely rather than left in place unused. `apps/worker` keeps using `tsx`
for its dev script since it has no decorator-based DI to break.
