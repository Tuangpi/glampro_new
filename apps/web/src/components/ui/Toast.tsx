import { useEffect, useState } from "react";

import { AlertTriangle, Bell, CheckCircle, X } from "@/components/icons";
import { subscribeToToasts, type ToastKind, type ToastMessage } from "./toast-store";

const AUTO_DISMISS_MS = 5000;

const STYLES: Record<ToastKind, string> = {
  success: "border-success/30 bg-success-soft text-success-text",
  error: "border-danger/30 bg-white text-danger",
  info: "border-line bg-white text-ink",
};

const ICONS: Record<ToastKind, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Bell,
};

/**
 * Renders toasts raised through `showToast`. Mounted once, in `main.tsx`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });

    return unsubscribe;
  }, []);

  const dismiss = (id: number) =>
    setToasts((current) => current.filter((entry) => entry.id !== id));

  return (
    <>
      {children}

      <div
        className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[var(--app-toast-w)] flex-col gap-3"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-card border px-4 py-3 text-sm shadow-menu ${STYLES[toast.kind]}`}
            >
              <Icon className="mt-0.5 shrink-0 text-base" aria-hidden />
              <p className="flex-1 leading-snug">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-sm p-1 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
