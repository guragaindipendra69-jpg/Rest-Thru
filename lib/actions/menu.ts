"use server";

import prisma from "@/lib/prisma";
import { checkResourceLimit, limitMessage } from "@/lib/plan-guard";
import {
  requireTenant,
  ALL_TENANT_ROLES,
  FRONT_OF_HOUSE_ROLES,
} from "@/lib/auth-tenant";
import { logActivity } from "./logs";

// Every action here derives restaurantId from the session, never from the
// caller. `restaurantId` parameters are still accepted at the call sites that
// already pass one, but they are ignored — see lib/auth-tenant.ts for why a
// caller-supplied tenant id is not a credential. Menu editing is front-of-house
// only; waiters may read the menu (their order station lists it) but not write.
//
// Mutations that take a bare row id run through updateMany/deleteMany with
// restaurantId in the WHERE, so a foreign id matches zero rows instead of
// deleting or repricing another outlet's dish.

export async function addCategory(data: {
  name: string;
  nameNp?: string;
  emoji?: string;
  imageUrl?: string;
  sortOrder?: number;
  active?: boolean;
  restaurantId?: string;
}) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  const name = data.name?.trim();
  if (!name) return { error: "Category name is required" };

  try {
    const result: { id: string }[] = await prisma.$queryRaw`
      INSERT INTO categories (id, restaurant_id, name, image_url, display_order, is_active, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${session.restaurantId}, ${name}, ${data.imageUrl ?? null}, ${data.sortOrder || 0}, ${data.active ?? true}, now(), now())
      RETURNING id
    `;
    await logActivity(session, {
      actionType: "CATEGORY_ADD",
      entityType: "Category",
      entityId: result[0].id,
      description: `Category "${name}" added`,
    });
    return { data: { id: result[0].id } };
  } catch (err: any) {
    return { error: err?.message || "Database error" };
  }
}

export async function updateCategory(
  id: string,
  data: {
    name: string;
    nameNp?: string;
    emoji?: string;
    imageUrl?: string;
    sortOrder?: number;
    active?: boolean;
  }
) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  const name = data.name?.trim();
  if (!name) return { error: "Category name is required" };

  try {
    // COALESCE keeps the existing image when the caller doesn't supply a new one.
    // The restaurant_id predicate is what makes a foreign id a no-op.
    const rows = await prisma.$executeRaw`
      UPDATE categories
      SET name = ${name}, display_order = ${data.sortOrder || 0}, is_active = ${data.active ?? true},
          image_url = COALESCE(${data.imageUrl ?? null}, image_url)
      WHERE id = ${id} AND restaurant_id = ${session.restaurantId}
    `;
    if (rows === 0) return { error: "Category not found" };
    await logActivity(session, {
      actionType: "CATEGORY_UPDATE",
      entityType: "Category",
      entityId: id,
      description: `Category "${name}" updated`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Database error" };
  }
}

export async function deleteCategory(id: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    // Deleting a category the guest menu still groups dishes under would leave
    // those dishes unreachable, so say so instead of orphaning them.
    const dishes = await prisma.menuItem.count({
      where: { categoryId: id, restaurantId: session.restaurantId },
    });
    if (dishes > 0) {
      return {
        error: `This category still holds ${dishes} dish${dishes === 1 ? "" : "es"}. Move or delete them first.`,
      };
    }

    const rows = await prisma.$executeRaw`
      DELETE FROM categories WHERE id = ${id} AND restaurant_id = ${session.restaurantId}
    `;
    if (rows === 0) return { error: "Category not found" };
    await logActivity(session, {
      actionType: "CATEGORY_DELETE",
      entityType: "Category",
      entityId: id,
      description: `Category deleted`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Database error" };
  }
}

export async function toggleCategoryActive(id: string, active: boolean) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const rows = await prisma.$executeRaw`
      UPDATE categories SET is_active = ${active}
      WHERE id = ${id} AND restaurant_id = ${session.restaurantId}
    `;
    if (rows === 0) return { error: "Category not found" };
    await logActivity(session, {
      actionType: active ? "CATEGORY_ACTIVATE" : "CATEGORY_DEACTIVATE",
      entityType: "Category",
      entityId: id,
      description: `Category ${active ? "activated" : "deactivated"}`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Database error" };
  }
}

// ── Menu Items ──────────────────────────────────────────────────────────────

export async function getMenuItems(
  _restaurantId?: string,
  opts?: { availableOnly?: boolean }
) {
  // Reading the menu is allowed for every tenant role — the waiter order
  // station lists it too. Writing is front-of-house only (see below).
  const auth = await requireTenant(ALL_TENANT_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const items = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        ...(opts?.availableOnly ? { isAvailable: true } : {}),
      },
      include: { addOns: true },
      orderBy: { createdAt: "desc" },
    });

    const orderCounts = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      _sum: { quantity: true },
      where: {
        menuItem: { restaurantId },
      },
    });

    const countMap = new Map(orderCounts.map((c) => [c.menuItemId, c._sum.quantity ?? 0]));

    const itemsWithCounts = items.map((item) => ({
      ...item,
      totalOrders: countMap.get(item.id) ?? 0,
    }));

    return { data: itemsWithCounts };
  } catch (err: any) {
    return { error: err?.message || "Failed to load menu items" };
  }
}

export async function addMenuItem(data: {
  // Accepted for call-site compatibility only — the row is always created under
  // the session's own restaurant.
  restaurantId?: string;
  categoryId: string;
  name: string;
  description?: string | null;
  price: number;
  discountPrice?: number | null;
  menuSection?: string | null;
  itemType?: string;
  foodType?: string;
  subType?: string;
  spiceLevel?: string;
  prepTime?: number;
  isAvailable?: boolean;
  allergens?: string[];
  imageUrl?: string | null;
  temperature?: string | null;
  volume?: number | null;
  sizeOptions?: any;
  kotType?: string | null;
  hsCode?: string | null;
  addOns?: { name: string; price: number }[];
}) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  const name = data.name?.trim();
  if (!name) return { error: "Dish name is required" };
  if (!Number.isFinite(data.price) || data.price < 0) {
    return { error: "Enter a valid price" };
  }

  // The category has to belong to this restaurant, or a foreign categoryId
  // would file our dish under someone else's menu.
  const category = await prisma.category.findFirst({
    where: { id: data.categoryId, restaurantId: session.restaurantId },
    select: { id: true },
  });
  if (!category) return { error: "Pick a category for this dish" };

  // Enforce the plan's menu-item cap before inserting. On the boundary this
  // returns a payload the client uses to open the upgrade popup.
  const limitReached = await checkResourceLimit(session.restaurantId, "menuItems");
  if (limitReached) return { error: limitMessage(limitReached), limitReached };

  try {
    const extras = (data.addOns || []).filter((a) => a.name?.trim());
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: session.restaurantId,
        categoryId: data.categoryId,
        name,
        description: data.description || null,
        price: data.price,
        discountPrice: data.discountPrice || null,
        menuSection: data.menuSection?.trim() || null,
        itemType: (data.itemType || "food").toUpperCase(),
        foodType: (data.foodType || "veg").toUpperCase(),
        subType: (data.subType || "veg").toUpperCase(),
        spiceLevel: (data.spiceLevel || "none").toUpperCase(),
        prepTime: data.prepTime || 15,
        isAvailable: data.isAvailable ?? true,
        allergens: data.allergens || [],
        imageUrl: data.imageUrl || null,
        temperature: data.temperature ? data.temperature.toUpperCase() : null,
        volume: data.volume || null,
        sizeOptions: data.sizeOptions || null,
        kotType: data.kotType?.trim() || null,
        hsCode: data.hsCode?.trim() || null,
        ...(extras.length > 0 && {
          addOns: {
            create: extras.map((a) => ({ name: a.name.trim(), price: a.price || 0 })),
          },
        }),
      },
    });
    await logActivity(session, {
      actionType: "MENU_ITEM_ADD",
      entityType: "MenuItem",
      entityId: item.id,
      description: `Menu item "${item.name}" added`,
    });
    return { data: item };
  } catch (err: any) {
    return { error: err?.message || "Failed to add menu item" };
  }
}

export async function updateMenuItem(id: string, data: Record<string, any>) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const updateData: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      price: "price",
      discountPrice: "discountPrice",
      menuSection: "menuSection",
      categoryId: "categoryId",
      itemType: "itemType",
      foodType: "foodType",
      subType: "subType",
      spiceLevel: "spiceLevel",
      prepTime: "prepTime",
      isAvailable: "isAvailable",
      allergens: "allergens",
      imageUrl: "imageUrl",
      temperature: "temperature",
      volume: "volume",
      sizeOptions: "sizeOptions",
    };
    for (const [key, field] of Object.entries(fieldMap)) {
      if (key in data) {
        let val = data[key];
        if (typeof val === "string" && ["itemType", "foodType", "subType", "spiceLevel", "temperature"].includes(key)) {
          val = val.toUpperCase();
        }
        updateData[field] = val;
      }
    }
    // A categoryId in the patch has to belong to this restaurant too, or an
    // edit could file our dish under a foreign category.
    if (updateData.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: updateData.categoryId, restaurantId: session.restaurantId },
        select: { id: true },
      });
      if (!category) return { error: "Pick a category for this dish" };
    }

    // updateMany, not update: the restaurantId predicate turns a foreign id
    // into zero rows rather than a successful write.
    const { count } = await prisma.menuItem.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: updateData,
    });
    if (count === 0) return { error: "Menu item not found" };
    await logActivity(session, {
      actionType: "MENU_ITEM_UPDATE",
      entityType: "MenuItem",
      entityId: id,
      description: `Menu item "${data.name}" updated`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update menu item" };
  }
}

export async function deleteMenuItem(id: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const { count } = await prisma.menuItem.deleteMany({
      where: { id, restaurantId: session.restaurantId },
    });
    if (count === 0) return { error: "Menu item not found" };
    await logActivity(session, {
      actionType: "MENU_ITEM_DELETE",
      entityType: "MenuItem",
      entityId: id,
      description: `Menu item deleted`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete menu item" };
  }
}

export async function toggleMenuItemAvailable(id: string, isAvailable: boolean) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const { count } = await prisma.menuItem.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: { isAvailable },
    });
    if (count === 0) return { error: "Menu item not found" };
    await logActivity(session, {
      actionType: isAvailable ? "MENU_ITEM_AVAILABLE" : "MENU_ITEM_UNAVAILABLE",
      entityType: "MenuItem",
      entityId: id,
      description: `Menu item ${isAvailable ? "made available" : "marked unavailable"}`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to toggle availability" };
  }
}

// ─── Bulk actions — used by the Menu page's multi-select bulk toolbar ──────
// Availability: flip isAvailable for every selected item in one round-trip.
export async function bulkUpdateItemsAvailable(ids: string[], isAvailable: boolean) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (ids.length === 0) return { error: "No items selected" };

  try {
    const { count } = await prisma.menuItem.updateMany({
      where: { id: { in: ids }, restaurantId: session.restaurantId },
      data: { isAvailable },
    });
    if (count === 0) return { error: "No matching items" };
    await logActivity(session, {
      actionType: isAvailable ? "BULK_AVAILABLE" : "BULK_UNAVAILABLE",
      entityType: "MenuItem",
      entityId: ids.join(","),
      description: `${count} menu items ${isAvailable ? "made available" : "marked unavailable"}`,
    });
    return { success: true, data: { count } };
  } catch (err: any) {
    return { error: err?.message || "Failed to update availability" };
  }
}

// Price: either set every selected item to a fixed price, or adjust each by
// a percentage of its own current price (a seasonal 86 / price-change pass).
// Percent mode can't be expressed as a single `updateMany` (each row needs
// its own current price read), so it runs as a batched transaction instead.
export async function bulkAdjustItemPrices(
  ids: string[],
  mode: "set" | "percent",
  value: number
) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  if (ids.length === 0) return { error: "No items selected" };
  if (!Number.isFinite(value)) return { error: "Enter a number" };

  try {
    let count = 0;
    if (mode === "set") {
      if (value < 0) return { error: "Price cannot be negative" };
      ({ count } = await prisma.menuItem.updateMany({
        where: { id: { in: ids }, restaurantId: session.restaurantId },
        data: { price: value },
      }));
    } else {
      if (value <= -100) return { error: "A cut of 100% or more would zero every price" };
      // Scoped read, so the transaction below can only ever touch our own rows.
      const items = await prisma.menuItem.findMany({
        where: { id: { in: ids }, restaurantId: session.restaurantId },
        select: { id: true, price: true },
      });
      await prisma.$transaction(
        items.map((it) =>
          prisma.menuItem.update({
            where: { id: it.id },
            data: { price: Math.max(0, Math.round(it.price * (1 + value / 100) * 100) / 100) },
          })
        )
      );
      count = items.length;
    }
    if (count === 0) return { error: "No matching items" };
    await logActivity(session, {
      actionType: "BULK_PRICE_ADJUST",
      entityType: "MenuItem",
      entityId: ids.join(","),
      description: `Bulk price ${mode} of ${value} applied to ${count} items`,
    });
    return { success: true, data: { count } };
  } catch (err: any) {
    return { error: err?.message || "Failed to adjust prices" };
  }
}

export async function getCategories(_restaurantId?: string) {
  const auth = await requireTenant(ALL_TENANT_ROLES);
  if (!auth.ok) return { error: auth.error };

  try {
    const cats = await prisma.category.findMany({
      where: { restaurantId: auth.session.restaurantId },
      orderBy: { displayOrder: "asc" },
    });
    return { data: cats };
  } catch (err: any) {
    return { error: err?.message || "Failed to load categories" };
  }
}

/**
 * Category overview for the Menu → Category page: every category with its dish
 * count and total order count (how many times its dishes have been ordered),
 * plus the aggregate stats shown in the header cards.
 */
export async function getCategoryOverview(_restaurantId?: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const [cats, dishGroups, orderRows] = await Promise.all([
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true, imageUrl: true, isActive: true },
      }),
      prisma.menuItem.groupBy({
        by: ["categoryId"],
        where: { restaurantId },
        _count: { _all: true },
      }),
      // Order counts per category — join order_items → menu_items back to category.
      prisma.$queryRaw<{ category_id: string; order_count: number }[]>`
        SELECT mi."category_id" AS category_id, COUNT(oi."id")::int AS order_count
        FROM "menu_items" mi
        JOIN "order_items" oi ON oi."menu_item_id" = mi."id"
        WHERE mi."restaurant_id" = ${restaurantId}
        GROUP BY mi."category_id"
      `,
    ]);

    const dishCountBy = new Map(dishGroups.map((g) => [g.categoryId, g._count._all]));
    const orderCountBy = new Map(orderRows.map((r) => [r.category_id, Number(r.order_count)]));

    const categories = cats.map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      isActive: c.isActive,
      dishCount: dishCountBy.get(c.id) ?? 0,
      orderCount: orderCountBy.get(c.id) ?? 0,
    }));

    const totalDishes = categories.reduce((s, c) => s + c.dishCount, 0);
    const topSold = categories.reduce<(typeof categories)[number] | null>(
      (best, c) => (best === null || c.orderCount > best.orderCount ? c : best),
      null
    );
    const mostDishes = categories.reduce<(typeof categories)[number] | null>(
      (best, c) => (best === null || c.dishCount > best.dishCount ? c : best),
      null
    );

    return {
      data: {
        categories,
        stats: {
          total: categories.length,
          totalDishes,
          topSold: topSold && topSold.orderCount > 0
            ? { name: topSold.name, orders: topSold.orderCount }
            : null,
          mostDishes: mostDishes && mostDishes.dishCount > 0
            ? { name: mostDishes.name, dishes: mostDishes.dishCount }
            : null,
          avgDishesPerCategory: categories.length > 0
            ? Math.round((totalDishes / categories.length) * 10) / 10
            : 0,
        },
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load category overview" };
  }
}

export async function getMenuSettings(_restaurantId?: string) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { bannerImageUrl: true },
    });
    let menuBgUrl: string | null = null;
    let menuCustomUrl: string | null = null;
    try {
      const raw = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
        `SELECT menu_bg_url, menu_custom_url FROM restaurants WHERE id = $1`,
        restaurantId
      );
      if (raw[0]) {
        menuBgUrl = raw[0].menu_bg_url || null;
        menuCustomUrl = raw[0].menu_custom_url || null;
      }
    } catch {}
    return { data: { menuBgUrl, menuCustomUrl, bannerImageUrl: restaurant?.bannerImageUrl || null } };
  } catch (err: any) {
    return { error: err?.message || "Failed to load menu settings" };
  }
}

/**
 * Only these columns may be written here. The update is built with
 * $executeRawUnsafe, and the SET clause is column *names*, which cannot be
 * parameterised — so without this allowlist a caller-supplied key like
 * `menu_bg_url = '', plan_type` would be spliced straight into the statement
 * and could write any column on the restaurants row.
 */
const MENU_SETTING_COLUMNS = new Set(["menu_bg_url", "menu_custom_url"]);

export async function updateMenuSettings(
  _restaurantId: string | undefined,
  updates: Record<string, any>
) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  const keys = Object.keys(updates).filter((k) => MENU_SETTING_COLUMNS.has(k));
  if (keys.length === 0) return { error: "Nothing to save" };

  try {
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`);
    const values = [session.restaurantId, ...keys.map((k) => updates[k])];

    await prisma.$executeRawUnsafe(
      `UPDATE restaurants SET ${setClauses.join(", ")} WHERE id = $1`,
      ...values
    );
    await logActivity(session, {
      actionType: "MENU_SETTINGS_UPDATE",
      entityType: "MenuSettings",
      entityId: session.restaurantId,
      description: `Menu settings updated`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to save menu settings" };
  }
}
