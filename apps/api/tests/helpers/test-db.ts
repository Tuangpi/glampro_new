import { prisma } from '../../src/database/prisma.js';

/** Child tables first, so referential integrity holds without disabling FK checks. */
const tablesInDeleteOrder = [
  'AppointmentStatusHistory',
  'AppointmentService',
  'Appointment',
  'StaffTimeOff',
  'StaffSchedule',
  'StaffServiceAssignment',
  'StaffProfile',
  'CustomerNote',
  'Customer',
  'InventoryMovement',
  'InventoryLevel',
  'Service',
  'Product',
  'ServiceCategory',
  'ProductCategory',
  'AuditLog',
  'BusinessHour',
  'Location',
  'Subscription',
  'OrganizationMembership',
  'OrganizationInvitation',
  'EmailVerificationToken',
  'PasswordResetToken',
  'AuthSession',
  'UserCredential',
  'Organization',
  'User',
] as const;

export const truncateAllTables = async () => {
  for (const table of tablesInDeleteOrder) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
};
