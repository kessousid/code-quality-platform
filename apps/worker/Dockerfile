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
RUN pnpm --filter @cqp/worker... run build

FROM node:20-slim AS runtime
# Prisma's query engine needs a real OpenSSL to detect against — node:20-slim doesn't ship one, and
# without it Prisma silently guesses a binary target that may not actually work at runtime.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "apps/worker/dist/main.js"]
