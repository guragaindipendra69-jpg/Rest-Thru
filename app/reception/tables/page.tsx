"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsolePage } from "@/components/shared/console-page";
import { useAuthStore } from "@/store/auth-store";
import { useUpgradeStore } from "@/store/upgrade-store";
import {
  addTable,
  deleteTable,
  getTables,
  updateTable,
  updateTablePosition,
  updateTableStatus,
} from "@/lib/actions/tables";
import {
  addSpace,
  deleteSpace,
  getSpaces,
  moveTablesToSpace,
  renameSpace,
  reorderSpaces,
} from "@/lib/actions/spaces";

import LayoutCanvas from "./_components/LayoutCanvas";
import SpaceRail from "./_components/SpaceRail";
import SpacesPanel from "./_components/SpacesPanel";
import TableDetailSheet from "./_components/TableDetailSheet";
import TableFormDialog, { type TableDraft } from "./_components/TableFormDialog";
import TableGridView from "./_components/TableGridView";
import TablesHeader, { type ViewMode } from "./_components/TablesHeader";
import {
  autoPosition,
  clampX,
  clampY,
  countByStatus,
  nextTableNumber,
  normalizeTable,
  snap,
  tableLabel,
  type SpaceRow,
  type TableRow,
  type TableStatus,
} from "./_components/shared";

export default function TableMapPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id || "";
  const showUpgrade = useUpgradeStore((s) => s.show);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<ViewMode>("grid");
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TableStatus | "all">("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [editingLayout, setEditingLayout] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formEditing, setFormEditing] = useState<TableRow | null>(null);
  const [detail, setDetail] = useState<TableRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Data ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [tableRes, spaceRes] = await Promise.all([getTables(), getSpaces()]);
    setLoading(false);

    if ((tableRes as any)?.error) toast.error((tableRes as any).error);
    if ((tableRes as any)?.data) {
      setTables(((tableRes as any).data as any[]).map((t, i) => normalizeTable(t, i)));
    }

    if ((spaceRes as any)?.error) return toast.error((spaceRes as any).error);
    const rows = (((spaceRes as any)?.data ?? []) as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      displayOrder: s.displayOrder ?? 0,
    }));
    setSpaces(rows);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const countsBySpace = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tables) map[t.space] = (map[t.space] ?? 0) + 1;
    return map;
  }, [tables]);

  /** The space filter applies to every view; search and status stack on top. */
  const inSpace = useMemo(
    () => (spaceFilter === "all" ? tables : tables.filter((t) => t.space === spaceFilter)),
    [tables, spaceFilter]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inSpace.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(t.number).includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.space.toLowerCase().includes(q)
      );
    });
  }, [inSpace, statusFilter, search]);

  /** Grouped by space, in the order the spaces themselves are arranged. */
  const groups = useMemo(() => {
    const order = new Map(spaces.map((s, i) => [s.name, i]));
    const map = new Map<string, TableRow[]>();
    for (const t of filtered) {
      const list = map.get(t.space);
      if (list) list.push(t);
      else map.set(t.space, [t]);
    }
    return Array.from(map.entries())
      .map(([name, list]) => {
        list.sort((a, b) => a.number - b.number);
        return [name, list] as [string, TableRow[]];
      })
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999));
  }, [filtered, spaces]);

  const counts = useMemo(() => countByStatus(inSpace), [inSpace]);
  const isFiltering = statusFilter !== "all" || search.trim().length > 0;
  const defaultSpace =
    spaceFilter !== "all" ? spaceFilter : spaces[0]?.name ?? "";

  // ─── Keyboard ────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      const dialogOpen = formOpen || detailOpen || manageOpen || !!deleteTarget;
      if (e.metaKey || e.ctrlKey || e.altKey || dialogOpen) return;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && typing) {
        setSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, detailOpen, manageOpen, deleteTarget]);

  // ─── Table handlers ──────────────────────────────────────────────────────

  const openAdd = () => {
    setFormEditing(null);
    setFormOpen(true);
  };

  const openEdit = (table: TableRow) => {
    setDetailOpen(false);
    setFormEditing(table);
    setFormOpen(true);
  };

  const openDetail = (table: TableRow) => {
    setDetail(table);
    setDetailOpen(true);
  };

  const submitTable = async (draft: TableDraft, again: boolean) => {
    const number = parseInt(draft.number, 10);
    const capacity = parseInt(draft.capacity, 10);
    const name = draft.name.trim();

    if (formEditing) {
      const res = await updateTable(formEditing.id, {
        tableNumber: number,
        name,
        capacity,
        shape: draft.shape,
        space: draft.space,
      });
      if ((res as any)?.error) {
        toast.error((res as any).error);
        return false;
      }
      setTables((prev) =>
        prev.map((t) =>
          t.id === formEditing.id
            ? { ...t, number, name, capacity, shape: draft.shape, space: draft.space }
            : t
        )
      );
      setDetail((d) =>
        d && d.id === formEditing.id
          ? { ...d, number, name, capacity, shape: draft.shape, space: draft.space }
          : d
      );
      toast.success("Table updated");
      return true;
    }

    // Place new tables at the end of their own space so a fresh table never
    // lands underneath an existing one on the layout canvas.
    const spot = autoPosition(tables.filter((t) => t.space === draft.space).length);
    const res = await addTable({
      tableNumber: number,
      name: name || undefined,
      capacity,
      shape: draft.shape,
      space: draft.space,
      positionX: spot.x,
      positionY: spot.y,
    });

    if ("limitReached" in res && res.limitReached) {
      showUpgrade(res.limitReached);
      return false;
    }
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }

    setTables((prev) => [
      ...prev,
      {
        id: (res as any).data.id,
        number,
        name,
        capacity,
        shape: draft.shape,
        status: "available",
        space: draft.space,
        x: spot.x,
        y: spot.y,
        qrCode: "",
      },
    ]);
    // Follow the user to the space they just added into, or they would save a
    // table and see nothing happen.
    if (spaceFilter !== "all" && spaceFilter !== draft.space) setSpaceFilter(draft.space);
    toast.success(`Table ${number} added${again ? " — next one is ready" : ""}`);
    return true;
  };

  const changeStatus = async (table: TableRow, status: TableStatus) => {
    const res = await updateTableStatus(table.id, status);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status } : t)));
    toast.success(`${tableLabel(table)} is now ${status.replace("_", " ")}`);
    return true;
  };

  // Positions are written on a trailing debounce: a drag emits one save, not
  // one per frame, and a quick series of nudges collapses into a single write.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, { x: number; y: number }>());

  const moveTable = useCallback((id: string, x: number, y: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
    pending.current.set(id, { x, y });

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const batch = Array.from(pending.current.entries());
      pending.current.clear();
      const results = await Promise.all(
        batch.map(([tableId, pos]) => updateTablePosition(tableId, pos.x, pos.y))
      );
      const failed = results.filter((r) => (r as any)?.error).length;
      if (failed) toast.error(`${failed} table position${failed === 1 ? "" : "s"} failed to save`);
    }, 600);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const autoArrange = () => {
    const targets = spaceFilter === "all" ? tables : inSpace;
    const ordered = [...targets].sort((a, b) => a.number - b.number);
    ordered.forEach((table, i) => {
      const spot = autoPosition(i);
      moveTable(table.id, clampX(snap(spot.x), table.shape), clampY(snap(spot.y), table.shape));
    });
    toast.success("Tables lined up");
  };

  const confirmDeleteTable = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteTable(deleteTarget.id);
    setDeleting(false);
    if ((res as any)?.error) return toast.error((res as any).error);
    setTables((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDetailOpen(false);
    toast.success(`${tableLabel(deleteTarget)} deleted`);
    setDeleteTarget(null);
  };

  // ─── Space handlers ──────────────────────────────────────────────────────

  const createSpace = async (name: string) => {
    const res = await addSpace(name);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }
    const created = (res as any).data;
    setSpaces((prev) => [...prev, { id: created.id, name: created.name, displayOrder: created.displayOrder ?? prev.length }]);
    setSpaceFilter(created.name);
    toast.success(`"${created.name}" added`);
    return true;
  };

  const handleRenameSpace = async (space: SpaceRow, name: string) => {
    const res = await renameSpace(space.id, name);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }
    const renamed = (res as any).data.name;
    setSpaces((prev) => prev.map((s) => (s.id === space.id ? { ...s, name: renamed } : s)));
    setTables((prev) =>
      prev.map((t) => (t.space === space.name ? { ...t, space: renamed } : t))
    );
    setSpaceFilter((prev) => (prev === space.name ? renamed : prev));
    toast.success(`Renamed to "${renamed}"`);
    return true;
  };

  const handleDeleteSpace = async (space: SpaceRow) => {
    const res = await deleteSpace(space.id);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }
    setSpaces((prev) => prev.filter((s) => s.id !== space.id));
    setSpaceFilter((prev) => (prev === space.name ? "all" : prev));
    toast.success(`"${space.name}" deleted`);
    return true;
  };

  const handleReorderSpaces = async (orderedIds: string[]) => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    const next = orderedIds
      .map((id, i) => {
        const found = byId.get(id);
        return found ? { ...found, displayOrder: i } : null;
      })
      .filter(Boolean) as SpaceRow[];
    setSpaces(next);

    const res = await reorderSpaces(orderedIds);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      load();
      return false;
    }
    return true;
  };

  const handleMoveTables = async (from: SpaceRow, toId: string) => {
    const res = await moveTablesToSpace(from.id, toId);
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return false;
    }
    const { moved, to } = (res as any).data;
    setTables((prev) => prev.map((t) => (t.space === from.name ? { ...t, space: to } : t)));
    if (moved > 0) {
      toast.success(
        to
          ? `${moved} table${moved === 1 ? "" : "s"} moved to "${to}"`
          : `${moved} table${moved === 1 ? "" : "s"} now have no space`
      );
    }
    return true;
  };

  const spaceHandlers = {
    onAdd: createSpace,
    onRename: handleRenameSpace,
    onDelete: handleDeleteSpace,
    onReorder: handleReorderSpaces,
    onMoveTables: handleMoveTables,
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[136px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ConsolePage>
      <TablesHeader
        total={inSpace.length}
        counts={counts}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        searchRef={searchRef}
        view={view}
        onViewChange={setView}
        onAddTable={openAdd}
      />

      <SpaceRail
        spaces={spaces}
        active={spaceFilter}
        counts={countsBySpace}
        totalTables={tables.length}
        onSelect={setSpaceFilter}
        onCreate={createSpace}
        onManage={() => setManageOpen(true)}
      />

      {view === "grid" ? (
        <TableGridView
          groups={groups}
          filtered={filtered}
          hasTables={tables.length > 0}
          isFiltering={isFiltering}
          onOpen={openDetail}
          onEdit={openEdit}
          onQr={openDetail}
          onDelete={setDeleteTarget}
          onAddTable={openAdd}
          onClearFilters={() => {
            setSearch("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <LayoutCanvas
          tables={filtered}
          editing={editingLayout}
          onEditingChange={setEditingLayout}
          onOpen={openDetail}
          onMove={moveTable}
          onAutoArrange={autoArrange}
          spaceLabel={
            spaceFilter === "all"
              ? "every space"
              : spaceFilter || "tables with no space"
          }
        />
      )}

      <TableFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={formEditing}
        spaces={spaces}
        defaultSpace={formEditing ? formEditing.space : defaultSpace}
        nextNumber={nextTableNumber(tables)}
        onSubmit={submitTable}
      />

      <TableDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        table={detail}
        restaurantId={restaurantId}
        onStatusChange={changeStatus}
        onEdit={openEdit}
        onDelete={(t) => {
          setDetailOpen(false);
          setDeleteTarget(t);
        }}
      />

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Manage spaces</DialogTitle>
            <DialogDescription>
              Add, rename, reorder or remove the areas your tables sit in. The
              order here is the order staff see everywhere else.
            </DialogDescription>
          </DialogHeader>
          <SpacesPanel
            spaces={spaces}
            counts={countsBySpace}
            handlers={spaceHandlers}
            dense
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget ? tableLabel(deleteTarget) : "this table"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.capacity} seats
              {deleteTarget?.space ? ` · ${deleteTarget.space}` : ""}. A table
              with past orders cannot be deleted — mark it reserved instead if
              you just want it out of service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteTable();
              }}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete table
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConsolePage>
  );
}
