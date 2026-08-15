"use server";

import prisma from "@/lib/prisma";
import { requireTenant, OWNER_ROLES } from "@/lib/auth-tenant";
import { logActivity } from "./logs";
import { checkResourceLimit, limitMessage } from "@/lib/plan-guard";
import { validatePhone } from "@/lib/phone-validator";

// Staff records carry salary, home address, date of birth and identity-document
// images. This used to accept restaurantId from the caller behind an
// authentication-only check, so any signed-in user at any restaurant could read
// another restaurant's entire HR file. Owner-only, session-scoped.
export async function getStaff() {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  try {
    const members = await prisma.staff.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: members };
  } catch (err: any) {
    return { error: err?.message || "Failed to load staff" };
  }
}

interface StaffInput {
  name: string;
  role: string;
  phone: string;
  email?: string;
  avatarUrl?: string | null;
  address?: string;
  dateOfBirth?: string | null;
  identityDocType?: string;
  identityDocImage?: string | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodGroup?: string;
  salary?: number;
  status?: string;
}

// The UI works with one "Full Name" field but the table stores firstName and
// lastName. Writing the whole string into firstName and leaving lastName as it
// was made the directory render "Ram Bahadur Bahadur" after an edit, because
// the page reads back `firstName + ' ' + lastName`. Split on the last space so
// both columns are always rewritten together.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export async function addStaff(data: StaffInput) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  const limitReached = await checkResourceLimit(restaurantId, "staff");
  if (limitReached) return { error: limitMessage(limitReached), limitReached };

  try {
    const phoneResult = validatePhone(data.phone);
    if (!phoneResult.valid) return { error: `Staff phone: ${phoneResult.error || "Invalid number"}` };
    if (data.emergencyContactPhone) {
      const ecResult = validatePhone(data.emergencyContactPhone);
      if (!ecResult.valid) return { error: `Emergency contact phone: ${ecResult.error || "Invalid number"}` };
    }

    const { firstName, lastName } = splitName(data.name);
    if (!firstName) return { error: "Staff name is required" };

    const member = await prisma.staff.create({
      data: {
        restaurantId,
        firstName,
        lastName,
        role: data.role.toUpperCase(),
        phoneNumber: data.phone,
        email: data.email || "",
        profileImage: data.avatarUrl || undefined,
        address: data.address || undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        identityDocType: data.identityDocType || "",
        identityDocImage: data.identityDocImage || undefined,
        emergencyContactName: data.emergencyContactName || "",
        emergencyContactPhone: data.emergencyContactPhone || "",
        bloodGroup: data.bloodGroup || "",
        salary: data.salary || 0,
      },
    });
    await logActivity(session, {
      actionType: "STAFF_ADD",
      entityType: "Staff",
      entityId: member.id,
      description: `Staff member "${data.name}" added as ${data.role}`,
    });
    return { data: member };
  } catch (err: any) {
    return { error: err?.message || "Failed to add staff member" };
  }
}

export async function updateStaff(data: StaffInput & { id: string }) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const phoneResult = validatePhone(data.phone);
    if (!phoneResult.valid) return { error: `Staff phone: ${phoneResult.error || "Invalid number"}` };
    if (data.emergencyContactPhone) {
      const ecResult = validatePhone(data.emergencyContactPhone);
      if (!ecResult.valid) return { error: `Emergency contact phone: ${ecResult.error || "Invalid number"}` };
    }

    const { firstName, lastName } = splitName(data.name);
    if (!firstName) return { error: "Staff name is required" };

    // updateMany rather than update: the restaurantId predicate becomes part of
    // the write, so another tenant's staff id matches 0 rows instead of being
    // silently updated. Avoids a racy read-then-write ownership check too.
    //
    // The image columns are nulled on an explicit `null` rather than coerced
    // through `|| undefined`. Prisma reads `undefined` as "leave this column
    // alone", so the old form could attach a photo but never take one off — the
    // Remove button in the edit dialog had no way to reach the database.
    const { count } = await prisma.staff.updateMany({
      where: { id: data.id, restaurantId: session.restaurantId },
      data: {
        firstName,
        lastName,
        role: data.role.toUpperCase(),
        phoneNumber: data.phone,
        email: data.email || "",
        profileImage: data.avatarUrl ?? null,
        address: data.address || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        identityDocType: data.identityDocType || "",
        identityDocImage: data.identityDocImage ?? null,
        emergencyContactName: data.emergencyContactName || "",
        emergencyContactPhone: data.emergencyContactPhone || "",
        bloodGroup: data.bloodGroup || "",
        salary: data.salary ?? undefined,
        // Only written when the caller actually sends it. A bare default of
        // ACTIVE would let any future second caller that does not carry the
        // status field silently reactivate a deactivated staff member, which is
        // the same trap updateCategory hit with display_order and is_active.
        status: data.status ? (data.status === "INACTIVE" ? "INACTIVE" : "ACTIVE") : undefined,
      },
    });
    if (count === 0) return { error: "Staff member not found" };

    const member = await prisma.staff.findUnique({ where: { id: data.id } });
    await logActivity(session, {
      actionType: "STAFF_UPDATE",
      entityType: "Staff",
      entityId: data.id,
      description: `Staff member updated`,
    });
    return { data: member };
  } catch (err: any) {
    return { error: err?.message || "Failed to update staff member" };
  }
}

export async function deleteStaff(staffId: string) {
  const auth = await requireTenant(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;

  try {
    const { count } = await prisma.staff.deleteMany({
      where: { id: staffId, restaurantId: session.restaurantId },
    });
    if (count === 0) return { error: "Staff member not found" };

    await logActivity(session, {
      actionType: "STAFF_DELETE",
      entityType: "Staff",
      entityId: staffId,
      description: `Staff member deleted`,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete staff member" };
  }
}
