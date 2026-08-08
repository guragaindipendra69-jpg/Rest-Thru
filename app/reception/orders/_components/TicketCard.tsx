"use client";

import { Plus, Printer, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";

import {
  AGE_TONE,
  TICKET_AGE,
  ageTier,
  formatElapsed,
  minutesSince,
  orderTypeMeta,
  rollUpItems,
} from "./shared";

/** How many dish lines fit before the card starts summarising. */
const VISIBLE_LINES = 5;

export default function TicketCard({
  group,
  now,
  onOpen,
  onAddItems,
  onPrintSlip,
  onCheckout,
}: {
  group: any;
  now: number;
  onOpen: () => void;
  onAddItems: () => void;
  onPrintSlip: () => void;
  onCheckout: () => void;
}) {
  const { Icon, label: typeLabel } = orderTypeMeta(group.orderType);
  const minutes = minutesSince(group.openedAt, now);
  const tone = AGE_TONE[ageTier(minutes, TICKET_AGE)];

  const lines = rollUpItems(group.items);
  const shown = lines.slice(0, VISIBLE_LINES);
  const hidden = lines.length - shown.length;
  const dishCount = group.items.reduce(
    (sum: number, i: any) => sum + (i?.quantity ?? 0),
    0
  );

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-lg",
        tone.ring
      )}
    >
      {/* Age rail — the one thing readable from across the room. */}
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", tone.rail)}
      />

      {/* The card body opens the ticket; the action row below stops the click. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col gap-3 p-4 pl-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Open ${group.label}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold leading-tight tracking-tight">
              {group.label}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {typeLabel}
              {group.orders.length > 1 && (
                <>
                  <span className="text-border">·</span>
                  <span>{group.orders.length} rounds</span>
                </>
              )}
            </p>
          </div>

          <span
            className={cn(
              "flex flex-shrink-0 items-center gap-1.5 rounded-full bg-muted/70 px-2 py-1 text-xs font-semibold tabular-nums",
              tone.text
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
            {formatElapsed(minutes)}
          </span>
        </div>

        <div className="min-h-[92px] space-y-1.5 border-t border-dashed border-border pt-3">
          {shown.map((line) => (
            <div
              key={line.key}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-7 flex-shrink-0 text-xs font-semibold tabular-nums text-primary">
                  {line.qty}&times;
                </span>
                <span
                  className={cn(
                    "truncate",
                    line.voided && "text-muted-foreground line-through"
                  )}
                >
                  {line.name}
                </span>
              </span>
              <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatNumber(Math.round(line.total))}
              </span>
            </div>
          ))}
          {hidden > 0 && (
            <p className="pl-9 text-xs font-medium text-muted-foreground">
              +{hidden} more {hidden === 1 ? "dish" : "dishes"}
            </p>
          )}
          {lines.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing ordered yet</p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {dishCount} {dishCount === 1 ? "dish" : "dishes"}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {formatCurrency(group.total)}
          </span>
        </div>
      </button>

      <div className="flex gap-1.5 border-t border-border bg-muted/30 p-2.5 pl-3.5">
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 flex-shrink-0 rounded-lg bg-card"
          title="Add items to this ticket"
          aria-label="Add items to this ticket"
          onClick={onAddItems}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 flex-shrink-0 rounded-lg bg-card"
          title="Print order slip"
          aria-label="Print order slip"
          onClick={onPrintSlip}
        >
          <Printer className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          className="h-9 flex-1 gap-1.5 rounded-lg font-semibold"
          title="Settle every unpaid round on this ticket"
          onClick={onCheckout}
        >
          <Receipt className="h-4 w-4" />
          Checkout
        </Button>
      </div>
    </article>
  );
}
