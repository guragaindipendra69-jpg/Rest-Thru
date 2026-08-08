import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Full-bleed wrapper for the reception console screens.
 *
 * The portal shells wrap every page in `p-4 sm:p-6`, which is right for the
 * card-and-form pages but wrong for the consoles (Reception Desk, Live Orders,
 * Checkout, Table Map, CRM). Those own the full width: each renders a sticky
 * toolbar that has to touch both edges, then supplies its own inner padding.
 *
 * This cancels the shell gutter in one place instead of five pages hand-rolling
 * the same negative margins and drifting apart. The margin values must stay in
 * step with the padding in `app/owner/shell.tsx` and `app/reception/shell.tsx`.
 *
 * These pages previously set `min-h-screen` to fill the viewport. That is not
 * needed — `<main>` is already `flex-1` inside a `min-h-screen` column — and it
 * was actively harmful: a full 100vh inside a container already offset by the
 * 64px header produced that much phantom scroll on every one of them.
 */
export function ConsolePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("-m-4 sm:-m-6", className)}>{children}</div>;
}
