"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { SpaceRow } from "./shared";

// "No space" as a select value. Radix will not take an empty string, and the
// move handler wants "" for unassigned, so the sentinel is unwrapped on submit.
const UNASSIGN = "__unassign__";

export type SpaceHandlers = {
  onAdd: (name: string) => Promise<boolean>;
  onRename: (space: SpaceRow, name: string) => Promise<boolean>;
  onDelete: (space: SpaceRow) => Promise<boolean>;
  onReorder: (orderedIds: string[]) => Promise<boolean>;
  onMoveTables: (from: SpaceRow, toId: string) => Promise<boolean>;
};

/**
 * Space management, reached from the Manage button on the table board. There is
 * no separate Spaces screen in the sidebar: a space is an attribute of a table,
 * so it is edited where the tables are, not in a section of its own.
 *
 * Two things this fixes over the old screens. Renaming is inline instead of a
 * modal, because a rename is a two-character correction far more often than it
 * is a deliberate operation. And deleting a space that still holds tables is no
 * longer a dead end: the confirm step offers to move those tables somewhere
 * else first, rather than refusing and leaving the user to re-assign each table
 * by hand.
 */
export default function SpacesPanel({
  spaces,
  counts,
  handlers,
  dense,
}: {
  spaces: SpaceRow[];
  counts: Record<string, number>;
  handlers: SpaceHandlers;
  dense?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SpaceRow | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [working, setWorking] = useState(false);

  const targetCount = deleteTarget ? counts[deleteTarget.name] ?? 0 : 0;
  const moveOptions = spaces.filter((s) => s.id !== deleteTarget?.id);

  const add = async () => {
    const trimmed = newName.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    const ok = await handlers.onAdd(trimmed);
    setAdding(false);
    if (ok) setNewName("");
  };

  const startEdit = (space: SpaceRow) => {
    setEditingId(space.id);
    setEditValue(space.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (space: SpaceRow) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === space.name) return cancelEdit();
    setSavingId(space.id);
    const ok = await handlers.onRename(space, trimmed);
    setSavingId(null);
    if (ok) cancelEdit();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= spaces.length) return;
    const ordered = [...spaces];
    const [pulled] = ordered.splice(index, 1);
    ordered.splice(next, 0, pulled);
    setMovingId(pulled.id);
    await handlers.onReorder(ordered.map((s) => s.id));
    setMovingId(null);
  };

  const openDelete = (space: SpaceRow) => {
    setDeleteTarget(space);
    setMoveTo(spaces.find((s) => s.id !== space.id)?.id ?? UNASSIGN);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    // Clear the space first when it still holds tables — the delete action
    // refuses otherwise, and that refusal is what used to strand people.
    if (targetCount > 0) {
      if (!moveTo) {
        setWorking(false);
        return;
      }
      const moved = await handlers.onMoveTables(
        deleteTarget,
        moveTo === UNASSIGN ? "" : moveTo
      );
      if (!moved) {
        setWorking(false);
        return;
      }
    }
    const ok = await handlers.onDelete(deleteTarget);
    setWorking(false);
    if (ok) setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          maxLength={40}
          disabled={adding}
          placeholder="Rooftop, Garden, Cabin 2"
          aria-label="New space name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-10 rounded-xl"
        />
        <Button
          onClick={add}
          disabled={adding || !newName.trim()}
          className="h-10 flex-shrink-0 gap-1.5 rounded-xl"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </div>

      {spaces.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No spaces. Tables work fine without them — add one here only if you
          want to group tables by floor or room.
        </p>
      ) : (
        <ul className={cn("space-y-2", dense && "max-h-[46vh] overflow-y-auto pr-1")}>
          {spaces.map((space, index) => {
            const editing = editingId === space.id;
            const count = counts[space.name] ?? 0;
            return (
              <li
                key={space.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/25"
              >
                <div className="flex flex-shrink-0 flex-col">
                  <button
                    type="button"
                    disabled={index === 0 || movingId !== null}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${space.name} up`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === spaces.length - 1 || movingId !== null}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${space.name} down`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {editing ? (
                  <Input
                    autoFocus
                    value={editValue}
                    maxLength={40}
                    disabled={savingId === space.id}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(space);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="h-9 rounded-lg"
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{space.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} table{count === 1 ? "" : "s"}
                    </p>
                  </div>
                )}

                {editing ? (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      disabled={savingId === space.id}
                      onClick={() => saveEdit(space)}
                      aria-label="Save name"
                    >
                      {savingId === space.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={savingId === space.id}
                      onClick={cancelEdit}
                      aria-label="Cancel rename"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="hidden h-6 tabular-nums sm:inline-flex">
                      {count}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEdit(space)}
                      aria-label={`Rename ${space.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title={`Delete ${space.name}`}
                      onClick={() => openDelete(space)}
                      aria-label={`Delete ${space.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !working) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {targetCount > 0
                ? `This space still holds ${targetCount} table${targetCount === 1 ? "" : "s"}. Pick where they should go and both steps run together.`
                : "This space has no tables. Deleting it cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {targetCount > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="move-to" className="text-sm font-medium">
                Move tables to
              </label>
              <div className="flex items-center gap-2">
                <span className="truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                  {deleteTarget?.name}
                </span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <Select value={moveTo} onValueChange={setMoveTo}>
                  <SelectTrigger id="move-to" className="h-10 flex-1 rounded-lg">
                    <SelectValue placeholder="Pick a space" />
                  </SelectTrigger>
                  <SelectContent>
                    {moveOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={UNASSIGN}>No space</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={working || (targetCount > 0 && !moveTo)}
              className="gap-1.5"
            >
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {targetCount > 0 ? "Move and delete" : "Delete space"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
