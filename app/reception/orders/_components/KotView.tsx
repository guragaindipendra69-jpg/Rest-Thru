"use client";

import { Loader2, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  AGE_TONE,
  KOT_AGE,
  STATUS_CONFIG,
  ageTier,
  formatElapsed,
  minutesSince,
  orderTypeMeta,
  type OrderStatus,
} from "./shared";

/**
 * The dockets the kitchen is cooking from. Styled like the paper it prints on
 * (mono figures, torn-edge rules) so the screen and the slip read the same,
 * but with an age tier the paper can't have: a docket that has sat past its
 * window is food going cold, and that outranks everything else on the board.
 */
export default function KotView({
  dockets,
  showCompleted,
  onShowCompleted,
  pendingCount,
  completedCount,
  now,
  busyOrderId,
  onPrint,
  onAdvance,
}: {
  dockets: any[];
  showCompleted: boolean;
  onShowCompleted: (value: boolean) => void;
  pendingCount: number;
  completedCount: number;
  now: number;
  busyOrderId: string | null;
  onPrint: (order: any) => void;
  onAdvance: (order: any, next: OrderStatus) => void;
}) {
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: false, label: "In the kitchen", count: pendingCount },
            { key: true, label: "Completed", count: completedCount },
          ] as const
        ).map(({ key, label, count }) => {
          const active = showCompleted === key;
          return (
            <button
              key={String(key)}
              type="button"
              onClick={() => onShowCompleted(key)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
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

      {dockets.length === 0 && (
        <p className="py-20 text-center text-sm text-muted-foreground">
          {showCompleted ? "No completed dockets." : "Nothing in the kitchen."}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {dockets.map(({ order, kotNumber, label, items }: any) => {
          const status = STATUS_CONFIG[order.status as OrderStatus];
          const minutes = minutesSince(order.createdAt, now);
          // Finished dockets stop aging — no point flagging food already served.
          const done = ["READY", "SERVED"].includes(order.status);
          const tone = AGE_TONE[done ? "fresh" : ageTier(minutes, KOT_AGE)];
          const totalQty = items.reduce(
            (sum: number, i: any) => sum + (i?.quantity ?? 0),
            0
          );

          return (
            <article
              key={order.id}
              className={cn(
                "relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft",
                !done && tone.ring
              )}
            >
              <span
                aria-hidden
                className={cn("absolute inset-x-0 top-0 h-1", tone.rail)}
              />

              <div className="flex items-start justify-between gap-2 pt-1">
                <div className="min-w-0">
                  <p className="font-mono text-lg font-bold leading-none">
                    {kotNumber ? `KOT ${kotNumber}` : "KOT —"}
                  </p>
                  <p className="mt-1.5 truncate text-sm font-semibold">{label}</p>
                </div>
                {!done && (
                  <span
                    className={cn(
                      "flex flex-shrink-0 items-center gap-1.5 rounded-full bg-muted/70 px-2 py-1 text-xs font-semibold tabular-nums",
                      tone.text
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                    {formatElapsed(minutes)}
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
                <p>
                  {orderTypeMeta(order.orderType).label} · #{order.orderId}
                </p>
                <p>
                  Fired{" "}
                  {new Date(order.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="mt-3 border-y border-dashed border-border py-2">
                <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Dish</span>
                  <span>Qty</span>
                </div>
                <div className="space-y-1">
                  {items.map((i: any, idx: number) => (
                    <div
                      key={i.id}
                      className="flex justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {idx + 1}.
                        </span>
                        {i.menuItemName}
                      </span>
                      <span className="flex-shrink-0 font-mono font-semibold tabular-nums">
                        {i.quantity}
                      </span>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Every item on this docket was voided.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-2 flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Dishes / Qty</span>
                <span className="font-mono tabular-nums">
                  {items.length}/{totalQty}
                </span>
              </div>

              <div className="mt-3 flex gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "flex-1 justify-center py-1.5 font-medium",
                    status?.tone
                  )}
                >
                  {status?.label ?? order.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 gap-1.5 rounded-lg text-xs"
                  onClick={() => onPrint(order)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  {kotNumber ? "Reprint" : "Print"}
                </Button>
              </div>

              {status?.nextStatus && (
                <Button
                  size="sm"
                  className="mt-2 h-9 w-full rounded-lg font-semibold"
                  disabled={busyOrderId === order.id}
                  onClick={() => onAdvance(order, status.nextStatus!)}
                >
                  {busyOrderId === order.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    status.nextLabel
                  )}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
