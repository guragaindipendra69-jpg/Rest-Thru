"use server";

import prisma from "@/lib/prisma";
import { requireTenant, OWNER_ROLES, FRONT_OF_HOUSE_ROLES } from "@/lib/auth-tenant";
import { logActivity } from "@/lib/activity-log";

export type ComboItemData = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  addons?: string;
  imageUrl?: string | null;
  foodType?: string;
};

export async function createCombo(data: {
  name: string;
  menuSection?: string | null;
  categoryId?: string | null;
  price: number;
  offerPrice: number;
  comboType?: string | null;
  hsCode?: string | null;
  prepTime?: number;
  imageUrl?: string | null;
  description?: string | null;
  items: ComboItemData[];
}) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const combo = await prisma.combo.create({
      data: {
        restaurantId: session.restaurantId,
        name: data.name,
        menuSection: data.menuSection?.trim() || null,
        categoryId: data.categoryId || null,
        price: data.price || 0,
        offerPrice: data.offerPrice || 0,
        comboType: data.comboType?.trim() || null,
        hsCode: data.hsCode?.trim() || null,
        prepTime: data.prepTime || 0,
        imageUrl: data.imageUrl || null,
        description: data.description || null,
        items: (data.items || []) as any,
      },
    });
    await logActivity(session, {
      actionType: "COMBO_ADD",
      entityType: "Combo",
      entityId: combo.id,
      description: `Combo "${combo.name}" created`,
    });
    return { data: combo };
  } catch (err: any) {
    return { error: err?.message || "Failed to create combo" };
  }
}

export async function getCombos() {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  try {
    const combos = await prisma.combo.findMany({
      where: { restaurantId },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: combos };
  } catch (err: any) {
    return { error: err?.message || "Failed to load combos" };
  }
}

export async function updateCombo(id: string, data: Record<string, any>) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    // Ownership is enforced by the write predicate, not a separate read.
    const { count } = await prisma.combo.updateMany({
      where: { id, restaurantId: session.restaurantId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.menuSection !== undefined && { menuSection: data.menuSection || null }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.offerPrice !== undefined && { offerPrice: data.offerPrice }),
        ...(data.comboType !== undefined && { comboType: data.comboType || null }),
        ...(data.hsCode !== undefined && { hsCode: data.hsCode || null }),
        ...(data.prepTime !== undefined && { prepTime: data.prepTime }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.items !== undefined && { items: data.items }),
        ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
      },
    });
    if (count === 0) return { error: "Combo not found" };

    const combo = await prisma.combo.findUnique({ where: { id } });
    await logActivity(session, {
      actionType: "COMBO_UPDATE",
      entityType: "Combo",
      entityId: id,
      description: `Combo "${combo?.name ?? id}" updated`,
    });
    return { data: combo };
  } catch (err: any) {
    return { error: err?.message || "Failed to update combo" };
  }
}

export async function toggleComboAvailable(id: string, isAvailable: boolean) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };

  try {
    const { count } = await prisma.combo.updateMany({
      where: { id, restaurantId: auth.session.restaurantId },
      data: { isAvailable },
    });
    if (count === 0) return { error: "Combo not found" };
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update combo" };
  }
}

export async function deleteCombo(id: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const { count } = await prisma.combo.deleteMany({
      where: { id, restaurantId: session.restaurantId },
    });
    if (count === 0) return { error: "Combo not found" };

    await logActivity(session, {
      actionType: "COMBO_DELETE",
      entityType: "Combo",
      entityId: id,
      description: `Combo deleted`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete combo" };
  }
}
