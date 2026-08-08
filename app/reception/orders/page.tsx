"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ManagerApprovalDialog from "@/components/dashboard/manager-approval-dialog";
import KotDialog from "@/components/kot/KotDialog";
import BillReceiptDialog from "@/components/receipt/BillReceiptDialog";
import { ConsolePage } from "@/components/shared/console-page";
import { getBill } from "@/lib/actions/bills";
import { getOrdersWithItems } from "@/lib/actions/dashboard";
import { getAvailableTables } from "@/lib/actions/reception";
import { updateOrderStatus, voidOrder, voidOrderItem } from "@/lib/actions/orders";
import { formatCurrency } from "@/lib/format";
import { formatOrderSlipHTML, printReceipt } from "@/lib/printing";
import { useAuthStore } from "@/store/auth-store";

import ActivityRail from "./_components/ActivityRail";
import KotView from "./_components/KotView";
import OrderDetailDialog from "./_components/OrderDetailDialog";
import OrdersHeader from "./_components/OrdersHeader";
import TableView from "./_components/TableView";
import TicketCard from "./_components/TicketCard";
import {
  STATUS_CONFIG,
  hasBill,
  liveItems,
  minutesSince,
  orderPlaceLabel,
  orderTypeMeta,
  useNow,
  usePortal,
  type AddOrderKey,
  type OrderStatus,
  type ViewTab,
} from "./_components/shared";

const SELF_VOID_ROLES = [
  "RECEPTIONIST",
  "MANAGER",
  "RESTAURANT_OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

const REFRESH_MS = 15_000;

export default function LiveOrdersPage() {
  const { restaurant, user } = useAuthStore();
  const restaurantId = restaurant?.id;
  const canSelfVoid = !!user?.role && SELF_VOID_ROLES.includes(user.role);
  const router = useRouter();
  const portal = usePortal();
  const now = useNow();

  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);

  const [view, setView] = useState<ViewTab>("ORDERS");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [showCompletedKots, setShowCompletedKots] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [voidItemTarget, setVoidItemTarget] = useState<any>(null);
  const [voidOrderTarget, setVoidOrderTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [billReceipt, setBillReceipt] = useState<{
    open: boolean;
    items: any[];
    bill: any;
    orderId?: string;
    tableName?: string;
    orderType?: string;
  }>({ open: false, items: [], bill: null });
  // Kitchen docket preview — opened after Start Cooking, or for a reprint.
  const [kotState, setKotState] = useState<{
    orderId: string | null;
    reprint: boolean;
  }>({ orderId: null, reprint: false });

  /* ── Data ────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [nextOrders, tableRes] = await Promise.all([
        getOrdersWithItems(50),
        getAvailableTables(),
      ]);
      setOrders(nextOrders ?? []);
      if (tableRes && "data" in tableRes && tableRes.data) setTables(tableRes.data);
      setSyncedAt(Date.now());
      setSyncFailed(false);
    } catch {
      // A dropped poll keeps the last good copy on screen — the header says so
      // rather than a toast firing every fifteen seconds.
      setSyncFailed(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setInitialLoading(true);
    refresh().finally(() => {
      if (!cancelled) setInitialLoading(false);
    });
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [restaurantId, refresh]);

  /* ── Keyboard: a POS is driven from the keyboard, not the mouse ──── */

  const anyDialogOpen =
    detailOpen ||
    billReceipt.open ||
    !!kotState.orderId ||
    !!voidItemTarget ||
    !!voidOrderTarget;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.key === "Escape" && typing && el === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
        return;
      }
      if (typing || anyDialogOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const byKey: Record<string, ViewTab> = {
        "1": "ORDERS",
        "2": "TABLE",
        "3": "KOT",
      };
      if (byKey[e.key]) {
        e.preventDefault();
        setView(byKey[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialogOpen]);

  /* ── Derived ─────────────────────────────────────────────────────── */

  const query = search.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    if (!query) return orders;
    // Match on order number, table, customer, or any dish on the ticket.
    return orders.filter(
      (o: any) =>
        String(o.orderId).toLowerCase().includes(query) ||
        String(o.table?.name ?? "").toLowerCase().includes(query) ||
        String(o.table?.tableNumber ?? "").toLowerCase().includes(query) ||
        String(o.customerName ?? "").toLowerCase().includes(query) ||
        (o.items || []).some((i: any) =>
          String(i.menuItemName ?? "").toLowerCase().includes(query)
        )
    );
  }, [orders, query]);

  /**
   * Live orders grouped the way a floor actually works — one ticket per table
   * (or per takeaway/delivery order), not one per round. A party's second round
   * belongs on the same ticket as their first because it lands on the same
   * bill; splitting them made one table look like several customers.
   */
  const tableGroups = useMemo(() => {
    const open = filteredOrders.filter(
      (o: any) => o.status !== "CANCELLED" && !hasBill(o)
    );
    const groups = new Map<string, any>();

    for (const order of open) {
      // Non-dine-in orders have no table, so each stands alone.
      const key = order.tableId ?? `solo:${order.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.orders.push(order);
        existing.items.push(...(order.items ?? []));
        existing.total += order.totalAmount ?? 0;
        // The ticket's clock reads from when the party sat down.
        if (new Date(order.createdAt) < new Date(existing.openedAt)) {
          existing.openedAt = order.createdAt;
        }
      } else {
        groups.set(key, {
          key,
          label: orderPlaceLabel(order),
          orderType: order.orderType,
          anchor: order,
          orders: [order],
          items: [...(order.items ?? [])],
          total: order.totalAmount ?? 0,
          openedAt: order.createdAt,
        });
      }
    }

    // Longest-seated first — those are closest to needing a bill.
    return Array.from(groups.values()).sort(
      (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
    );
  }, [filteredOrders]);

  const stats = useMemo(() => {
    const oldest = tableGroups.length
      ? minutesSince(tableGroups[0].openedAt, now)
      : 0;
    return {
      openTickets: tableGroups.length,
      seatedTables: tableGroups.filter((g) => g.anchor.tableId).length,
      runningTotal: tableGroups.reduce((sum, g) => sum + (g.total ?? 0), 0),
      oldestMinutes: oldest,
    };
  }, [tableGroups, now]);

  /**
   * Right rail: one row per *bill*, not per order.
   *
   * A table's rounds share a bill, and the group total is stored on the anchor
   * order — listing every order separately would show the same money twice (a
   * 650 bill appearing as "650" and "150").
   */
  const billedRows = useMemo(() => {
    const byBill = new Map<string, any>();

    for (const o of filteredOrders) {
      if (o.status === "CANCELLED") continue;
      const anchorBill = o.bills?.[0];
      const billId = o.billId ?? anchorBill?.id;
      if (!billId) continue;

      const entry = byBill.get(billId) ?? {
        billId,
        billNumber: anchorBill?.billNumber ?? null,
        status: anchorBill?.status ?? null,
        total: null as number | null,
        orderIds: [] as string[],
        items: [] as any[],
        label: orderPlaceLabel(o),
        at: o.updatedAt ?? o.createdAt,
        anyOrder: o,
      };

      entry.orderIds.push(o.orderId);
      entry.items.push(...(o.items ?? []));
      // The bill row is the authority on what was charged; fall back to the
      // anchor order's total for rows that predate the bill join.
      if (anchorBill) {
        entry.billNumber = anchorBill.billNumber ?? entry.billNumber;
        entry.status = anchorBill.status ?? entry.status;
        entry.total = anchorBill.totalAmount ?? o.totalAmount ?? entry.total;
      } else if (entry.total == null) {
        entry.total = o.totalAmount ?? null;
      }
      if (new Date(o.updatedAt ?? o.createdAt) > new Date(entry.at)) {
        entry.at = o.updatedAt ?? o.createdAt;
      }
      byBill.set(billId, entry);
    }

    return Array.from(byBill.values())
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 25);
  }, [filteredOrders]);

  /** Right rail: voided orders, kept visible for the shift's audit. */
  const voidedRows = useMemo(
    () =>
      filteredOrders
        .filter((o: any) => o.status === "CANCELLED")
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime()
        )
        .slice(0, 25),
    [filteredOrders]
  );

  /**
   * Table view: every table with its live state. A table reads "Billed" once
   * its party's orders are on a bill but the table hasn't been released yet —
   * the window where staff still need to hand over the invoice.
   */
  const tableCards = useMemo(() => {
    const byTable = new Map<string, any[]>();
    for (const o of orders) {
      if (!o.tableId || o.status === "CANCELLED") continue;
      byTable.set(o.tableId, [...(byTable.get(o.tableId) ?? []), o]);
    }

    return tables
      .filter(
        (t: any) =>
          spaceFilter === "all" || (t.space || "Uncategorized") === spaceFilter
      )
      .filter((t: any) => {
        if (!query) return true;
        return (
          String(t.name ?? "").toLowerCase().includes(query) ||
          String(t.tableNumber).includes(query)
        );
      })
      .map((t: any) => {
        const live = byTable.get(t.id) ?? [];
        const unbilled = live.filter((o: any) => !hasBill(o));
        const billedNotCleared = live.length > 0 && unbilled.length === 0;
        const liveStatus =
          unbilled.length > 0
            ? "OCCUPIED"
            : billedNotCleared
            ? "BILLED"
            : "OPEN";
        const openedAt = unbilled.length
          ? unbilled.reduce(
              (oldest: string, o: any) =>
                new Date(o.createdAt) < new Date(oldest) ? o.createdAt : oldest,
              unbilled[0].createdAt
            )
          : null;
        return {
          ...t,
          space: t.space || "Uncategorized",
          liveStatus,
          unbilled,
          total: unbilled.reduce(
            (sum: number, o: any) => sum + (o.totalAmount ?? 0),
            0
          ),
          openedAt,
        };
      });
  }, [tables, orders, spaceFilter, query]);

  const groupedTables = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of tableCards) {
      map.set(t.space, [...(map.get(t.space) ?? []), t]);
    }
    return Array.from(map.entries());
  }, [tableCards]);

  const tableSpaces = useMemo(
    () =>
      Array.from(
        new Set(tables.map((t: any) => t.space || "Uncategorized"))
      ).sort(),
    [tables]
  );

  const tableCountsBySpace = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const space = t.space || "Uncategorized";
      counts[space] = (counts[space] ?? 0) + 1;
    }
    return counts;
  }, [tables]);

  /**
   * KOT view: one docket per order sent to the kitchen. Orders still waiting
   * to be fired have no KOT number yet — the number is stamped on first print.
   */
  const kotSplit = useMemo(() => {
    const live = filteredOrders.filter((o: any) => o.status !== "CANCELLED");
    const toCard = (o: any) => ({
      order: o,
      kotNumber: o.kotNumber,
      label: orderPlaceLabel(o),
      items: liveItems(o.items ?? []),
    });
    const isDone = (o: any) => ["READY", "SERVED"].includes(o.status);
    return {
      pending: live.filter((o) => !isDone(o)).map(toCard),
      completed: live
        .filter(isDone)
        .map(toCard)
        .sort((a, b) => (b.kotNumber ?? 0) - (a.kotNumber ?? 0)),
    };
  }, [filteredOrders]);

  // Oldest docket first — the kitchen works a queue, not a stack.
  const pendingDockets = useMemo(
    () =>
      [...kotSplit.pending].sort(
        (a, b) =>
          new Date(a.order.createdAt).getTime() -
          new Date(b.order.createdAt).getTime()
      ),
    [kotSplit.pending]
  );

  /**
   * Every unbilled order the party at this table has run up.
   *
   * Settling sweeps all of them onto one bill, so the dialog has to price the
   * whole table — showing just the round that was tapped would quote a total
   * lower than what actually gets charged.
   */
  const billingGroup = useMemo(() => {
    if (!selectedOrder) return [];
    if (!selectedOrder.tableId || hasBill(selectedOrder)) return [selectedOrder];
    const siblings = orders.filter(
      (o: any) =>
        o.id !== selectedOrder.id &&
        o.tableId === selectedOrder.tableId &&
        !hasBill(o) &&
        o.status !== "CANCELLED"
    );
    return [selectedOrder, ...siblings];
  }, [selectedOrder, orders]);

  const groupItems = billingGroup.flatMap((o: any) => o.items ?? []);
  const groupSubtotal = billingGroup.reduce(
    (sum: number, o: any) => sum + (o.subtotal ?? 0),
    0
  );
  const groupTotal = billingGroup.reduce(
    (sum: number, o: any) => sum + (o.totalAmount ?? 0),
    0
  );

  /* ── Actions ─────────────────────────────────────────────────────── */

  /**
   * Routes the "New order" shortcuts. This board is shared by the owner and
   * reception portals, so the destination resolves from the current portal.
   */
  const handleAddOrder = (key: AddOrderKey) => {
    switch (key) {
      case "DINE_IN":
      case "TAKEAWAY":
      case "DELIVERY":
      case "PICKUP":
        // Order entry reads ?type= and records it on the order, so a delivery
        // ticket says Delivery and carries no table.
        router.push(`${portal}/order?type=${key}`);
        break;
      case "QUICK_BILL":
        // Counter sale: same order-entry screen, but the cart bills it on the
        // spot (quick=1) rather than sending it to the kitchen.
        router.push(`${portal}/order?type=TAKEAWAY&quick=1`);
        break;
      case "RESERVATION":
        toast.info("Reservations aren't built yet.");
        break;
    }
  };

  const handleAdvance = async (order: any, status: OrderStatus) => {
    setBusyOrderId(order.id);
    const result = await updateOrderStatus(order.id, status);
    setBusyOrderId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Order ${order.orderId} → ${STATUS_CONFIG[status].label}`);
    setSelectedOrder((prev: any) =>
      prev?.id === order.id ? { ...prev, status } : prev
    );
    // Starting the cook is the moment the kitchen needs its docket, so offer to
    // print it rather than forcing a separate trip through the order dialog.
    if (status === "PREPARING") setKotState({ orderId: order.id, reprint: false });
    refresh();
  };

  /**
   * Prints the whole table's order slip — every round, with prices and the KOT
   * numbers behind them. Built from the group rather than the anchor so a
   * party's second round can't be left off the paper.
   */
  const handlePrintOrderSlip = (group: any) => {
    const fmt = (d: Date | string) =>
      new Date(d).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

    const items = liveItems(group.items);
    const billed = group.orders.some((o: any) => hasBill(o));

    const html = formatOrderSlipHTML({
      orderTypeLabel: orderTypeMeta(group.orderType).label,
      tableLabel: group.anchor?.table
        ? group.anchor.table.name || `Table ${group.anchor.table.tableNumber}`
        : null,
      orderedAt: fmt(group.openedAt),
      status: billed
        ? "Billed"
        : STATUS_CONFIG[group.anchor?.status as OrderStatus]?.label ?? "Running",
      items: items.map((i: any) => ({
        name: i.menuItemName,
        qty: i.quantity,
        price: i.pricePerUnit * i.quantity,
      })),
      total: group.total,
      // Newest docket first, matching the "17,16" ordering on the slip.
      kotNumbers: group.orders
        .map((o: any) => o.kotNumber)
        .filter((n: any) => n != null)
        .sort((a: number, b: number) => b - a),
      printedBy:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.email ||
        "—",
      printedAt: fmt(new Date()),
    });

    if (!printReceipt(html)) {
      toast.error("Couldn't open the printer — check your browser's print settings.");
    }
  };

  const handleShowBill = async (order: any) => {
    // Prefer `billId` — a second round settled onto the table's existing bill
    // has no anchor `bills` entry of its own.
    const billId = order?.billId || order?.bills?.[0]?.id;
    if (!billId) {
      toast.error("No bill found for this order");
      return;
    }
    const res = await getBill(billId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    const billData = res.data;
    setBillReceipt({
      open: true,
      items: (billData.order?.items || []).map((i: any) => ({
        name: i.menuItemName,
        qty: i.quantity,
        price: i.pricePerUnit,
        total: i.pricePerUnit * i.quantity,
      })),
      bill: billData,
      orderId: order.orderId,
      tableName: order.table ? `T${order.table.tableNumber}` : undefined,
      orderType: order.orderType,
    });
  };

  const handleApprovedVoidItem = async (data: {
    reason: string;
    approverUsername?: string;
    approverPassword?: string;
  }) => {
    const result = await voidOrderItem({
      orderItemId: voidItemTarget.id,
      ...data,
    });
    if (result.error) return { error: result.error };
    toast.success(`${voidItemTarget.menuItemName} voided`);
    setSelectedOrder(result.data);
    setVoidItemTarget(null);
    refresh();
  };

  const handleApprovedVoidOrder = async (data: {
    reason: string;
    approverUsername?: string;
    approverPassword?: string;
  }) => {
    const result = await voidOrder({ orderId: voidOrderTarget.id, ...data });
    if (result.error) return { error: result.error };
    toast.success(`Order ${voidOrderTarget.orderId} voided`);
    setVoidOrderTarget(null);
    setDetailOpen(false);
    refresh();
  };

  const closeVoidDialogs = () => {
    setVoidItemTarget(null);
    setVoidOrderTarget(null);
    setVoidReason("");
  };

  const confirmSelfVoidItem = async () => {
    setVoidBusy(true);
    const result = await voidOrderItem({
      orderItemId: voidItemTarget.id,
      reason: voidReason.trim(),
    });
    setVoidBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${voidItemTarget.menuItemName} voided`);
    setSelectedOrder(result.data);
    closeVoidDialogs();
    refresh();
  };

  const confirmSelfVoidOrder = async () => {
    setVoidBusy(true);
    const result = await voidOrder({
      orderId: voidOrderTarget.id,
      reason: voidReason.trim(),
    });
    setVoidBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Order ${voidOrderTarget.orderId} voided`);
    closeVoidDialogs();
    setDetailOpen(false);
    refresh();
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <ConsolePage>
      <OrdersHeader
        openTickets={stats.openTickets}
        seatedTables={stats.seatedTables}
        runningTotal={stats.runningTotal}
        oldestMinutes={stats.oldestMinutes}
        syncedAt={syncedAt}
        syncFailed={syncFailed}
        now={now}
        search={search}
        onSearchChange={setSearch}
        searchRef={searchRef}
        view={view}
        onViewChange={setView}
        onAddOrder={handleAddOrder}
      />

      {initialLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-4 lg:p-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-3 w-16" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {view === "ORDERS" && (
            <div className="flex flex-col items-start gap-4 p-4 lg:p-6 xl:flex-row">
              <div className="w-full min-w-0 flex-1">
                {tableGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-24 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light">
                      <ClipboardList className="h-7 w-7 text-primary" />
                    </div>
                    <p className="text-base font-semibold">
                      {query ? "Nothing matches that search" : "The floor is clear"}
                    </p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {query
                        ? "Try a table number, an order number, or a dish name."
                        : "No open tickets right now. Start one from New order above."}
                    </p>
                    {query && (
                      <Button
                        variant="outline"
                        className="mt-5 rounded-lg"
                        onClick={() => setSearch("")}
                      >
                        Clear search
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {tableGroups.map((group: any) => (
                      <TicketCard
                        key={group.key}
                        group={group}
                        now={now}
                        onOpen={() => {
                          setSelectedOrder(group.anchor);
                          setDetailOpen(true);
                        }}
                        onAddItems={() =>
                          router.push(`${portal}/order?type=${group.orderType}`)
                        }
                        onPrintSlip={() => handlePrintOrderSlip(group)}
                        onCheckout={() =>
                          router.push(`${portal}/checkout/${group.anchor.id}`)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              <ActivityRail
                billed={billedRows}
                voided={voidedRows}
                onShowBill={handleShowBill}
              />
            </div>
          )}

          {view === "TABLE" && (
            <TableView
              groupedTables={groupedTables}
              spaces={tableSpaces}
              spaceFilter={spaceFilter}
              onSpaceFilter={setSpaceFilter}
              tableCounts={tableCountsBySpace}
              totalTables={tables.length}
              now={now}
              onOpenTable={(t) =>
                router.push(`${portal}/checkout/${t.unbilled[0].id}`)
              }
            />
          )}

          {view === "KOT" && (
            <KotView
              dockets={showCompletedKots ? kotSplit.completed : pendingDockets}
              showCompleted={showCompletedKots}
              onShowCompleted={setShowCompletedKots}
              pendingCount={kotSplit.pending.length}
              completedCount={kotSplit.completed.length}
              now={now}
              busyOrderId={busyOrderId}
              onPrint={(order) =>
                setKotState({ orderId: order.id, reprint: !!order.kotNumber })
              }
              onAdvance={handleAdvance}
            />
          )}
        </>
      )}

      <OrderDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        order={selectedOrder}
        billingGroup={billingGroup}
        groupItems={groupItems}
        groupSubtotal={groupSubtotal}
        groupTotal={groupTotal}
        onVoidItem={(item) => {
          setVoidReason("");
          setVoidItemTarget(item);
        }}
        onVoidOrder={(order) => {
          setVoidReason("");
          setVoidOrderTarget(order);
        }}
        onCheckout={() => router.push(`${portal}/checkout/${selectedOrder.id}`)}
        onShowBill={() => handleShowBill(selectedOrder)}
        onPrintKot={() =>
          setKotState({ orderId: selectedOrder.id, reprint: true })
        }
      />

      <BillReceiptDialog
        open={billReceipt.open}
        onOpenChange={(o) => setBillReceipt((prev) => ({ ...prev, open: o }))}
        items={billReceipt.items}
        bill={billReceipt.bill}
        orderId={billReceipt.orderId}
        tableName={billReceipt.tableName}
        orderType={billReceipt.orderType}
      />

      {/* Kitchen docket — shown after Start Cooking and for reprints */}
      <KotDialog
        open={!!kotState.orderId}
        onOpenChange={(o) => !o && setKotState({ orderId: null, reprint: false })}
        orderId={kotState.orderId}
        reprint={kotState.reprint}
      />

      {canSelfVoid ? (
        <>
          <AlertDialog
            open={!!voidItemTarget}
            onOpenChange={(o) => !o && closeVoidDialogs()}
          >
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Void {voidItemTarget?.menuItemName ?? "item"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {voidItemTarget &&
                    `${voidItemTarget.quantity}x at ${formatCurrency(
                      voidItemTarget.pricePerUnit * voidItemTarget.quantity
                    )}. `}
                  This is recorded against your login and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <textarea
                className="min-h-20 w-full rounded-xl border border-border-control bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Reason for voiding..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={closeVoidDialogs}>
                  Keep item
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="gap-2"
                  disabled={!voidReason.trim() || voidBusy}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmSelfVoidItem();
                  }}
                >
                  {voidBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Void item
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={!!voidOrderTarget}
            onOpenChange={(o) => !o && closeVoidDialogs()}
          >
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Void order {voidOrderTarget?.orderId ?? ""}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {voidOrderTarget &&
                    `${orderPlaceLabel(voidOrderTarget)}, ${formatCurrency(
                      voidOrderTarget.totalAmount ?? 0
                    )}. `}
                  This is recorded against your login and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <textarea
                className="min-h-20 w-full rounded-xl border border-border-control bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Reason for voiding..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={closeVoidDialogs}>
                  Keep order
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="gap-2"
                  disabled={!voidReason.trim() || voidBusy}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmSelfVoidOrder();
                  }}
                >
                  {voidBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Void order
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <>
          <ManagerApprovalDialog
            open={!!voidItemTarget}
            onOpenChange={(o) => !o && setVoidItemTarget(null)}
            title={`Void ${voidItemTarget?.menuItemName ?? "item"}`}
            description="Voiding an item requires a manager, owner, or admin to authorize with their own login."
            onConfirm={handleApprovedVoidItem}
          />
          <ManagerApprovalDialog
            open={!!voidOrderTarget}
            onOpenChange={(o) => !o && setVoidOrderTarget(null)}
            title={`Void order ${voidOrderTarget?.orderId ?? ""}`}
            description="Voiding an order requires a manager, owner, or admin to authorize with their own login."
            onConfirm={handleApprovedVoidOrder}
          />
        </>
      )}
    </ConsolePage>
  );
}
