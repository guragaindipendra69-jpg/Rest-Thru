import type { ReactNode } from "react";

/**
 * Unified page header used across every authenticated surface (superadmin,
 * dashboard, reception). Replaces the hand-rolled
 * `<div className="flex items-center justify-between"><h1 …><p …></div>` block
 * that was copy-pasted into ~20 pages with slightly different spacing.
 *
 * On mobile the title and actions stack vertically (they used to overflow / get
 * cramped side-by-side); from `sm` up they sit on one row.
 */
export function PageHeader({
  title,
  description,
  back,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /**
   * Leading slot for a back affordance on a drill-down or create page. Takes a
   * node rather than an href because the five callers do not agree on how they
   * navigate (three render a `<Link>`, two call `router.push`) or on the icon,
   * and that is their business rather than this component's.
   *
   * It exists because without it those five pages could not use this component
   * at all, so each hand-rolled its own row and lost what the component is for:
   * their titles stayed `text-2xl` at every width instead of stepping down on a
   * phone, and none of them stacked. It is `flex-shrink-0` and sits outside the
   * `min-w-0` block so a long title truncates rather than squeezing the button.
   */
  back?: ReactNode;
  /** Right-aligned actions (buttons, badges, filters). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {back && <div className="flex-shrink-0">{back}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
