# Tenancy — model and enforcement

How one deployment serves many salons without ever letting one see another's data,
and how the platform console sits above all of them.

Vocabulary lives in [`../CONTEXT.md`](../CONTEXT.md). This file is the technical
contract: the models, the token claims, and the four layers that enforce isolation.

---

## 1. Principle

**A tenant id is never taken from the request.** It is read from the verified JWT
and stamped onto the request by the auth middleware, then applied to every query by
a Prisma client extension. A handler that forgets to scope a query still gets a
scoped query, because scoping is not the handler's job.

Nothing about tenant isolation may depend on a client sending the right header, a
route being written carefully, or a developer remembering. Assume instead that any
individual handler will eventually be written wrong.

| Layer | Mechanism                                 | Stops                                   |
| ----- | ----------------------------------------- | --------------------------------------- |
| 0     | Token claim, signed                       | Forging a tenant id                     |
| 1     | `auth` middleware → `req.auth.tenantId`   | Cross-tenant reads by a wrong route     |
| 2     | Prisma extension injects `where.tenantId` | A handler that forgot to filter         |
| 3     | `requireModule(code)` guard               | Using a feature the tenant did not buy  |
| 4     | PostgreSQL RLS (hardening phase)          | A raw SQL query, a compromised app role |

Layer 4 is deliberately last: the application layers make it correct, RLS makes it
**provable**, including against `$queryRaw` in the reporting phase.

---

## 2. Platform plane models

| Model           | Purpose                                                         | Key fields                                                                                                    |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PlatformAdmin` | An employee of the SaaS operator. Never has a `tenantId`.       | `email` (unique), `passwordHash`, `name`, `status`, `tokenVersion`, `lastLoginAt`                             |
| `Tenant`        | One salon business. The isolation boundary.                     | `id`, `name`, `slug` (unique), `status`, `tokenVersion`, `ownerUserId` (unique)                               |
| `Module`        | The catalogue of switchable features. Seeded, not user-created. | `code` (unique), `name`, `category`, `isCore`, `sortOrder`                                                    |
| `TenantModule`  | One entitlement: this tenant has this module.                   | `tenantId`, `moduleId`, `expiresAt?`, `limits` (JSON?), unique on the pair                                    |
| `Subscription`  | One paid period. Several per tenant over time.                  | `tenantId`, `startDate`, `endDate`, `status`, `amount`, `currency`                                            |
| `Payment`       | Ledger entry against a subscription.                            | `tenantId`, `subscriptionId?`, `amount`, `paidAt`, `method`, `recordedByPlatformAdminId`, `note`              |
| `AuditLog`      | Every privileged platform action.                               | `actorPlatformAdminId`, `tenantId?`, `action`, `targetType`, `targetId`, `metadata` (JSON), `ip`, `createdAt` |

`TenantStatus`: `ACTIVE` · `SUSPENDED` · `EXPIRED` · `CANCELLED`.

`Tenant.tokenVersion` is what makes suspension instant: incrementing it invalidates
every access token issued for that tenant, exactly as `User.tokenVersion` already
does per person.

### 2.1 ID strategy for the legacy cutover

The legacy system had no `tenants` row; the tenant _was_ the owner's `users` row,
and every other row pointed at it with `company_id = owner.id` (or `company_id IS
NULL` when the row was the owner itself).

**Set `Tenant.id` equal to that owner's existing `users.id` at migration time.**
Then every legacy `company_id` value is already a valid `tenantId` and the whole
domain migrates with zero remapping — no lookup table, no second pass, no risk of a
partial rename. The only obligations are a unique constraint on `tenants.id` and a
rule that new tenants get a freshly generated id (`cuid()`, the default used by every
model in `schema.prisma` — it is alphanumeric, so it can never collide with a
not-yet-migrated legacy id).

See [ADR 0002](../decisions/0002-tenant-id-equals-owner-id.md).

---

## 3. Realms and token claims

A token's `realm` decides which middleware will even look at it.

| Realm      | Subject       | `tenantId` claim | Used by                       |
| ---------- | ------------- | ---------------- | ----------------------------- |
| `platform` | PlatformAdmin | absent           | The platform console          |
| `web`      | User          | present          | The salon web app             |
| `pos`      | User          | present          | Till sessions (screen-locked) |
| `mobile`   | User          | present          | The shipped mobile client     |

The `platform` row is the **target** state, not the shipped one: `AUTH_REALMS` in
[`packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts) is
`web · pos · mobile` today, and `AuthRealm` is a database enum, so adding `platform` is a
migration. It lands with the phase that builds the console, whose placement is settled by
[ADR 0004](../decisions/0004-platform-console-is-its-own-app.md) — not with Phase 3.

Access token claims: `sub`, `realm`, `role`, `tenantId` (omitted for `platform`),
`ver`, `iss`, `exp`.

`tenantId` is **never** accepted from a body, query string or header — not even to
"confirm" it. If a payload contains a tenant id, the validator rejects it rather
than ignoring it, so the mistake surfaces immediately in development.

The `auth` middleware, in order:

1. Verify signature, issuer and expiry.
2. Look the subject up in the database (`PlatformAdmin` or `User` by `realm`).
3. Compare `ver` against `tokenVersion` — catches logout, password change, and a
   tenant-level suspension.
4. For tenant realms, load the `Tenant` and resolve its **effective status**:
   computed from `endDate` **and** the stored `status`.
5. Refuse with `TENANT_SUSPENDED`, `TENANT_EXPIRED` or `TENANT_CANCELLED`. A
   suspended tenant's owner may proceed **read-only** (see §6).
6. Stamp `req.auth = { kind, id, realm, role, tenantId, tenant }`.

---

## 4. The Prisma client extension

`apps/api/src/lib/prisma.ts` exports the extended client. The extension covers
every model listed in a single `TENANT_SCOPED_MODELS` constant — one list, one
place to audit, and a test that asserts no other model has a `tenantId` column.

```
read  (findMany, findFirst, findUnique, count, aggregate, groupBy)
      → merge  where: { tenantId: ctx.tenantId }
create / createMany
      → merge  data:  { tenantId: ctx.tenantId }
update / updateMany / delete / deleteMany
      → merge  where: { tenantId: ctx.tenantId }
```

Tenant context comes from `AsyncLocalStorage`, populated by the auth middleware, so
no handler passes `tenantId` around by hand. Two consequences worth stating:

- **A query outside any tenant context fails loudly** rather than silently returning
  everything. Background jobs and the console opt in explicitly with
  `runAsPlatform()` / `runAsTenant(id)`. There is no implicit "no tenant means all
  tenants".
- A `findUnique` on a tenant-scoped model is rewritten to `findFirst` with the
  tenant filter, because Prisma will not accept extra non-unique predicates there.
  A known, deliberate trade: correctness over the marginal cost of `findFirst`.

### Models that are not tenant-scoped

`PlatformAdmin`, `Tenant`, `Module`, `Account`, `RefreshToken`, `AuditLog`,
`JobRun`. Anything else gaining a `tenantId` must be added to
`TENANT_SCOPED_MODELS` in the same commit — the isolation test fails otherwise.

---

## 5. Entitlement enforcement

`requireModule(code)` is route middleware that runs after `auth`:

- Core modules (`Module.isCore`) pass as soon as the tenant exists.
- Add-on modules require an effective `TenantModule` row — one that exists and has
  not expired.
- Failure is `403` with `code: "MODULE_NOT_ENTITLED"` and the module code in
  `details`, so the UI can render "this needs the Packages add-on" instead of a
  bare "forbidden".

Route usage:

```
POST /api/sales              requireModule("sales")        // core
POST /api/packages           requireModule("packages")     // add-on
GET  /api/reports/commission requireModule("employeeCommission")
```

The front end receives the tenant's effective entitlement list once per session
(`GET /api/auth/me`) and uses it to hide navigation — `navigation.ts` gains a `module`
field for exactly this, **arriving with Phase 3**, when `/api/auth/me` starts returning the
entitlement list. The field does not exist yet: `NavItem` is `label` / `path` / `icon` /
`roles` / `badge`, and `navigation.test.ts` asserts the rail's shape, so do not add a
`module` field before there is something to populate it. Hidden is not secured; the guard is
the boundary.

---

## 6. Locked-out tenants

| Tenant status | Sign in       | Read | Write | What the UI shows                              |
| ------------- | ------------- | ---- | ----- | ---------------------------------------------- |
| `ACTIVE`      | owner + staff | yes  | yes   | Normal                                         |
| `SUSPENDED`   | owner only    | yes  | no    | "Subscription suspended — contact billing"     |
| `EXPIRED`     | no            | no   | no    | Login refusal explaining the period ended      |
| `CANCELLED`   | no            | no   | no    | Login refusal explaining the account is closed |

`SUSPENDED` is read-only rather than a hard lock so the person who can actually pay
is the person who sees the message. Write refusal is `403` with
`code: "TENANT_SUSPENDED"`, keeping one error contract.

---

## 7. The platform console's reach

The console is **not** a tenant. It uses `runAsPlatform()` and therefore bypasses
layer 2 — which is exactly why every console query is written against the
platform-plane models only.

- The console reads `Tenant`, `TenantModule`, `Subscription`, `Payment`,
  `AuditLog` and `Module`. It never lists salon sales, customers or appointments.
- Any future "tenant health" number (active staff, sales this month) must be an
  explicitly named aggregate in a dedicated service, reviewed as a deliberate
  exception — never a general-purpose unscoped query.
- Every console mutation writes an `AuditLog` row in the same transaction. A
  privileged change without an audit row is a bug.

---

## 8. Testing isolation

The unit suites cannot prove isolation; an integration test against the compose
stack can. The phase that introduces the extension adds:

1. A two-tenant fixture (tenant A and tenant B, each with customers and users).
2. A test that authenticates as A and asserts A's customer list contains none of
   B's rows — for every tenant-scoped model.
3. A test that a tenant-scoped query executed with no tenant context **throws**.
4. A test asserting the model list in `TENANT_SCOPED_MODELS` equals the set of
   models with a `tenantId` column, derived from the Prisma DMMF. This is the test
   that catches a new model added without scoping.

---

## 9. Hardening phase (deferred, not skipped)

PostgreSQL row-level security keyed on `current_setting('app.tenant_id')`, with the
API connecting as a role that has no `BYPASSRLS`. This turns layer 4 from a
convention into a guarantee, and is the reason `$queryRaw` stays safe in the
reporting phase. It is deferred only because it doubles the cost of every schema
change while the model is still moving.

---

## 10. Legacy mapping at a glance

| Legacy                                 | New                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `users` row with `company_id IS NULL`  | `Tenant` (+ its owner `User`)                                                                                          |
| `users.company_id`                     | `Tenant.id` → every domain row's `tenantId`                                                                            |
| `company_id ?? user.id` idiom          | not needed; `tenantId` is always present and always explicit                                                           |
| `users.isOwner` (`1` / `2` / `NULL`)   | `Tenant.ownerUserId` — a relation, not a role. `User.globalRole` stays `SUPER_ADMIN` / `MANAGER` / `STAFF` / `CASHIER` |
| `users.*_access`, `user_infos.*`       | `TenantModule` rows                                                                                                    |
| `users.start_date` / `end_date`        | `Subscription` rows                                                                                                    |
| `user_payments`                        | `Payment`                                                                                                              |
| `system_admins` + `system-admin` guard | `PlatformAdmin` + `realm: "platform"`                                                                                  |
| `/api/v1/system-admin/*`               | `/api/platform/*`                                                                                                      |
| no audit trail                         | `AuditLog` on every privileged action                                                                                  |
| suspension did not exist               | `Tenant.status` + `Tenant.tokenVersion`                                                                                |

Detail for each table is in [`../legacy/LEGACY-MAP.md`](../legacy/LEGACY-MAP.md).
