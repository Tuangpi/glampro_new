# Glampro — Docker guide

Everything Glampro needs runs in Docker: PostgreSQL, the API, the web app, and a
one-shot migration runner. The host only needs **Docker Engine with Compose v2**.

- [`compose.yaml`](compose.yaml) — local development (hot reload, ports published)
- [`compose.production.yaml`](compose.production.yaml) — self-contained production stack

Architecture and code conventions live in [`docs/architecture.md`](docs/architecture.md).

---

## Choose the right file

|                 | `compose.yaml`                                | `compose.production.yaml`              |
| --------------- | --------------------------------------------- | -------------------------------------- |
| Purpose         | Local development                             | Self-contained deployment              |
| Images          | `development` targets                         | `runtime` targets                      |
| API             | nodemon + tsx, source bind-mounted            | compiled `dist`, `NODE_ENV=production` |
| Web             | Vite dev server with HMR                      | nginx serving the built SPA            |
| Published ports | `5173` (web), `9000` (api), `5433` (database) | `8080` (nginx only)                    |
| Database        | container + named volume                      | container + named volume               |
| Migrations      | run by the API container on start             | run by a one-shot `migrations` service |
| Secrets file    | `.env.docker`                                 | `.env.production`                      |

`compose.production.yaml` is a **new, self-contained installation**: it creates
its own PostgreSQL container and volume. To point the stack at an existing
database instead, set `DATABASE_URL` on the `migrations` and `api` services and
remove the `database` service and its `depends_on` entries.

---

## Development

```bash
cp .env.docker.example .env.docker     # then replace both placeholder secrets
docker compose --env-file .env.docker up --build -d
```

| URL                                | What                                            |
| ---------------------------------- | ----------------------------------------------- |
| <http://localhost:5173>            | Web app (Vite HMR)                              |
| <http://localhost:9100/health>     | API liveness                                    |
| <http://localhost:9100/api/health> | API readiness (includes database status)        |
| `localhost:5433`                   | PostgreSQL, published so host tools can connect |

The API is published on **9100** and the database on **5433** by default, so
neither collides with a PostgreSQL or another local stack already running on the
host. Change `API_PORT` or `POSTGRES_PORT` if those are taken.

### What the API container does on start

`npm run dev:docker:api` runs, in order:

1. `prisma migrate deploy` — applies pending committed migrations
2. `tsc` for `@glampro/shared` — refreshes the shared package the API imports
3. `prisma generate` — regenerates the client if `schema.prisma` changed
4. `tsc --watch` for the shared package, alongside nodemon + tsx for the API

The web container builds the shared package and then starts Vite. The first boot
therefore takes noticeably longer than subsequent ones.

### How the bind mounts work

Source is mounted at `/app`, but `node_modules` and the generated Prisma client
live in **named volumes seeded from the image**. That keeps host-installed
binaries out of the containers and vice versa.

Consequence: **after changing any `package.json`, those volumes are stale.**
Refresh them with:

```bash
make rebuild      # or: docker compose --env-file .env.docker up --build -d -V
```

If a `node_modules` volume is ever corrupt, remove just that volume:

```bash
docker compose --env-file .env.docker down
docker volume rm glampro_api_node_modules glampro_web_node_modules
docker compose --env-file .env.docker up --build -d
```

### Hot reload

| Container | Mechanism       | Watches                                                   |
| --------- | --------------- | --------------------------------------------------------- |
| `api`     | nodemon → `tsx` | `apps/api/src`, `apps/api/prisma`, `packages/shared/dist` |
| `web`     | Vite HMR        | `apps/web/src`, `packages/shared/dist`                    |

Edits to `packages/shared/src` are picked up because the API container runs
`tsc --watch` for that package, and Vite reloads when `dist` changes.

Both dev servers poll for changes by default (`CHOKIDAR_USEPOLLING`,
`VITE_USE_POLLING`) because the repository may sit on a filesystem where inotify
does not fire. Set `VITE_USE_POLLING=false` in `compose.yaml` when the source is
on a normal local disk and the extra CPU matters.

---

## Production

```bash
cp .env.production.example .env.production   # then replace every secret
docker compose -f compose.production.yaml --env-file .env.production up --build -d
```

The app is then served from <http://localhost:8080> (change `WEB_PORT`). nginx
serves the SPA, proxies `/api`, `/uploads` and `/health` to the API, and is the
only service published to the host.

Before going live:

1. Generate real secrets — `openssl rand -base64 48` for `JWT_SECRET` and the
   database password. Use a different value for `JWT_REFRESH_SECRET`.
2. Set `BCRYPT_ROUNDS=12`.
3. Set `CORS_ORIGINS` to the public origin(s), comma-separated, e.g.
   `https://salon.example.com`. A wrong value here means the browser cannot call
   the API at all.
4. Set `SEED_MODE=production` together with `ADMIN_EMAIL`, `ADMIN_NAME` and
   `ADMIN_PASSWORD`, then create the administrator once:

   ```bash
   docker compose -f compose.production.yaml --env-file .env.production \
     run --rm migrations npx prisma db seed
   ```

5. Keep `.env.production` readable only by the deploying user (`chmod 600`) and
   never commit it.
6. Terminate TLS in front of nginx (reverse proxy or load balancer). The API
   trusts the first `X-Forwarded-*` hop, so do not expose the API port directly.

### Migrations in production

The `migrations` service runs `prisma migrate deploy` on every `up`. It applies
only committed migration files and preserves existing rows, so it is safe to
re-run. Check state or apply explicitly at any time:

```bash
docker compose -f compose.production.yaml --env-file .env.production \
  run --rm migrations npx prisma migrate status
docker compose -f compose.production.yaml --env-file .env.production \
  run --rm migrations npx prisma migrate deploy
```

**Never** run `prisma migrate reset` or a development seed against a production
database.

### Backups

Two volumes hold state: `postgres_data` and `uploads_data`.

```bash
docker compose -f compose.production.yaml --env-file .env.production \
  exec -T database pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql

docker run --rm -v glampro_uploads_data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Verify a restore on a scratch database before relying on either backup.

---

## Secrets and configuration

| File                      | Committed | Purpose                              |
| ------------------------- | --------- | ------------------------------------ |
| `.env.docker.example`     | yes       | Template for local development       |
| `.env.docker`             | **no**    | Local development values             |
| `.env.production.example` | yes       | Template for production              |
| `.env.production`         | **no**    | Production values                    |
| `apps/api/.env.example`   | yes       | Template for host-side `npm run dev` |
| `apps/web/.env.example`   | yes       | Template for host-side `npm run dev` |

Rules:

- Nothing in a `VITE_*` variable is secret — Vite inlines those into the browser
  bundle. Rebuild the web image after changing one.
- Database and JWT values are read at container start; they are never baked into
  an image.
- Quote values containing spaces (`ADMIN_NAME="Glampro Administrator"`) so the
  file also works with `source`.
- When a password contains URL-significant characters (`@`, `:`, `/`, `#`, `%`),
  percent-encode it inside `DATABASE_URL`.

---

## Troubleshooting

| Symptom                                                | Cause and fix                                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '@glampro/shared'`                 | The shared package has not been built. Run `npm run build:shared` on the host, or restart the container — its start command builds it. |
| API exits with `Missing required environment variable` | `DATABASE_URL` or `JWT_SECRET` is unset. Check the env file and that compose is invoked with `--env-file`.                             |
| Web loads but every request 502s                       | The API container is still starting (migrations, Prisma generate, shared build). `docker compose logs -f api`.                         |
| `502` right after editing a `package.json`             | Stale `node_modules` volumes — run `make rebuild`.                                                                                     |
| Port already allocated                                 | Change `WEB_PORT`, `API_PORT` or `POSTGRES_PORT` in the env file.                                                                      |
| Prisma client out of date after a schema change        | The container regenerates on start; to force it: `docker compose exec api npm run db:generate`.                                        |
| Edits are not picked up                                | Polling is disabled somewhere. Check `CHOKIDAR_USEPOLLING` / `VITE_USE_POLLING` in `compose.yaml`.                                     |
| `npm ci` fails in CI but works locally                 | `.npmrc` is required — it carries `legacy-peer-deps=true`.                                                                             |
