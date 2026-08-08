'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle, AlertTriangle, Clock, Search, TrendingUp, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getInventoryItems } from '@/lib/actions/inventory';
import { formatRelativeTime } from '@/lib/format';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';
import { AddInventoryDialog } from './AddInventoryDialog';
import { EditableStockCell } from './EditableStockCell';
import { StockHistoryDialog } from './StockHistoryDialog';
import { getItemStatus, statusColors, type InventoryItem } from './inventory-shared';

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/**
 * Inventory for owner and reception.
 *
 * The two portals shipped this as two 800-line files that differed only by a
 * dead Edit button, so both routes now render this component -- same pattern as
 * `components/settings/*`. Eight columns have no small-screen story, so there is
 * a card list below `md` and the table from `md` up.
 */
export default function InventoryPageBody() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id || '';

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertDismissed, setAlertDismissed] = useState(false);

  const loadItems = useCallback(() => {
    if (!restaurantId) return;
    setIsLoading(true);
    setLoadError(null);
    getInventoryItems().then((result) => {
      setIsLoading(false);
      if (result.error) { setLoadError(result.error); toast.error(result.error); return; }
      if (result.data) {
        setInventoryItems(result.data.map((i: any) => ({
          id:           i.id,
          name:         i.name,
          category:     i.description || '',
          currentStock: i.currentQuantity,
          unit:         i.unit,
          minThreshold: i.reorderLevel,
          lastUpdated:  new Date(i.updatedAt),
          status:       getItemStatus(i.currentQuantity, i.reorderLevel),
        })));
      }
    });
  }, [restaurantId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const totalItems      = inventoryItems.length;
  const lowStockItems   = inventoryItems.filter((i) => i.status === 'Low').length;
  const outOfStockItems = inventoryItems.filter((i) => i.status === 'Out of Stock').length;
  const healthyItems    = inventoryItems.filter((i) => i.status === 'Healthy').length;

  const filteredItems = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const applyStock = (id: string, newStock: number) =>
    setInventoryItems((prev) => prev.map((i) =>
      i.id === id
        ? { ...i, currentStock: newStock, status: getItemStatus(newStock, i.minThreshold), lastUpdated: new Date() }
        : i
    ));

  const emptyMessage = searchQuery
    ? 'No items match your search'
    : 'No inventory items yet — click "Add Item" to get started';

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {!alertDismissed && (lowStockItems > 0 || outOfStockItems > 0) && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-warning/25 bg-warning-surface p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning-strong" />
            <div>
              <p className="font-medium text-warning">
                {lowStockItems + outOfStockItems} item
                {lowStockItems + outOfStockItems !== 1 ? 's are' : ' is'} running low on stock
              </p>
              <p className="text-sm text-warning">Please reorder soon to avoid stockouts</p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAlertDismissed(true)}
            className="flex-shrink-0 text-warning-strong hover:bg-warning-surface"
            aria-label="Dismiss low stock alert"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <PageHeader
        title="Inventory Management"
        description="Track and manage your restaurant inventory"
      >
        <AddInventoryDialog
          restaurantId={restaurantId}
          onAdded={(item) => setInventoryItems((prev) => [item, ...prev])}
        />
      </PageHeader>

      {/* 2x2 on a tablet: four cards in the width left beside the sidebar is a sliver each. */}
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Kpi label="Total Items" value={totalItems} footnote="Items in inventory">
          <TrendingUp className="h-4 w-4 text-primary" />
        </Kpi>
        <Kpi
          label="Low Stock"
          value={lowStockItems}
          valueClass="text-warning-strong"
          accent="border-l-4 border-l-warning"
          footnote="Below minimum threshold"
        >
          <AlertCircle className="h-4 w-4 text-warning-strong" />
        </Kpi>
        <Kpi
          label="Out of Stock"
          value={outOfStockItems}
          valueClass="text-destructive"
          accent="border-l-4 border-l-destructive"
          footnote="Items not available"
        >
          <AlertCircle className="h-4 w-4 text-destructive" />
        </Kpi>
        <Kpi
          label="Healthy Stock"
          value={healthyItems}
          valueClass="text-primary"
          accent="border-l-4 border-l-success"
          footnote="Above minimum threshold"
        >
          <TrendingUp className="h-4 w-4 text-success" />
        </Kpi>
      </motion.div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Inventory Items</CardTitle>
            <CardDescription>Manage all inventory items and stock levels</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items or categories..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : loadError ? (
            <div className="py-8 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
              <p className="mb-3 text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={loadItems}>Retry</Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center">
              <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <>
              <ul className="space-y-2 md:hidden">
                {filteredItems.map((item) => (
                  <li key={item.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        {item.category && (
                          <p className="truncate text-xs text-muted-foreground">{item.category}</p>
                        )}
                      </div>
                      <Badge className={statusColors[item.status]}>{item.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <EditableStockCell
                          itemId={item.id}
                          value={item.currentStock}
                          unit={item.unit}
                          onSaved={(newValue) => applyStock(item.id, newValue)}
                        />
                        <p className="px-2 text-xs text-muted-foreground">
                          Min {item.minThreshold} {item.unit} · {formatRelativeTime(item.lastUpdated)}
                        </p>
                      </div>
                      <StockHistoryDialog
                        item={item}
                        onStockChanged={applyStock}
                        trigger={
                          <Button size="sm" variant="outline" className="flex-shrink-0">
                            <Clock className="mr-1.5 h-4 w-4" />
                            History
                          </Button>
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Min Threshold</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.name}</TableCell>
                        <TableCell className="text-sm">{item.category}</TableCell>
                        <TableCell>
                          <EditableStockCell
                            itemId={item.id}
                            value={item.currentStock}
                            unit={item.unit}
                            onSaved={(newValue) => applyStock(item.id, newValue)}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{item.minThreshold} {item.unit}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[item.status]}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatRelativeTime(item.lastUpdated)}
                        </TableCell>
                        <TableCell>
                          <StockHistoryDialog item={item} onStockChanged={applyStock} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass = '',
  accent = '',
  footnote,
  children,
}: {
  label: string;
  value: number;
  valueClass?: string;
  accent?: string;
  footnote: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card className={accent}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          {children}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
          <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}