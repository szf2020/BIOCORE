# BIOCore Server Dockerfile (T24 — Sprint 4 Track A hardening)
# Multi-stage: deps -> build -> run. Final image runs the compiled server.
#
# Note: ai-gateway / experiment-optimizer 等 workspace 包必须 build 才能被 server/dist 引用。
# `pnpm -r build` 在 build stage 会按 workspace 依赖图顺序编译。

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Copy workspace manifest + all package.json files first (lets pnpm cache layer reuse)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY packages/plc-driver/package.json packages/plc-driver/
COPY packages/data-service/package.json packages/data-service/
COPY packages/batch-engine/package.json packages/batch-engine/
COPY packages/ai-gateway/package.json packages/ai-gateway/
COPY packages/ai-analytics/package.json packages/ai-analytics/
COPY packages/soft-sensor/package.json packages/soft-sensor/
COPY packages/experiment-optimizer/package.json packages/experiment-optimizer/
COPY packages/runtime-guard/package.json packages/runtime-guard/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Build stage ────────────────────────────────────────────
FROM deps AS build
COPY packages packages
COPY config config
RUN pnpm -r build

# ─── Run stage ──────────────────────────────────────────────
FROM node:20-alpine AS run
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Copy all build artifacts (multi-package monorepo: keep workspace structure for path-relative imports)
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY scripts/healthcheck.mjs scripts/healthcheck.mjs

# Volumes mounted at runtime (see docker-compose.yml):
#   /app/data     — SQLite DB
#   /app/crashes  — runtime-guard diagnostic dumps
#   /app/logs     — application logs (stdout/stderr also captured by docker logging driver)
RUN mkdir -p /app/data /app/crashes /app/logs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node scripts/healthcheck.mjs

CMD ["node", "packages/server/dist/index.js"]
