# Context — vocabulary and the shape of the product

Read this before changing a model, a route or a screen. It defines the words this
codebase uses and the SaaS structure everything hangs off.

For the current phase and open questions see [`STATE.md`](STATE.md). For the
enforcement mechanics see [`saas/TENANCY.md`](saas/TENANCY.md).

---

## 1. What the product is

A **multi-tenant salon management SaaS**. One deployment serves many salons. Each
salon is a separate business with its own catalogue, staff, customers, sales and
appointments, and it can only ever see its own data.

Around the salons sits a **platform layer**: the operator of the service
(glamproplus.com) uses a separate console to create salons, decide which modules
each one has bought, record their payments and suspend them when a subscription
lapses.

Three audiences, three surfaces:

| Audience               | Surface                            | Authenticates against |
| ---------------------- | ---------------------------------- | --------------------- |
| Salon staff and owners | The salon app (`apps/web`)         | `users` table         |
| Salon staff on the go  | The shipped mobile client (frozen) | `users` table         |
| The platform operator  | The platform console               | `platform_admins`     |

---

## 2. Vocabulary

These words are used precisely. Prefer them over synonyms in code, docs and UI.

| Term                 | Meaning                                                                                   | Not to be confused with      |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| **Tenant**           | One salon business — the isolation boundary. Model `Tenant`, table `tenants`.             | A customer of the salon      |
| **Business / Salon** | The user-facing name for a tenant in the platform console. Same thing, friendlier word.   | —                            |
| **Platform admin**   | An employee of the SaaS operator. Model `PlatformAdmin`. No tenant, no `tenantId`.        | The salon owner              |
| **Owner**            | The `User` with role `OWNER` who signed the salon up. One per tenant.                     | A platform admin             |
| **Staff / user**     | Any other login inside a tenant — manager, stylist, cashier. Always carries a `tenantId`. | —                            |
| **Module**           | A feature area that can be switched on or off per tenant (`Module` catalogue row).        | A screen                     |
| **Entitlement**      | The row granting one tenant one module, with optional expiry and limits (`TenantModule`). | A role permission            |
| **Core module**      | A module every tenant always has (`isCore`). Cannot be revoked.                           | —                            |
| **Subscription**     | One paid period for a tenant: `startDate`, `endDate`, status.                             | A Stripe subscription object |
| **Payment**          | A recorded payment against a tenant's subscription. The ledger.                           | A POS sale                   |
| **Sale**             | A transaction at the salon till — what the customer pays the salon.                       | A platform payment           |
| **Department**       | A branch or a section of the salon. The legacy term; kept in the UI.                      | A tenant                     |
| **Realm**            | Which kind of caller a token belongs to: `platform`, `web`, `pos`, `mobile`.              | A role                       |

**"Tenant" in code, "business" or "salon" in the console UI.** The domain model is
about isolation; the console operator thinks in businesses.

---

## 3. The two-plane model

```
┌─ Platform plane ────────────────────────────────────────────────┐
│  PlatformAdmin ──▶ Module catalogue                             │
│                ──▶ Tenant ──▶ TenantModule  (what was bought)   │
│                          ──▶ Subscription ──▶ Payment           │
│                ──▶ AuditLog                                     │
└─────────────────────────────────────────────────────────────────┘
                              │ provisions & gates
                              ▼
┌─ Tenant plane (one per salon) ──────────────────────────────────┐
│  User (owner, manager, staff)                                   │
│  Department · Customer · Product · Service · Package            │
│  ValuePackage · GiftCard · Appointment · Sale (+ line items)    │
│  EmployeeCommission · EmployeeLeave · CustomerPoint, and so on  │
└─────────────────────────────────────────────────────────────────┘
```

Every model in the lower plane carries a `tenantId`. Nothing in the lower plane
can reach the upper plane, and the console never queries salon data except through
explicitly aggregated, read-only reporting.

---

## 4. Roles inside a tenant

Distinct from platform admins, and distinct from _module_ entitlements.

| Role      | Scope                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| `OWNER`   | Everything in the tenant, including staff management and settings.           |
| `MANAGER` | Everything the tenant has modules for, except destructive/ownership actions. |
| `STAFF`   | The operational subset the tenant grants them.                               |
| `CASHIER` | Point of sale and receipt handling.                                          |

The legacy system encoded role as `users.isOwner` (`1=owner, 2=manager, NULL=user`)
plus eleven boolean `*_access` flags on the same row. That conflated **"the tenant
bought this module"** with **"this person may use it"**. The rebuild separates them:

1. **`TenantModule`** — did the tenant buy it? Set by the platform console. A hard
   gate: no entitlement means the API returns `MODULE_NOT_ENTITLED`.
2. **Role defaults** — given the tenant bought it, may this role use it?
3. **`UserModule`** (optional, later) — a per-user exception on top of the role.

The API enforces 1 and 2. The UI additionally hides what the user cannot use, but
hiding is presentation, never the security boundary.

---

## 5. Module catalogue

The starting catalogue, derived from the legacy `*_access` columns and
`user_infos` flags. Codes are stable identifiers used in the API, the console and
`navigation.ts`; labels are UI copy and may change freely.

### Core — `isCore`, always entitled, cannot be revoked

| Code           | Covers                                     |
| -------------- | ------------------------------------------ |
| `dashboard`    | Home KPIs, today's appointments and sales  |
| `sales`        | Point of sale, cart, payment, receipt      |
| `customers`    | Customer records, tiers, history           |
| `appointments` | Booking and the day-view calendar          |
| `services`     | Service catalogue and pricing              |
| `products`     | Product catalogue and stock                |
| `employees`    | Staff records, shifts, leave               |
| `departments`  | Branches and sections                      |
| `reports`      | Sales, customer and operational reporting  |
| `settings`     | Tenant profile, hours, tax, receipt, staff |

### Add-on — granted per tenant by the platform console

| Code                  | Covers                                        | Legacy origin                   |
| --------------------- | --------------------------------------------- | ------------------------------- |
| `packages`            | Service packages sold as a bundle of sessions | `package_access` / `package`    |
| `valuePackages`       | Prepaid credit / stored-value packages        | `value_package`                 |
| `giftCards`           | Gift cards: issue, redeem, QR                 | `giftcard_access` / `gift_card` |
| `loyaltyPoints`       | Customer points earned on sales               | `customer_point`                |
| `employeeCommission`  | Commission calculation and its report         | `employee_commission_package`   |
| `employeePerformance` | Per-staff performance reporting               | `employee_performance_package`  |
| `whatsappBusiness`    | WhatsApp Business messaging                   | `whatsapp_business`             |
| `dataImport`          | Bulk import of legacy/competitor data         | `migration_access`              |
| `aiAssistant`         | AI chat and AI-composed mail                  | `AIController`, `/api/ai-chat`  |
| `googleCalendar`      | Two-way Google Calendar sync                  | `GoogleCalendarController`      |
| `mobileApp`           | Access for the shipped mobile client          | `/api/mobile/*`                 |

Two legacy quirks the rebuild resolves rather than reproduces: `package_access`
_and_ `user_infos.package` both existed (likewise `giftcard_access` and
`gift_card`) — one row per module replaces both; and `migration_access` sat on the
owner row while the `MigrationController` routes were commented out, so `dataImport`
is listed here as a module to either build properly or drop (see
[`STATE.md`](STATE.md), open questions).

---

## 6. Subscription lifecycle

```
                   provisioned by console
                            │
                            ▼
  ┌────────┐  period ends, renewed   ┌────────────┐
  │ ACTIVE │ ───────────────────────▶│   ACTIVE   │
  └───┬────┘                         └─────┬──────┘
      │ period ends, not renewed          │ console suspends
      ▼                                    ▼
  ┌──────────┐   console records payment  ┌───────────┐
  │ EXPIRED  │ ─────────────────────────▶ │ SUSPENDED │
  └──────────┘                            └─────┬─────┘
      │                                        │ reinstated
      │ console cancels                        ▼
      ▼                                     ACTIVE
  ┌───────────┐
  │ CANCELLED │
  └───────────┘
```

Rules:

- Signing in requires `ACTIVE`. A `SUSPENDED` owner may sign in **read-only**, so
  they can see _why_ they are locked out and that payment is what fixes it.
  `EXPIRED` and `CANCELLED` cannot sign in.
- Expiry is **computed** from `endDate`, not stored as a stale flag; a nightly job
  materialises `EXPIRED` for reporting and notification purposes.
- Module entitlements can expire independently of the subscription.
- Suspending a tenant kills its sessions immediately by incrementing the tenant's
  `tokenVersion` — the same mechanism already used per user on `users`.

The legacy equivalent was `users.start_date` / `users.end_date` on the owner row
plus an `isOwner` check. It had no notion of suspension and no history: extending a
subscription overwrote the dates in place. The rebuild keeps one `Subscription` row
per period, so "what was this tenant paying in March?" is answerable.

---

## 7. Where the legacy model stops being useful

Worth carrying over:

- The domain itself: catalogue, cart, sale line items, packages as bundles of
  services, value packages as prepaid credit, gift cards with QR, customer points,
  commissions, leaves, outstanding balances.
- The SaaS _concepts_ — they were already there, just implicit.
- The route vocabulary, broadly, so muscle memory and the mobile client survive.

Deliberately not carried over:

| Legacy pattern                                       | Replacement                                             | Why                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Boolean `*_access` columns on `users` / `user_infos` | `TenantModule` rows                                     | Adding a module must not be a schema change            |
| `users.start_date` / `end_date` as the subscription  | `Subscription` rows, one per period                     | History, suspension, renewals                          |
| `company_id NULL` meaning "this user _is_ a company" | `Tenant` + non-null `tenantId` everywhere in the domain | The single most error-prone legacy idiom               |
| `decimal(8,2)` money                                 | Wider decimal + a single money helper                   | Caps a multi-outlet tenant at 999,999.99               |
| Soft delete by convention                            | Explicit per model                                      | "Why is this row missing?" should not be a mystery     |
| Commented-out routes, dead controllers               | Build it or delete it                                   | `MigrationController`, `get_user_appointments_history` |
