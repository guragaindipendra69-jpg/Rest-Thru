"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  CAPACITY_PRESETS,
  SHAPE_META,
  shapeForCapacity,
  type SpaceRow,
  type TableRow,
  type TableShape,
} from "./shared";

export type TableDraft = {
  number: string;
  name: string;
  capacity: string;
  shape: TableShape;
  space: string;
};

// Radix rejects an empty item value, so "no space" travels as a sentinel and is
// unwrapped back to "" before it reaches the draft.
const NO_SPACE = "__no_space__";

/**
 * Add and edit in one form.
 *
 * The old version asked for five fields with no help: a number the user had to
 * remember, a raw capacity box, and two dropdowns. Here the number is filled in
 * from the highest one already in use, seat counts are one tap, and picking a
 * count moves the shape with it — so the common case is "open, Enter". Shape
 * only becomes a decision if you disagree with the suggestion.
 *
 * Space is optional. A single-room cafe has no floors to speak of, and being
 * made to invent one before the first table could be added was a wall in front
 * of the very first thing a new restaurant does here.
 */
export default function TableFormDialog({
  open,
  onOpenChange,
  editing,
  spaces,
  defaultSpace,
  nextNumber,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TableRow | null;
  spaces: SpaceRow[];
  defaultSpace: string;
  nextNumber: number;
  onSubmit: (draft: TableDraft, again: boolean) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<TableDraft>({
    number: "",
    name: "",
    capacity: "4",
    shape: "square",
    space: "",
  });
  const [shapeTouched, setShapeTouched] = useState(false);
  const [saving, setSaving] = useState<"once" | "again" | null>(null);

  useEffect(() => {
    if (!open) return;
    setShapeTouched(false);
    setDraft(
      editing
        ? {
            number: String(editing.number),
            name: editing.name,
            capacity: String(editing.capacity),
            shape: editing.shape,
            space: editing.space,
          }
        : {
            number: String(nextNumber),
            name: "",
            capacity: "4",
            shape: "square",
            space: defaultSpace,
          }
    );
  }, [open, editing, defaultSpace, nextNumber]);

  const setCapacity = (value: string) => {
    const seats = parseInt(value, 10);
    setDraft((d) => ({
      ...d,
      capacity: value,
      // Follow the seat count until the user overrules it themselves.
      shape: shapeTouched || !Number.isFinite(seats) ? d.shape : shapeForCapacity(seats),
    }));
  };

  const valid =
    !!draft.number.trim() &&
    parseInt(draft.number, 10) > 0 &&
    parseInt(draft.capacity, 10) > 0;

  const submit = async (again: boolean) => {
    if (!valid || saving) return;
    setSaving(again ? "again" : "once");
    const ok = await onSubmit(draft, again);
    setSaving(null);
    if (!ok) return;
    if (again) {
      // Keep the space and shape, advance the number, clear the label — the
      // rhythm for entering a whole room in one sitting.
      setDraft((d) => ({
        ...d,
        number: String((parseInt(d.number, 10) || nextNumber) + 1),
        name: "",
      }));
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {editing ? `Edit ${editing.name || `Table ${editing.number}`}` : "Add a table"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply everywhere this table appears."
              : "Number and seats are pre-filled — change what you need and save."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="table-number">Table number</Label>
              <Input
                id="table-number"
                type="number"
                min={1}
                inputMode="numeric"
                value={draft.number}
                onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="table-space">
                Space <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={draft.space || NO_SPACE}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, space: v === NO_SPACE ? "" : v }))
                }
              >
                <SelectTrigger id="table-space" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SPACE}>No space</SelectItem>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="table-name">
              Label <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="table-name"
              value={draft.name}
              maxLength={40}
              placeholder="Window seat, Corner booth"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submit(false)}
              className="h-10 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Staff see this instead of the number on orders and bills.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Seats</Label>
            <div className="flex flex-wrap gap-2">
              {CAPACITY_PRESETS.map((seats) => {
                const active = draft.capacity === String(seats);
                return (
                  <button
                    key={seats}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCapacity(String(seats))}
                    className={cn(
                      "h-10 min-w-[52px] rounded-xl border px-3 text-sm font-semibold tabular-nums transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {seats}
                  </button>
                );
              })}
              <Input
                type="number"
                min={1}
                aria-label="Custom seat count"
                value={CAPACITY_PRESETS.includes(parseInt(draft.capacity, 10)) ? "" : draft.capacity}
                placeholder="Other"
                onChange={(e) => setCapacity(e.target.value)}
                className="h-10 w-[84px] rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Shape</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SHAPE_META) as TableShape[]).map((key) => {
                const { label, hint, preview } = SHAPE_META[key];
                const active = draft.shape === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setShapeTouched(true);
                      setDraft((d) => ({ ...d, shape: key }));
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-colors",
                      active
                        ? "border-primary bg-primary-light/60 shadow-soft"
                        : "border-border bg-card hover:border-primary/30"
                    )}
                  >
                    <span
                      className={cn(
                        "border-2",
                        preview,
                        active ? "border-primary bg-primary/20" : "border-muted-foreground/40"
                      )}
                    />
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!!saving}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <Button
                variant="outline"
                onClick={() => submit(true)}
                disabled={!valid || !!saving}
                className="gap-1.5 rounded-lg"
              >
                {saving === "again" && <Loader2 className="h-4 w-4 animate-spin" />}
                Save and add another
              </Button>
            )}
            <Button
              onClick={() => submit(false)}
              disabled={!valid || !!saving}
              className="gap-1.5 rounded-lg"
            >
              {saving === "once" && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add table"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
