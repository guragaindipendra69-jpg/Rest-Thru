"use server";

import { cache } from "react";
import prisma from "@/lib/prisma";
import {
  requireTenant,
  OWNER_ROLES,
  FRONT_OF_HOUSE_ROLES,
} from "@/lib/auth-tenant";

// ─── Cached helpers ────────────────────────────────────────────────────────
// React cache() deduplicates identical calls within the same server-render.
// For aggregate data that barely changes per page-load, we also use
// Next.js unstable_cache with a 60-second revalidation window.
import { unstable_cache } from "next/cache";

// ─── Authorization ─────────────────────────────────────────────────────────
// Every export here used to take `restaurantId` as a parameter with NO session
// check at all — and because each export of a "use server" module is a public
// POST endpoint, that let anyone read any restaurant's revenue, orders and
// bill totals just by passing an id (which is public: it's in every table's QR
// URL). Now the id is derived from the session and never accepted from callers.
//
// The cached inner functions below stay private and still take restaurantId,
// for two reasons:
//   1. unstable_cache may not read cookies()/headers() — a dynamic data source
//      inside it throws — so the session MUST be resolved outside the cache.
//   2. unstable_cache folds the wrapped function's arguments into its cache
//      key, so keeping restaurantId as an argument keeps the cache correctly
//      partitioned per tenant instead of serving one restaurant's numbers to
//      the next.
// Reads throw on failure; the dashboard pages already wrap these in .catch().

async function tenantId(allowedRoles: readonly string[]): Promise<string> {
  const auth = await requireTenant(allowedRoles);
  if (!auth.ok) throw new Error(auth.error);
  return auth.session.restaurantId;
}

// ─── Types ─────────────────────────────────────────────────────────────────
export type DashboardStats = {
  totalOrders: number;
  todayOrders: number;
  todayRevenue: number;
  activeTables: number;
  totalTables: number;
  pendingOrders: number;
  occupiedTables: number;
  availableTables: number;
};

export type RecentOrder = {
  id: string;
  orderId: string;
  status: string;
  totalAmount: number;
  createdAt: Date;
  table: { tableNumber: number } | null;
};

export type ChartPoint = { date: string; revenue: number };
export type TopItem    = { name: string; orders: number; revenue: number; percentage: number; isVeg: boolean };
export type Activity   = { id: string; type: "order" | "payment" | "cancelled"; title: string; time: Date };
export type TableOverviewItem = { id: string; tableNumber: number; status: string };
export type Transaction = {
  id: string;
  billNumber: string;
  orderId: string | null;
  tableNumber: number | null;
  totalAmount: number;
  taxAmount: number;
  paymentMethod: string;
  status: string;
  date: Date;
};

// ─── 1. Dashboard Stats ────────────────────────────────────────────────────
// Cached for 60 s — avoids recalculating aggregate counts on every navigation.
const dashboardStats = unstable_cache(
  async (restaurantId: string): Promise<DashboardStats> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // All counts run in a single Promise.all — no sequential waterfall.
    // totalTables was previously fetched AFTER the parallel block (bug).
    const [
      totalOrders,
      todayOrders,
      activeTables,
      totalTables,
      pendingOrders,
      todayRevenueAgg,
    ] = await Promise.all([
      prisma.order.count({ where: { restaurantId } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: today } } }),
      prisma.restaurantTable.count({
        where: { restaurantId, status: { not: "AVAILABLE" } },
      }),
      prisma.restaurantTable.count({ where: { restaurantId } }),
      prisma.order.count({
        where: { restaurantId, status: { in: ["PENDING", "PREPARING"] } },
      }),
      prisma.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: today },
          status: { not: "CANCELLED" },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOrders,
      todayOrders,
      todayRevenue: todayRevenueAgg._sum.totalAmount ?? 0,
      activeTables,
      totalTables,
      pendingOrders,
      occupiedTables: activeTables,
      availableTables: totalTables - activeTables,
    };
  },
  ["dashboard-stats"],
  { revalidate: 60 }
);

export async function getDashboardStats(): Promise<DashboardStats> {
  return dashboardStats(await tenantId(OWNER_ROLES));
}

// ─── 2. Recent Orders — paginated, no N+1 ──────────────────────────────────
// Default limit dropped from 50 → 10. Callers pass page for cursor-based nav.
const recentOrders = cache(
  async (restaurantId: string, limit: number, cursor?: string): Promise<RecentOrder[]> => {
    return prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      // Only fetch the columns the UI actually uses — no items include
      select: {
        id: true,
        orderId: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
      },
    });
  }
);

export async function getRecentOrders(limit = 10, cursor?: string): Promise<RecentOrder[]> {
  return recentOrders(await tenantId(OWNER_ROLES), limit, cursor);
}

// ─── 2b. Full Orders with Items — for the dashboard/orders page ────────────
// Includes items and special requests for the kanban detail view.
const ordersWithItems = cache(
  async (restaurantId: string, limit: number): Promise<any[]> => {
    const orders = await prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: true,
        // `name` is the outlet's own label for the table ("Terrace 2"); the
        // orders board prefers it and falls back to the number.
        table: { select: { tableNumber: true, name: true } },
        bills: { select: { id: true, billNumber: true, totalAmount: true, status: true } },
      },
    });
    return orders;
  }
);

// Reception runs checkout and the orders board, so this one is front-of-house.
export async function getOrdersWithItems(limit = 50): Promise<any[]> {
  return ordersWithItems(await tenantId(FRONT_OF_HOUSE_ROLES), limit);
}

// ─── 3. Revenue Chart — aggregated in DB, not in JS ────────────────────────
// Previously: fetched all matching orders into memory, grouped in JS (O(n)).
// Now: uses groupBy + _sum pushed to the database.
const revenueChartData = unstable_cache(
  async (
    restaurantId: string,
    period: "week" | "month"
  ): Promise<ChartPoint[]> => {
    const days = period === "week" ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Raw SQL via $queryRaw to get date-truncated aggregates in one round-trip.
    // NOTE: uses the mapped physical names (@@map/@map) — table "orders", snake_case columns.
    const rows = await prisma.$queryRaw<{ day: Date; total: number }[]>`
      SELECT
        DATE_TRUNC('day', "created_at") AS day,
        COALESCE(SUM("total_amount"), 0)::float AS total
      FROM "orders"
      WHERE
        "restaurant_id" = ${restaurantId}
        AND "created_at" >= ${startDate}
        AND "status" != 'CANCELLED'
      GROUP BY day
      ORDER BY day ASC
    `;

    // Fill in missing days with 0 so the chart is always continuous.
    const map = new Map(
      rows.map((r) => [r.day.toISOString().split("T")[0], r.total])
    );
    const result: ChartPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      result.push({ date: key, revenue: map.get(key) ?? 0 });
    }
    return result;
  },
  ["revenue-chart"],
  { revalidate: 120 }
);

export async function getRevenueChartData(
  period: "week" | "month" = "week"
): Promise<ChartPoint[]> {
  return revenueChartData(await tenantId(OWNER_ROLES), period);
}

// ─── 4. Top Selling Items ──────────────────────────────────────────────────
// Revenue = SUM(quantity × unit price), joined with menu_items for veg/non-veg.
const topSellingItems = unstable_cache(
  async (restaurantId: string, limit: number): Promise<TopItem[]> => {
    const rows = await prisma.$queryRaw<
      { name: string; orders: number; revenue: number; food_type: string | null }[]
    >`
      SELECT
        oi."menu_item_name" AS name,
        SUM(oi."quantity")::int AS orders,
        SUM(oi."quantity" * oi."price_per_unit")::float AS revenue,
        MAX(mi."food_type") AS food_type
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."order_id"
      LEFT JOIN "menu_items" mi ON mi."id" = oi."menu_item_id"
      WHERE o."restaurant_id" = ${restaurantId}
        AND o."status" != 'CANCELLED'
      GROUP BY oi."menu_item_name"
      ORDER BY orders DESC
      LIMIT ${limit}
    `;

    const maxOrders = rows[0]?.orders ?? 1;

    return rows.map((row) => ({
      name:       row.name,
      orders:     row.orders,
      revenue:    row.revenue,
      percentage: Math.round((row.orders / maxOrders) * 100),
      isVeg:      row.food_type !== "NON_VEG",
    }));
  },
  ["top-items"],
  { revalidate: 120 }
);

export async function getTopSellingItems(limit = 5): Promise<TopItem[]> {
  return topSellingItems(await tenantId(OWNER_ROLES), limit);
}

// ─── 4b. Table Overview — real per-table numbers + status for the Home grid ─
// The Home page's "Table Overview" grid used to render N generic squares
// (occupiedTables red, rest green) with no link to which physical table was
// occupied. This returns the actual tables so the grid can show real numbers.
const tableOverview = cache(
  async (restaurantId: string): Promise<TableOverviewItem[]> => {
    return prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { tableNumber: "asc" },
      select: { id: true, tableNumber: true, status: true },
    });
  }
);

export async function getTableOverview(): Promise<TableOverviewItem[]> {
  return tableOverview(await tenantId(FRONT_OF_HOUSE_ROLES));
}

// ─── 5. Recent Activity — single query, interleaved in DB ──────────────────
const recentActivity = cache(
  async (restaurantId: string, limit: number): Promise<Activity[]> => {
    // Fetch orders and bills in parallel — already optimal.
    const [orders, bills] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderId: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.bill.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { billNumber: true, totalAmount: true, createdAt: true },
      }),
    ]);

    const activities: Activity[] = [
      ...orders.map((o) => ({
        id:    `o-${o.id}`,
        type:  (o.status === "CANCELLED" ? "cancelled" : "order") as Activity["type"],
        title: o.status === "CANCELLED"
          ? `Order ${o.orderId} cancelled`
          : `Order ${o.orderId} placed`,
        time:  o.createdAt,
      })),
      ...bills.map((b) => ({
        id:    `b-${b.billNumber}`,
        type:  "payment" as Activity["type"],
        title: `Bill ${b.billNumber} paid — NPR ${b.totalAmount.toLocaleString()}`,
        time:  b.createdAt,
      })),
    ];

    return activities
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, limit);
  }
);

export async function getRecentActivity(limit = 5): Promise<Activity[]> {
  return recentActivity(await tenantId(OWNER_ROLES), limit);
}

// ─── 6. Transaction History — recent bills with amount, VAT, method, status ─
const recentTransactions = cache(
  async (restaurantId: string, limit: number): Promise<Transaction[]> => {
    const bills = await prisma.bill.findMany({
      where: { restaurantId },
      orderBy: { billDate: "desc" },
      take: limit,
      select: {
        id: true,
        billNumber: true,
        totalAmount: true,
        taxAmount: true,
        paymentMethod: true,
        status: true,
        billDate: true,
        settledAt: true,
        order: { select: { orderId: true, table: { select: { tableNumber: true } } } },
      },
    });

    return bills.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      orderId: b.order?.orderId ?? null,
      tableNumber: b.order?.table?.tableNumber ?? null,
      totalAmount: b.totalAmount,
      taxAmount: b.taxAmount,
      paymentMethod: b.paymentMethod,
      status: b.status,
      date: b.settledAt ?? b.billDate,
    }));
  }
);

export async function getRecentTransactions(limit = 10): Promise<Transaction[]> {
  return recentTransactions(await tenantId(OWNER_ROLES), limit);
}
