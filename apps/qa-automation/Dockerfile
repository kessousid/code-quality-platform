# Build context is the repo ROOT (pnpm workspace) — see docs/adr/0030.
FROM node:20-slim AS build
# Prisma's query engine needs a real OpenSSL to detect against — node:20-slim doesn't ship one, and
# without it Prisma silently guesses a binary target that may not actually work at runtime.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cqp/db run generate
RUN pnpm --filter @cqp/qa-automation... run build

# Playwright's own runtime image ships Chromium plus every OS-level
# dependency it needs already installed — see docs/adr/0035. The pinned
# tag's Chromium build must match the `playwright` npm version this repo
# installs (currently ^1.48.0), or the two silently drift apart.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Additions for the external staging pytest suite (docs/adr/0036) — an
# addition to this runtime image, not a base-image swap, so the already-
# working production (Node/Playwright-JS) path is never put at risk. The
# suite's own repo (and its own requirements.txt) is cloned fresh on every
# run — never baked into the image, since it "keeps getting updated" by
# others — but pre-installing the common packages + Chromium here means
# most of a run's setup time is already paid for at build time.
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv xvfb && rm -rf /var/lib/apt/lists/*
# python-dotenv: the suite's own automation/config/settings.py imports it,
# but its own requirements.txt doesn't list it — a gap in their file, not
# ours. Installed defensively here (and again at runtime, since their
# requirements.txt is re-installed fresh every run) so a missing
# dependency in their file never silently breaks every single test.
RUN python3 -m pip install --no-cache-dir pytest pytest-playwright playwright pytest-html python-dotenv
# A dedicated PLAYWRIGHT_BROWSERS_PATH, deliberately NOT the default
# (shared with Node Playwright's own /ms-playwright, baked in by this base
# image). Confirmed live: since every staging run re-installs its browser
# fresh (requirements.txt can bump the Python playwright version at any
# time), that reinstall's own cleanup logic doesn't recognize Node's
# separately-baked chromium as "claimed" and prunes it — a real production
# incident, not a hypothetical one. Scoped with an inline env assignment,
# not `ENV`, so it applies only to this one RUN step and never leaks into
# the final image's runtime environment (which would break Node Playwright
# instead).
RUN PLAYWRIGHT_BROWSERS_PATH=/ms-playwright-staging python3 -m playwright install --with-deps chromium

WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "apps/qa-automation/dist/main.js"]
