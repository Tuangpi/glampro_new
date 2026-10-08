/**
 * Settings — handoff screen 11.
 *
 * **MVP slice M4** (`docs/mvp.md`): the salon profile (read/edit), a read-only
 * modules panel, and a staff/roles summary. Hours editing, tax and receipt
 * configuration, notifications and integrations are full-phase work and are
 * not stubbed — each needs columns the schema does not have, and a form that
 * saved nowhere would be worse than no form.
 *
 * Two boundaries this screen keeps rather than re-invents:
 *
 * - **`slug` and `status` are shown, never edited.** The first is the isolation
 *   key's public face and the second is the platform console's verdict; the
 *   PATCH contract is `.strict()` so a field smuggled in is a 422, not a silent
 *   write (AGENTS.md: nothing that belongs to the platform console is editable
 *   here).
 * - **The team summary reads `GET /api/staff`** — the same endpoint the staff
 *   screen reads. A second "summary" endpoint could disagree with the team
 *   page, and one question gets one answer (ADR 0010's shape).
 */
import { useState } from "react";

import { Link } from "react-router";

import type { ModuleSummary, StaffSummary } from "@glampro/shared";

import { Briefcase, Settings as SettingsIcon } from "@/components/icons";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import Table, { type TableColumn } from "@/components/ui/Table";
import { showToast } from "@/components/ui/toast-store";
import { ROLE_BADGE, ROLE_LABELS } from "@/constants/staff";
import { useAuth } from "@/contexts/AuthContext";
import { useModules, useSalonProfile, useUpdateSalonProfile } from "@/hooks/useSettings";
import { useStaffList } from "@/hooks/useStaff";
import { getErrorMessage, getValidationDetails } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function Settings() {
  const { isReadOnly, user } = useAuth();
  const modules = useModules();
  // One request, and the server's `total` is the count the summary shows — the
  // team screen's own numbers come from the same rows (ADR 0010).
  const team = useStaffList({ page: 1, pageSize: 50, status: "active" });

  const canEdit =
    !isReadOnly && (user?.globalRole === "SUPER_ADMIN" || user?.globalRole === "MANAGER");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl">Settings</h2>
        <p className="mt-1 text-sm text-ink-muted">
          What this salon is, what it has bought, and who works here.
        </p>
      </header>

      <ProfileCard canEdit={canEdit} />
      <ModulesCard modules={modules.data} isPending={modules.isPending} isError={modules.isError} />
      <TeamCard
        rows={team.data?.data ?? []}
        total={team.data?.total ?? 0}
        isPending={team.isPending}
        isError={team.isError}
      />
    </div>
  );
}

/** Salon profile: two editable fields, four read-only facts. */
function ProfileCard({ canEdit }: { canEdit: boolean }) {
  const profile = useSalonProfile();
  const update = useUpdateSalonProfile();
  const data = profile.data;

  // The two editable fields show the server's values until the user types, and
  // the user's from then on. Deliberately **not** an effect that seeds state: the
  // read lands after mount, and a write-back would clobber a half-typed name
  // whenever the profile refetched behind the form.
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftThreshold, setDraftThreshold] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const name = draftName ?? data?.name ?? "";
  const threshold = draftThreshold ?? (data === undefined ? "" : String(data.lowStockThreshold));

  const fieldError = (field: string): string | undefined =>
    fieldErrors[field] ?? fieldErrors[`body.${field}`];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    try {
      await update.mutateAsync({
        name: name.trim(),
        lowStockThreshold: Number(threshold),
      });
      showToast("success", "Salon profile saved.");
    } catch (error) {
      const details = getValidationDetails(error);
      if (Object.keys(details).length > 0) {
        setFieldErrors(details);
        return;
      }
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <Card
      title="Salon profile"
      description="The name the app shows everywhere, and what counts as low stock for this salon."
    >
      {profile.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : profile.isError || data === undefined ? (
        // Not pending and no record: the read failed, or answered nothing. Either
        // way there is no profile to edit, which is the same sentence to a user.
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          The profile could not be loaded.
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Salon name"
              required
              value={name}
              onChange={(event) => setDraftName(event.target.value)}
              error={fieldError("name")}
              disabled={!canEdit || update.isPending}
              maxLength={200}
            />
            <Input
              label="Low-stock threshold"
              type="number"
              min={0}
              max={10000}
              value={threshold}
              onChange={(event) => setDraftThreshold(event.target.value)}
              error={fieldError("lowStockThreshold")}
              disabled={!canEdit || update.isPending}
              hint="Stock at or below this reads as low on the rail badge and the tiles (ADR 0010)."
            />
          </div>

          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Slug" value={data.slug} />
            <Fact label="Status" value={data.status} />
            <Fact label="Owner" value={data.owner?.name ?? "—"} />
            <Fact label="Created" value={formatDate(data.createdAt)} />
          </dl>
          <p className="text-xs text-ink-muted">
            Slug and status belong to the platform operator, so they are shown but never edited
            here. Hours, tax and receipts are configured when those features ship.
          </p>

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" loading={update.isPending}>
                Save profile
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">{isReadOnlyReason()}</p>
          )}
        </form>
      )}
    </Card>
  );
}

/** Why the save button is absent — one sentence rather than a dead control. */
function isReadOnlyReason(): string {
  return "Only a manager or the owner can change the salon profile.";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}

/** The modules panel: what the catalogue offers and what this salon may use. */
function ModulesCard({
  modules,
  isPending,
  isError,
}: {
  modules: ModuleSummary[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const columns: TableColumn<ModuleSummary>[] = [
    {
      key: "name",
      header: "Module",
      cell: (row) => <span className="font-bold text-ink">{row.name}</span>,
    },
    { key: "category", header: "Type", cell: (row) => row.category },
    {
      key: "access",
      header: "Access",
      cell: (row) =>
        row.entitled ? (
          <Badge variant={row.isCore ? "purple" : "success"}>
            {row.isCore ? "Core" : "Active"}
          </Badge>
        ) : (
          <Badge variant="neutral">Not purchased</Badge>
        ),
    },
    {
      key: "expires",
      header: "Renews",
      cell: (row) => (row.expiresAt ? formatDate(row.expiresAt) : "—"),
    },
  ];

  return (
    <Card
      title="Modules"
      description="What this salon has bought. Read-only: entitlements are granted by the platform operator."
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          The module list could not be loaded.
        </p>
      ) : (
        <Table
          caption="Modules this salon has access to"
          columns={columns}
          rows={modules ?? []}
          rowKey={(row) => row.code}
          className="rounded-none border-0"
        />
      )}
    </Card>
  );
}

/** Staff and roles — the same rows the staff screen lists, summarised here. */
function TeamCard({
  rows,
  total,
  isPending,
  isError,
}: {
  rows: StaffSummary[];
  total: number;
  isPending: boolean;
  isError: boolean;
}) {
  const columns: TableColumn<StaffSummary>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <Badge variant={ROLE_BADGE[row.globalRole]}>{ROLE_LABELS[row.globalRole]}</Badge>
      ),
    },
    { key: "position", header: "Position", cell: (row) => row.position ?? "—" },
  ];

  return (
    <Card
      title="Staff and roles"
      description={
        isPending
          ? "Loading the team…"
          : `${total} active ${total === 1 ? "account" : "accounts"} in this salon.`
      }
      actions={
        // A link, not a `Button`: it navigates, and the rail's own styles are
        // what make it look like one — a button that pretends to be a link is
        // the wrong element for Enter and middle-click alike.
        <Link
          to="/staff"
          className="inline-flex h-control items-center gap-1.5 rounded-md border border-line px-4 text-sm font-medium text-ink-body transition hover:bg-surface-muted"
        >
          <Briefcase aria-hidden />
          Manage staff
        </Link>
      }
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          The team could not be loaded.
        </p>
      ) : (
        <Table
          caption="Active staff and their roles"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          className="rounded-none border-0"
          empty={
            <p className="px-5 py-6 text-sm text-ink-muted">
              <SettingsIcon aria-hidden className="mr-1.5 inline" />
              No staff accounts yet.
            </p>
          }
        />
      )}
    </Card>
  );
}
