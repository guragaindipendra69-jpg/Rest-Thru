"use client";

import { useState } from "react";
import { Ban, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRelativeTime } from "@/lib/format";

import { orderPlaceLabel, rollUpItems } from "./shared";

type RailTab = "BILLED" | "VOIDED";

function ItemLines({ items }: { items: any[] }) {
  const lines = rollUpItems(items);
  const shown = lines.slice(0, 3);
  return (
    <div className="space-y-0.5">
      {shown.map((line) => (
        <p key={line.key} className="truncate text-xs text-muted-foreground">
          <span className="tabular-nums text-foreground">{line.qty}&times;</span>{" "}
          {line.name}
        </p>
      ))}
      {lines.length > shown.length && (
        <p className="text-xs text-muted-foreground/70">
          +{lines.length - shown.length} more
        </p>
      )}
    </div>
  );
}

/**
 * The shift's settled and written-off money, kept beside the live floor so
 * staff don't have to go looking for it behind a filter. Billed and voided
 * share one column rather than two half-height ones — a busy night fills
 * either list past what a 500px box could show.
 */
export default function ActivityRail({
  billed,
  voided,
  onShowBill,
}: {
  billed: any[];
  voided: any[];
  onShowBill: (order: any) => void;
}) {
  const [tab, setTab] = useState<RailTab>("BILLED");
  const rows = tab === "BILLED" ? billed : voided;

  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft xl:w-[340px] xl:flex-shrink-0">
      <div className="flex gap-1 border-b border-border bg-muted/40 p-2">
        {(
          [
            { key: "BILLED", label: "Billed", count: billed.length, Icon: Receipt },
            { key: "VOIDED", label: "Voided", count: voided.length, Icon: Ban },
          ] as const
        ).map(({ key, label, count, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active && key === "BILLED" && "text-primary",
                  active && key === "VOIDED" && "text-destructive"
                )}
              />
              {label}
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center bg-muted px-1.5 tabular-nums"
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      <ScrollArea className="h-[420px] xl:h-[calc(100vh-19rem)]">
        <div className="space-y-2 p-3">
          {rows.length === 0 && (
            <p className="py-14 text-center text-sm text-muted-foreground">
              {tab === "BILLED" ? "Nothing billed yet" : "No voided orders"}
            </p>
          )}

          {tab === "BILLED" &&
            billed.map((b: any) => (
              <div
                key={b.billId}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {b.billNumber ?? `#${b.orderIds[0]}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.label}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex-shrink-0",
                      b.status === "PAID" &&
                        "border-success/40 bg-success/10 text-success"
                    )}
                  >
                    {b.status === "PAID" ? "Paid" : b.status ?? "—"}
                  </Badge>
                </div>

                <div className="mt-2">
                  <ItemLines items={b.items} />
                </div>

                <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-2">
                  <span className="text-sm font-bold tabular-nums">
                    {formatCurrency(b.total ?? 0)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(b.at)}
                  </span>
                </div>

                {b.orderIds.length > 1 && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {b.orderIds.length} rounds · #{b.orderIds.join(", #")}
                  </p>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 w-full gap-1.5 rounded-lg text-xs"
                  onClick={() => onShowBill(b.anyOrder)}
                >
                  <Receipt className="h-3.5 w-3.5" /> Show bill
                </Button>
              </div>
            ))}

          {tab === "VOIDED" &&
            voided.map((o: any) => (
              <div
                key={o.id}
                className="rounded-xl border border-destructive/25 bg-destructive/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{o.orderId}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {orderPlaceLabel(o)}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                    {formatRelativeTime(o.updatedAt ?? o.createdAt)}
                  </span>
                </div>

                <div className="mt-2">
                  <ItemLines items={o.items ?? []} />
                </div>

                <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-destructive/20 pt-2">
                  <span className="text-sm font-bold tabular-nums line-through decoration-destructive/50">
                    {formatCurrency(o.totalAmount ?? 0)}
                  </span>
                </div>

                {o.voidReason && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {o.voidReason}
                  </p>
                )}
              </div>
            ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
