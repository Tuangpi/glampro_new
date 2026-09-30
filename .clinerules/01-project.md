# glampro_new — project rules

`glampro_new` is a greenfield rebuild of the Glampro / Salon Pro salon SaaS:
`apps/web` (React 19 + Vite + Tailwind 4), `apps/api` (Express 5 + Prisma 7),
`packages/shared` (Zod contracts), PostgreSQL 17, everything in Docker Compose.

Before acting on anything, read `AGENTS.md`, then `docs/STATE.md`. `docs/STATE.md`
is the living handoff and tells you the current phase and what is next.

## Rules

- **Only commit SQL migrations.** `prisma migrate dev` locally, `prisma migrate
deploy` elsewhere. Never `db push` outside a throwaway spike.
- **Never edit `apps/api/generated/`** — regenerate with `npm run db:generate`.
- **Never edit token values in `apps/web/src/styles/tokens.css`.** It is a verbatim
  copy of `design/handoff/tokens/tokens.css`. Change the source, re-copy, map
  through Tailwind's `@theme`.
- **`/api/mobile/*` is frozen.** The shipped mobile client depends on its exact
  paths, field names and payload shapes.
- **Tenant scoping is never trusted from the request.** `tenantId` comes from the
  verified JWT and is applied by the Prisma client extension. See
  `docs/saas/TENANCY.md`.
- **Cross-boundary shapes live in `packages/shared`** as Zod schemas.
- **TypeScript is `erasableSyntaxOnly`:** no enums, no runtime namespaces, no
  parameter properties.
- **No secrets** in the repo, in an image, or behind a `VITE_*` name.

## Definition of done for any change

`npm run verify` exits 0 (format check, lint, type-check, tests), and
`docs/STATE.md` is updated if the change moved the project forward.
