"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  MoreVertical,
  Utensils,
  Trophy,
  Award,
  Sparkles,
  Loader2,
  ImageIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  addCategory,
  updateCategory,
  deleteCategory,
  getCategoryOverview,
} from "@/lib/actions/menu";
import { UploadField } from "@/components/shared/upload-field";
import { cn } from "@/lib/utils";

type CategoryRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  dishCount: number;
  orderCount: number;
};

type Overview = {
  categories: CategoryRow[];
  stats: {
    total: number;
    totalDishes: number;
    topSold: { name: string; orders: number } | null;
    mostDishes: { name: string; dishes: number } | null;
    avgDishesPerCategory: number;
  };
};

const CATEGORY_LIMIT = 100;

export default function CategoryPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id;

  const [overview, setOverview] = useState<Overview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  // Add / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    const res = await getCategoryOverview(restaurantId);
    if ("error" in res && res.error) {
      toast.error(res.error);
    } else if (res.data) {
      setOverview(res.data as Overview);
    }
    setIsLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const cats = overview?.categories ?? [];
    const q = search.trim().toLowerCase();
    return q ? cats.filter((c) => c.name.toLowerCase().includes(q)) : cats;
  }, [overview, search]);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setImageUrl(null);
    setDialogOpen(true);
  };

  const openEdit = (cat: CategoryRow) => {
    setEditing(cat);
    setName(cat.name);
    setImageUrl(cat.imageUrl);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    setSaving(true);
    try {
      // `imageUrl` is already stored — UploadField uploads on pick. Passing it
      // on every save (not only when a new file was chosen) is what lets the
      // Remove button clear the picture: the action reads null as "clear it".
      const res = editing
        ? await updateCategory(editing.id, { name: name.trim(), imageUrl })
        : await addCategory({ name: name.trim(), imageUrl, restaurantId });

      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success(editing ? "Category updated" : "Category created");
        setDialogOpen(false);
        await load();
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteCategory(deleteTarget.id);
    setDeleting(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
    } else {
      toast.success("Category deleted");
      setDeleteTarget(null);
      await load();
    }
  };

  const stats = overview?.stats;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader title="Category">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-9 w-full sm:w-52"
          />
        </div>
        <div className="flex items-center rounded-lg border bg-background p-0.5">
          <button
            onClick={() => setView("grid")}
            aria-label="Grid view"
            className={cn(
              "p-1.5 rounded-md transition-colors",
              view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            aria-label="List view"
            className={cn(
              "p-1.5 rounded-md transition-colors",
              view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add New
        </Button>
      </PageHeader>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Utensils className="h-5 w-5" />}
          iconClass="bg-primary-light text-primary"
          label="Total"
          value={isLoading ? "—" : `${stats?.total ?? 0}/${CATEGORY_LIMIT}`}
        />
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          iconClass="bg-warning-surface text-warning-strong"
          label="Top Sold"
          value={isLoading ? "—" : stats?.topSold?.name ?? "No sales yet"}
          badge={stats?.topSold ? `${stats.topSold.orders} orders` : undefined}
        />
        <StatCard
          icon={<Award className="h-5 w-5" />}
          iconClass="bg-brand-light text-brand-strong"
          label="Most Dishes"
          value={isLoading ? "—" : stats?.mostDishes?.name ?? "—"}
          badge={stats?.mostDishes ? `${stats.mostDishes.dishes} dishes` : undefined}
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5" />}
          iconClass="bg-info-surface text-info-strong"
          label="Avg. Dishes Per Category"
          value={isLoading ? "—" : String(stats?.avgDishesPerCategory ?? 0)}
        />
      </div>

      {/* ── Categories ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No categories found</p>
          <p className="text-sm">Create your first category to organise dishes.</p>
          <Button onClick={openAdd} className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" /> Add New
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className="group relative rounded-xl border bg-card p-4 flex flex-col items-center text-center transition-shadow hover:shadow-md"
            >
              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CategoryMenu onEdit={() => openEdit(cat)} onDelete={() => setDeleteTarget(cat)} />
              </div>
              <div className="w-24 h-24 rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
                {cat.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <p className="font-semibold truncate w-full">{cat.name}</p>
              <p className="text-sm text-muted-foreground">{cat.dishCount} Dish</p>
              {!cat.isActive && (
                <Badge variant="outline" className="mt-2 text-[10px]">Inactive</Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border divide-y">
          {filtered.map((cat) => (
            <div key={cat.id} className="flex items-center gap-4 p-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                {cat.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{cat.name}</p>
                <p className="text-sm text-muted-foreground">{cat.dishCount} Dish · {cat.orderCount} orders</p>
              </div>
              {!cat.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
              <CategoryMenu onEdit={() => openEdit(cat)} onDelete={() => setDeleteTarget(cat)} />
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Beverages"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Image</label>
              <UploadField
                value={imageUrl}
                onChange={setImageUrl}
                folder="categories"
                shape="wide"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Shown as the category tile here and on the guest menu. A square
                image crops best.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the category. Dishes assigned to it must be re-categorised.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("p-2 rounded-lg", iconClass)}>{icon}</span>
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        {badge && (
          <Badge variant="outline" className="text-[10px] bg-muted/50">
            {badge}
          </Badge>
        )}
      </div>
      <p className="text-xl font-bold truncate">{value}</p>
    </div>
  );
}

function CategoryMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Category actions"
          className="p-1.5 rounded-md bg-background/80 border hover:bg-muted transition-colors"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
