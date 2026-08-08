"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { SpaceRow } from "./shared";

/**
 * The space switcher, with creation folded straight into the rail.
 *
 * Adding a space used to mean opening a dialog, typing, saving and closing it.
 * Since a new space is nearly always created moments before the tables that go
 * on it, the "+" here expands into an input in place: type, press Enter, and
 * the rail selects the new space so the very next action lands in the right
 * room. Escape backs out.
 *
 * Tables need no space at all, so an "Unassigned" chip appears whenever some
 * table has none. Without it those tables are only reachable through "All
 * spaces", which is how a table gets forgotten.
 */
export default function SpaceRail({
  spaces,
  active,
  counts,
  totalTables,
  onSelect,
  onCreate,
  onManage,
}: {
  spaces: SpaceRow[];
  active: string;
  counts: Record<string, number>;
  totalTables: number;
  onSelect: (name: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onManage: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const unassigned = counts[""] ?? 0;

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const reset = () => {
    setAdding(false);
    setName("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await onCreate(trimmed);
    setSaving(false);
    if (ok) reset();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/60 px-4 py-3 lg:px-6">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={active === "all"}
          onClick={() => onSelect("all")}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
            active === "all"
              ? "border-foreground bg-foreground text-background shadow-soft"
              : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          )}
        >
          All spaces
          <span
            className={cn(
              "rounded-full px-1.5 text-[11px] tabular-nums",
              active === "all" ? "bg-background/20" : "bg-muted"
            )}
          >
            {totalTables}
          </span>
        </button>

        {spaces.map((space) => {
          const isActive = active === space.name;
          const count = counts[space.name] ?? 0;
          return (
            <button
              key={space.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(space.name)}
              className={cn(
                "flex max-w-[220px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              <span className="truncate">{space.name}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  isActive ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {unassigned > 0 && (
          <button
            type="button"
            aria-pressed={active === ""}
            onClick={() => onSelect("")}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active === ""
                ? "border-primary bg-primary text-primary-foreground shadow-soft"
                : "border-dashed border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            Unassigned
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                active === "" ? "bg-primary-foreground/20" : "bg-muted"
              )}
            >
              {unassigned}
            </span>
          </button>
        )}

        {adding ? (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-card py-0.5 pl-3 pr-1 shadow-soft">
            <Input
              ref={inputRef}
              value={name}
              maxLength={40}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") reset();
              }}
              placeholder="Rooftop, Garden, Cabin 2"
              aria-label="New space name"
              className="h-7 w-44 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={submit}
              disabled={saving || !name.trim()}
              aria-label="Save space"
              className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              aria-label="Cancel"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-light/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            New space
          </button>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onManage}
        className="h-8 flex-shrink-0 gap-1.5 rounded-lg text-muted-foreground"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Manage</span>
      </Button>
    </div>
  );
}
