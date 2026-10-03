import { Suspense, type ReactNode } from "react";

import PageLoading from "@/components/ui/PageLoading";

/**
 * Wraps a lazily-loaded page in its Suspense boundary.
 *
 * Every route element goes through here so the loading state is identical
 * across the app.
 */
export function lazyRoute(node: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoading />}>{node}</Suspense>;
}
