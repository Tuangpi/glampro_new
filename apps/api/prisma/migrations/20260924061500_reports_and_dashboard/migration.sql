-- Reporting queries always scope by tenant and then narrow to a location and time.
CREATE INDEX `Appointment_organizationId_locationId_startsAt_idx` ON `Appointment`(`organizationId`, `locationId`, `startsAt`);

-- Revenue and dashboard reads use the same tenant/location/date predicate.
CREATE INDEX `Sale_organizationId_locationId_createdAt_idx` ON `Sale`(`organizationId`, `locationId`, `createdAt`);

-- Payment and refund reports aggregate by their own event time within a tenant.
CREATE INDEX `SalePayment_organizationId_createdAt_idx` ON `SalePayment`(`organizationId`, `createdAt`);
CREATE INDEX `SaleRefund_organizationId_createdAt_idx` ON `SaleRefund`(`organizationId`, `createdAt`);

-- Staff performance reads explicitly attributed service lines.
CREATE INDEX `SaleLine_organizationId_staffProfileId_idx` ON `SaleLine`(`organizationId`, `staffProfileId`);
