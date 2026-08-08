"use client";

import { usePathname } from "next/navigation";
import { Circle, RectangleHorizontal, Square } from "lucide-react";

/**
 * One vocabulary for the table map, shared by both portals.
 *
 * Colour follows the same rule as the live orders board: a neutral tile means
 * nothing needs doing, and colour means someone has to act. That is why a free
 * table is deliberately the quietest thing on the screen.
 */

export type TableStatus = "available" | "occupied" | "bill_requested" | "reserved";
export type TableShape = "square" | "round" | "large";

export type TableRow = {
  id: string;
  number: number;
  name: string;
  capacity: number;
  shape: TableShape;
  status: TableStatus;
  space: string;
  x: number;
  y: number;
  /** Rotating QR token — see `?k=` on the public table route. */
  qrCode: string;
};

export type SpaceRow = {
  id: string;
  name: string;
  displayOrder: number;
};

export const STATUS_META: Record<
  TableStatus,
  {
    label: string;
    hint: string;
    tile: string;
    dot: string;
    badge: string;
    accent: string;
  }
> = {
  available: {
    label: "Free",
    hint: "Ready to seat",
    tile: "border-dashed border-border bg-muted/25 hover:border-primary/40 hover:bg-primary-light/40",
    dot: "bg-muted-foreground/40",
    badge: "border-border bg-muted text-muted-foreground",
    accent: "bg-muted-foreground/30",
  },
  occupied: {
    label: "Seated",
    hint: "Guests in, tab running",
    tile: "border-success/50 bg-success/10 hover:border-success hover:bg-success/15",
    dot: "bg-success",
    badge: "border-success/40 bg-success/10 text-success",
    accent: "bg-success",
  },
  bill_requested: {
    label: "Bill due",
    hint: "Waiting to pay",
    tile: "border-warning/50 bg-warning-surface hover:border-warning",
    dot: "bg-warning",
    badge: "border-warning/40 bg-warning-surface text-warning-strong",
    accent: "bg-warning",
  },
  reserved: {
    label: "Reserved",
    hint: "Held for a booking",
    tile: "border-info/50 bg-info/10 hover:border-info hover:bg-info/15",
    dot: "bg-info",
    badge: "border-info/40 bg-info/10 text-info",
    accent: "bg-info",
  },
};

export const STATUS_ORDER: TableStatus[] = [
  "occupied",
  "bill_requested",
  "reserved",
  "available",
];

export const SHAPE_META: Record<
  TableShape,
  { label: string; hint: string; Icon: typeof Square; preview: string; tile: string }
> = {
  square: {
    label: "Square",
    hint: "2 to 4 seats",
    Icon: Square,
    preview: "h-8 w-8 rounded-md",
    tile: "h-[104px] w-[104px] rounded-2xl",
  },
  round: {
    label: "Round",
    hint: "4 to 6 seats",
    Icon: Circle,
    preview: "h-8 w-8 rounded-full",
    tile: "h-[104px] w-[104px] rounded-full",
  },
  large: {
    label: "Banquet",
    hint: "8 seats and up",
    Icon: RectangleHorizontal,
    preview: "h-6 w-10 rounded-md",
    tile: "h-[88px] w-[152px] rounded-2xl",
  },
};

export const CAPACITY_PRESETS = [2, 4, 6, 8, 10, 12];

/** Suggests the shape that matches a seat count, so the two never disagree. */
export function shapeForCapacity(capacity: number): TableShape {
  if (capacity >= 8) return "large";
  if (capacity >= 5) return "round";
  return "square";
}

// ─── Layout canvas ─────────────────────────────────────────────────────────
// Tiles snap to a 20px grid so a hand-arranged room still lines up, and every
// coordinate is clamped inside the canvas so a table can never be dragged into
// a region the scroll container will not reach.
export const GRID_SNAP = 20;
export const CANVAS_W = 1400;
export const CANVAS_H = 900;

export function snap(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

export function clampX(x: number, shape: TableShape): number {
  const width = shape === "large" ? 152 : 104;
  return Math.min(Math.max(0, x), CANVAS_W - width);
}

export function clampY(y: number, shape: TableShape): number {
  const height = shape === "large" ? 88 : 104;
  return Math.min(Math.max(0, y), CANVAS_H - height);
}

/** Tidy left-to-right placement for a table that has no saved position yet. */
export function autoPosition(index: number): { x: number; y: number } {
  const perRow = 7;
  return {
    x: 40 + (index % perRow) * 180,
    y: 40 + Math.floor(index / perRow) * 160,
  };
}

// ─── Normalising ───────────────────────────────────────────────────────────

/** Maps a Prisma row (SCREAMING enums, nullable name) to the client shape. */
export function normalizeTable(raw: any, index = 0): TableRow {
  const shape = String(raw?.shape || "square").toLowerCase();
  const fallback = autoPosition(index);
  return {
    id: raw.id,
    number: raw.tableNumber,
    name: raw.name || "",
    capacity: raw.capacity ?? 4,
    shape: (["square", "round", "large"].includes(shape) ? shape : "square") as TableShape,
    status: String(raw?.status || "available").toLowerCase() as TableStatus,
    space: raw.space || "",
    x: raw.positionX ?? fallback.x,
    y: raw.positionY ?? fallback.y,
    qrCode: raw.qrCode || "",
  };
}

/** Next free number, taken from the highest in use so deletes never collide. */
export function nextTableNumber(tables: TableRow[]): number {
  return tables.reduce((max, t) => Math.max(max, t.number), 0) + 1;
}

export function tableLabel(table: Pick<TableRow, "number" | "name">): string {
  return table.name || `Table ${table.number}`;
}

/** Counts per status for one set of tables — drives the header chips. */
export function countByStatus(tables: TableRow[]): Record<TableStatus, number> {
  const counts: Record<TableStatus, number> = {
    available: 0,
    occupied: 0,
    bill_requested: 0,
    reserved: 0,
  };
  for (const t of tables) {
    if (counts[t.status] !== undefined) counts[t.status] += 1;
  }
  return counts;
}

/** Owner and reception render the same component; links must follow the URL. */
export function usePortal(): "/owner" | "/reception" {
  const pathname = usePathname();
  return pathname?.startsWith("/owner") ? "/owner" : "/reception";
}
