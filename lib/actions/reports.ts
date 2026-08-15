"use server";

import prisma from "@/lib/prisma";
import { requireTenant, OWNER_ROLES } from "@/lib/auth-tenant";
import { chartColor, paymentColor } from "@/lib/constants";

// Every export here took the target `restaurantId` as its first argument behind
// a bare `if (!session)`. That authenticates without authorizing: a restaurant
// id is public (it is printed on every table QR sticker), so any signed-in user
// of any outlet -- a waiter included -- could read another restaurant's full
// revenue, item mix, per-waiter takings and VAT return by passing its id to
// these endpoints. Every "use server" export is a public POST endpoint.
//
// This is the same fix lib/actions/settings.ts already carries. The leading
// `_restaurantId` parameter is kept and ignored so the existing call sites
// compile; they all passed their own session's restaurant anyway. Reports are
// owner-level, hence OWNER_ROLES rather than FRONT_OF_HOUSE_ROLES.

function getDateRange(period: string, startDate?: string, endDate?: string) {
  const now = new Date();
  let start: Date;
  const end = new Date(now);

  switch (period) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week": {
      const dayOfWeek = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    }
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        return { start, end: e };
      }
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * The equally-long window immediately before `range`, for period-on-period
 * comparison. Derived from the range's own span so it works for every preset
 * and for a custom range.
 */
function previousRange(range: { start: Date; end: Date }) {
  const span = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - span - 1),
    end: new Date(range.start.getTime() - 1),
  };
}

export async function getSalesReport(
  _restaurantId: string | undefined,
  period: string,
  startDate?: string,
  endDate?: string,
) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const { start, end } = getDateRange(period, startDate, endDate);

    // Orders and bills for the period are independent — one round-trip, not two.
    const [orders, bills] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: start, lte: end },
          status: { notIn: ["CANCELLED", "VOIDED"] },
        },
        include: { items: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.bill.findMany({
        where: {
          restaurantId,
          billDate: { gte: start, lte: end },
          status: { notIn: ["VOIDED"] },
        },
        select: { paymentMethod: true, totalAmount: true },
      }),
    ]);

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalDiscount = orders.reduce((sum, o) => sum + o.discountAmount, 0);
    const totalTax = orders.reduce((sum, o) => sum + o.taxAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const paymentMethodMap = new Map<string, number>();
    for (const bill of bills) {
      const method = bill.paymentMethod || "CASH";
      paymentMethodMap.set(method, (paymentMethodMap.get(method) || 0) + bill.totalAmount);
    }
    const totalBillAmount = Array.from(paymentMethodMap.values()).reduce((a, b) => a + b, 0);
    const paymentMethodBreakdown = Array.from(paymentMethodMap.entries()).map(([name, value]) => ({
      name,
      value: totalBillAmount > 0 ? Math.round((value / totalBillAmount) * 100) : 0,
      color: getPaymentColor(name),
    }));

    const typeMap = new Map<string, number>();
    for (const o of orders) {
      typeMap.set(o.orderType, (typeMap.get(o.orderType) || 0) + o.totalAmount);
    }
    const orderTypeBreakdown = Array.from(typeMap.entries()).map(([name, value]) => ({
      name,
      pct: totalRevenue > 0 ? Math.round((value / totalRevenue) * 100) : 0,
    }));

    const itemMap = new Map<string, { name: string; category: string; orders: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const existing = itemMap.get(item.menuItemId) || {
          name: item.menuItemName, category: "", orders: 0, revenue: 0,
        };
        existing.orders += item.quantity;
        existing.revenue += item.quantity * item.pricePerUnit;
        itemMap.set(item.menuItemId, existing);
      }
    }
    const topSellingItems = Array.from(itemMap.entries())
      .map(([_, data]) => data)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    const hourlyMap = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const hour = `${o.createdAt.getHours().toString().padStart(2, "0")}:00`;
      const existing = hourlyMap.get(hour) || { orders: 0, revenue: 0 };
      existing.orders += 1;
      existing.revenue += o.totalAmount;
      hourlyMap.set(hour, existing);
    }
    const hourlyData = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    const revenueMap = new Map<string, number>();
    for (const o of orders) {
      const dateStr = o.createdAt.toISOString().split("T")[0];
      revenueMap.set(dateStr, (revenueMap.get(dateStr) || 0) + o.totalAmount);
    }
    const revenueData = Array.from(revenueMap.entries())
      .map(([date, revenue]) => ({ date, revenue, lastRevenue: 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      data: {
        totalRevenue,
        totalOrders,
        totalDiscount,
        totalTax,
        averageOrderValue,
        paymentMethodBreakdown,
        orderTypeBreakdown,
        topSellingItems,
        hourlyData,
        revenueData,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load sales report" };
  }
}

export async function getItemReport(_restaurantId: string | undefined, period: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const range = getDateRange(period);
    const prior = previousRange(range);

    // OrderItem denormalises the item name but not its category, so the
    // category has to come from the menu. This used to be hardcoded to "" for
    // every row, which made the "Revenue by Category" pie a single 100%
    // "Uncategorized" slice on every restaurant - a chart that could never say
    // anything. The prior-period rollup is what makes `trend` real (see below).
    const [orders, priorOrders, menuItems] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: range.start, lte: range.end },
          status: { notIn: ["CANCELLED", "VOIDED"] },
        },
        include: { items: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: prior.start, lte: prior.end },
          status: { notIn: ["CANCELLED", "VOIDED"] },
        },
        select: { items: { select: { menuItemId: true, quantity: true } } },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId },
        select: { id: true, category: { select: { name: true } } },
      }),
    ]);

    const categoryOf = new Map(menuItems.map((m) => [m.id, m.category?.name ?? ""]));

    const priorQty = new Map<string, number>();
    for (const order of priorOrders) {
      for (const item of order.items) {
        priorQty.set(item.menuItemId, (priorQty.get(item.menuItemId) ?? 0) + item.quantity);
      }
    }

    const itemMap = new Map<string, {
      id: string; name: string; category: string;
      orders: number; revenue: number; quantity: number;
    }>();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = itemMap.get(item.menuItemId) || {
          id: item.menuItemId,
          name: item.menuItemName,
          category: categoryOf.get(item.menuItemId) ?? "",
          orders: 0, revenue: 0, quantity: 0,
        };
        existing.orders += 1;
        existing.quantity += item.quantity;
        existing.revenue += item.quantity * item.pricePerUnit;
        itemMap.set(item.menuItemId, existing);
      }
    }

    const items = Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue);

    // `trend` used to be `i < items.length / 2 ? "up" : "down"`, i.e. the top
    // half of the table always showed a green up arrow and the bottom half a red
    // down arrow. That is the sort order redrawn as an arrow, not a trend, and it
    // claimed a dish was declining purely for ranking below the median. It is
    // now units sold this period against the same span immediately before, and
    // "flat" is a real third outcome (including a dish with no prior sales to
    // compare against).
    const trendFor = (item: { id: string; quantity: number }) => {
      const before = priorQty.get(item.id);
      if (before == null || before === 0) return "flat";
      if (item.quantity > before) return "up";
      if (item.quantity < before) return "down";
      return "flat";
    };

    const topItems = items.slice(0, 10).map((item, i) => ({
      rank: i + 1,
      name: item.name,
      category: item.category || "Uncategorized",
      orders: item.orders,
      revenue: item.revenue,
      trend: trendFor(item),
    }));

    const leastItems = items.slice(-5).reverse().map((item, i) => ({
      rank: Math.max(1, items.length - 4) + i,
      name: item.name,
      category: item.category || "Uncategorized",
      orders: item.orders,
      revenue: item.revenue,
    }));

    const catMap = new Map<string, number>();
    for (const item of items) {
      const cat = item.category || "Uncategorized";
      catMap.set(cat, (catMap.get(cat) || 0) + item.revenue);
    }
    const totalCatRevenue = Array.from(catMap.values()).reduce((a, b) => a + b, 0);
    const categoryData = Array.from(catMap.entries()).map(([name, value]) => ({
      name,
      value: totalCatRevenue > 0 ? Math.round((value / totalCatRevenue) * 100) : 0,
    }));

    const categoryColors = categoryData.map((_, i) => chartColor(i));

    return { data: { topItems, leastItems, categoryData, categoryColors } };
  } catch (err: any) {
    return { error: err?.message || "Failed to load item report" };
  }
}

export async function getStaffReport(_restaurantId: string | undefined, period: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const { start, end } = getDateRange(period);

    // Staff roster and order rollup are independent — fetch together.
    const [staff, orders] = await Promise.all([
      prisma.staff.findMany({
        where: { restaurantId, isActive: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          assignedWaiterId: { not: null },
          createdAt: { gte: start, lte: end },
          status: { notIn: ["CANCELLED", "VOIDED"] },
        },
        select: { assignedWaiterId: true, totalAmount: true },
      }),
    ]);

    const staffMap = new Map<string, { name: string; ordersHandled: number; revenue: number }>();
    for (const s of staff) {
      staffMap.set(s.id, {
        name: `${s.firstName} ${s.lastName}`.trim() || s.firstName,
        ordersHandled: 0, revenue: 0,
      });
    }

    for (const o of orders) {
      if (!o.assignedWaiterId) continue;
      const existing = staffMap.get(o.assignedWaiterId);
      if (existing) {
        existing.ordersHandled += 1;
        existing.revenue += o.totalAmount;
      }
    }

    // There is no `rating` anywhere in the schema. This used to return
    // `+(4.0 + Math.random()).toFixed(1)`, which the page rendered next to a
    // filled star as that waiter's performance rating - a fabricated number in
    // a table an owner reads to decide who is carrying a shift, and one that
    // changed on every refresh. Removed rather than replaced: the honest fix is
    // to collect real ratings first. The three columns that remain are measured.
    const staffData = Array.from(staffMap.values())
      .map((s) => ({
        ...s,
        avgOrderValue: s.ordersHandled > 0 ? Math.round(s.revenue / s.ordersHandled) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return { data: staffData };
  } catch (err: any) {
    return { error: err?.message || "Failed to load staff report" };
  }
}

export async function getTaxReport(_restaurantId: string | undefined, period: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const { start, end } = getDateRange(period);

    const bills = await prisma.bill.findMany({
      where: {
        restaurantId,
        billDate: { gte: start, lte: end },
        status: { notIn: ["VOIDED"] },
      },
      select: { subtotal: true, taxAmount: true, totalAmount: true, billDate: true },
    });

    const totalTaxable = bills.reduce((sum, b) => sum + b.subtotal, 0);
    const totalVAT = bills.reduce((sum, b) => sum + b.taxAmount, 0);
    const netRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);

    const monthMap = new Map<string, { taxable: number; vat: number }>();
    for (const bill of bills) {
      const monthKey = `${bill.billDate.getFullYear()}-${String(bill.billDate.getMonth() + 1).padStart(2, "0")}`;
      const existing = monthMap.get(monthKey) || { taxable: 0, vat: 0 };
      existing.taxable += bill.subtotal;
      existing.vat += bill.taxAmount;
      monthMap.set(monthKey, existing);
    }
    const monthlyVATData = Array.from(monthMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { data: { totalTaxable, totalVAT, netRevenue, monthlyVATData } };
  } catch (err: any) {
    return { error: err?.message || "Failed to load tax report" };
  }
}

function getPaymentColor(method: string): string {
  return paymentColor(method);
}
