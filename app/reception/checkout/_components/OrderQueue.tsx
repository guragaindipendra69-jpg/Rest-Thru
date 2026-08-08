"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Banknote, ChevronRight, Pause, Play, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";

type OrderTypeFilter = "all" | "DINE_IN" | "TAKEAWAY";

/**
 * The cashier's work queue: search, the type filter, parked and pending bills,
 * and the ready-to-bill list.
 *
 * Split out of `checkout/page.tsx` following the pattern already established by
 * `app/reception/orders/_components/`.
 */
export function OrderQueue({
  searchQuery,
  onSearchChange,
  orderTypeFilter,
  onOrderTypeChange,
  heldBills,
  pendingBills,
  readyToBillOrders,
  onResumeHeld,
  onSelectPending,
  onSelectOrder,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  orderTypeFilter: OrderTypeFilter;
  onOrderTypeChange: (value: OrderTypeFilter) => void;
  heldBills: any[];
  pendingBills: any[];
  readyToBillOrders: any[];
  onResumeHeld: (bill: any) => void;
  onSelectPending: (bill: any) => void;
  onSelectOrder: (order: any) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <Input
              placeholder="Search order #, table, or customer"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 border-0 p-0 focus-visible:ring-0"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs
            defaultValue="ready"
            value={orderTypeFilter === "all" ? "ready" : orderTypeFilter}
            onValueChange={(v) => onOrderTypeChange(v === "ready" ? "all" : (v as OrderTypeFilter))}
          >
            <TabsList className="w-full">
              <TabsTrigger value="ready" className="flex-1">Ready</TabsTrigger>
              <TabsTrigger value="DINE_IN" className="flex-1">Dine-in</TabsTrigger>
              <TabsTrigger value="TAKEAWAY" className="flex-1">Takeaway</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {heldBills.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="flex items-center gap-1 text-sm">
              <Pause className="w-4 h-4" /> Parked Bills ({heldBills.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {heldBills.map((bill: any) => (
              <button
                key={bill.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                onClick={() => onResumeHeld(bill)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{bill.billNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {bill.order?.table ? `Table ${bill.order.table.tableNumber}` : "Takeaway"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(bill.totalAmount)}</span>
                  <span className="inline-flex h-7 w-7 items-center justify-center">
                    <Play className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingBills.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="flex items-center gap-1 text-sm">
              <Banknote className="w-4 h-4" /> Pending Bills ({pendingBills.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {pendingBills.map((bill: any) => (
              <button
                key={bill.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                onClick={() => onSelectPending(bill)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{bill.billNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {bill.order?.table ? `Table ${bill.order.table.tableNumber}` : "Takeaway"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(bill.totalAmount)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm">Ready to Bill ({readyToBillOrders.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {/* Viewport-relative, not a fixed 400px: on a short tablet in landscape
              a hardcoded height either strands the list or overflows the fold. */}
          <ScrollArea className="h-[min(52vh,26rem)]">
            <AnimatePresence>
              {readyToBillOrders.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No orders ready to bill</p>
              )}
              {readyToBillOrders.map((order: any) => (
                <motion.button
                  key={order.id}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-1 flex w-full items-center justify-between rounded-lg bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                  onClick={() => onSelectOrder(order)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">#{order.orderId}</p>
                      <Badge variant="outline" className="h-4 text-[10px]">
                        {order.orderType === "DINE_IN" ? `T${order.table?.tableNumber}` : "TW"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.items?.slice(0, 2).map((i: any) => i.menuItemName).join(", ")}
                      {order.items?.length > 2 && ` +${order.items.length - 2}`}
                    </p>
                  </div>
                  <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                    <span className="whitespace-nowrap text-sm font-semibold">
                      {formatCurrency(order.totalAmount)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
