import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle,
  Eye,
  Package,
  Users,
} from "@/components/icons";
import StatTile from "@/components/ui/StatTile";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Dashboard — handoff screen 05.
 *
 * The four stat tiles are **server-side aggregates** from one request
 * (`GET /api/reports/dashboard`), so the tiles and any later report read the
 * same counted figures rather than a count of rows the browser happens to hold
 * (ADR 0010). The window they count is the browser's own day, sent as
 * instants, because the salon's timezone lives in the clock in front of the
 * screen (see `hooks/useDashboard.ts`).
 *
 * The system-status card and the welcome header are what Phase 0 shipped; they
 * stay because the quickest way to confirm web, API and PostgreSQL are wired
 * together is the dashboard that says so.
 *
 * When the summary request fails every figure reads "—": the screen never
 * invents a zero, because "no income today" and "the server did not answer"
 * are different statements and only one of them is true.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const status = useSystemStatus();
  const summary = useDashboardSummary();

  const healthy = status.data?.database === "up";
  const degraded = !status.isPending && !status.isError && !healthy;

  const figures = summary.data;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl">
              Welcome{user ? `, ${user.name.split(" ")[0]}` : ""} to Glampro Salon
            </h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Point of sale, appointments, customers, stock and reporting — rebuilt on the Salon Pro
              design system.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void status.refetch()}
            className="flex h-control items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-body transition hover:bg-surface-muted"
          >
            <Eye className={cn(status.isFetching && "animate-spin")} aria-hidden />
            Re-check status
          </button>
        </div>
      </section>

      {/* One request, four tiles: the figures share a window, so they cannot be
          observed a moment apart and disagree. */}
      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Banknote className="size-4.5" />}
          display={figures ? formatPrice(Number(figures.incomeToday)) : undefined}
          value={figures ? Number(figures.incomeToday) : undefined}
          label={
            figures
              ? `Today\u2019s income · ${figures.salesToday} ${
                  figures.salesToday === 1 ? "sale" : "sales"
                }`
              : "Today\u2019s income"
          }
          tone="purple"
        />
        <StatTile
          icon={<Calendar className="size-4.5" />}
          value={figures?.appointmentsToday}
          label="Appointments today"
          tone="success"
        />
        <StatTile
          icon={<Users className="size-4.5" />}
          value={figures?.newCustomersToday}
          label="New customers today"
          tone="neutral"
        />
        <StatTile
          icon={<Package className="size-4.5" />}
          value={figures?.lowStock}
          label="Low stock"
          tone="warning"
        />
      </section>

      {summary.isError ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden />
          Today&rsquo;s figures could not be loaded — the tiles above read “—” until the server
          answers.
        </p>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-6">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-md">System status</h3>
          <StatusPill
            tone={status.isPending ? "neutral" : status.isError || degraded ? "danger" : "success"}
            label={
              status.isPending
                ? "Checking…"
                : status.isError || degraded
                  ? "Attention needed"
                  : "All systems operational"
            }
          />
        </header>

        {status.isPending ? (
          <p className="text-sm text-ink-muted">Contacting the API…</p>
        ) : status.isError ? (
          <p className="text-sm text-danger">
            The API did not answer. Check that the stack is running (<code>make up-d</code>).
          </p>
        ) : (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <StatusFact label="API" value={status.data.app} />
            <StatusFact
              label="Database"
              value={status.data.database === "up" ? "Connected" : "Down"}
            />
            <StatusFact label="Environment" value={status.data.environment} />
            <StatusFact
              label="Uptime"
              value={`${Math.floor(status.data.uptimeSeconds / 60)}m ${
                status.data.uptimeSeconds % 60
              }s`}
            />
          </dl>
        )}
      </section>
    </div>
  );
}

/** The readiness pill: one word about the whole stack, in the status palette. */
function StatusPill({ tone, label }: { tone: "success" | "danger" | "neutral"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold",
        tone === "success" && "bg-success-soft text-success-text",
        tone === "danger" && "bg-danger/10 text-danger",
        tone === "neutral" && "bg-surface-2 text-ink-muted",
      )}
    >
      {tone === "success" ? <CheckCircle aria-hidden /> : <AlertTriangle aria-hidden />}
      {label}
    </span>
  );
}

/** One fact in the status card's grid — label above value, like the handoff. */
function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
