# syntax=docker/dockerfile:1
#
# Glampro API image.
# Build from the repository root (the build context spans the npm workspaces):
#   docker build -f docker/api.Dockerfile -t glampro-api .
#
# Targets
#   development             hot-reloading API used by compose.yaml
#   migration               one-shot `prisma migrate deploy` runner
#   runtime                 production image (dist + prod dependencies only)

# ─── Dependency layer (shared by every target) ────────────────────────────────
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

# Only manifests are copied first so `npm ci` is cached until a lockfile changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci

# ─── Compile shared package, Prisma client and API ────────────────────────────
FROM dependencies AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build --workspace @glampro/shared \
 && npm run db:generate --workspace @glampro/api \
 && npm run build --workspace @glampro/api

# ─── Development (compose.yaml bind-mounts the source over /app) ──────────────
FROM build AS development
ENV NODE_ENV=development
RUN chown -R node:node /app
USER node
EXPOSE 9000
CMD ["npm", "run", "dev:docker:api"]

# ─── One-shot migration runner ───────────────────────────────────────────────
FROM build AS migration
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ─── Production dependencies only ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Scoped to the API + shared workspaces so the web toolchain never lands in the
# API image.
RUN npm ci --omit=dev --workspace @glampro/api --workspace @glampro/shared --include-workspace-root \
 && npm cache clean --force

# ─── Production runtime ───────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=9000
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
# The workspace symlink node_modules/@glampro/shared points here.
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist

RUN mkdir -p apps/api/uploads \
 && chown -R node:node /app

USER node
WORKDIR /app/apps/api
EXPOSE 9000
CMD ["node", "dist/src/index.js"]
