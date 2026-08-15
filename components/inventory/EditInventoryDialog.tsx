'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { deleteInventoryItem, updateInventoryItem } from '@/lib/actions/inventory';
import { toast } from 'sonner';
import { getItemStatus, UNITS } from './inventory-shared';

/**
 * Row actions for an inventory item: edit the item details (name, category,
 * unit, minimum threshold) or delete it entirely (which also clears its
 * movement ledger). Stock level edits stay on the inline EditableStockCell so
 * the stock history stays truthful.
 */
export function EditInventoryDialog({
  item,
  onUpdated,
  onDeleted,
}: {
  item: {
    id: string;
    name: string;
    category: string;
    unit: string;
    minThreshold: number;
    currentStock: number;
  };
  onUpdated: (item: {
    id: string;
    name: string;
    category: string;
    unit: string;
    minThreshold: number;
    currentStock: number;
    status: string;
    lastUpdated: Date;
  }) => void;
  onDeleted: (id: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    minThreshold: String(item.minThreshold),
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const openEdit = () => {
    setForm({
      itemName: item.name,
      category: item.category,
      unit: item.unit,
      minThreshold: String(item.minThreshold),
    });
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemName.trim()) { toast.error('Item name is required'); return; }
    setIsSaving(true);
    const result = await updateInventoryItem(item.id, {
      name: form.itemName.trim(),
      category: form.category.trim(),
      unit: form.unit,
      minThreshold: parseFloat(form.minThreshold) || 0,
    });
    setIsSaving(false);
    if (result.error) { toast.error(result.error); return; }
    if (!result.data) return;

    const updated = result.data;
    onUpdated({
      id: updated.id,
      name: updated.name,
      category: updated.description || '',
      unit: updated.unit,
      minThreshold: updated.reorderLevel,
      currentStock: updated.currentQuantity,
      status: getItemStatus(updated.currentQuantity, updated.reorderLevel),
      lastUpdated: new Date(updated.updatedAt),
    });
    toast.success(`${updated.name} updated`);
    setEditOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteInventoryItem(item.id);
    setIsDeleting(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success(`${item.name} deleted`);
    onDeleted(item.id);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={openEdit}
        className="gap-1.5"
        aria-label={`Edit ${item.name}`}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${item.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the item and its entire stock history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>Update the details of &quot;{item.name}&quot;.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Item Name *</label>
              <Input
                placeholder="e.g., Chicken"
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <Input
                placeholder="e.g., Meat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Unit *</label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Minimum Threshold *</label>
                <Input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={form.minThreshold}
                  onChange={(e) => setForm({ ...form, minThreshold: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}