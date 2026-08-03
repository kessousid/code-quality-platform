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
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir pytest pytest-playwright playwright pytest-html
RUN python3 -m playwright install --with-deps chromium

WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "apps/qa-automation/dist/main.js"]
