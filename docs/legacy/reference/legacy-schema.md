# Legacy schema reference

Transcribed from the **42 migration files** in the legacy Laravel application
(`database/migrations/`), not from a live database dump. Where the two could
disagree, this file records what the migrations _declare_; a live `SHOW CREATE
TABLE` is the only way to catch drift introduced by manual SQL.

Legacy path: see [`../LEGACY-MAP.md`](../LEGACY-MAP.md).

Conventions in the legacy schema:

- Every primary key is `uuid` **unless** it is a join or line-item table, which use
  an auto-increment `id`.
- `company_id` is the tenancy column. It is **nullable on `users`** — `NULL` means
  "this row _is_ a company". It is **non-null** on almost everything else.
- Timestamps are Laravel's `created_at` / `updated_at`.
- Status columns are inconsistently typed: some are `boolean`, some `tinyInteger`
  with a comment documenting the meaning.

Legend: **PK** primary key · **FK** foreign key · **N** nullable.

---

## 1. Tenancy, identity and platform

### `users` — the tenant _and_ the staff table

`2014_10_12_0000001_create_users_table.php` (+ `2025_06_30` logo,
`2026_03_16` Google Calendar)

| Column                                    | Type             | Notes                                                  |
| ----------------------------------------- | ---------------- | ------------------------------------------------------ |
| `id` **PK**                               | uuid             |                                                        |
| `company_id` **FK** users.id **N**        | uuid             | `NULL` ⇒ this row is itself a tenant                   |
| `name`                                    | string           |                                                        |
| `company_name`                            | string           | Business name — only meaningful on an owner row        |
| `email`                                   | string           | **not unique in the migration** (application-enforced) |
| `email_verified_at` **N**                 | timestamp        |                                                        |
| `password` **N**                          | string           |                                                        |
| `gender` **N**                            | integer          | `0=male, 1=female`                                     |
| `phone`, `address` **N**                  | string           |                                                        |
| `status` **N**                            | boolean          | default `1`                                            |
| `position` **N**                          | string           | Job title for staff rows                               |
| `remember_token`                          | string           |                                                        |
| `appointment_access` … `migration_access` | tinyInteger × 11 | Entitlement **and** permission, conflated. See below   |
| `isOwner` **N**                           | tinyInteger      | `1=owner, 2=manager, NULL=user`                        |
| `start_date`, `end_date`                  | date             | The subscription period, stored on the owner row       |
| `color` **N**                             | string           | Calendar colour for staff                              |
| `logo` **N**                              | string           | Added later                                            |
| `google_calendar_access_token` **N**      | text             | Added `2026_03_16`                                     |
| `google_calendar_refresh_token` **N**     | text             |                                                        |
| `google_calendar_token_expires_at` **N**  | timestamp        |                                                        |
| `google_calendar_email` **N**             | string           |                                                        |
| `google_calendar_id` **N**                | string           |                                                        |

The eleven `*_access` tinyIntegers, all `default 0`, `1=yes 0=no`:
`appointment_access`, `customer_access`, `department_access`, `product_access`,
`service_access`, `package_access`, `giftcard_access`, `employee_access`,
`sale_access`, `report_access`, `migration_access`.

**The central legacy ambiguity.** On an owner row these flags read as "the tenant
bought this"; on a staff row they read as "this person may use this". The same
column answers two different questions depending on which row it sits on. The
rebuild splits it into `TenantModule` (bought) and role defaults (permitted).

### `user_infos` — seven more feature flags

`2023_12_27_040526_create_user_infos_table.php`

| Column                          | Type        | Notes                                      |
| ------------------------------- | ----------- | ------------------------------------------ |
| `id` **PK**                     | uuid        |                                            |
| `user_id` **FK** users.id **N** | uuid        |                                            |
| `employee_commission_package`   | tinyInteger | default 0                                  |
| `employee_performance_package`  | tinyInteger | default 0                                  |
| `whatsapp_business`             | tinyInteger | default 0                                  |
| `package`                       | tinyInteger | default 0 — **overlaps** `package_access`  |
| `value_package`                 | tinyInteger | default 0                                  |
| `customer_point`                | tinyInteger | default 0                                  |
| `gift_card`                     | tinyInteger | default 0 — **overlaps** `giftcard_access` |

A separate table, one row per user, holding exactly the same kind of information as
the `*_access` columns on `users`. `package` and `gift_card` duplicate
`package_access` and `giftcard_access`; which one a given controller reads is
inconsistent. The rebuild has one `TenantModule` row per module per tenant.

### `system_admins` — the whole platform layer

`2023_11_07_021400_create_system_admins_table.php`

| Column                    | Type      | Notes      |
| ------------------------- | --------- | ---------- |
| `id` **PK**               | uuid      |            |
| `name`                    | string    |            |
| `email`                   | string    | **unique** |
| `email_verified_at` **N** | timestamp |            |
| `password`                | string    |            |
| `remember_token`          | string    |            |

One table, a `system-admin` auth guard, and a `/api/v1/system-admin/*` route group
— that is the entire legacy platform layer. No `tenants` table, no module
catalogue, no audit trail.

### `user_payments` — the subscription ledger

`2024_03_08_034455_create_user_payments_table.php`

| Column                    | Type         | Notes                      |
| ------------------------- | ------------ | -------------------------- |
| `id` **PK**               | uuid         |                            |
| `user_id` **FK** users.id | uuid         | The owner, i.e. the tenant |
| `amount`                  | decimal(8,2) |                            |
| `pay_date`                | date         |                            |
| `updated_by`              | string       | **Free text**, not a FK    |

`updated_by` is a string, which is one reason the console needs a real `AuditLog`:
legacy has no dependable record of _which_ platform admin changed a tenant.

### Framework tables

| Table                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `password_reset_tokens`  | Laravel password reset (`email` is the PK)     |
| `personal_access_tokens` | Sanctum tokens; `tokenable_id` retyped to uuid |
| `jobs`, `failed_jobs`    | Queue tables (no queue worker in the handoff)  |

---

## 2. The tenancy idiom

Because `company_id` is nullable on `users` and holds the owner's id elsewhere, the
application uses variants of:

```php
$companyId = $user->company_id ?? $user->id;   // "which tenant am I?"
```

and then filters `where('company_id', $companyId)` on every domain table. It works,
but every query has to remember it, and a row whose `company_id` is missing or
wrong is silently invisible rather than rejected. There is no foreign key from
`company_id` to a parent, because no parent table exists.

The rebuild replaces this with `tenants.id`, a real foreign key, and a `tenantId`
applied automatically by the Prisma extension.

---

## 3. Catalogue

All of these carry `company_id` (uuid, non-null) plus timestamps.

### `departments` — branches / sections

`2014_10_12_0000000_create_departments_table.php`

| Column       | Type   |
| ------------ | ------ |
| `id` **PK**  | uuid   |
| `name`       | string |
| `company_id` | uuid   |

Note: `departments` is the **first** migration (ordered before `users`), so its
`company_id` has no foreign key to point at.

### `services`

`2023_11_06_114348_create_services_table.php`

| Column                  | Type         | Notes                                   |
| ----------------------- | ------------ | --------------------------------------- |
| `id` **PK**             | uuid         |                                         |
| `department` **FK**     | uuid **N**   | Named `department`, not `department_id` |
| `name`                  | string       |                                         |
| `status`                | boolean      | default 0, `1=active 0=unactive`        |
| `member_price` **N**    | decimal(8,2) |                                         |
| `nonmember_price` **N** | decimal(8,2) |                                         |
| `point` **N**           | integer      | Loyalty points earned                   |
| `description` **N**     | string       |                                         |

No duration column, even though the redesign's booking flow auto-fills duration
from the service. Duration lives only on `appointments` (`2025_07_22` migration).

### `products`

`2023_11_06_114327_create_products_table.php`

| Column                       | Type         | Notes                            |
| ---------------------------- | ------------ | -------------------------------- |
| `id` **PK**                  | uuid         |                                  |
| `name`                       | string       |                                  |
| `status`                     | boolean      | default 0, `1=active 0=inactive` |
| `member_price` **N**         | decimal(8,2) |                                  |
| `nonmember_price` **N**      | decimal(8,2) |                                  |
| `quantity` **N**             | integer      | Stock on hand                    |
| `point` **N**                | integer      |                                  |
| `department_id` **FK** **N** | uuid         | **`_id` suffix** here            |
| `description` **N**          | string       |                                  |

The column naming is inconsistent between `services.department` and
`products.department_id` for the same relationship.

### `packages` — a bundle of service sessions

`2023_11_06_114443_create_packages_table.php`

| Column                    | Type         | Notes                            |
| ------------------------- | ------------ | -------------------------------- |
| `id` **PK**               | uuid         |                                  |
| `name` **N**              | string       |                                  |
| `department` **FK** **N** | uuid         |                                  |
| `status` **N**            | boolean      | default 1, `0=inactive 1=active` |
| `no_of_time` **N**        | integer      | Sessions included                |
| `member_price` **N**      | decimal(8,2) |                                  |
| `nonmember_price` **N**   | decimal(8,2) |                                  |
| `description` **N**       | text         |                                  |

### `valuepackages` — prepaid credit

`2023_11_06_114454_create_valuepackages_table.php`

| Column                    | Type         | Notes                            |
| ------------------------- | ------------ | -------------------------------- |
| `id` **PK**               | uuid         |                                  |
| `name` **N**              | string       |                                  |
| `status`                  | boolean      | default 0, `1=active 0=inactive` |
| `department` **FK** **N** | uuid         |                                  |
| `price`                   | decimal(8,2) | What the customer pays           |
| `credit`                  | decimal(8,2) | Credit they receive              |
| `description` **N**       | text         |                                  |

`price` vs `credit` is the discount mechanism — pay 100, receive 120 of credit.

### `giftcards`

`2023_11_06_114519_create_giftcards_table.php`

| Column               | Type         | Notes                         |
| -------------------- | ------------ | ----------------------------- |
| `id` **PK**          | uuid         |                               |
| `name`               | string       |                               |
| `expired_date` **N** | string       | A **string**, not a date type |
| `value`              | decimal(8,2) |                               |
| `remark` **N**       | longText     |                               |
| `qr_code`            | string       |                               |

### Join tables

| Table                   | Columns                                          | Notes                                          |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `package_services`      | `id`, `service_id`, `package_id`                 | Which services a package covers                |
| `valuepackage_services` | `id`, `service_id`, `valuepackage_id`            | Which services a value package may be spent on |
| `department_user`       | `id`, `user_id`, `department_id` (+ cascade)     | Staff ↔ branch                                 |
| `customer_department`   | `id`, `customer_id`, `department_id` (+ cascade) | Customer ↔ branch                              |

All four use auto-increment `id` rather than uuid, and carry **no `company_id`** —
tenancy is inherited through the parents. A query on these tables alone cannot be
tenant-scoped without a join, which is one reason the rebuild gives every table an
explicit `tenantId`.

---

## 4. Customers and what they hold

### `customers`

`2023_11_06_114349_create_customers_table.php`

| Column                | Type       | Notes                                                  |
| --------------------- | ---------- | ------------------------------------------------------ |
| `id` **PK**           | uuid       |                                                        |
| `customer_id` **N**   | string     | A human-readable id, **different from `id`**           |
| `name`                | string     |                                                        |
| `member_id` **N**     | string     | Membership/tier reference                              |
| `dob` **N**           | string     | Date of birth as a **string** (drives birthday export) |
| `gender` **N**        | string     | Stored as **string** here, integer on `users`          |
| `email` **N**         | string     | `unique()` — **globally**, across all tenants          |
| `password`            | string     | Customers can log in to the mobile app                 |
| `phone` **N**         | string     |                                                        |
| `hair_card_no` **N**  | string     | Physical loyalty card numbers                          |
| `mani_card_no` **N**  | string     |                                                        |
| `card_no` **N**       | string     |                                                        |
| `address` **N**       | string     |                                                        |
| `comment` **N**       | string     |                                                        |
| `company_id` **FK**   | uuid       |                                                        |
| `otp` **N**           | string     | Mobile password reset                                  |
| `otp_expire_at` **N** | bigInteger | Epoch seconds                                          |

Two problems inherited from this table: `email` is globally unique, so the same
person cannot be a customer at two salons; and `customer_id` is a second
identifier that the code must keep in sync with `id`. The rebuild scopes customer
email uniqueness to the tenant.

### Customer holdings

These record what a customer owns and what has been consumed. They all carry
`customer_id` and most carry a `sale_id`, but **none carries `company_id`**.

| Table                         | Key columns                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customer_packages`           | `sale_package_id`, `customer_id`, `package_id`, `quantity`                                                                                       |
| `customer_valuepackages`      | `sale_valuepackage_id` **N**, `customer_id`, `valuepackage_id`, `amount`                                                                         |
| `customer_giftcards`          | `sale_gift_card_id` **N**, `customer_id`, `giftcard_id`, `value`, `qr_code` **N**                                                                |
| `customer_points`             | `customer_id`, `sale_id`, `point` (uuid PK)                                                                                                      |
| `customer_used_packages`      | `customer_id`, `customer_package_id`, `package_id`, `sale_id`, `unuse_time` **N**, `use_date`, `use_time`, `no_of_time`, `signature` **N**       |
| `customer_used_valuepackages` | `customer_id`, `customer_valuepackage_id`, `valuepackage_id`, `sale_id`, `unuse_time` **N**, `use_date`, `use_time`, `amount`, `signature` **N** |
| `customer_used_giftcards`     | `customer_id`, `customer_giftcard_id`, `giftcard_id`, `sale_id`, `use_date`, `use_time`, `signature` **N**, `use_amount` **N**                   |
| `customer_outstandings`       | `customer_id`, `unpaid_amount`, `sale_id` **N**                                                                                                  |
| `customer_paid_outstandings`  | `customer_outstanding_id`, `customer_id`, `sale_id`, `paid_date`, `paid_time`, `paid_amount`                                                     |

Observations that shape the rebuild:

- **`signature` is a `longText` base64 image** on all three `*_used_*` tables — the
  customer signs the screen when redeeming. This is why the web app carries a
  signature-pad dependency.
- The three `*_used_*` tables share one shape but differ in whether they track
  `amount` vs `no_of_time`. In the rebuild this is one redemption ledger with a
  typed quantity, or three tables if the reporting genuinely differs — decide in
  the phase that builds packages.
- `customer_points` records points **per sale**, so a customer's balance is
  `SUM(point)`. There is no balance column to go stale, which is right, and the
  rebuild keeps that property.
- Outstanding balances are split across two tables (what is owed, what was paid),
  so the current balance is again a sum.

---

## 5. Sales

### `sales`

`2023_11_06_114584_create_sales_table.php`

| Column                 | Type         | Notes                                         |
| ---------------------- | ------------ | --------------------------------------------- |
| `id` **PK**            | uuid         |                                               |
| `customer_id` **FK**   | uuid         |                                               |
| `employee_id` **FK**   | uuid         | The **primary** employee on the sale          |
| `sale_id` **N**        | string       | Human-readable reference, **not** the PK      |
| `total_quantity`       | integer      |                                               |
| `total_amount`         | decimal(8,2) |                                               |
| `paid_amount`          | decimal(8,2) |                                               |
| `payment_type` **N**   | string       | Text, e.g. cash/card                          |
| `paymenttype_id` **N** | uuid         | **No `paymenttypes` table exists** — dangling |
| `session_id` **N**     | string       | Payment-gateway session                       |
| `payment_status`       | tinyInteger  | default 0, `0=unpaid 1=paid`                  |
| `sale_status`          | tinyInteger  | default 0, `0=hold 1=done`                    |
| `sale_date`            | date         |                                               |
| `sale_time`            | time         |                                               |
| `sold_by_one` **N**    | uuid         | Up to **four** attributed employees           |
| `sold_by_two` **N**    | uuid         |                                               |
| `sold_by_three` **N**  | uuid         |                                               |
| `sold_by_four` **N**   | uuid         |                                               |
| `company_id` **FK**    | uuid         |                                               |

Two things to fix in the rebuild: `sold_by_one…four` is a fixed-width list where the
domain wants an arbitrary number of attributed staff (and the redesign's cart
assigns an employee **per line**); and `payment_type` (text) coexists with
`paymenttype_id` (uuid) pointing at a table that no migration creates.

### Sale line items

Five tables with an almost identical shape, differing only in which catalogue table
they reference. All use an auto-increment `id` **and** carry a nullable `company_id`.

| Table                | References        | Note                   |
| -------------------- | ----------------- | ---------------------- |
| `sale_products`      | `product_id`      |                        |
| `sale_services`      | `service_id`      |                        |
| `sale_packages`      | `package_id`      |                        |
| `sale_valuepackages` | `valuepackage_id` |                        |
| `sale_gift_cards`    | `giftcard_id`     | uuid PK instead of int |

Shared columns: `id`, `sale_id` **FK**, the catalogue FK, `name` (denormalised at
sale time), `quantity`, `paid_price` (decimal 8,2), `sale_date` **N**, `company_id`
**N**, timestamps.

`name` and `paid_price` are copied from the catalogue at sale time, which is
correct — a receipt must not change when a product is renamed or repriced. The
rebuild keeps that snapshot behaviour.

Four near-identical tables plus a fifth for gift cards is a polymorphic line-item
relationship spread across tables. The rebuild uses one sale-line table with a
`kind` and a nullable FK per kind, which makes "total for this sale" a single query
and lets a line be reassigned to another employee.

### `employee_comissions`

`2023_11_06_114758_create_employee_comissions_table.php`

| Column               | Type    | Notes                                  |
| -------------------- | ------- | -------------------------------------- |
| `id` **PK**          | uuid    |                                        |
| `employee_id` **FK** | uuid    |                                        |
| `sale_id` **FK**     | uuid    |                                        |
| `sale_amount`        | integer | Note: **integer**, not decimal         |
| `item_id` **N**      | string  | Which line item (`string`, for a uuid) |
| `type` **N**         | string  | Which catalogue kind `item_id` is      |
| `date` **N**         | date    |                                        |

No `company_id`. The table name is misspelled (`comissions`).

### `employee_performances`

`2023_11_06_114943_create_employee_performances_table.php`

| Column               | Type    |
| -------------------- | ------- |
| `id` **PK**          | bigint  |
| `employee_id` **FK** | uuid    |
| `sale_id` **FK**     | uuid    |
| `item_id` **N**      | string  |
| `type` **N**         | string  |
| `amount`             | integer |
| `date` **N**         | date    |

Same shape as commissions but with an auto-increment PK and no uuid. Both hold
derived data recomputed from sales, which is why the rebuild is tempted to treat
them as a materialised view rather than a table — decide in the reports phase.

### `employee_leaves`

`2023_11_06_114859_create_employee_leaves_table.php`

| Column               | Type   |
| -------------------- | ------ |
| `id` **PK**          | uuid   |
| `employee_id` **FK** | uuid   |
| `from_date`          | string |
| `to_date`            | string |
| `am_pm`              | string |
| `granted_by` **N**   | string |
| `comment` **N**      | text   |

Dates are strings and `granted_by` is free text rather than a user reference. The
rebuild uses real dates and a FK, and needs an approval state — the legacy
`employee_leave_approve` / `employee_leave_reject` endpoints imply one, but the
table has no column to record it.

---

## 6. Appointments

`2023_11_06_114413_create_appointments_table.php`
(+ `2025_07_16` signature, `2025_07_22` duration)

| Column                     | Type     | Notes                                             |
| -------------------------- | -------- | ------------------------------------------------- |
| `id` **PK**                | uuid     |                                                   |
| `customer_id` **FK** **N** | uuid     | cascades on delete                                |
| `user_id` **FK** **N**     | uuid     | assigned staff member; cascades on delete         |
| `service_id` **FK** **N**  | uuid     | cascades on delete                                |
| `start_time` **N**         | datetime |                                                   |
| `finish_time` **N**        | datetime |                                                   |
| `date` **N**               | string   | duplicates the date inside `start_time`           |
| `time` **N**               | string   | duplicates the time inside `start_time`           |
| `status` **N**             | boolean  | default 0 — a boolean for a multi-state lifecycle |
| `comment` **N**            | longText |                                                   |
| `company_id` **FK**        | uuid     |                                                   |
| `signature` **N**          | text     | added later; customer signs on completion         |
| `duration` **N**           | string   | added later; a **string**, e.g. `"01:30"`         |

The rebuild collapses `start_time` / `date` / `time` into one timestamptz pair,
makes `status` an enum (`SCHEDULED` · `IN_PROGRESS` · `COMPLETED` · `CANCELLED` ·
`NO_SHOW` — the legacy `appointmentStart` / `appointmentFinish` endpoints already
imply the middle two), and gives services a real `duration` so the redesign's
"pick a service, duration fills in" flow has a source.

---

## 7. Table roster

33 domain tables, grouped, in dependency order:

| Group      | Tables                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Platform   | `system_admins`, `user_payments`                                                                                           |
| Identity   | `users`, `user_infos`, `departments`, `department_user`                                                                    |
| Catalogue  | `services`, `products`, `packages`, `valuepackages`, `giftcards`, `package_services`, `valuepackage_services`              |
| Customers  | `customers`, `customer_department`, `customer_packages`, `customer_valuepackages`, `customer_giftcards`, `customer_points` |
| Redemption | `customer_used_packages`, `customer_used_valuepackages`, `customer_used_giftcards`                                         |
| Credit     | `customer_outstandings`, `customer_paid_outstandings`                                                                      |
| Booking    | `appointments`                                                                                                             |
| Sales      | `sales`, `sale_products`, `sale_services`, `sale_packages`, `sale_valuepackages`, `sale_gift_cards`                        |
| Staff      | `employee_comissions`, `employee_performances`, `employee_leaves`                                                          |

Plus four framework tables (`password_reset_tokens`, `personal_access_tokens`,
`jobs`, `failed_jobs`) — 37 created, 42 migrations including the five that add or
drop single columns.
