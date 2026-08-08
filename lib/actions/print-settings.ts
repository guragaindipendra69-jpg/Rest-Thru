"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logActivity } from "./logs";

/**
 * Invoice and KOT print configuration.
 *
 * Both are one-row-per-restaurant and are created on first read, so callers
 * never have to deal with "settings don't exist yet" — a restaurant that has
 * never opened the page still gets working defaults.
 */

export async function getInvoiceSettings() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const [settings, restaurant] = await Promise.all([
      prisma.invoiceSetting.findUnique({
        where: { restaurantId: session.restaurantId },
      }),
      prisma.restaurant.findUnique({
        where: { id: session.restaurantId },
        select: {
          name: true, street: true, city: true, state: true,
          phoneNumber: true, panNumber: true, vatNumber: true,
          vatRegistered: true, taxPercentage: true, logoUrl: true,
        },
      }),
    ]);

    if (settings) return { data: settings };

    // Seed from the restaurant profile so the first view is already filled in
    // with the details the owner entered under Restaurant Details.
    const created = await prisma.invoiceSetting.create({
      data: {
        restaurantId: session.restaurantId,
        legalName: restaurant?.name ?? "",
        address: [restaurant?.street, restaurant?.city, restaurant?.state]
          .filter(Boolean)
          .join(", "),
        contactNumber: restaurant?.phoneNumber ?? "",
        taxNumber: restaurant?.vatNumber || restaurant?.panNumber || "",
        invoiceType: restaurant?.vatRegistered ? "Tax Invoice" : "Invoice",
      },
    });
    return { data: created };
  } catch (err: any) {
    return { error: err?.message || "Failed to load invoice settings" };
  }
}

export async function saveInvoiceSettings(patch: Record<string, any>) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    // Whitelist: this comes straight from a form, and a stray key would let a
    // caller write columns the page has no business touching.
    const allowed = [
      "invoiceType", "legalName", "address", "contactNumber", "taxNumber",
      "logoUrl", "fontSize",
      "showInvoiceNo", "showDate", "showOrderType", "showTime", "showEstimateDetail",
      "showSN", "showHSCode", "showParticular", "showRate", "showQty", "showAmount",
      "enableDishDiscount", "enableLoyaltyDiscount", "enableDiscount",
      "enableServiceCharge", "showDiscountPercentage", "enableTax",
      "showPaymentMode", "showBilledBy", "showKotNumber", "showAssign",
      "showTenderAmount", "showInWords", "showServiceDuration",
      "qrEnabled", "qrFileName", "qrImageUrl",
      "footerHeader", "footerRemarks", "checkoutAction",
    ] as const;

    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (key in patch) data[key] = patch[key];
    }
    if (typeof data.fontSize === "number") {
      data.fontSize = Math.min(Math.max(Math.round(data.fontSize), 6), 24);
    }

    const saved = await prisma.invoiceSetting.upsert({
      where: { restaurantId: session.restaurantId },
      create: { restaurantId: session.restaurantId, ...data },
      update: data,
    });

    await logActivity(session, {
      actionType: "SETTINGS_UPDATE",
      entityType: "InvoiceSetting",
      entityId: saved.id,
      description: `Invoice settings updated by ${session.username}`,
    });

    return { data: saved };
  } catch (err: any) {
    return { error: err?.message || "Failed to save invoice settings" };
  }
}

export async function getKotSettings() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const existing = await prisma.kotSetting.findUnique({
      where: { restaurantId: session.restaurantId },
    });
    if (existing) return { data: existing };

    const created = await prisma.kotSetting.create({
      data: { restaurantId: session.restaurantId },
    });
    return { data: created };
  } catch (err: any) {
    return { error: err?.message || "Failed to load KOT settings" };
  }
}

export async function saveKotSettings(patch: Record<string, any>) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const allowed = [
      "showKotNo", "showOrderType", "showTable", "showOrderBy", "showTime",
      "tableAsSubHeading",
      "showSN", "showDishes", "showQty", "showTotal",
      "fontSize", "printCount", "compactView", "printOnCancel", "printOnUpdate",
      "showKotRemarks", "showDishRemarks", "showPrintedBy", "showPrintedAt",
      "footerText", "dishRemarksPosition",
      "orderAction", "cancelAction", "editAction", "autoResetWithDaybook",
    ] as const;

    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (key in patch) data[key] = patch[key];
    }
    if (typeof data.fontSize === "number") {
      data.fontSize = Math.min(Math.max(Math.round(data.fontSize), 6), 24);
    }
    if (typeof data.printCount === "number") {
      // More than a handful of copies is a jammed printer, not an intention.
      data.printCount = Math.min(Math.max(Math.round(data.printCount), 1), 10);
    }

    const saved = await prisma.kotSetting.upsert({
      where: { restaurantId: session.restaurantId },
      create: { restaurantId: session.restaurantId, ...data },
      update: data,
    });

    await logActivity(session, {
      actionType: "SETTINGS_UPDATE",
      entityType: "KotSetting",
      entityId: saved.id,
      description: `KOT settings updated by ${session.username}`,
    });

    return { data: saved };
  } catch (err: any) {
    return { error: err?.message || "Failed to save KOT settings" };
  }
}

/**
 * Resets the restaurant's KOT counter so the next docket starts at 1.
 *
 * Clears `kotNumber` on past orders rather than storing a separate counter,
 * because the next number is derived from the highest one in use.
 */
export async function resetKotNumbers() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const { count } = await prisma.order.updateMany({
      where: { restaurantId: session.restaurantId, kotNumber: { not: null } },
      data: { kotNumber: null },
    });

    await logActivity(session, {
      actionType: "KOT_RESET",
      entityType: "Restaurant",
      entityId: session.restaurantId,
      description: `KOT numbering reset by ${session.username} (${count} dockets cleared)`,
    });

    return { data: { cleared: count } };
  } catch (err: any) {
    return { error: err?.message || "Failed to reset KOT numbers" };
  }
}
