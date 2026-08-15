"use server";

import prisma from "@/lib/prisma";
import { getSession, clearSession } from "@/lib/auth";
import { requireTenant, OWNER_ROLES, FRONT_OF_HOUSE_ROLES, ALL_TENANT_ROLES } from "@/lib/auth-tenant";
import { restaurantPurgeOperations } from "@/lib/restaurant-purge";
import { logActivity } from "./logs";
import { validatePhone } from "@/lib/phone-validator";

// Every export here used to take the target `restaurantId` as its first argument
// behind nothing but `if (!session)`. A Server Action is a public POST endpoint
// and a restaurant id is public input — it is printed on every table QR sticker —
// so that let any signed-in user of any outlet (a waiter included) read and
// rewrite another restaurant's profile: its PAN, VAT number and tax rate, its
// operating hours, its cover photo, its stored settings blob, and its
// subscription. `updateRestaurant` compounded it by logging the change against
// the *caller's* `session.restaurantId` while writing to the id it was handed, so
// the audit trail named the wrong outlet.
//
// The id now comes from the session in every one of them, via `requireTenant()`,
// which also supplies the role check the bare truthiness test never performed.
// Each still accepts (and ignores) the leading parameter so the existing call
// sites keep compiling — they all passed their own `authRestaurant?.id` anyway,
// which is exactly what the session carries. The `_restaurantId` name marks it as
// vestigial, matching `getMenuSettings` in lib/actions/menu.ts.
//
// The superadmin console does not go through here: it edits arbitrary outlets via
// the separate `updateRestaurant` in lib/actions/admin.ts, behind `requireAdmin()`.
export async function getRestaurant(_restaurantId?: string) {
  const auth = await requireTenant(ALL_TENANT_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        operatingHours: {
          select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
        },
      },
    });
    return { data: restaurant };
  } catch (err: any) {
    return { error: err?.message || "Failed to load restaurant" };
  }
}

export async function getSettingsData(_restaurantId?: string) {
  const auth = await requireTenant(ALL_TENANT_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const row = await prisma.restaurantSetting.findUnique({
      where: { restaurantId },
      select: { data: true },
    });
    return { data: (row?.data as Record<string, any>) ?? null };
  } catch {
    return { data: null };
  }
}

export async function getActiveSubscription(_restaurantId?: string) {
  const auth = await requireTenant(ALL_TENANT_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const sub = await prisma.subscription.findFirst({
      where: { restaurantId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
    return { data: sub };
  } catch (err: any) {
    return { error: err?.message || "Failed to load subscription" };
  }
}

export async function updateRestaurant(_restaurantId: string | undefined, data: Record<string, any>) {
  // Writing the outlet's own tax identity, so this is owner-only rather than
  // anyone front-of-house.
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const restaurantId = session.restaurantId;

  try {
    if (data.phoneNumber) {
      const phoneResult = validatePhone(data.phoneNumber);
      if (!phoneResult.valid) return { error: `Phone: ${phoneResult.error}` };
    }

    const allowedFields = [
      "name", "email", "street", "phoneNumber", "websiteUrl", "city", "timezone",
      "currency", "language", "taxPercentage", "bannerImageUrl",
      "vatRegistered", "panNumber", "vatNumber",
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in data) updateData[key] = data[key];
    }
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: updateData,
    });

    await logActivity(session, {
      actionType: "RESTAURANT_UPDATE",
      entityType: "Restaurant",
      entityId: restaurantId,
      description: `Restaurant settings updated`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to save settings" };
  }
}

/**
 * Persists a restaurant's weekly operating hours into the relational
 * `operating_hours` table (one row per weekday, 0=Sun … 6=Sat). This is the same
 * table the public menu book reads, so saving here is what makes the owner's
 * hours show up — and stay in sync — on the customer-facing menu's last page.
 */
export async function saveOperatingHours(
  _restaurantId: string | undefined,
  hours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const restaurantId = session.restaurantId;

  try {
    await prisma.$transaction(
      hours.map((h) =>
        prisma.operatingHours.upsert({
          where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: h.dayOfWeek } },
          update: { isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime },
          create: {
            restaurantId,
            dayOfWeek: h.dayOfWeek,
            isOpen: h.isOpen,
            openTime: h.openTime,
            closeTime: h.closeTime,
          },
        })
      )
    );

    await logActivity(session, {
      actionType: "OPERATING_HOURS_UPDATE",
      entityType: "Restaurant",
      entityId: restaurantId,
      description: `Operating hours updated`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to save operating hours" };
  }
}

export async function upsertSettings(_restaurantId: string | undefined, patch: Record<string, any>) {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const keys = Object.keys(patch);
    if (keys.length === 0) return { success: true };

    // Merge rather than replace — callers send only the keys their page owns,
    // and a whole-object write would wipe every other page's preferences.
    const existing = await prisma.restaurantSetting.findUnique({
      where: { restaurantId },
      select: { data: true },
    });
    const merged = { ...((existing?.data as Record<string, any>) ?? {}), ...patch };

    await prisma.restaurantSetting.upsert({
      where: { restaurantId },
      create: { restaurantId, data: merged },
      update: { data: merged },
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to save settings" };
  }
}

// `updateRestaurantDirect` used to live here and has been removed.
//
// It built raw SQL by interpolating the *keys* of a caller-supplied object
// straight into an UPDATE statement and running it through `$executeRawUnsafe`:
//
//     const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
//     await prisma.$executeRawUnsafe(`UPDATE restaurants SET ${setClauses.join(", ")} WHERE id = $1`, ...values);
//
// Only the values were parameterised. The column names were not, and unlike
// `updateRestaurant` above there was no allowlist, so a key was arbitrary SQL
// injected into the statement — behind nothing but `if (!session)`, against any
// restaurant id, with no role check. It had no call sites anywhere in the app.
//
// `updateRestaurant` already does this job safely: session-derived id, fixed
// allowlist of columns, and the Prisma query builder. Anything needing a column
// it does not cover should be added to that allowlist rather than reviving a raw
// statement.

export async function updateCoverPhoto(_restaurantId: string | undefined, coverUrl: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const restaurantId = session.restaurantId;

  try {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { bannerImageUrl: coverUrl },
    });

    await logActivity(session, {
      actionType: "COVER_PHOTO_UPDATE",
      entityType: "Restaurant",
      entityId: restaurantId,
      description: `Cover photo updated`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to upload cover" };
  }
}

export async function cancelSubscription(_restaurantId?: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const restaurantId = session.restaurantId;

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { restaurantId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) return { error: "No active subscription found" };

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED", endDate: new Date() },
    });

    await logActivity(session, {
      actionType: "SUBSCRIPTION_CANCEL",
      entityType: "Restaurant",
      entityId: restaurantId,
      description: `Subscription cancelled`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to cancel subscription" };
  }
}

export async function getAvailablePlans() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });
    return { data: plans };
  } catch (err: any) {
    return { error: err?.message || "Failed to load plans" };
  }
}

export async function subscribeToPlan(_restaurantId: string | undefined, planId: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const restaurantId = auth.session.restaurantId;

  try {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return { error: "Plan not found" };

    // Cancel any existing active subscription
    const existing = await prisma.subscription.findFirst({
      where: { restaurantId, status: "ACTIVE" },
    });
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: "CANCELLED", endDate: new Date() },
      });
    }

    // Create new subscription (1-year duration, same as registration)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        restaurantId,
        planId,
        status: "ACTIVE",
        startDate,
        endDate,
        autoRenew: true,
        billingCycle: "MONTHLY",
        paymentMethod: "manual",
      },
      include: { plan: true },
    });

    return { data: subscription };
  } catch (err: any) {
    return { error: err?.message || "Failed to subscribe" };
  }
}

// ── No setUserPassword ──
//
// There was a `setUserPassword(userId, newPassword)` here, called by the owner
// settings page to change your own password. It checked only that *some* session
// existed, then hashed the new password onto whatever `userId` the caller sent:
// no role check, no tenant scoping, no current-password check, and no length
// check either. As an export of a "use server" module it is a public POST
// endpoint, so any signed-in account — a waiter, or an owner of an unrelated
// restaurant — could take over any other account, including SUPER_ADMIN, given
// its id. Staff ids are not secret; the owner staff directory hands them out.
//
// The settings page now calls `changePassword` in lib/actions/auth.ts, which
// resolves the account from the session and demands the current password. One
// password-writing path outside the superadmin console is the point: a second
// one is a second thing to get wrong.

// ── Delete my restaurant ──
//
// The owner-facing counterpart to the superadmin's deleteRestaurant. Both run the
// same foreign-key-ordered purge from lib/restaurant-purge.ts; only the
// authorization and the guard rails differ.
//
// Gated to RESTAURANT_OWNER alone rather than OWNER_ROLES: legacy STAFF accounts
// also live in the owner portal, and erasing the entire tenant is not something a
// staff login should be able to do. restaurantId comes from the session, so no
// caller can name someone else's restaurant here.

/** The phrase the owner has to type. Compared case- and spacing-insensitively. */
const DELETE_CONFIRMATION = "delete my restaurant";

/**
 * What the danger card needs before it can offer the button: the name to show
 * and the number of tax invoices on record, which is what decides whether the
 * delete is available at all. One indexed count.
 */
export async function getRestaurantDeleteInfo() {
  const auth = await requireTenant(["RESTAURANT_OWNER"]);
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  try {
    const [restaurant, billCount] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true },
      }),
      prisma.bill.count({ where: { restaurantId } }),
    ]);

    return {
      data: {
        restaurantName: restaurant?.name ?? "",
        billCount,
        confirmationPhrase: DELETE_CONFIRMATION,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load account details" };
  }
}

/**
 * Erase the signed-in owner's restaurant and every row that hangs off it.
 *
 * Refuses once any bill exists. Nepal's IRD rules require issued invoices to be
 * retained, which is why the billing engine marks a cancelled bill VOID and keeps
 * its sequence instead of deleting the row (bill-design.md); a self-service delete
 * that wiped the invoice series would undo that. Those outlets go through support
 * so a platform admin can make the call.
 *
 * Deliberately does not call logActivity: ActivityLog.restaurantId is required, so
 * a row written after the purge cannot exist, and one written before is deleted by
 * the purge itself.
 */
export async function deleteMyRestaurant(confirmation: string) {
  const auth = await requireTenant(["RESTAURANT_OWNER"]);
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  // Re-checked server side: the dialog disables its button until the phrase
  // matches, but the action is a public endpoint and the dialog is not the gate.
  const typed = (confirmation || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (typed !== DELETE_CONFIRMATION) {
    return { error: `Type "${DELETE_CONFIRMATION}" exactly to confirm` };
  }

  try {
    const billCount = await prisma.bill.count({ where: { restaurantId } });
    if (billCount > 0) {
      return {
        error:
          `${billCount} tax invoice${billCount === 1 ? "" : "s"} on record. Nepal's IRD rules ` +
          "require issued invoices to be retained, so this outlet cannot be deleted here. " +
          "Contact support to close the account.",
      };
    }

    await prisma.$transaction(restaurantPurgeOperations(restaurantId));

    // The owner's own user row is gone, but the JWT in the cookie would still
    // verify, leaving a session pointing at a restaurant that no longer exists.
    // Clear every portal this tenant could have open in the browser.
    await clearSession("owner");
    await clearSession("reception");
    await clearSession("waiter");

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete restaurant" };
  }
}
