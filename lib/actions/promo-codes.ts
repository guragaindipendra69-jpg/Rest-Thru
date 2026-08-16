"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Platform-level subscription promo codes — Superadmin > Subscriptions >
// Promo Code Management. Previously the search box filtered a hardcoded
// `filteredPromos = []`; this backs it with a real table (PromoCode).

async function requireAdmin() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPER_ADMIN"].includes(session.role)) {
    return null;
  }
  return session;
}

export async function getPromoCodes() {
  // Every writer in this module is admin-only but the reader was not, and it is
  // a "use server" export, so any anonymous POST returned the platform's whole
  // promo catalogue: codes, discount values, usage limits and expiry. A promo
  // code IS the secret - knowing it is what redeems it - so an unguarded list
  // hands out every live discount. The only call site is the superadmin
  // Subscriptions console.
  const session = await requireAdmin();
  if (!session) return [];

  return prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createPromoCode(input: {
  code: string;
  description?: string;
  discountType: "percentage" | "flat";
  discountValue: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
}) {
  const session = await requireAdmin();
  if (!session) return { error: "Not authorized" };

  const code = input.code.trim().toUpperCase();
  if (!code) return { error: "Code is required" };
  if (!input.discountValue || input.discountValue <= 0) return { error: "Discount value must be positive" };

  try {
    const promo = await prisma.promoCode.create({
      data: {
        code,
        description: input.description || null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        usageLimit: input.usageLimit ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return { data: promo };
  } catch (err: any) {
    if (err?.code === "P2002") return { error: "A promo code with that code already exists" };
    return { error: err?.message || "Failed to create promo code" };
  }
}

export async function togglePromoCodeActive(id: string) {
  const session = await requireAdmin();
  if (!session) return { error: "Not authorized" };

  try {
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) return { error: "Promo code not found" };
    const updated = await prisma.promoCode.update({
      where: { id },
      data: { isActive: !promo.isActive },
    });
    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update promo code" };
  }
}
