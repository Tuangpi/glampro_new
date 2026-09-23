# Authorization and tenant isolation

## Two boundaries

| Boundary     | Subject                                  | Enforcement                                                  |
| ------------ | ---------------------------------------- | ------------------------------------------------------------ |
| Platform     | GlamPro staff operating the SaaS         | `User.platformRole` = `PLATFORM_ADMIN`                       |
| Organization | Salon employees acting inside one tenant | `OrganizationMembership.role` resolved into `request.tenant` |

Platform administration is intentionally separate. A salon owner can never reach platform routes,
and a platform admin has no implicit access to salon operations.

## Roles

Organization roles, from `MembershipRole`:

| Role           | Intent                                                |
| -------------- | ----------------------------------------------------- |
| `ORG_OWNER`    | Full control including billing, members, and settings |
| `ORG_ADMIN`    | Full operational and administrative control           |
| `MANAGER`      | Operations plus staff management, voids, and refunds  |
| `RECEPTIONIST` | Front desk: appointments, customers, and sales        |
| `STAFF`        | Read-mostly access plus creating sales                |

## Permissions

Permissions are declared as a single `as const` array in
`apps/api/src/modules/auth/authorization.ts`, and `Permission` is derived from it. The role map is
typed as `Record<MembershipRole, ReadonlySet<Permission>>`, so TypeScript fails the build if a
role is missing or a permission name is misspelled.

```text
appointments.read    appointments.manage
customers.read       customers.manage
services.read        services.manage
products.read        products.manage
inventory.read       inventory.adjust
sales.create         sales.read         sales.void    sales.refund
staff.read           staff.manage
reports.view         settings.manage    members.manage
billing.manage       audit.read
```

Role grants:

| Permission        | OWNER | ADMIN | MANAGER | RECEPTIONIST  | STAFF |
| ----------------- | :---: | :---: | :-----: | :-----------: | :---: |
| `appointments.*`  |   ✔   |   ✔   |    ✔    | read + manage | read  |
| `customers.*`     |   ✔   |   ✔   |    ✔    | read + manage | read  |
| `services.*`      |   ✔   |   ✔   |  read   |     read      | read  |
| `products.*`      |   ✔   |   ✔   |  read   |     read      | read  |
| `inventory.*`     |   ✔   |   ✔   |    ✔    |     read      |   –   |
| `sales.create`    |   ✔   |   ✔   |    ✔    |       ✔       |   ✔   |
| `sales.read`      |   ✔   |   ✔   |    ✔    |       ✔       |   ✔   |
| `sales.void`      |   ✔   |   ✔   |    ✔    |       –       |   –   |
| `sales.refund`    |   ✔   |   ✔   |    ✔    |       –       |   –   |
| `staff.read`      |   ✔   |   ✔   |    ✔    |       ✔       |   –   |
| `staff.manage`    |   ✔   |   ✔   |    ✔    |       –       |   –   |
| `reports.view`    |   ✔   |   ✔   |    ✔    |       –       |   –   |
| `settings.manage` |   ✔   |   ✔   |    –    |       –       |   –   |
| `members.manage`  |   ✔   |   ✔   |    –    |       –       |   –   |
| `billing.manage`  |   ✔   |   ✔   |    –    |       –       |   –   |
| `audit.read`      |   ✔   |   ✔   |    –    |       –       |   –   |

`ORG_OWNER` and `ORG_ADMIN` currently hold every permission. Phase 2 will tighten `ORG_ADMIN`
where owner-only actions (transferring ownership, cancelling the subscription) need separation.

## Enforcement

`requirePermission(permission)` is the only place role checks happen. It returns middleware that:

1. rejects with `401 AUTHENTICATION_REQUIRED` when `request.tenant` is absent, which means the
   request never resolved to an organization membership;
2. rejects with `403 PERMISSION_DENIED` when the role lacks the permission;
3. otherwise continues.

Routes compose it after the authentication and tenant middlewares. `requirePermission` ships with
the foundation; `authenticate`, `withTenant`, and `validate` arrive with the authentication,
tenancy, and shared-validation modules respectively, at which point the chain looks like:

```ts
router.post(
  '/sales',
  authenticate,
  withTenant,
  requirePermission('sales.create'),
  validate({ body: createSaleSchema }),
  createSaleHandler,
);
```

Controllers must not read `request.tenant.role` to make decisions. `roleHasPermission` exists for
services that need a secondary check on a sensitive transition, such as refunding a sale that has
already been settled.

## Tenant isolation rules

1. Every tenant-owned table has `organizationId`. Location-owned tables also have `locationId`.
2. `organizationId` is resolved server-side from the authenticated membership. A value supplied
   by the browser is never trusted for authorization.
3. Services accept an explicit tenant context and include it in every `where` clause, for example
   `where: { id, organizationId }` rather than `where: { id }`.
4. Unique constraints are scoped, such as `@@unique([organizationId, userId])` on memberships and
   `@@unique([organizationId, code])` on locations, so two tenants can use the same natural keys.
5. Indexes lead with the tenant column (`@@index([organizationId, isActive])`) so scoped queries
   stay efficient.
6. A membership's role applies to the whole organization. Location restriction comes from
   `request.tenant.locationIds`, and single-location tenants get one entry.
7. Cross-organization access attempts return `404`, not `403`, for records reached by ID. This
   avoids confirming that another tenant's record exists.
8. Platform-scoped routes use a different resolver and never fall back to organization context.

## Audit logging

`AuditLog` records `organizationId` (nullable for platform events), `actorUserId`, `actorType`,
`action`, `entityType`, `entityId`, `requestId`, `ipAddress`, `userAgent`, and a JSON `metadata`
payload. `actorType` distinguishes `USER`, `PLATFORM_ADMIN`, `SYSTEM`, and `WEBHOOK` so that
Stripe-driven changes are attributable.

Events that must be audited include authentication outcomes, membership and role changes,
invitation lifecycle, subscription changes, catalog price changes, inventory adjustments, sale
voids, and refunds.

## Testing requirements

Any new module ships with integration tests covering:

1. an unauthenticated request is rejected with `401`;
2. a request from an insufficient role is rejected with `403`;
3. a request from organization A for a record owned by organization B returns `404`;
4. a permitted request within the tenant succeeds and leaves data outside the tenant untouched.

`apps/api/src/modules/auth/authorization.test.ts` covers the role-to-permission matrix. Tenant
isolation tests are added per module as those modules are built.
