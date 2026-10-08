/**
 * Appointment data — handoff screens 03 and 06 (`/api/appointments`).
 *
 * No new contract: the list query, the detail, the write and its PATCH all
 * come from `@glampro/shared`, so everything below is shaped by what
 * `schemas/appointment.ts` already says.
 *
 * The day view passes its window as instants (see `todayWindow` in
 * `useDashboard.ts` — the same edges the tiles count, so the list and the
 * "N appointments today" tile can never disagree about where the day ends).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AppointmentDetail,
  AppointmentListQuery,
  AppointmentSummary,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, getPaginated, patch, post } from "@/lib/api";

export interface AppointmentListFilters {
  page: number;
  pageSize: number;
  /** Day edges as instants. Omitted = the whole book. */
  from?: string;
  to?: string;
  status?: AppointmentListQuery["status"];
  search?: string;
}

/**
 * One page of bookings in a window.
 *
 * The filters object is the last element of the key, so `invalidateQueries` on
 * `queryKeys.appointments.list()` matches every window and every search — a
 * booking created for tomorrow must refresh the list the user is looking at
 * even when they had filtered to today.
 */
export function useAppointmentList(filters: AppointmentListFilters) {
  return useQuery({
    queryKey: [...queryKeys.appointments.list(), filters],
    queryFn: () =>
      getPaginated<AppointmentSummary>("/appointments", {
        page: filters.page,
        pageSize: filters.pageSize,
        from: filters.from,
        to: filters.to,
        status: filters.status,
        search: filters.search || undefined,
      }),
    placeholderData: (previous) => previous,
  });
}

/** One booking, for the editor's second read. */
export function useAppointment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.appointments.detail(id ?? ""),
    queryFn: () => get<AppointmentDetail>(`/appointments/${id}`),
    enabled: id !== null,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAppointmentInput) => post<AppointmentDetail>("/appointments", input),
    onSuccess: () => {
      invalidateAppointments(queryClient);
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAppointmentInput }) =>
      patch<AppointmentDetail>(`/appointments/${id}`, input),
    onSuccess: (_appointment, variables) => {
      invalidateAppointments(queryClient);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.appointments.detail(variables.id),
      });
    },
  });
}

/**
 * A write moves every window, not just the one on screen: booking tomorrow
 * changes today's "upcoming" list and the dashboard tile alike, so the whole
 * `["appointments"]` prefix is invalidated rather than one page of it.
 *
 * The dashboard summary goes with it — its appointments tile is the same
 * table counted differently (ADR 0010: one server-side answer per figure).
 */
function invalidateAppointments(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.list() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary() });
}
