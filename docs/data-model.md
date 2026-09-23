# Data model

The Prisma schema lives at `apps/api/prisma/schema.prisma` and targets MySQL 8.4. Identifiers are
`cuid()` strings so that records can be generated client-side before a transaction commits.

## Implemented models

### Tenancy

| Model                    | Purpose                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| `Organization`           | Tenant root: name, unique slug, status, legal and GST details, currency, timezone |
| `OrganizationMembership` | Links a `User` to an `Organization` with a role and status                        |
| `OrganizationInvitation` | Pending invitation with a hashed token, role, expiry, and audit fields            |
| `Location`               | Salon branch with address, timezone, currency, tax mode, and receipt numbering    |
| `BusinessHour`           | Per-location opening hours, one row per weekday                                   |
| `Subscription`           | Stripe-backed SaaS subscription state for an organization                         |

`Organization` defaults to `SGD` and `Asia/Singapore`. `Location.pricesIncludeTax` defaults to
`true`, which matches Singapore practice where displayed prices include GST.

Receipt numbering is per location: `receiptPrefix` plus a monotonically increasing
`nextReceiptNumber`, allocated inside the sale transaction so concurrent sales cannot collide.

### Identity

| Model                    | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `User`                   | Person record: email, name, phone, platform role, verification state |
| `UserCredential`         | bcrypt `passwordHash` and `passwordChangedAt`, separated from `User` |
| `AuthSession`            | Refresh token hash, token family, device metadata, revocation state  |
| `PasswordResetToken`     | Single-use hashed reset token with expiry and `usedAt`               |
| `EmailVerificationToken` | Single-use hashed verification token with expiry                     |

Splitting credentials from the person record keeps password material out of ordinary user
queries. Splitting sessions from credentials allows device-level revocation without invalidating
a password.

`AuthSession.refreshTokenHash` is unique, and `tokenFamilyId` groups the chain of rotations. A
rotated row is superseded by its successor: its access token stops working immediately and the row
is no longer listed as an active session. When a retired token is presented again outside a short
grace window the whole family is revoked, and signing out revokes the family too.

### Platform

| Model      | Purpose                                                              |
| ---------- | -------------------------------------------------------------------- |
| `AuditLog` | Actor, action, entity, request ID, IP, user agent, and JSON metadata |

Actions currently written: `auth.registered`, `auth.login`, `auth.login_failed`,
`auth.session_refreshed`, `auth.refresh_reuse_detected`, `auth.logout`, `auth.session_revoked`,
`auth.password_reset_requested`, `auth.password_reset_completed`, `auth.email_verified`,
`settings.organization_updated`, `settings.location_created`, `settings.location_updated`,
`settings.business_hours_updated`, `members.invited`, `members.invitation_revoked`,
`members.invitation_accepted`, `members.role_changed`, `members.suspended`,
`members.reactivated`, and `members.removed`.

## Enumerations

| Enum                 | Values                                                                |
| -------------------- | --------------------------------------------------------------------- |
| `PlatformRole`       | `USER`, `PLATFORM_ADMIN`                                              |
| `MembershipRole`     | `ORG_OWNER`, `ORG_ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`          |
| `MembershipStatus`   | `INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`                           |
| `OrganizationStatus` | `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`               |
| `InvitationStatus`   | `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`                           |
| `SubscriptionStatus` | `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCELLED`, `INCOMPLETE` |
| `AuditActorType`     | `USER`, `PLATFORM_ADMIN`, `SYSTEM`, `WEBHOOK`                         |

## Relationship shape

```text
User ──1:1── UserCredential
User ──1:n── AuthSession, PasswordResetToken, EmailVerificationToken

Organization ──1:n── OrganizationMembership ──n:1── User
Organization ──1:n── OrganizationInvitation
Organization ──1:n── Subscription
Organization ──1:n── Location ──1:n── BusinessHour
Organization ──1:n── AuditLog
```

Every tenant-owned model either holds `organizationId` directly or reaches it through a parent
that does. Deletes cascade from `Organization` to its memberships, invitations, locations, and
subscriptions; `AuditLog` relations use `SetNull` so history survives.

## Planned models

These are not in the schema yet. They are listed so the tenant columns, snapshotting rules, and
money conventions are fixed before implementation.

| Area         | Models                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| People       | `Customer`, `StaffProfile`, `StaffServiceAssignment`, `StaffSchedule`, `StaffTimeOff` |
| Catalog      | `ServiceCategory`, `Service`, `ProductCategory`, `Product`                            |
| Inventory    | `InventoryLevel`, `InventoryMovement`                                                 |
| Appointments | `Appointment`, `AppointmentService`, `AppointmentStatusHistory`                       |
| Sales        | `Sale`, `SaleLine`, `SalePayment`, `SaleRefund`                                       |

Conventions that apply to all of them:

1. `organizationId` on every model; `locationId` on the location-owned ones (inventory,
   appointments, sales, schedules).
2. Historical records snapshot what they need. A `SaleLine` stores the name, unit price, tax, and
   discount applied at the time of sale, and an `AppointmentService` stores the duration and price
   used for scheduling. Editing the catalog later must not rewrite history.
3. Money is stored as integer minor units in an `Int` column, with the currency taken from the
   location's organization.
4. Inventory changes are recorded as movements rather than direct edits, so `InventoryLevel` is a
   derived current quantity and `InventoryMovement` is the append-only ledger.
5. Sales and refunds carry an explicit `SalePayment` row per tender, allowing split payments
   across cash, PayNow, and card.
6. Status fields use enums: appointment status (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`,
   `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`) and payment method (`CASH`, `PAYNOW`,
   `CARD`, `OTHER`).
