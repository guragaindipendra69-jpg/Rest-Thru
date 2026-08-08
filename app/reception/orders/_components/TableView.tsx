"use client";

import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

import { formatElapsed, minutesSince } from "./shared";

type LiveStatus = "OPEN" | "OCCUPIED" | "BILLED";

/** Colour carries the state, so the floor reads at a glance. */
const TONE: Record<
  LiveStatus,
  { tile: string; dot: string; label: string; caption: string }
> = {
  OPEN: {
    tile: "border-dashed border-border bg-muted/30 hover:border-primary/40 hover:bg-primary-light/40",
    dot: "bg-muted-foreground/40",
    label: "Free",
    caption: "text-muted-foreground",
  },
  OCCUPIED: {
    tile: "border-success/50 bg-success/10 hover:border-success hover:bg-success/15",
    dot: "bg-success",
    label: "Seated",
    caption: "text-foreground",
  },
  BILLED: {
    tile: "border-warning/50 bg-warning-surface hover:border-warning",
    dot: "bg-warning",
    label: "Billed",
    caption: "text-warning-strong",
  },
};

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {(["OCCUPIED", "BILLED", "OPEN"] as LiveStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", TONE[s].dot)} />
          {s === "OCCUPIED"
            ? "Seated — running a tab"
            : s === "BILLED"
            ? "Billed — waiting to clear"
            : "Free"}
        </span>
      ))}
    </div>
  );
}

export default function TableView({
  groupedTables,
  spaces,
  spaceFilter,
  onSpaceFilter,
  tableCounts,
  totalTables,
  now,
  onOpenTable,
}: {
  groupedTables: Array<[string, any[]]>;
  spaces: string[];
  spaceFilter: string;
  onSpaceFilter: (space: string) => void;
  tableCounts: Record<string, number>;
  totalTables: number;
  now: number;
  onOpenTable: (table: any) => void;
}) {
  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {spaces.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All", count: totalTables },
              ...spaces.map((s) => ({ key: s, label: s, count: tableCounts[s] ?? 0 })),
            ].map(({ key, label, count }) => {
              const active = spaceFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSpaceFilter(key)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      active
                        ? "bg-primary-foreground/20"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <Legend />
      </div>

      {groupedTables.length === 0 && (
        <p className="py-20 text-center text-sm text-muted-foreground">
          No tables configured yet.
        </p>
      )}

      {groupedTables.map(([space, tables]) => (
        <section key={space}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">{space}</h2>
            <Badge variant="secondary" className="h-5 bg-muted tabular-nums">
              {tables.length}
            </Badge>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {tables.map((t: any) => {
              const tone = TONE[t.liveStatus as LiveStatus];
              const seated = t.unbilled.length > 0;
              const minutes = t.openedAt ? minutesSince(t.openedAt, now) : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!seated}
                  onClick={() => onOpenTable(t)}
                  title={
                    seated
                      ? `Checkout ${t.name || `Table ${t.tableNumber}`}`
                      : t.liveStatus === "BILLED"
                      ? "Billed — waiting to be cleared"
                      : "Table is free"
                  }
                  className={cn(
                    "relative flex h-[124px] flex-col justify-between rounded-2xl border p-3 text-left transition-all duration-150",
                    tone.tile,
                    seated
                      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-soft"
                      : "cursor-default"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
                      {tone.label}
                    </span>
                    {t.openedAt && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatElapsed(minutes)}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-tight">
                      {t.name || `Table ${t.tableNumber}`}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-sm font-semibold tabular-nums",
                        tone.caption
                      )}
                    >
                      {seated ? formatCurrency(t.total) : tone.label}
                    </p>
                  </div>

                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {t.capacity} seats
                    {t.unbilled.length > 1 && (
                      <>
                        <span className="text-border">·</span>
                        {t.unbilled.length} rounds
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
