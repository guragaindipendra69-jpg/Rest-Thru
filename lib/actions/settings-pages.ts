"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logActivity } from "./logs";

/** Data for the smaller Settings pages: Activity Log, Users Role, Trash, Support. */

export async function getActivityLogPage(filters?: {
  actionType?: string;
  query?: string;
  limit?: number;
}) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const where: any = { restaurantId: session.restaurantId };
    if (filters?.actionType && filters.actionType !== "ALL") {
      where.actionType = filters.actionType;
    }
    if (filters?.query) {
      where.description = { contains: filters.query, mode: "insensitive" };
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters?.limit ?? 100,
    });

    // activityLog.userId has no relation, so names are resolved in one extra
    // query rather than N joins.
    const userIds = Array.from(new Set(logs.map((l) => l.userId).filter(Boolean)));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const byId = new Map(
      users.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username || "—",
      ])
    );

    const types = Array.from(new Set(logs.map((l) => l.actionType))).sort();

    return {
      data: {
        logs: logs.map((l) => ({ ...l, performedBy: byId.get(l.userId) ?? "—" })),
        actionTypes: types,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load activity log" };
  }
}

/** Roles in use, with the members holding each. */
export async function getUsersAndRoles() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const [users, staff] = await Promise.all([
      prisma.user.findMany({
        where: { restaurantId: session.restaurantId },
        select: {
          id: true, firstName: true, lastName: true, username: true,
          email: true, role: true, isActive: true, lastLoginAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.staff.findMany({
        where: { restaurantId: session.restaurantId, isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true, status: true },
      }),
    ]);

    // Roles the app actually authorises against, so the page shows a complete
    // set even when nobody holds one yet.
    const KNOWN_ROLES = [
      "RESTAURANT_OWNER", "MANAGER", "RECEPTIONIST", "WAITER", "KITCHEN", "STAFF",
    ];
    const counts = new Map<string, number>(KNOWN_ROLES.map((r) => [r, 0]));
    for (const u of users) {
      counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    }

    return {
      data: {
        roles: Array.from(counts.entries()).map(([role, count]) => ({ role, count })),
        users,
        staff,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load users and roles" };
  }
}

export async function setUserActive(userId: string, isActive: boolean) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    // Scoped to this restaurant so one owner can't disable another's staff.
    const target = await prisma.user.findFirst({
      where: { id: userId, restaurantId: session.restaurantId },
      select: { id: true, username: true, role: true },
    });
    if (!target) return { error: "User not found" };
    if (target.id === session.id) {
      return { error: "You can't deactivate your own account." };
    }

    await prisma.user.update({ where: { id: userId }, data: { isActive } });
    await logActivity(session, {
      actionType: "USER_STATUS",
      entityType: "User",
      entityId: userId,
      description: `${target.username} ${isActive ? "activated" : "deactivated"} by ${session.username}`,
    });
    return { data: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update user" };
  }
}

/**
 * Trash: things that were voided or cancelled rather than hard-deleted.
 *
 * The app has no soft-delete column yet, so this lists the records that *do*
 * carry a void/cancel trail — voided bills and cancelled orders — instead of
 * pretending to be a general-purpose recycle bin.
 */
export async function getTrashItems(filter: "ALL" | "VOID_INVOICE" = "ALL") {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const bills = await prisma.bill.findMany({
      where: { restaurantId: session.restaurantId, status: "VOID" },
      orderBy: { voidedAt: "desc" },
      take: 100,
      select: {
        id: true, billNumber: true, totalAmount: true,
        voidedAt: true, voidedBy: true, voidReason: true,
      },
    });

    const orders =
      filter === "VOID_INVOICE"
        ? []
        : await prisma.order.findMany({
            where: { restaurantId: session.restaurantId, status: "CANCELLED" },
            orderBy: { voidedAt: "desc" },
            take: 100,
            select: {
              id: true, orderId: true, totalAmount: true,
              voidedAt: true, voidedBy: true, voidReason: true, updatedAt: true,
            },
          });

    const actorIds = Array.from(
      new Set([...bills, ...orders].map((r: any) => r.voidedBy).filter(Boolean))
    ) as string[];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const nameById = new Map(
      actors.map((a) => [
        a.id,
        [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.username || "—",
      ])
    );

    return {
      data: [
        ...bills.map((b) => ({
          id: b.id,
          particular: b.billNumber,
          type: "Void Invoice",
          amount: b.totalAmount,
          deletedAt: b.voidedAt,
          deletedBy: b.voidedBy ? nameById.get(b.voidedBy) ?? "—" : "—",
          remarks: b.voidReason ?? "",
        })),
        ...orders.map((o: any) => ({
          id: o.id,
          particular: `Order ${o.orderId}`,
          type: "Cancelled Order",
          amount: o.totalAmount,
          deletedAt: o.voidedAt ?? o.updatedAt,
          deletedBy: o.voidedBy ? nameById.get(o.voidedBy) ?? "—" : "—",
          remarks: o.voidReason ?? "",
        })),
      ].sort(
        (a, b) =>
          new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime()
      ),
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load trash" };
  }
}

export async function getSupportTickets() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { restaurantId: session.restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, subject: true, message: true, status: true, createdAt: true,
      },
    });
    return { data: tickets };
  } catch (err: any) {
    return { error: err?.message || "Failed to load support tickets" };
  }
}

export async function createSupportTicket(data: { subject: string; message: string }) {
  const session = await getSession();
  if (!session?.restaurantId || !session.id) return { error: "Not authenticated" };
  if (!data.subject?.trim()) return { error: "A subject is required" };
  if (!data.message?.trim()) return { error: "A message is required" };

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        subject: data.subject.trim(),
        message: data.message.trim(),
      },
      select: { id: true, subject: true, status: true, createdAt: true, message: true },
    });
    return { data: ticket };
  } catch (err: any) {
    return { error: err?.message || "Failed to create ticket" };
  }
}

/** Plan usage counters for Billing & Subscription. */
export async function getBillingUsage() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  const restaurantId = session.restaurantId;

  try {
    const [members, tables, dishes, customers, spaces, sub] = await Promise.all([
      prisma.user.count({ where: { restaurantId } }),
      prisma.restaurantTable.count({ where: { restaurantId } }),
      prisma.menuItem.count({ where: { restaurantId } }),
      prisma.customer.count({ where: { restaurantId } }),
      prisma.space.count({ where: { restaurantId } }),
      prisma.subscription.findFirst({
        where: { restaurantId, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Limits come from the plan when one is active; 0 renders as unlimited.
    const p: any = sub?.plan ?? {};
    return {
      data: {
        members, tables, dishes, customers, spaces,
        limits: {
          members: p.maxStaff ?? 0,
          tables: p.maxTables ?? 0,
          dishes: p.maxMenuItems ?? 0,
          customers: 0,
          spaces: 0,
        },
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load usage" };
  }
}
