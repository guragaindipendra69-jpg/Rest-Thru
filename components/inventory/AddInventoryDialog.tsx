'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { addInventoryItem } from '@/lib/actions/inventory';
import { toast } from 'sonner';
import { getItemStatus, UNITS, type InventoryItem } from './inventory-shared';

const EMPTY_FORM = { itemName: '', category: '', currentStock: '', unit: 'kg', minThreshold: '' };

export function AddInventoryDialog({
  restaurantId,
  onAdded,
}: {
  restaurantId: string;
  onAdded: (item: InventoryItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const resetForm = () => setFormData(EMPTY_FORM);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) { toast.error('Not authenticated'); return; }
    if (!formData.itemName || !formData.currentStock || !formData.minThreshold) {
      toast.error('Please fill all required fields'); return;
    }
    setIsSaving(true);
    const result = await addInventoryItem({
      name:          formData.itemName,
      category:      formData.category || '',
      currentStock:  parseFloat(formData.currentStock),
      unit:          formData.unit,
      minThreshold:  parseFloat(formData.minThreshold),
    });

    setIsSaving(false);
    if (result.error) { toast.error(result.error); return; }
    if (!result.data) return;

    const item = result.data;
    onAdded({
      id:           item.id,
      name:         item.name,
      category:     item.description || '',
      currentStock: item.currentQuantity,
      unit:         item.unit,
      minThreshold: item.reorderLevel,
      lastUpdated:  new Date(item.updatedAt),
      status:       getItemStatus(item.currentQuantity, item.reorderLevel),
    });
    toast.success(`${item.name} added to inventory`);
    setIsOpen(false);
    resetForm();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-2" />Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>Add a new item to your restaurant inventory.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Item Name *</label>
            <Input
              placeholder="e.g., Chicken"
              value={formData.itemName}
              onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <Input
              placeholder="e.g., Meat"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Current Stock *</label>
              <Input
                type="number"
                placeholder="0"
                min="0"
                value={formData.currentStock}
                onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Unit *</label>
              <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Minimum Threshold *</label>
            <Input
              type="number"
              placeholder="0"
              min="0"
              value={formData.minThreshold}
              onChange={(e) => setFormData({ ...formData, minThreshold: e.target.value })}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsOpen(false); resetForm(); }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-primary" disabled={isSaving}>
              {isSaving ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
