# Legacy map — what the old system is and how it maps onto the rebuild

Everything needed to read the legacy Glampro application without having it checked
out, and the mapping from its model to the new one.

- Column-level detail: [`reference/legacy-schema.md`](reference/legacy-schema.md)
- HTTP surface: [`API-INVENTORY.md`](API-INVENTORY.md)
- Tenant model the rebuild adopts: [`../saas/TENANCY.md`](../saas/TENANCY.md)

---

## 1. Where it is

```
/media/tuangpi/2f03b0ac-9b56-4f1a-ab1c-0529d7bb4e7910/home/singtuang/Documents/Aridient/Glampros/glampro
```

A sibling directory of this repository — **outside** the monorepo, not a git
submodule, not a dependency. It is reference material: read it, cite it, do not
build against it.

| Aspect       | Legacy                             | Rebuild                          |
| ------------ | ---------------------------------- | -------------------------------- |
| Backend      | Laravel 10.10 on PHP 8.1           | Express 5 + TypeScript           |
| Auth         | Sanctum 3.3 personal access tokens | JWT access + opaque refresh      |
| Database     | MySQL, 42 migrations, 37 tables    | PostgreSQL 17 + Prisma 7         |
| Front end    | React 18.2 SPA in `front-end/`     | React 19 + Vite + Tailwind 4     |
| Client state | Redux Toolkit + redux-persist      | TanStack Query (no global store) |
| Router       | react-router-dom 6                 | React Router 8                   |
| i18n         | i18next + react-i18next            | English only for now (see STATE) |
| Entitlements | 18 boolean columns across 2 tables | `TenantModule` rows              |
| Tenancy      | implicit, via `users.company_id`   | first-class `Tenant`             |

Notable backend packages, and what they imply for the rebuild:

| Package                          | Used for                                | Rebuild plan                                   |
| -------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `barryvdh/laravel-dompdf`        | Receipt and report PDFs                 | Server-side PDF in the reporting phase         |
| `maatwebsite/excel`              | Every `/export/*` endpoint              | XLSX export in the reporting phase             |
| `simplesoftwareio/simple-qrcode` | Gift-card QR codes                      | Client-side `qrcode`; revisit if server-needed |
| `stripe/stripe-php`              | Card payments                           | Payment integration, later phase               |
| `webklex/laravel-imap`           | Reading a mailbox (the AI mail feature) | Only if `aiAssistant` is kept                  |
| `cloudinary/cloudinary_php`      | Image hosting (logos, staff photos)     | Local `UPLOADS_DIR` volume, or an adapter      |

The legacy front end also carries `routes/web.php` with one public
`POST /webhook` (`WebHookController::webhookHandler`, `withoutMiddleware('web')`).
A public unauthenticated webhook is a compatibility requirement for whatever
payment provider calls it — confirm the provider before the payments phase, because
the handler's expected payload is not documented in code.

---

## 2. How to read it

| Question                              | Look at                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| What tables exist and what is in them | `database/migrations/` — 42 files, chronological        |
| How a table is actually shaped today  | A live `SHOW CREATE TABLE`; migrations may have drifted |
| What endpoints exist                  | `routes/api.php` — the only API route file              |
| What an endpoint does                 | `app/Http/Controllers/Api/v1/**`                        |
| Which columns a model exposes         | `app/Models/**` — check `$fillable` and casts           |
| Whether a tenant check is applied     | Grep the controller for `company_id`                    |
| How the UI consumed it                | `front-end/src/` — pages, services, redux slices        |

**The cheapest way to answer "how does X work today?"** is to grep the controller
for `company_id`. If a query has no `company_id` filter it is either a deliberately
platform-scoped query or a tenant-isolation bug — and knowing which is the point.

---

## 3. The finding that shapes everything

**The legacy application is already a multi-tenant SaaS. The tenancy is implicit.**

There is no `companies` or `tenants` table. A tenant is a `users` row where
`company_id IS NULL` and `isOwner IS NOT NULL`. Every other row — including every
_other_ user — points back at that owner's id through `company_id`, and the
application resolves the current tenant with:

```php
$companyId = $user->company_id ?? $user->id;
```

Everything else follows from that one fact:

| SaaS concept        | Legacy representation                                        |
| ------------------- | ------------------------------------------------------------ |
| Tenant              | `users` row with `company_id IS NULL`, `isOwner IS NOT NULL` |
| Tenant membership   | `users.company_id`                                           |
| Module entitlement  | `users.*_access` (11 columns) + `user_infos.*` (7 columns)   |
| Subscription period | `users.start_date` / `users.end_date`                        |
| Subscription status | _does not exist_ — computed from the dates                   |
| Suspension          | _does not exist_                                             |
| Platform operator   | `system_admins` + the `system-admin` guard                   |
| Platform API        | `/api/v1/system-admin/*`                                     |
| Payment ledger      | `user_payments`                                              |
| Audit trail         | _does not exist_ — `user_payments.updated_by` is free text   |

So the rebuild is not inventing a SaaS layer. It is **promoting an implicit design
into an explicit one**, which is why legacy data migrates 1:1 (see
[ADR 0002](../decisions/0002-tenant-id-equals-owner-id.md)) and why the platform
console closes three real gaps rather than three imagined ones: no audit trail, no
suspension, and no subscription history.

---

## 4. Model mapping

"Replaced by", not "renamed to". Column detail is in
[`reference/legacy-schema.md`](reference/legacy-schema.md).

### Platform plane

| Legacy                          | New                       | Notes                                                                  |
| ------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `system_admins`                 | `PlatformAdmin`           | `password` → `passwordHash`; add `status`, `tokenVersion`              |
| _(implicit owner row)_          | `Tenant`                  | `id` = the owner's legacy `users.id`; `name` from `company_name`       |
| _(18 boolean flags)_            | `Module` + `TenantModule` | Catalogue seeded from the codes in [`../CONTEXT.md`](../CONTEXT.md) §5 |
| `users.start_date` / `end_date` | `Subscription`            | One row per period; history preserved                                  |
| `user_payments`                 | `Payment`                 | `updated_by` (text) → `recordedByPlatformAdminId` (FK)                 |
| _(nothing)_                     | `AuditLog`                | New; every privileged console action                                   |

### Tenant plane

| Legacy                                                                                     | New                                               | Notes                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| `users` (owner + staff in one table)                                                       | `User` + `Tenant`                                 | Split identity from the business                        |
| `users.isOwner` `1` / `2` / `NULL`                                                         | `Tenant.ownerUserId` (a relation, not a role)     | `CASHIER` is new; `GLOBAL_ROLES` is unchanged           |
| `users.*_access`, `user_infos.*`                                                           | `TenantModule` + role defaults                    | Bought vs. permitted, separated                         |
| `departments`                                                                              | `Department`                                      |                                                         |
| `department_user`, `customer_department`                                                   | Prisma implicit m-n joins                         | Plus `tenantId` on both sides                           |
| `customers`                                                                                | `Customer`                                        | Email uniqueness becomes per-tenant                     |
| `services`                                                                                 | `Service`                                         | Add `duration` — legacy had none, the redesign needs it |
| `products`                                                                                 | `Product`                                         | `quantity` becomes tracked stock                        |
| `packages`, `package_services`                                                             | `Package` + m-n to `Service`                      |                                                         |
| `valuepackages`, `valuepackage_services`                                                   | `ValuePackage` + m-n to `Service`                 | `price` / `credit` kept                                 |
| `giftcards`                                                                                | `GiftCard`                                        | `expired_date` string → real date                       |
| `sale_gift_cards`, `customer_giftcards`, `customer_used_giftcards`                         | `GiftCardIssue` + `GiftCardRedemption`            |                                                         |
| `customer_packages`, `customer_used_packages`                                              | `CustomerPackage` + `PackageRedemption`           | `signature` longText → text column or object storage    |
| `customer_valuepackages`, `customer_used_valuepackages`                                    | `CustomerValuePackage` + `ValuePackageRedemption` |                                                         |
| `customer_points`                                                                          | `CustomerPoint`                                   | Keep: balance stays a `SUM`, so nothing can go stale    |
| `customer_outstandings`, `customer_paid_outstandings`                                      | `CustomerOutstanding` + `OutstandingPayment`      |                                                         |
| `appointments`                                                                             | `Appointment`                                     | One timestamptz pair; `status` becomes an enum          |
| `sales`                                                                                    | `Sale`                                            | `sold_by_one..four` → attributed staff per line         |
| `sale_products`, `sale_services`, `sale_packages`, `sale_valuepackages`, `sale_gift_cards` | `SaleLine`, one table with `kind` + nullable FKs  | Snapshot `name` + `price` preserved                     |
| `employee_comissions`                                                                      | `Commission`                                      | Fix the spelling; `sale_amount` integer → decimal       |
| `employee_performances`                                                                    | _(derived — a view, not a table)_                 | Decide in the reports phase                             |
| `employee_leaves`                                                                          | `Leave`                                           | Real dates, FK for `grantedBy`, add approval status     |

### The tenancy column

| Legacy                                        | New                                                   |
| --------------------------------------------- | ----------------------------------------------------- |
| `users.company_id` — nullable, no foreign key | `Tenant.id` — real FK, `tenantId` non-null everywhere |
| `departments.company_id` with no parent table | `Department.tenantId`                                 |
| Join tables with no `company_id` at all       | `tenantId` on both join tables                        |
| `company_id` nullable on some sale/line rows  | never nullable                                        |
| `company_id ?? user.id` resolved per query    | resolved once, by the auth middleware, from the token |

---

## 5. Gaps and inconsistencies worth knowing before migrating

Found while transcribing the migrations. None is a blocker; each costs time if
discovered late.

| #   | Finding                                                                            | Impact                                                     |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `sales.paymenttype_id` references a `paymenttypes` table **no migration creates**  | Either it exists in production only, or the column is dead |
| 2   | `services.department` vs `products.department_id`                                  | Same relationship, two column names                        |
| 3   | `users.email` is not unique at the DB level (application-enforced)                 | The migration must decide what to do with duplicates       |
| 4   | `customers.email` is **globally** unique across tenants                            | Blocks one person being a customer at two salons           |
| 5   | "Employee" and "user" are the same row; the words are interchangeable in the code  | **Resolved** — one row, §6 Q4                              |
| 6   | `users.gender` is an integer, `customers.gender` a string                          | Normalise in the migration                                 |
| 7   | `customers.dob` and `giftcards.expired_date` are strings                           | Normalise to dates; malformed values need a rule           |
| 8   | `appointments.date` + `time` duplicate `start_time`                                | **Resolved** — `start_time` wins, §6 Q7                    |
| 9   | `appointments.status` is a boolean for a five-state lifecycle                      | **Resolved** — booked/started, §6 Q8                       |
| 10  | `employee_leaves` has no approval column although approve/reject endpoints exist   | **Resolved** — stored as free text in `granted_by`, §6 Q9  |
| 11  | `employee_comissions.sale_amount` is an integer                                    | Truncated commission amounts                               |
| 12  | Every money column is `decimal(8,2)`                                               | Max 999,999.99 — widen in the rebuild                      |
| 13  | `MigrationController` exists but its routes are commented out                      | `migration_access` may gate nothing at all                 |
| 14  | `get_user_appointments_history` route is commented out                             | Dead mobile endpoint                                       |
| 15  | `POST /webhook` is public and unauthenticated (§1)                                 | Needs a signature check before it is re-implemented        |
| 16  | `*_access` is read inconsistently — some code reads `users.*`, some `user_infos.*` | Any entitlement report from the legacy DB must check both  |

Items 3, 4, 5, 8, 9 and 10 must be resolved before the corresponding phase is
built, because they change the schema rather than just the code. They are tracked
in [`../STATE.md`](../STATE.md).

Findings 5, 8, 9 and 10 have since been **answered from the legacy source** and are
written up with their evidence in §6 below. Findings 3, 4 and 6 still need
production data.

---

## 6. Schema gates, answered from the legacy source

These four changed the shape of the new schema, so they were resolved by reading
the legacy application rather than guessed. They are the contract for the Phase 2
migration, and each is marked resolved in [`../STATE.md`](../STATE.md) §4.1.

| #   | Question                                       | Answer                                                                             |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Q4  | Is "employee" a different row from "user"?     | No — one row                                                                       |
| Q7  | `appointments.date` + `time`, or `start_time`? | `start_time`                                                                       |
| Q8  | What do `appointments.status` `0` / `1` mean?  | `0` booked, `1` started; completion is `finish_time`, not a status                 |
| Q9  | Was leave approval ever stored?                | Yes, lossily — `employee_leaves.granted_by` holds an approver name or `"rejected"` |

### Q4 — employee and user are the same row

`EmployeeController::create()` creates a `User` and sets `company_id`
(`app/Http/Controllers/Api/v1/User/EmployeeController.php`, lines 62 and 72); the
listings query `User::when(...)` and filter on `company_id` (lines 24, 37, 45); and
`employee_leaves.employee_id` is a foreign key onto `users.id`. Everything
employee-shaped lives on the user row: `users.isOwner` (`1=owner, 2=manager,
null=user`), `users.status`, `users.position` and the eleven `*_access` flags.

**Consequence:** the rebuild has **one** `User` model, not a separate staff table.
Staff is a `User` in a staff role carrying a staff profile. This is consistent with
ADR 0002, which makes ownership a relation (`Tenant.ownerUserId`) rather than a
role, and with the mapping in §4.

### Q7 — `start_time` is authoritative; `date` and `time` are copies

On create the controller writes all three columns from the same input
(`AppointmentController.php`, lines 116–120):

```php
$appointment->start_time = $input['date'] . " " . $input['time'];
$appointment->date       = $input['date'];
$appointment->time       = $input['time'];
```

On update the same happens whenever those fields are present (lines 207–220), and
every read path uses `start_time` — the calendar feed and the response payload
(lines 90, 145, 163, 229, 247). `start_time` is derived data that happened to be
written beside its own source, while `date` and `time` are `varchar` copies of a
timestamp that could never disagree at write time but were free to drift afterwards.

**Consequence:** `Appointment` gets one `startsAt` and one `endsAt` timestamptz.

### Q8 — `status` is a two-state flag, and "finished" is not a status

`appointments.status` is `boolean default 0`. The only writer that changes it is
`appointmentStart()`, which sets it to `1` (line 272):

```php
Appointment::where('id', $id)
    ->where('company_id', $this->companyId($request->user()))
    ->update(['status' => 1]);
```

`appointmentFinish()` never touches `status` — it writes `finish_time` and
`signature` (lines 287–289) and answers _"Appointment Finished with signature!"_. So
the stored lifecycle is:

| Legacy value              | Meaning                                  |
| ------------------------- | ---------------------------------------- |
| `status = 0` (default)    | booked                                   |
| `status = 1`              | started — the staff member pressed Start |
| `finish_time IS NOT NULL` | finished, and signed                     |

There is no stored cancelled, no-paid or no-show state anywhere in the application.
The five-state lifecycle exists only in the handoff screens; the legacy system never
had one.

**Consequence:** the new `AppointmentStatus` enum is ours to define and the mapping
is unambiguous — `0 → SCHEDULED`, `1 → IN_PROGRESS`, `finish_time != null →
COMPLETED`. `CANCELLED` and `NO_SHOW` are new states with nothing to migrate.
The importer trusts `start_time`, falling back to `date` + `time` only where

### Q9 — leave approval was stored, as free text

`employee_leaves.granted_by` is a `string`. Approval writes the approver's **name**;
rejection writes the literal string `"rejected"` (`EmployeeController.php`, lines
258–272):

```php
public function employee_leave_approve(Request $request, $id) {
    $employee_leave = EmployeeLeave::where('id', $id)
        ->where('company_id', $this->companyId($request->user()))->first();
    $employee_leave->granted_by = $request->user()->name;
    $employee_leave->save();
}

public function employee_leave_reject(Request $request, $id) {
    // …
    $employee_leave->granted_by = "rejected";
    $employee_leave->save();
}
```

So approval history **is** recoverable — it was persisted, just encoded as free text
with no id and no timestamp. A row whose `granted_by` is exactly `rejected` was
rejected; any other non-null value is an approver's display name. Note that neither
path touches the user's `status`, so a rejection leaves no other trace either.

**Consequence:** `Leave` gets a real `status` enum and an `approvedById` foreign key
to `User`. The importer recovers the state from the string — `"rejected"` to
`REJECTED`, any other value to `APPROVED` — and leaves `approvedById` null when the
name does not resolve to a user, because guessing an approver from a display name
would write a false audit record into the new database. Unresolvable names are
reported by the importer rather than dropped.
`start_time` is null, and does not carry `date`/`time` across.
