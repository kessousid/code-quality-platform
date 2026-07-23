# Dev database used for live verification (2026-07-17)

Phases 3–6 repeatedly flagged "not verified against a live Postgres" as a
sandbox limitation. This was closed once, for real, using a database
already available to the user — documented here so it can be reconnected
to without repeating the whole discovery process, and without any
credential committed to this repo.

## What this is

- A **separate, dedicated database** (`curatal_db_copy`) — a full
  `pg_dump`/`pg_restore` clone of the real CuratalIT application's
  database (`curatal_db`), taken specifically so this platform's
  verification work never touches live application data or its 24
  concurrent connections.
- This platform's own tables live in an **isolated Postgres schema**
  (`cqp`) inside that cloned database — never `public`, which holds the
  cloned application's own 259 tables. There is no possibility of a table
  name collision between the two.
- Reached via an **SSH tunnel** to the host the database actually runs
  on — the database is not reachable directly from this machine, only
  through that tunnel.

## Reconnecting

1. Open the tunnel (identity file path and SSH host are not repeated
   here — ask the user if not already known):
   ```
   ssh -i "<path-to-identity-file>" -N -L 15432:127.0.0.1:5432 ubuntu@<ssh-host>
   ```
2. Set `packages/db/.env`:
   ```
   DATABASE_URL="postgresql://ottl:<password>@127.0.0.1:15432/curatal_db_copy?schema=cqp"
   ```
   (Ask the user for the current password — do not assume a previously
   used one still works; it was reset at least once during setup.)
3. `pnpm --filter @cqp/db run generate` then `pnpm --filter @cqp/db exec prisma migrate deploy`
   to apply any new migrations.
4. **Revert `packages/db/.env` to the local placeholder
   (`postgresql://cqp:cqp@localhost:5432/cqp`) and close the SSH tunnel
   when done** — this is a real remote credential to a real server; it
   should not sit in a plaintext file, or keep an open tunnel, longer than
   the verification session that needs it.

## What this is not

- Not the default dev setup — `docker-compose.yml` (local Postgres +
  Redis) remains the intended path for day-to-day development. This
  tunnel-based database exists only because a local Postgres/Docker
  wasn't available in the sandbox this project was built in, and the user
  offered an already-running server instead.
- Not a substitute for eventually testing against a disposable local
  Postgres (via `docker-compose up -d postgres`) before any real deploy —
  this dev database is a convenience for this project's own verification,
  not a staging environment.
