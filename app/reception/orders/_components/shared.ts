"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bike,
  CalendarCheck,
  FileText,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/* ── Domain vocabulary ──────────────────────────────────────────────── */

export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "CANCELLED";

export type ViewTab = "ORDERS" | "TABLE" | "KOT";

export type AddOrderKey =
  | "DINE_IN"
  | "DELIVERY"
  | "RESERVATION"
  | "TAKEAWAY"
  | "PICKUP"
  | "QUICK_BILL";

export const ADD_ORDER_OPTIONS: ReadonlyArray<{
  key: AddOrderKey;
  label: string;
  hint: string;
  Icon: LucideIcon;
}> = [
  { key: "DINE_IN", label: "Dine in", hint: "Seat a table", Icon: Utensils },
  { key: "TAKEAWAY", label: "Takeaway", hint: "Counter pickup", Icon: ShoppingBag },
  { key: "DELIVERY", label: "Delivery", hint: "Send it out", Icon: Bike },
  { key: "PICKUP", label: "Pick up", hint: "Called ahead", Icon: ShoppingCart },
  { key: "QUICK_BILL", label: "Quick bill", hint: "Bill on the spot", Icon: FileText },
  { key: "RESERVATION", label: "Reservation", hint: "Not built yet", Icon: CalendarCheck },
];

const ORDER_TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  DINE_IN: { label: "Dine In", Icon: Utensils },
  TAKEAWAY: { label: "Takeaway", Icon: ShoppingBag },
  DELIVERY: { label: "Delivery", Icon: Bike },
  PICKUP: { label: "Pick up", Icon: ShoppingCart },
};

/** Unknown or missing order types read as dine-in, the floor's default. */
export function orderTypeMeta(orderType: unknown) {
  return (
    ORDER_TYPE_META[String(orderType ?? "").toUpperCase()] ??
    ORDER_TYPE_META.DINE_IN
  );
}

export const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    nextStatus: OrderStatus | null;
    nextLabel?: string;
    tone: string;
  }
> = {
  PENDING: {
    label: "Pending",
    nextStatus: "PREPARING",
    nextLabel: "Start cooking",
    tone: "bg-warning-surface text-warning-strong border-warning/40",
  },
  PREPARING: {
    label: "Preparing",
    nextStatus: "READY",
    nextLabel: "Mark ready",
    tone: "bg-info/10 text-info border-info/30",
  },
  READY: {
    label: "Ready",
    nextStatus: "SERVED",
    nextLabel: "Mark served",
    tone: "bg-success/10 text-success border-success/30",
  },
  SERVED: {
    label: "Served",
    nextStatus: null,
    tone: "bg-muted text-muted-foreground border-border",
  },
  CANCELLED: {
    label: "Cancelled",
    nextStatus: null,
    tone: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

/** Dine-in orders are identified by their table; the rest by their type. */
export function orderPlaceLabel(order: any): string {
  const table = order?.table;
  if (table) return table.name || `Table ${table.tableNumber}`;
  return orderTypeMeta(order?.orderType).label;
}

/**
 * `bills` only covers orders a bill was raised *from*; a second round swept
 * into an existing table bill carries `billId` instead. Checking both stops an
 * already-billed round still offering checkout.
 */
export function hasBill(order: any): boolean {
  return !!order?.billId || (order?.bills?.length ?? 0) > 0;
}

/** The items a guest is actually charged for — voids and cancels drop out. */
export function liveItems(items: any[] = []): any[] {
  return items.filter(
    (i) => i?.status !== "CANCELLED" && i?.status !== "VOIDED"
  );
}

/**
 * Collapses repeat orders of the same dish into one line.
 *
 * A party's second round usually re-orders half the first, so an uncollapsed
 * ticket shows "Momo" three times and the reader has to add it up. Display
 * only: checkout and the void flow still work off the real rows.
 */
export function rollUpItems(items: any[] = []) {
  const rolled = new Map<string, { key: string; name: string; qty: number; total: number; voided: boolean }>();
  for (const item of items) {
    const voided = item?.status === "CANCELLED" || item?.status === "VOIDED";
    const key = `${item?.menuItemName ?? "Item"}|${item?.pricePerUnit ?? 0}|${voided}`;
    const existing = rolled.get(key);
    const qty = item?.quantity ?? 0;
    const total = (item?.pricePerUnit ?? 0) * qty;
    if (existing) {
      existing.qty += qty;
      existing.total += total;
    } else {
      rolled.set(key, {
        key,
        name: item?.menuItemName ?? "Item",
        qty,
        total,
        voided,
      });
    }
  }
  return Array.from(rolled.values());
}

/* ── Ticket age ─────────────────────────────────────────────────────── */

export type AgeTier = "fresh" | "watch" | "late";

/**
 * How long something may sit before the board starts nagging.
 *
 * A dine-in party legitimately holds a table for an hour, so open tickets get
 * a long leash. A docket the kitchen has not cleared is food going cold, so
 * KOTs get a short one.
 */
export const TICKET_AGE = { watch: 45, late: 90 } as const;
export const KOT_AGE = { watch: 10, late: 20 } as const;

export function ageTier(
  minutes: number,
  thresholds: { watch: number; late: number }
): AgeTier {
  if (minutes >= thresholds.late) return "late";
  if (minutes >= thresholds.watch) return "watch";
  return "fresh";
}

/** Colour is the only thing a passing waiter reads, so it carries the state. */
export const AGE_TONE: Record<
  AgeTier,
  { rail: string; dot: string; text: string; ring: string }
> = {
  fresh: {
    rail: "bg-success",
    dot: "bg-success",
    text: "text-muted-foreground",
    ring: "",
  },
  watch: {
    rail: "bg-warning",
    dot: "bg-warning",
    text: "text-warning-strong",
    ring: "ring-1 ring-warning/50",
  },
  late: {
    rail: "bg-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    ring: "ring-1 ring-destructive/50",
  },
};

export function minutesSince(
  at: string | Date | null | undefined,
  now: number
): number {
  if (!at) return 0;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

/** Compact clock for a ticket: "just now", "8m", "1h 12m". */
export function formatElapsed(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/* ── Hooks ──────────────────────────────────────────────────────────── */

/**
 * One ticking clock for the whole board.
 *
 * Every elapsed timer reads from this rather than holding its own interval, so
 * a busy floor with fifty open tickets still wakes the main thread twice a
 * minute instead of a hundred times.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * This board is mounted by both `/owner/orders` and `/reception/orders`, so
 * every push resolves against the portal the user is actually in. A
 * receptionist sent to `/owner/...` is bounced to the login screen by
 * middleware.
 */
export function usePortal(): "/owner" | "/reception" {
  const pathname = usePathname();
  return pathname?.startsWith("/owner") ? "/owner" : "/reception";
}
