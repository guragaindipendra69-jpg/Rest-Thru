"use client";

import { motion } from "framer-motion";
import { LayoutGrid, Map, Plus, QrCode, Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { STATUS_META, STATUS_ORDER, usePortal, type TableStatus } from "./shared";

export type ViewMode = "grid" | "layout";

const VIEWS: ReadonlyArray<{ key: ViewMode; label: string; Icon: typeof LayoutGrid }> = [
  { key: "grid", label: "Grid", Icon: LayoutGrid },
  { key: "layout", label: "Layout", Icon: Map },
];

/**
 * Sticky command bar. The counts double as filters: tapping "Bill due" narrows
 * the board to the tables that need a cashier, which is the single most common
 * thing a receptionist wants from this screen.
 */
export default function TablesHeader({
  total,
  counts,
  statusFilter,
  onStatusFilter,
  search,
  onSearchChange,
  searchRef,
  view,
  onViewChange,
  onAddTable,
}: {
  total: number;
  counts: Record<TableStatus, number>;
  statusFilter: TableStatus | "all";
  onStatusFilter: (status: TableStatus | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onAddTable: () => void;
}) {
  const portal = usePortal();

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70">
      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Tables</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {total === 0
                ? "No tables yet — add your first one to get started"
                : `${total} table${total === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Table number, name, space"
                aria-label="Search tables"
                className="h-10 rounded-xl border-border bg-background pl-9 pr-16"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </div>

            <Button asChild variant="outline" className="h-10 gap-2 rounded-xl">
              <Link href={`${portal}/tables/qr`}>
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">QR codes</span>
              </Link>
            </Button>

            <Button
              onClick={onAddTable}
              className="h-10 gap-2 rounded-xl shadow-soft"
            >
              <Plus className="h-4 w-4" />
              Add table
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "all" as const, label: "All", count: total, dot: "" },
                ...STATUS_ORDER.map((s) => ({
                  key: s,
                  label: STATUS_META[s].label,
                  count: counts[s],
                  dot: STATUS_META[s].dot,
                })),
              ]
            ).map(({ key, label, count, dot }) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onStatusFilter(active && key !== "all" ? "all" : key)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {dot && (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        active ? "bg-primary-foreground/70" : dot
                      )}
                    />
                  )}
                  {label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            role="tablist"
            aria-label="Table board view"
            className="inline-flex w-fit rounded-xl bg-muted p-1"
          >
            {VIEWS.map(({ key, label, Icon }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onViewChange(key)}
                  className={cn(
                    "relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors sm:px-4",
                    active
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="tables-view-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-lg bg-primary shadow-soft"
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
