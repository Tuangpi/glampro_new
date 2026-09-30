# syntax=docker/dockerfile:1
#
# Glampro web image.
# Build from the repository root (the build context spans the npm workspaces):
#   docker build -f docker/web.Dockerfile -t glampro-web .
#
# Targets
#   development             Vite dev server used by compose.yaml
#   runtime                 nginx serving the compiled SPA and proxying the API

# ─── Dependency layer ─────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci

# ─── Build the SPA ────────────────────────────────────────────────────────────
FROM dependencies AS build
# Baked into the bundle at build time; must never hold a secret.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @glampro/shared \
 && npm run build --workspace @glampro/web

# ─── Development (compose.yaml bind-mounts the source over /app) ──────────────
FROM build AS development
ENV NODE_ENV=development
RUN chown -R node:node /app
USER node
EXPOSE 5173
CMD ["npm", "run", "dev:docker:web"]

# ─── Production runtime ───────────────────────────────────────────────────────
FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1
