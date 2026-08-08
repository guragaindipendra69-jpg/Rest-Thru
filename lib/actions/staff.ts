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

    const member = await prisma.staff.create({
      data: {
        restaurantId,
        firstName: data.name,
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

    // updateMany rather than update: the restaurantId predicate becomes part of
    // the write, so another tenant's staff id matches 0 rows instead of being
    // silently updated. Avoids a racy read-then-write ownership check too.
    const { count } = await prisma.staff.updateMany({
      where: { id: data.id, restaurantId: session.restaurantId },
      data: {
        firstName: data.name,
        role: data.role.toUpperCase(),
        phoneNumber: data.phone,
        email: data.email || "",
        profileImage: data.avatarUrl || undefined,
        address: data.address || undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        identityDocType: data.identityDocType || "",
        identityDocImage: data.identityDocImage || undefined,
        emergencyContactName: data.emergencyContactName || "",
        emergencyContactPhone: data.emergencyContactPhone || "",
        bloodGroup: data.bloodGroup || "",
        salary: data.salary ?? undefined,
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
