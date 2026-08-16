import { Loader2 } from 'lucide-react';

/**
 * Suspense fallback for the owner and reception shells, so it stands in for
 * every route under them. A spinner rather than a content-shaped skeleton is
 * deliberate here: the boundary wraps `{children}`, so at this level the shape
 * of the page being streamed is not known. Pages that do know their own shape
 * use the shaped primitives instead (DashboardPageSkeleton in
 * components/dashboard/skeletons.tsx, KpiSkeleton / SectionSkeleton in
 * components/superadmin/skeletons.tsx).
 *
 * role="status" because a spinner is silent to a screen reader otherwise, and
 * this one covers the whole content area on every navigation in both portals.
 */
export function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground"
    >
      <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
      <p className="text-sm font-medium">Loading...</p>
    </div>
  );
}
