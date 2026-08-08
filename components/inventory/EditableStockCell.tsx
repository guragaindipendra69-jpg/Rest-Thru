'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateInventoryStock } from '@/lib/actions/inventory';
import { toast } from 'sonner';

/** Click-to-edit stock quantity. Enter commits, Escape reverts. */
export function EditableStockCell({
  itemId,
  value,
  unit,
  onSaved,
}: {
  itemId: string;
  value: number;
  unit: string;
  onSaved: (newValue: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync the edit buffer if the underlying value changes elsewhere
  // (e.g. Add Stock / Record Usage in StockHistoryDialog) while not editing.
  useEffect(() => {
    if (!isEditing) setEditValue(value.toString());
  }, [value, isEditing]);

  const handleSave = async () => {
    const parsed = parseFloat(editValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error('Enter a valid, non-negative quantity');
      return;
    }
    if (parsed === value) { setIsEditing(false); return; }
    setIsSaving(true);
    const result = await updateInventoryStock(itemId, parsed);
    setIsSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(value.toString()); // revert — do not silently keep a stale/unsent value
      return;
    }
    onSaved(parsed);
    toast.success('Stock updated');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.toString());
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          className="w-20"
          min="0"
          autoFocus
          disabled={isSaving}
        />
        <span className="text-sm">{unit}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-success"
          onClick={handleSave}
          disabled={isSaving}
          title="Save"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          onClick={handleCancel}
          disabled={isSaving}
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="cursor-pointer rounded px-2 py-1 text-left transition hover:bg-muted/50"
      onClick={() => setIsEditing(true)}
      title="Click to edit stock quantity"
    >
      {value} {unit}
    </button>
  );
}
