import { FiLoader } from "react-icons/fi";

/** Shown while a lazily-loaded route chunk is being fetched. */
export default function PageLoading() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <div
        className="flex flex-col items-center gap-3 text-ink-muted"
        role="status"
        aria-live="polite"
      >
        <FiLoader className="animate-spin text-2xl text-purple" aria-hidden />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}
