import { FiAlertCircle, FiCheckCircle, FiRefreshCw } from "react-icons/fi";

import { useSystemStatus } from "@/hooks/useSystemStatus";
import { cn } from "@/lib/utils";

/**
 * Dashboard.
 *
 * Phase 0 keeps this deliberately thin: it proves the whole stack is wired up
 * (browser → Vite/nginx → Express → PostgreSQL) by rendering live backend
 * readiness. The Salon Pro dashboard tiles from handoff screen 05 land in the
 * dashboard phase.
 */
export default function Dashboard() {
  const { data, isPending, isError, error, refetch, isFetching } = useSystemStatus();

  const healthy = data?.database === "up";
  const degraded = !isPending && !isError && !healthy;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl">Welcome to Glampro Salon</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Point of sale, appointments, customers, stock and reporting — rebuilt on the Salon Pro
              design system.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            className="flex h-control items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-body transition hover:bg-surface-muted"
          >
            <FiRefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
            Re-check status
          </button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-md">System status</h3>
          <StatusPill
            tone={isPending ? "neutral" : isError || degraded ? "danger" : "success"}
            label={
              isPending
                ? "Checking…"
                : isError || degraded
                  ? "Attention needed"
                  : "All systems operational"
            }
          />
        </header>

        {isError ? (
          <div className="flex items-start gap-3 rounded-md bg-danger/5 p-4 text-sm text-danger">
            <FiAlertCircle className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">The API is unreachable.</p>
              <p className="mt-1 text-ink-muted">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            <Metric label="API" value={data?.status ?? "—"} />
            <Metric label="Database" value={data?.database ?? "—"} />
            <Metric label="Environment" value={data?.environment ?? "—"} />
            <Metric label="Uptime" value={data ? `${data.uptimeSeconds}s` : "—"} />
          </dl>
        )}
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {["Today's income", "Appointments", "New customers", "Low stock"].map((label) => (
          <article key={label} className="rounded-lg border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
            <p className="mt-2 text-2xl text-ink">—</p>
            <p className="mt-1 text-2xs text-ink-faint">Wired up in a later phase</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold capitalize text-ink">{value}</dd>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "neutral" | "success" | "danger"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1 text-xs font-semibold",
        tone === "success" && "bg-success-soft text-success-text",
        tone === "danger" && "bg-danger/10 text-danger",
        tone === "neutral" && "bg-surface-2 text-ink-muted",
      )}
    >
      {tone === "success" ? <FiCheckCircle aria-hidden /> : <FiAlertCircle aria-hidden />}
      {label}
    </span>
  );
}
