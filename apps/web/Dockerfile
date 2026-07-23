# Build context is the repo ROOT (pnpm workspace) — see docs/adr/0030.
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cqp/web... run build

FROM node:20-slim AS runtime
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node", "server.mjs"]
