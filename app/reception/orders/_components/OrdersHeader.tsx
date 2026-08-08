"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  CloudOff,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

import {
  ADD_ORDER_OPTIONS,
  formatElapsed,
  type AddOrderKey,
  type ViewTab,
} from "./shared";

const VIEWS: ReadonlyArray<{ key: ViewTab; label: string; hint: string }> = [
  { key: "ORDERS", label: "Orders", hint: "1" },
  { key: "TABLE", label: "Tables", hint: "2" },
  { key: "KOT", label: "Kitchen", hint: "3" },
];

function StatChip({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "money" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 leading-none",
        tone === "money" && "border-primary/25 bg-primary-light/50",
        tone === "warn" && "border-warning/40 bg-warning-surface/60",
        tone === "default" && "border-border bg-card"
      )}
    >
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "money" && "text-primary",
          tone === "warn" && "text-warning-strong"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default function OrdersHeader({
  openTickets,
  seatedTables,
  runningTotal,
  oldestMinutes,
  syncedAt,
  syncFailed,
  now,
  search,
  onSearchChange,
  searchRef,
  view,
  onViewChange,
  onAddOrder,
}: {
  openTickets: number;
  seatedTables: number;
  runningTotal: number;
  oldestMinutes: number;
  syncedAt: number | null;
  syncFailed: boolean;
  now: number;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  view: ViewTab;
  onViewChange: (view: ViewTab) => void;
  onAddOrder: (key: AddOrderKey) => void;
}) {
  const syncSeconds =
    syncedAt == null ? null : Math.max(0, Math.round((now - syncedAt) / 1000));

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70">
      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        {/* Row 1 — identity, live numbers, and the two things staff reach for */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">Live Orders</h1>
              <span className="relative flex h-2 w-2" aria-hidden>
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-75",
                    syncFailed
                      ? "bg-destructive"
                      : "animate-ping bg-success"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    syncFailed ? "bg-destructive" : "bg-success"
                  )}
                />
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {syncFailed ? (
                <>
                  <CloudOff className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive">
                    Can&apos;t reach the server — showing the last good copy
                  </span>
                </>
              ) : syncSeconds == null ? (
                "Connecting..."
              ) : (
                `Updated ${syncSeconds < 5 ? "just now" : `${syncSeconds}s ago`} · refreshes every 15s`
              )}
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Table, order no, dish, guest"
                aria-label="Search live orders"
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

            <Popover>
              <PopoverTrigger asChild>
                <Button className="h-10 gap-2 rounded-xl shadow-soft">
                  <Plus className="h-4 w-4" />
                  New order
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[420px] max-w-[92vw] rounded-2xl p-3"
              >
                <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Start a new order
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ADD_ORDER_OPTIONS.map(({ key, label, hint, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onAddOrder(key)}
                      className="group flex items-center gap-3 rounded-xl border border-transparent bg-muted/40 px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary-light/60"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card transition-colors group-hover:border-primary/30 group-hover:text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Row 2 — the shift at a glance */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <StatChip
            value={String(openTickets)}
            label={openTickets === 1 ? "open ticket" : "open tickets"}
          />
          <StatChip value={String(seatedTables)} label="tables seated" />
          <StatChip
            value={formatCurrency(runningTotal)}
            label="running total"
            tone="money"
          />
          <StatChip
            value={openTickets ? formatElapsed(oldestMinutes) : "—"}
            label="oldest ticket"
            tone={oldestMinutes >= 90 && openTickets ? "warn" : "default"}
          />
        </div>

        {/* Row 3 — the three ways the floor reads the same shift */}
        <div
          role="tablist"
          aria-label="Order board view"
          className="inline-flex w-fit rounded-xl bg-muted p-1"
        >
          {VIEWS.map((v) => {
            const active = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onViewChange(v.key)}
                className={cn(
                  "relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:px-5",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="orders-view-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-primary shadow-soft"
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {v.label}
                  <Badge
                    variant="outline"
                    className={cn(
                      "hidden h-4 border-0 px-1 font-sans text-[10px] font-medium sm:inline-flex",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground"
                    )}
                  >
                    {v.hint}
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
