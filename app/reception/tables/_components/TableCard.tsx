"use client";

import { MoreVertical, Pencil, QrCode, Trash2, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { STATUS_META, tableLabel, type TableRow } from "./shared";

/**
 * One table, as a card. The whole tile opens the detail sheet; the overflow
 * menu carries the rarer destructive paths so a mis-tap on a busy screen
 * cannot delete a table.
 */
export default function TableCard({
  table,
  showSpace,
  onOpen,
  onEdit,
  onQr,
  onDelete,
}: {
  table: TableRow;
  showSpace?: boolean;
  onOpen: (table: TableRow) => void;
  onEdit: (table: TableRow) => void;
  onQr: (table: TableRow) => void;
  onDelete: (table: TableRow) => void;
}) {
  const meta = STATUS_META[table.status] ?? STATUS_META.available;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(table)}
        aria-label={`${tableLabel(table)}, ${meta.label}`}
        className={cn(
          "flex h-[136px] w-full flex-col justify-between rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-soft",
          meta.tile
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
            T{table.number}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">
            {tableLabel(table)}
          </p>
          {showSpace && table.space && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {table.space}
            </p>
          )}
        </div>

        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {table.capacity} seats
          <span className="text-border">·</span>
          {table.shape === "large" ? "Banquet" : table.shape === "round" ? "Round" : "Square"}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${tableLabel(table)}`}
            className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl">
          <DropdownMenuItem onClick={() => onEdit(table)} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onQr(table)} className="gap-2">
            <QrCode className="h-4 w-4" /> Show QR
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(table)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
