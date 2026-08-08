'use client';

import { useState } from 'react';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { addStock, getInventoryHistory, recordUsage } from '@/lib/actions/inventory';
import { formatRelativeTime } from '@/lib/format';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { HistoryEntry, InventoryItem } from './inventory-shared';

/** Movements, the trend chart, and the two mutations that write to them. */
export function StockHistoryDialog({
  item,
  onStockChanged,
  trigger,
}: {
  item: InventoryItem;
  onStockChanged: (id: string, newStock: number) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showRecordUsage, setShowRecordUsage] = useState(false);
  const [addQty, setAddQty] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [usageQty, setUsageQty] = useState('');
  const [usageNotes, setUsageNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [trend, setTrend] = useState<{ day: string; stock: number }[]>([]);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    const result = await getInventoryHistory(item.id);
    setIsLoadingHistory(false);
    if (result.error) { setHistoryError(result.error); return; }
    if (result.data) {
      setEntries(result.data.entries);
      setTrend(result.data.trend);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) loadHistory();
  };

  const handleAddStock = async () => {
    const qty = parseFloat(addQty);
    if (!qty || qty <= 0) { toast.error('Enter a quantity greater than 0'); return; }
    setIsSubmitting(true);
    const result = await addStock(item.id, qty, addNotes || undefined);
    setIsSubmitting(false);
    if (result.error) { toast.error(result.error); return; }
    if (result.data) {
      onStockChanged(item.id, result.data.currentQuantity);
      toast.success(`Added ${qty} ${item.unit}`);
      setAddQty(''); setAddNotes(''); setShowAddStock(false);
      loadHistory();
    }
  };

  const handleRecordUsage = async () => {
    const qty = parseFloat(usageQty);
    if (!qty || qty <= 0) { toast.error('Enter a quantity greater than 0'); return; }
    setIsSubmitting(true);
    const result = await recordUsage(item.id, qty, usageNotes || undefined);
    setIsSubmitting(false);
    if (result.error) { toast.error(result.error); return; }
    if (result.data) {
      onStockChanged(item.id, result.data.currentQuantity);
      toast.success(`Recorded usage of ${qty} ${item.unit}`);
      setUsageQty(''); setUsageNotes(''); setShowRecordUsage(false);
      loadHistory();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon" variant="ghost" aria-label={`Stock history for ${item.name}`}>
            <Clock className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stock History - {item.name}</DialogTitle>
          <DialogDescription>View stock movements and trends for this item</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary-hover"
              onClick={() => { setShowAddStock(!showAddStock); setShowRecordUsage(false); }}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Add Stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowRecordUsage(!showRecordUsage); setShowAddStock(false); }}
            >
              <TrendingDown className="h-4 w-4 mr-2" />
              Record Usage
            </Button>
          </div>

          {showAddStock && (
            <MovementForm
              quantityLabel={`Quantity to Add (${item.unit})`}
              qty={addQty}
              onQtyChange={setAddQty}
              notes={addNotes}
              onNotesChange={setAddNotes}
              submitLabel={isSubmitting ? 'Adding...' : 'Add Stock'}
              submitClass="bg-primary"
              disabled={isSubmitting}
              onSubmit={handleAddStock}
              onCancel={() => setShowAddStock(false)}
            />
          )}

          {showRecordUsage && (
            <MovementForm
              quantityLabel={`Quantity Used (${item.unit})`}
              qty={usageQty}
              onQtyChange={setUsageQty}
              notes={usageNotes}
              onNotesChange={setUsageNotes}
              submitLabel={isSubmitting ? 'Recording...' : 'Record Usage'}
              disabled={isSubmitting}
              onSubmit={handleRecordUsage}
              onCancel={() => setShowRecordUsage(false)}
            />
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium">Recent Movements</p>
            {isLoadingHistory ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : historyError ? (
              <p className="py-4 text-sm text-destructive">{historyError}</p>
            ) : entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No movements recorded yet for this item.
              </p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {e.movementType === 'USAGE'
                        ? <TrendingDown className="h-4 w-4 text-destructive" />
                        : <TrendingUp className="h-4 w-4 text-success" />}
                      <div>
                        <p className="font-medium">
                          {e.movementType === 'USAGE' ? 'Used' : e.movementType === 'ADJUSTMENT' ? 'Adjusted' : 'Added'}{' '}
                          {Math.abs(e.quantity)} {item.unit}
                          {e.reason ? ` — ${e.reason}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(new Date(e.createdAt))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Stock Level Trend</p>
            {isLoadingHistory ? (
              <Skeleton className="h-[250px] w-full rounded-lg" />
            ) : trend.length <= 1 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough movement history yet to chart a trend.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="stock"
                    stroke="hsl(var(--primary))"
                    dot={{ fill: 'hsl(var(--primary))' }}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Add Stock and Record Usage differ only in labels and which action they call. */
function MovementForm({
  quantityLabel,
  qty,
  onQtyChange,
  notes,
  onNotesChange,
  submitLabel,
  submitClass = '',
  disabled,
  onSubmit,
  onCancel,
}: {
  quantityLabel: string;
  qty: string;
  onQtyChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  submitLabel: string;
  submitClass?: string;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">{quantityLabel}</label>
        <Input type="number" placeholder="0" min="0" value={qty} onChange={(e) => onQtyChange(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notes</label>
        <Input placeholder="Add notes..." value={notes} onChange={(e) => onNotesChange(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className={submitClass} onClick={onSubmit} disabled={disabled}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
