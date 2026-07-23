# ADR-0010: Clean Architecture layering, proven with one real vertical slice

## Status

Accepted

## Context

The brief requires Clean Architecture. ADR-0005 already committed to
keeping business logic free of NestJS imports, but that alone isn't a full
layering — it doesn't say where use cases live, where repository
interfaces are defined, or how DI wires a Prisma-backed implementation
underneath a framework-free use case. Describing this in the abstract
(as a table) is what Phase 1 already did; Phase 5 needs to prove it
compiles and runs, or the "layering" is just a diagram nobody has to obey.

## Decision

Four layers, four different packages/apps own them:

| Layer                        | Location                     | Rule                                                                                                                                                                                         |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                       | `packages/core`              | Plain TS types + repository **interfaces** (ports). No framework, no Prisma, no NestJS.                                                                                                      |
| Application                  | `packages/application` (new) | Use case classes. Depend only on domain ports from `@cqp/core`. Constructor-injected, but the _class itself_ has no `@Injectable()` — NestJS wraps it, doesn't infect it.                    |
| Infrastructure (persistence) | `packages/db`                | Prisma-backed repository **implementations** of the domain ports, plus the enum mappers (ADR-0009).                                                                                          |
| Infrastructure (delivery)    | `apps/api`                   | NestJS controllers/modules bind a port token to the Prisma implementation and hand it to the use case. This is the only layer allowed to import `@nestjs/*` for this slice's business logic. |

**Proof, not just structure**: this ADR ships alongside a real vertical
slice — create a scan, get a scan by id — implemented through all four
layers and exercised with a live HTTP call, the same rigor every prior
phase has used. Everything else (Finding, Report, Patch CRUD) repeats this
exact pattern in Phase 6; this slice is the template, not a one-off.

```
packages/core        : Scan (domain type), ScanRepository (port)
packages/application  : CreateScanUseCase, GetScanUseCase
packages/db           : PrismaScanRepository (adapter)
apps/api              : ScanModule, ScanController, ScanRepository token binding
```

## Consequences

- One more workspace package (`packages/application`) than Phase 2
  anticipated — worth it because "use cases" needed a home that is neither
  `packages/core` (domain should stay minimal — types and ports, not
  orchestration) nor `apps/api` (framework-coupled).
- Every future entity (Finding, Report, Patch) follows this same four-layer
  path. Phase 6 is "repeat the pattern eight more times with real DTOs and
  auth," not "invent a new pattern."
- The `PrismaScanRepository` is written and typechecks against the real
  generated client, but — same gap as Phases 3 and 4 — isn't exercised
  against a live Postgres in this sandbox. The use-case layer's tests use
  an in-memory fake `ScanRepository`, which is exactly what the port
  abstraction is for: the application layer's tests don't need a database
  at all.
