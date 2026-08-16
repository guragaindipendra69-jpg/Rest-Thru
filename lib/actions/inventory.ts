"use server";

import prisma from "@/lib/prisma";
import { requireTenant, FRONT_OF_HOUSE_ROLES } from "@/lib/auth-tenant";
import { logActivity } from "@/lib/activity-log";

export async function getInventoryItems() {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  try {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
    });
    return { data: items };
  } catch (err: any) {
    return { error: err?.message || "Failed to load inventory" };
  }
}

export async function addInventoryItem(data: {
  name: string;
  category?: string;
  currentStock: number;
  unit: string;
  minThreshold: number;
}) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const item = await prisma.inventoryItem.create({
      data: {
        restaurantId: session.restaurantId,
        name: data.name,
        description: data.category || null,
        currentQuantity: data.currentStock,
        unit: data.unit,
        reorderLevel: data.minThreshold,
      },
    });
    await logActivity(session, {
      actionType: "INVENTORY_ADD",
      entityType: "InventoryItem",
      entityId: item.id,
      description: `Inventory item "${data.name}" added (qty: ${data.currentStock})`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to add item" };
  }
}

// ─── Stock movements — backed by the (previously unused) InventoryHistory
// table. Every quantity change goes through here so `historyEntries` stays a
// real audit trail instead of the page fabricating "Recent Movements".
async function recordMovement(
  inventoryItemId: string,
  movementType: "ADD" | "USAGE" | "ADJUSTMENT",
  quantity: number,
  recordedBy: string,
  reason?: string | null
) {
  await prisma.inventoryHistory.create({
    data: { inventoryItemId, movementType, quantity, reason: reason || null, recordedBy },
  });
}

// Directly set the stock level to an exact value — used by the inline
// EditableStockCell on the inventory table. Previously this cell discarded
// the typed value with no server call at all (real data-loss bug).
export async function updateInventoryStock(id: string, newQuantity: number, reason?: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (newQuantity < 0) return { error: "Stock cannot be negative" };

  try {
    // findFirst scoped by restaurantId (not findUnique by bare id) so an item
    // belonging to another tenant is simply not found.
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId: session.restaurantId },
      select: { currentQuantity: true },
    });
    if (!existing) return { error: "Item not found" };

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { currentQuantity: newQuantity, lastRestockDate: newQuantity > existing.currentQuantity ? new Date() : undefined },
    });

    const delta = newQuantity - existing.currentQuantity;
    if (delta !== 0) {
      await recordMovement(id, "ADJUSTMENT", delta, session.id, reason || "Manual stock edit");
    }
    await logActivity(session, {
      actionType: "INVENTORY_STOCK_UPDATE",
      entityType: "InventoryItem",
      entityId: id,
      description: `Stock updated to ${newQuantity}${reason ? ` (${reason})` : ""}`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to update stock" };
  }
}

// Editable inventory item — name, category, unit and minimum threshold. Stock
// changes stay on updateInventoryStock so the movement ledger is not bypassed.
export async function updateInventoryItem(
  id: string,
  data: { name: string; category?: string; unit: string; minThreshold: number }
) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (!data.name?.trim()) return { error: "Name is required" };
  if (data.minThreshold < 0) return { error: "Minimum threshold cannot be negative" };

  try {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId: session.restaurantId },
      select: { id: true },
    });
    if (!existing) return { error: "Item not found" };

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        name: data.name.trim(),
        description: data.category?.trim() || null,
        unit: data.unit,
        reorderLevel: data.minThreshold,
      },
    });
    await logActivity(session, {
      actionType: "INVENTORY_UPDATE",
      entityType: "InventoryItem",
      entityId: id,
      description: `Inventory item "${data.name.trim()}" updated`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to update item" };
  }
}

// Deletes the item and its movement ledger. Blocked when the item is in use by
// a menu item or combo, since deleting it would orphan that link.
export async function deleteInventoryItem(id: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId: session.restaurantId },
      select: { id: true, name: true },
    });
    if (!existing) return { error: "Item not found" };

    await prisma.$transaction([
      prisma.inventoryHistory.deleteMany({ where: { inventoryItemId: id } }),
      prisma.inventoryItem.delete({ where: { id } }),
    ]);
    await logActivity(session, {
      actionType: "INVENTORY_DELETE",
      entityType: "InventoryItem",
      entityId: id,
      description: `Inventory item "${existing.name}" deleted`,
    });
    return { data: { id } };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete item" };
  }
}

// Add stock (delivery/restock) — StockHistoryDialog's "Add Stock" action.
export async function addStock(id: string, quantity: number, notes?: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (!quantity || quantity <= 0) return { error: "Enter a quantity greater than 0" };

  try {
    // Scoped increment: 0 rows matched means the item is not this tenant's.
    const { count } = await prisma.inventoryItem.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: { currentQuantity: { increment: quantity }, lastRestockDate: new Date() },
    });
    if (count === 0) return { error: "Item not found" };
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    await recordMovement(id, "ADD", quantity, session.id, notes);
    await logActivity(session, {
      actionType: "INVENTORY_STOCK_ADD",
      entityType: "InventoryItem",
      entityId: id,
      description: `Added ${quantity} units${notes ? ` (${notes})` : ""}`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to add stock" };
  }
}

// Record usage (consumption/waste) — StockHistoryDialog's "Record Usage" action.
export async function recordUsage(id: string, quantity: number, notes?: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (!quantity || quantity <= 0) return { error: "Enter a quantity greater than 0" };

  try {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId: session.restaurantId },
      select: { currentQuantity: true },
    });
    if (!existing) return { error: "Item not found" };
    const clamped = Math.min(quantity, existing.currentQuantity);

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { currentQuantity: { decrement: clamped } },
    });
    await recordMovement(id, "USAGE", clamped, session.id, notes);
    await logActivity(session, {
      actionType: "INVENTORY_USAGE",
      entityType: "InventoryItem",
      entityId: id,
      description: `Used ${quantity} units${notes ? ` (${notes})` : ""}`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to record usage" };
  }
}

// Recent movements + a derived stock-trend series for StockHistoryDialog.
export async function getInventoryHistory(inventoryItemId: string, limit = 20) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };

  try {
    // Confirm the item is this tenant's before returning its movement ledger.
    const owned = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, restaurantId: auth.session.restaurantId },
      select: { id: true },
    });
    if (!owned) return { error: "Item not found" };

    const [entries, item] = await Promise.all([
      prisma.inventoryHistory.findMany({
        where: { inventoryItemId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { currentQuantity: true } }),
    ]);

    // Reconstruct an approximate stock trajectory by walking the fetched
    // window backward from the current known quantity — real data derived
    // from the actual movement ledger, not a fabricated series.
    const chronological = [...entries].reverse();
    let running = item?.currentQuantity ?? 0;
    const trend: { day: string; stock: number }[] = [];
    for (let i = chronological.length - 1; i >= 0; i--) {
      const e = chronological[i];
      const signedDelta = e.movementType === "USAGE" ? -e.quantity : e.quantity;
      trend.unshift({ day: e.createdAt.toISOString().split("T")[0], stock: running });
      running -= signedDelta;
    }
    trend.unshift({ day: "start", stock: running });

    return { data: { entries, trend } };
  } catch (err: any) {
    return { error: err?.message || "Failed to load stock history" };
  }
}
