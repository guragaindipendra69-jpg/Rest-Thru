"use client";

import { useRef } from "react";
import { Grid3x3, Lock, Move, Unlock, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  CANVAS_H,
  CANVAS_W,
  GRID_SNAP,
  SHAPE_META,
  STATUS_META,
  clampX,
  clampY,
  snap,
  tableLabel,
  type TableRow,
} from "./shared";

function Tile({
  table,
  editing,
  onOpen,
  onMove,
}: {
  table: TableRow;
  editing: boolean;
  onOpen: (table: TableRow) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const meta = STATUS_META[table.status] ?? STATUS_META.available;
  const shape = SHAPE_META[table.shape] ?? SHAPE_META.square;
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    drag.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.x,
      origY: table.y,
      moved: false,
    };
    elRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    e.preventDefault();
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    // Painted straight onto the node during the gesture — routing every pointer
    // move through React state would re-render the whole canvas 60x a second.
    if (elRef.current) {
      elRef.current.style.left = `${clampX(snap(drag.current.origX + dx), table.shape)}px`;
      elRef.current.style.top = `${clampY(snap(drag.current.origY + dy), table.shape)}px`;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    elRef.current?.releasePointerCapture(e.pointerId);
    if (!drag.current.moved) {
      // A tap, not a drag. The node may still carry a pixel or two of paint
      // from onPointerMove that React will never correct — no state changed —
      // so put it back where the props say it belongs.
      if (elRef.current) {
        elRef.current.style.left = `${table.x}px`;
        elRef.current.style.top = `${table.y}px`;
      }
      return;
    }
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    onMove(
      table.id,
      clampX(snap(drag.current.origX + dx), table.shape),
      clampY(snap(drag.current.origY + dy), table.shape)
    );
  };

  // Arrow keys nudge by one grid cell — a precise alternative to dragging, and
  // the only way to arrange the room without a pointing device.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editing) return;
    const step = e.shiftKey ? GRID_SNAP * 4 : GRID_SNAP;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    onMove(
      table.id,
      clampX(snap(table.x + delta[0]), table.shape),
      clampY(snap(table.y + delta[1]), table.shape)
    );
  };

  return (
    <div
      ref={elRef}
      style={{ position: "absolute", left: table.x, top: table.y, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        type="button"
        onClick={() => !editing && onOpen(table)}
        onKeyDown={onKeyDown}
        aria-label={`${tableLabel(table)}, ${meta.label}${editing ? " — arrow keys to move" : ""}`}
        className={cn(
          "flex select-none flex-col items-center justify-center gap-0.5 border-2 p-2 transition-shadow",
          shape.tile,
          meta.tile,
          editing
            ? "cursor-grab ring-2 ring-primary/40 ring-offset-2 ring-offset-background active:cursor-grabbing"
            : "cursor-pointer hover:shadow-soft-lg"
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className="font-mono text-sm font-bold leading-none">T{table.number}</span>
        {table.name && (
          <span className="max-w-full truncate px-1 text-[10px] leading-tight text-muted-foreground">
            {table.name}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-2.5 w-2.5" />
          {table.capacity}
        </span>
      </button>
    </div>
  );
}

/**
 * The room as it is actually shaped. Positions snap to a 20px grid and are
 * clamped inside a fixed canvas, so a table can never be dropped somewhere the
 * scroll container will not reach — the failure that made the old free-form
 * canvas feel unsafe to touch.
 */
export default function LayoutCanvas({
  tables,
  editing,
  onEditingChange,
  onOpen,
  onMove,
  onAutoArrange,
  spaceLabel,
}: {
  tables: TableRow[];
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onOpen: (table: TableRow) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAutoArrange: () => void;
  spaceLabel: string;
}) {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {editing ? (
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <Move className="h-4 w-4" />
              Drag tables to match the room. Arrow keys nudge, Shift speeds it up.
            </span>
          ) : (
            <>Arranging <span className="font-medium text-foreground">{spaceLabel}</span> — tap a table to open it.</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <Button
              variant="outline"
              onClick={onAutoArrange}
              className="h-9 gap-1.5 rounded-lg"
            >
              <Grid3x3 className="h-4 w-4" /> Auto-arrange
            </Button>
          )}
          <Button
            variant={editing ? "default" : "outline"}
            onClick={() => onEditingChange(!editing)}
            className="h-9 gap-1.5 rounded-lg"
          >
            {editing ? (
              <>
                <Lock className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" /> Arrange
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-muted/20">
        <div
          className="relative"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            backgroundImage: editing
              ? "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)"
              : undefined,
            backgroundSize: `${GRID_SNAP}px ${GRID_SNAP}px`,
          }}
        >
          {tables.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No tables in this space yet.
            </p>
          ) : (
            tables.map((table) => (
              <Tile
                key={table.id}
                table={table}
                editing={editing}
                onOpen={onOpen}
                onMove={onMove}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
