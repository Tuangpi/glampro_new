import { FiArrowLeft } from "react-icons/fi";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-display leading-none text-purple">404</p>
        <h2 className="mt-3 text-lg">Page not found</h2>
        <p className="mt-1 text-sm text-ink-muted">
          That screen does not exist, or it moved somewhere else.
        </p>

        <Link
          to="/"
          className="mt-6 inline-flex h-control items-center gap-2 rounded-md bg-purple px-5 text-sm font-semibold text-white shadow-purple-btn transition hover:bg-purple-dark"
        >
          <FiArrowLeft aria-hidden />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
