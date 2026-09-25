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
| `StripeWebhookEvent`     | Unique Stripe event ids used to make webhook processing idempotent                |

`Organization` defaults to `SGD` and `Asia/Singapore`. `Location.pricesIncludeTax` defaults to
`true`, which matches Singapore practice where displayed prices include GST.

Receipt numbering is per location: `receiptPrefix` plus a monotonically increasing
`nextReceiptNumber`, allocated inside the sale transaction so concurrent sales cannot collide.

### Catalog

| Model             | Purpose                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `ServiceCategory` | Ordered grouping for services, unique per organization                           |
| `Service`         | Bookable offering: duration in minutes, price in cents, availability, sort order |
| `ProductCategory` | Ordered grouping for retail products, unique per organization                    |
| `Product`         | Sellable item: optional SKU, price, cost, inventory tracking flag                |

Money is stored as integer minor units in `Int` columns (`priceInCents`, `costInCents`), with the
currency taken from the organization. Products carry no quantity column of their own, because stock
lives in the inventory ledger below. Category names are unique per organization
(`@@unique([organizationId, name])`) and `Product.sku` is unique per organization when present, so
two tenants can use the same names and SKUs.

### Inventory

| Model               | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `InventoryLevel`    | Current quantity on hand for one product at one location             |
| `InventoryMovement` | Append-only ledger row: type, quantity, reason, performer, timestamp |

Inventory changes are recorded as movements rather than direct edits, so `InventoryLevel` is the
current quantity and `InventoryMovement` is the history that produced it. A tracked product starts
with a zero-quantity level row per active location, so the inventory screen can show it before the
first movement is recorded.

`InventoryMovementType` carries the direction because the quantity is always positive:
`ADJUST_IN`, `RETURN`, and `INITIAL_STOCK` add stock, while `ADJUST_OUT`, `SALE`, `DAMAGE`,
`EXPIRY`, and `STOCK_CORRECTION` remove it. A surplus found during a count is therefore recorded as
`ADJUST_IN`. `SALE` rows are written by the point of sale, and `RETURN` rows are written when a
sale is voided or refunded; the manual adjustment endpoint never writes either type, and an adjustment
that would drive a level below zero is refused with `409`.

### Sales

| Model            | Purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `Sale`           | Completed receipt with location-scoped numbering, totals, status, and actor |
| `SaleLine`       | Snapshotted service/product line with quantity, price, discount, and tax    |
| `SalePayment`    | One payment tender; multiple rows allow a split payment                     |
| `SaleRefund`     | Financial reversal with method, amount, reason, and processor               |
| `SaleRefundLine` | Product quantity returned by one refund, capped by the original line        |

A sale belongs to one organization and location, may link to a customer and appointment, and can be
created for a walk-in without either link. `SaleLine` keeps the catalog name, unit price, discount,
tax, and total as snapshots. A service line may carry an optional `StaffProfile` attribution; product
lines retain the `Product` link and whether stock was tracked at sale time.

Checkout calculates all totals from the current tenant catalog, requires the payment rows to add up
exactly, allocates `receiptPrefix` plus the next per-location number, and creates `SALE` inventory
movements in the same transaction. A void is allowed only for a completed sale and creates `RETURN`
movements. Refunds may be partial; a full refund with no explicit return list returns every remaining
tracked product, while the `SaleRefundLine` ledger prevents cumulative returns from exceeding the
quantity sold. Payment methods record terminal events only; no card data or external payment state is
stored.

### People

| Model                    | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `Customer`               | Tenant-scoped profile: contact details, address, member number, soft archive |
| `CustomerNote`           | Append-only note with an optional author, rendered as a timeline             |
| `StaffProfile`           | Roster record for one membership: job title, colour, bookability, hire dates |
| `StaffServiceAssignment` | Which services a staff member performs; replaced as a full set               |
| `StaffSchedule`          | One row per weekday, mirroring `BusinessHour`                                |
| `StaffTimeOff`           | Dated absence layered on the recurring week, with an optional reason         |

`Customer.email`, `Customer.phone`, and `Customer.memberNumber` are each unique per organization
when present, so two tenants can record the same person without clashing and a duplicate inside one
tenant reads as `409`. `countryCode` defaults to `SG`, matching the organization default. `isActive`
is a soft archive rather than a delete, because appointments and sales will reference the row as
history.

Notes are append-only: `CustomerNote` carries `createdAt` and no `updatedAt`, and the API creates
and reads notes without ever editing or deleting one. `authorUserId` is nullable and its foreign key
uses the default `Restrict`, so the note keeps its text if the member who wrote it is later removed;
the author simply reads as null.

`StaffProfile.membershipId` is unique, which makes the profile a 1:1 extension of
`OrganizationMembership`: a person's name, email, and role stay on the membership, so the roster is a
view of people who already exist in the organization rather than a second directory. A profile can
only be attached to an `ACTIVE` membership in the same organization, and creating one writes seven
non-working `StaffSchedule` rows so the schedule screen always has exactly one row per weekday.
Weekly hours are organization-level, not per location.

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

### Appointments

| Model                      | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `Appointment`              | One visit: location, customer, staff member, status, and its start and end time |
| `AppointmentService`       | Snapshot of a service on a visit: name, duration, and price at booking time     |
| `AppointmentStatusHistory` | Append-only trail of status moves, the first row with no previous status        |

`Appointment.endsAt` is written by the API from the summed snapshot durations rather than from live
`Service` rows, so editing the catalog cannot move an existing booking, and the visit's duration and
price totals come from the same snapshots. The end time is stored rather than computed so the staff
overlap check runs against the `[staffProfileId, startsAt, endsAt]` index.

A visit in `SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, or `IN_PROGRESS` holds its window;
`COMPLETED`, `CANCELLED`, and `NO_SHOW` release it. Two visits for one staff member may not overlap,
and neither may a visit and a recorded absence; both rules are checked inside the write transaction.
Times outside the location's business hours or the staff member's week are accepted — the
availability endpoint simply does not offer them — so a walk-in after closing can still be recorded.
The status trail is append-only, and a finished visit keeps its notes and its trail while refusing
to be moved.

### Reporting read model

Reports add no persisted model. Appointment, sale, payment, refund, and attributed service-line rows
remain the source of truth, while the reports service projects them for one location and a bounded local
date range. Composite indexes on `(organizationId, locationId, event time)` support the common reads;
payment and refund indexes use `(organizationId, createdAt)` because each report follows its own event
time. Historical staff with report activity stays visible even after leaving the active roster.

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
`members.reactivated`, `members.removed`, `catalog.service_category_created`,
`catalog.service_category_updated`, `catalog.service_created`, `catalog.service_updated`,
`catalog.product_category_created`, `catalog.product_category_updated`, `catalog.product_created`,
`catalog.product_updated`, `inventory.movement_recorded`, `customer.created`, `customer.updated`,
`customer.note_added`, `staff.profile_created`, `staff.profile_updated`, `staff.services_replaced`,
`staff.schedule_replaced`, `staff.time_off_recorded`, `staff.time_off_removed`,
`appointment.created`, `appointment.updated`, `appointment.services_replaced`,
`appointment.status_changed`, `sale.created`, `sale.voided`, `sale.refunded`,
`billing.checkout_created`, `billing.portal_session_created`, `billing.webhook_processed`,
`platform.organization_status_changed`, and `platform.subscription_status_changed`.

## Enumerations

| Enum                    | Values                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `PlatformRole`          | `USER`, `PLATFORM_ADMIN`                                                                             |
| `MembershipRole`        | `ORG_OWNER`, `ORG_ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`                                         |
| `MembershipStatus`      | `INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`                                                          |
| `OrganizationStatus`    | `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`                                              |
| `InvitationStatus`      | `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`                                                          |
| `SubscriptionStatus`    | `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCELLED`, `INCOMPLETE`                                |
| `AuditActorType`        | `USER`, `PLATFORM_ADMIN`, `SYSTEM`, `WEBHOOK`                                                        |
| `InventoryMovementType` | `ADJUST_IN`, `ADJUST_OUT`, `SALE`, `RETURN`, `STOCK_CORRECTION`, `DAMAGE`, `EXPIRY`, `INITIAL_STOCK` |
| `CustomerGender`        | `FEMALE`, `MALE`, `OTHER`, `UNDISCLOSED`                                                             |
| `AppointmentStatus`     | `SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`           |
| `SaleStatus`            | `COMPLETED`, `VOIDED`, `PARTIALLY_REFUNDED`, `REFUNDED`                                              |
| `SaleLineType`          | `SERVICE`, `PRODUCT`                                                                                 |
| `PaymentMethod`         | `CASH`, `PAYNOW`, `CARD`, `OTHER`                                                                    |

## Relationship shape

```text
User ──1:1── UserCredential
User ──1:n── AuthSession, PasswordResetToken, EmailVerificationToken

Organization ──1:n── OrganizationMembership ──n:1── User
Organization ──1:n── OrganizationInvitation
Organization ──1:n── Subscription
Organization ──1:n── Location ──1:n── BusinessHour
Organization ──1:n── AuditLog

Organization ──1:n── ServiceCategory ──1:n── Service
Organization ──1:n── ProductCategory ──1:n── Product
Product ──1:n── InventoryLevel ──n:1── Location
Product ──1:n── InventoryMovement ──n:1── Location
InventoryMovement ──n:1── User (performedBy)

Organization ──1:n── Customer ──1:n── CustomerNote ──n:1── User (author)
Organization ──1:n── StaffProfile ──1:1── OrganizationMembership ──n:1── User
StaffProfile ──1:n── StaffServiceAssignment ──n:1── Service
StaffProfile ──1:n── StaffSchedule, StaffTimeOff

Organization ──1:n── Appointment ──n:1── Location, Customer, StaffProfile
Appointment ──1:n── AppointmentService ──n:1── Service
Appointment ──1:n── AppointmentStatusHistory ──n:1── User (changedBy)
Appointment ──n:1── User (createdBy)

Organization ──1:n── Sale ──n:1── Location, Customer, Appointment, User (createdBy/voidedBy)
Sale ──1:n── SaleLine ──n:1── Service, Product, StaffProfile
Sale ──1:n── SalePayment
Sale ──1:n── SaleRefund ──1:n── SaleRefundLine ──n:1── SaleLine
InventoryMovement ──n:1── Sale, SaleLine (nullable source links)
```

Every tenant-owned model either holds `organizationId` directly or reaches it through a parent
that does. Deletes cascade from `Organization` to its memberships, invitations, locations,
subscriptions, categories, services, products, inventory rows, customers, notes, and staff rows;
`AuditLog` relations use `SetNull` so history survives.

`InventoryMovement` is never deleted or updated by the API, so the ledger is append-only even
though the foreign key to `User` uses the default `Restrict` behaviour. `CustomerNote.authorUserId`,
`StaffTimeOff.createdById`, and the appointment trail's `changedById` keep the same default for the
same reason.

Appointments reach their location, customer, staff profile, and services through default `Restrict`
foreign keys: a visit is history, so none of those rows can be deleted out from under it. The status
trail cascades with its appointment, because a visit that never existed has no trail to keep.

## Cross-model financial rules

Sales and refunds follow the same tenant, location, money, snapshot, and append-only rules as the
earlier modules. A sale's `receiptNumber` is unique within an organization and location; its
`receiptCode` freezes the prefix used at the time. Catalog edits never rewrite `SaleLine` snapshots.
Payments are explicit rows, so a sale can be split across methods without storing payment credentials.
Inventory movements may point back to the sale and line that caused them, but remain append-only.

For reports, gross and net sales are derived from non-voided `Sale` rows. Net subtracts the current
`refundedInCents`; the payment report instead uses `SalePayment.createdAt` and `SaleRefund.createdAt` so
the two event streams are period-correct independently. Staff revenue is the gross total of service
lines carrying that `staffProfileId`. Because `SaleRefundLine` records returned quantity but no monetary
allocation, refund money is not assigned to a staff member.

Customer visit history is derived from appointments and sales rather than copied onto `Customer`.
A sale may be a walk-in with no customer or appointment; when either link is supplied, the API checks
that it belongs to the same organization and that the appointment matches the selected location and
customer. Sale voids and refunds are audited, and their return quantities are tracked separately so
a product cannot be returned more times than it was sold.
