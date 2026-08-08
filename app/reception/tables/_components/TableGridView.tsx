"use client";

import { LayoutGrid, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import TableCard from "./TableCard";
import { STATUS_META, STATUS_ORDER, type TableRow } from "./shared";

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
          {STATUS_META[s].label}
          <span className="text-border">·</span>
          {STATUS_META[s].hint}
        </span>
      ))}
    </div>
  );
}

/**
 * The default view: a responsive grid that reflows from one column on a phone
 * to as many as fit on a desktop. When "All spaces" is selected the tables stay
 * grouped under their space heading, so the rooms never blur together.
 */
export default function TableGridView({
  groups,
  filtered,
  hasTables,
  isFiltering,
  onOpen,
  onEdit,
  onQr,
  onDelete,
  onAddTable,
  onClearFilters,
}: {
  groups: Array<[string, TableRow[]]>;
  filtered: TableRow[];
  hasTables: boolean;
  isFiltering: boolean;
  onOpen: (table: TableRow) => void;
  onEdit: (table: TableRow) => void;
  onQr: (table: TableRow) => void;
  onDelete: (table: TableRow) => void;
  onAddTable: () => void;
  onClearFilters: () => void;
}) {
  if (!hasTables) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">No tables yet</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Add your tables once and every order, bill and QR sticker hangs off
          them from then on.
        </p>
        <Button onClick={onAddTable} className="mt-5 gap-2 rounded-xl shadow-soft">
          <Plus className="h-4 w-4" /> Add your first table
        </Button>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
          <Search className="h-6 w-6 text-muted-foreground" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Nothing matches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No table fits the current search and filters.
        </p>
        {isFiltering && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            className="mt-5 rounded-xl"
          >
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  const multiSpace = groups.length > 1;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <Legend />

      {groups.map(([space, tables]) => (
        <section key={space}>
          {multiSpace && (
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">{space || "Unassigned"}</h2>
              <Badge variant="secondary" className="h-5 bg-muted tabular-nums">
                {tables.length}
              </Badge>
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                showSpace={!multiSpace}
                onOpen={onOpen}
                onEdit={onEdit}
                onQr={onQr}
                onDelete={onDelete}
              />
            ))}

            <button
              type="button"
              onClick={onAddTable}
              className="flex h-[136px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-light/40 hover:text-primary"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-medium">Add table</span>
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
