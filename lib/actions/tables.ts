"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkResourceLimit, limitMessage } from "@/lib/plan-guard";
import { logActivity } from "@/lib/activity-log";

// `restaurantId` is still accepted so existing call sites keep working, but it
// is deliberately ignored. Every export of a "use server" module is a public
// POST endpoint and a restaurant's id is printed on every table QR, so trusting
// the argument let any signed-in user list another outlet's tables. The session
// is the only source of truth.
export async function getTables(_restaurantId?: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId: session.restaurantId },
      orderBy: { tableNumber: "asc" },
    });
    return { data: tables };
  } catch (err: any) {
    return { error: err?.message || "Failed to load tables" };
  }
}

export async function addTable(data: {
  // Accepted for call-site compatibility only — the row is always created under
  // the session's own restaurant (see the create below).
  restaurantId?: string;
  tableNumber: number;
  name?: string;
  capacity: number;
  shape: string;
  space: string;
  positionX: number;
  positionY: number;
}) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };

  // Enforce the plan's table cap before inserting.
  const limitReached = await checkResourceLimit(session.restaurantId, "tables");
  if (limitReached) return { error: limitMessage(limitReached), limitReached };

  try {
    const table = await prisma.restaurantTable.create({
      data: {
        // Always create under the caller's own restaurant
        restaurantId: session.restaurantId,
        tableNumber: data.tableNumber,
        name: data.name || null,
        capacity: data.capacity,
        shape: data.shape,
        space: data.space,
        positionX: data.positionX,
        positionY: data.positionY,
      },
    });
    await logActivity(session, {
      actionType: "TABLE_ADD",
      entityType: "RestaurantTable",
      entityId: table.id,
      description: `Table "${table.name || table.tableNumber}" added`,
    });
    return { data: { id: table.id } };
  } catch (err: any) {
    if (err?.code === "P2002") {
      return { error: `Table ${data.tableNumber} already exists` };
    }
    return { error: err?.message || "Failed to add table" };
  }
}

/**
 * Edit an existing table's details. Every field is optional so the detail sheet
 * can patch just what changed, and `tableNumber` collisions surface as a
 * friendly message rather than a raw P2002.
 */
export async function updateTable(
  id: string,
  data: {
    tableNumber?: number;
    name?: string | null;
    capacity?: number;
    shape?: string;
    space?: string;
  }
) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };

  const patch: Record<string, unknown> = {};
  if (data.tableNumber != null && Number.isFinite(data.tableNumber)) {
    if (data.tableNumber < 1) return { error: "Table number must be 1 or more" };
    patch.tableNumber = Math.trunc(data.tableNumber);
  }
  if (data.name !== undefined) patch.name = data.name?.trim() || null;
  if (data.capacity != null && Number.isFinite(data.capacity)) {
    if (data.capacity < 1) return { error: "Capacity must be at least 1 seat" };
    patch.capacity = Math.trunc(data.capacity);
  }
  if (data.shape) patch.shape = data.shape;
  // Empty means "no space", which is a real value here — not a missing field —
  // so this cannot be a truthiness check or a table could never be unassigned.
  if (data.space !== undefined) patch.space = data.space;
  if (Object.keys(patch).length === 0) return { success: true };

  try {
    const result = await prisma.restaurantTable.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: patch,
    });
    if (result.count === 0) return { error: "Table not found" };
    await logActivity(session, {
      actionType: "TABLE_UPDATE",
      entityType: "RestaurantTable",
      entityId: id,
      description: `Table "${patch.name || patch.tableNumber || id}" updated`,
    });
    return { success: true };
  } catch (err: any) {
    if (err?.code === "P2002") {
      return { error: `Table ${data.tableNumber} already exists` };
    }
    return { error: err?.message || "Failed to update table" };
  }
}

// `status` is a plain String column with no database enum behind it, and this
// action is a public POST endpoint that used to write the caller's string
// straight through. A single lowercase "reserved" reached the live data that
// way, and it desynced two widgets on the owner dashboard: the legend counts
// tables by comparing against the uppercase names, so the row fell out of all
// three buckets, while the stat card counts `status != "AVAILABLE"` and so read
// it as occupied. The dashboard showed "1 occupied" beside "0 Occupied".
//
// Normalising here rather than at each call site keeps the column canonical
// whatever the caller sends, and the allowlist means an unknown status is a
// rejected request instead of a row no view can account for.
const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED"] as const;

export async function updateTableStatus(id: string, status: string) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };

  const normalized = String(status || "").trim().toUpperCase();
  if (!TABLE_STATUSES.includes(normalized as (typeof TABLE_STATUSES)[number])) {
    return { error: `Invalid table status. Expected one of: ${TABLE_STATUSES.join(", ")}` };
  }

  try {
    const result = await prisma.restaurantTable.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: { status: normalized },
    });
    if (result.count === 0) return { error: "Table not found" };
    await logActivity(session, {
      actionType: "TABLE_STATUS_UPDATE",
      entityType: "RestaurantTable",
      entityId: id,
      description: `Table status updated to ${normalized}`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update table status" };
  }
}

export async function updateTablePosition(id: string, x: number, y: number) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };

  try {
    const result = await prisma.restaurantTable.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: { positionX: x, positionY: y },
    });
    if (result.count === 0) return { error: "Table not found" };
    await logActivity(session, {
      actionType: "TABLE_POSITION_UPDATE",
      entityType: "RestaurantTable",
      entityId: id,
      description: `Table position updated`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update table position" };
  }
}

export async function deleteTable(id: string) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };

  try {
    // Don't delete a table that still has orders attached — history would break
    const hasOrders = await prisma.order.findFirst({
      where: { tableId: id },
      select: { id: true },
    });
    if (hasOrders) {
      return { error: "This table has order history. Mark it unavailable instead of deleting." };
    }

    const result = await prisma.restaurantTable.deleteMany({
      where: { id, restaurantId: session.restaurantId },
    });
    if (result.count === 0) return { error: "Table not found" };
    await logActivity(session, {
      actionType: "TABLE_DELETE",
      entityType: "RestaurantTable",
      entityId: id,
      description: `Table deleted`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete table" };
  }
}
