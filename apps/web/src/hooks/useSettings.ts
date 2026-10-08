/**
 * Settings data — handoff screen 11 (`/api/settings`).
 *
 * Two reads and one write. The staff/roles summary is deliberately **not**
 * here: it is `useStaffList` reading the same `GET /api/staff` the staff screen
 * reads, because a second endpoint that summarised the team could disagree with
 * the team page, and one answer per question is the rule (ADR 0010's shape).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModuleSummary, SalonProfile, UpdateSalonProfileInput } from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, patch } from "@/lib/api";

/** The salon's profile — name, slug, status, threshold and owner. */
export function useSalonProfile() {
  return useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: () => get<SalonProfile>("/settings/profile"),
    staleTime: 60_000,
  });
}

/** The module catalogue joined to this salon's grants, read-only. */
export function useModules() {
  return useQuery({
    queryKey: queryKeys.settings.modules(),
    queryFn: () => get<ModuleSummary[]>("/settings/modules"),
    staleTime: 60_000,
  });
}

/**
 * Saves the salon's two fields.
 *
 * The profile query is invalidated with the auth profile too: the shell's
 * header draws `tenant.name`, so a rename that left the top bar saying the old
 * name would look like it had not saved.
 */
export function useUpdateSalonProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSalonProfileInput) => patch<SalonProfile>("/settings/profile", input),
    onSuccess: (profile) => {
      void queryClient.setQueryData(queryKeys.settings.general(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile() });
    },
  });
}
