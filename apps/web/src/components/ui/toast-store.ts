/**
 * Toast store.
 *
 * Kept separate from `Toast.tsx` so non-component modules (the axios
 * interceptor, for example) can raise a toast without importing React.
 */
export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Subscribe to toast events. Returns the unsubscribe function. */
export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(kind: ToastKind, message: string): void {
  const toast: ToastMessage = { id: nextId++, kind, message };
  listeners.forEach((listener) => listener(toast));
}
