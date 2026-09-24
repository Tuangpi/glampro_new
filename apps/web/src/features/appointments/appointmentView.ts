import type {
  AppointmentStatus,
  AppointmentSummary,
  CustomerSummary,
  StaffProfileSummary,
} from '@glampro/contracts';
import { appointmentStatusTransitions } from '@glampro/contracts';

/**
 * The calendar's display vocabulary. Statuses, transitions, and the people on a
 * visit are described once here so the grid, the form, and the detail panel
 * cannot disagree about what a status is called or what may happen next.
 */

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

/** The verb on the button that moves a visit into that status. */
export const appointmentStatusActions: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Move back to scheduled',
  CONFIRMED: 'Confirm',
  CHECKED_IN: 'Check in',
  IN_PROGRESS: 'Start service',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancel',
  NO_SHOW: 'No show',
};

const statusTones: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-[#EEF1FF] text-[#2B3160]',
  CONFIRMED: 'bg-[#E7F4FF] text-[#1B5FA8]',
  CHECKED_IN: 'bg-[#FDF3E0] text-[#8A5B00]',
  IN_PROGRESS: 'bg-[#F1ECFF] text-brand',
  COMPLETED: 'bg-[#E7F7EE] text-[#1C8A5A]',
  CANCELLED: 'bg-[#FDECEC] text-[#B42318]',
  NO_SHOW: 'bg-[#F3F4FA] text-muted',
};

export const appointmentStatusTone = (status: AppointmentStatus) => statusTones[status];

/** The moves the calendar offers for one visit; a finished one offers none. */
export const nextStatusesOf = (status: AppointmentStatus): AppointmentStatus[] => [
  ...appointmentStatusTransitions[status],
];

/** A status that ends the visit keeps its row but leaves the diary alone. */
export const isClosedStatus = (status: AppointmentStatus) =>
  status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW';

export const staffNameOf = (staff: StaffProfileSummary): string =>
  staff.displayName?.trim() ||
  [staff.member.firstName, staff.member.lastName].filter(Boolean).join(' ');

export const customerNameOf = (customer: CustomerSummary): string =>
  [customer.firstName, customer.lastName].filter(Boolean).join(' ');

export type AppointmentColumn = {
  id: string;
  name: string;
  color: string | null;
  visits: AppointmentSummary[];
};

/**
 * The day view is one column per stylist. Visits keep their time order inside a
 * column and the columns are alphabetical, so a chair reads top to bottom and
 * the salon's day reads left to right.
 */
export const columnsOf = (appointments: readonly AppointmentSummary[]): AppointmentColumn[] => {
  const columns = new Map<string, AppointmentColumn>();

  for (const appointment of appointments) {
    const column = columns.get(appointment.staffProfileId) ?? {
      id: appointment.staffProfileId,
      name: staffNameOf(appointment.staff),
      color: appointment.staff.color,
      visits: [],
    };

    column.visits.push(appointment);
    columns.set(appointment.staffProfileId, column);
  }

  for (const column of columns.values()) {
    column.visits.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  return [...columns.values()].sort((left, right) => left.name.localeCompare(right.name));
};
