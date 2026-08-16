"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, clearSession, getSession } from "@/lib/auth";
import { isApproverRole } from "@/lib/manager-approval";
import { logActivity } from "@/lib/activity-log";
import { validatePhone } from "@/lib/phone-validator";
import { safeRedirectForRole } from "@/lib/constants";
import { verifyGoogleTicket } from "@/lib/google-ticket";

// Validate that a username is in Gmail format (a valid email ending in @gmail.com).
export async function isValidGmail(username: string): Promise<boolean> {
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
  return gmailRegex.test(username.trim());
}

function generateUsername(email: string): string {
  let base = email.split("@")[0] || "user";
  // Replace non-alphanumeric chars (except - and _) to keep it safe
  base = base.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  // Append short random suffix to avoid unique constraint collisions
  return `${base}_${Math.random().toString(36).substring(2, 7)}`;
}


// `createSessionFromSupabaseLogin` used to live here and has been removed.
//
// It was left over from the abandoned Supabase auth path and had no call sites
// anywhere in the app — but a `"use server"` export is a public POST endpoint
// whether or not the app calls it, and this one took an *email address*, found or
// created that user, and minted a session with whatever role the row carried.
// `createSession` picks the portal cookie from that role, so posting a known
// admin email to it returned a working superadmin cookie. Nothing more than the
// address was required.
//
// Prisma is the active ORM (the Supabase env vars are vestigial), so there is no
// flow to preserve. Deleting the export is the fix: an unused endpoint cannot be
// secured by being unused. If a Supabase path is ever revived, it must verify a
// Supabase-issued token rather than trust an emailed identity, the way
// `googleLogin` verifies its credential before anyone is signed in.

/**
 * The one credential check behind every sign-in form.
 *
 * `redirectTo` is where the caller would like the user to land, not where they
 * will: `safeRedirectForRole` reduces it to the user's own role home unless it is
 * a same-origin path inside the portal their role belongs to. Since the shared
 * /login form serves owners, staff, receptionists and waiters at once, that
 * parameter arrives from a query string on behalf of four different portals — it
 * is caller input reaching a navigation, so it is validated here rather than in
 * the form. Callers no longer need to pass it at all to get correct routing; the
 * role decides.
 */
export async function login(
  username: string,
  password: string,
  redirectTo?: string,
  options?: { adminConsole?: boolean; blockAdmin?: boolean }
) {
  try {
    // Allow login by email, phone number, OR username
    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }, { phoneNumber: username }], isActive: true },
      include: { restaurant: { select: { isActive: true } } },
    });

    if (!user || !user.passwordHash) {
      return { error: "Invalid username or password" };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return { error: "Invalid username or password" };
    }

    // Platform kill switch: a restaurant the superadmin has closed locks out
    // its entire team — owner, receptionist and waiter alike. Checked only
    // after the password is verified so it can't be used to probe accounts.
    // Admins carry no restaurant link, so `user.restaurant` is null for them
    // and this branch never fires.
    if (user.restaurant && !user.restaurant.isActive) {
      return {
        error: "This restaurant has been closed by the administrator. Please contact support.",
      };
    }

    // Admin console gate: only SUPER_ADMIN / ADMIN may sign in here. Reject
    // everyone else (e.g. a restaurant owner using their real credentials)
    // BEFORE any session is created — otherwise a valid non-admin login would
    // mint a session cookie and only get bounced by the proxy afterward. The
    // error is intentionally the same generic string so this endpoint can't be
    // used to tell "wrong password" apart from "right password, wrong console".
    if (
      options?.adminConsole &&
      user.role !== "ADMIN" &&
      user.role !== "SUPER_ADMIN"
    ) {
      return { error: "Invalid username or password" };
    }

    // Reverse gate for the public / staff login doors (home-page dialog,
    // /login, /owner/login): admins may ONLY sign in through the admin
    // console, never through these. Reject before creating a session, with the
    // same generic message so these forms can't be used to discover that an
    // account is an admin.
    if (
      options?.blockAdmin &&
      (user.role === "ADMIN" || user.role === "SUPER_ADMIN")
    ) {
      return { error: "Invalid username or password" };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession({
      id: user.id,
      username: user.username || "",
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      restaurantId: user.restaurantId,
    });

    const destination = safeRedirectForRole(user.role, redirectTo);
    return { success: true, redirectTo: destination };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("login error:", message, err instanceof Error ? err.stack : "");
    return { error: "Failed to create session" };
  }
}

export async function createRestaurant(data: {
  ownerId: string;
  name: string;
  type: string;
  address?: string;
  city?: string;
  phone?: string;
  panNumber?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
  numTables?: number;
  operatingHours?: any;
}) {
  try {
    const restaurant = await prisma.restaurant.create({
      data: {
        ownerId: data.ownerId,
        name: data.name,
        type: data.type.toUpperCase().replace(/\s+/g, '_'),
        street: data.address || '',
        city: data.city || '',
        phoneNumber: data.phone || '',
        panNumber: data.panNumber || null,
        vatRegistered: data.vatRegistered ?? false,
        vatNumber: data.vatNumber || null,
        totalTables: data.numTables || 0,
        isActive: true,
      },
    });

    return { restaurantId: restaurant.id };
  } catch (err: any) {
    return { error: err?.message || 'Failed to create restaurant' };
  }
}

export async function register(data: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  restaurantName: string;
  restaurantType: string;
  address?: string;
  city?: string;
  restaurantPhone?: string;
  planId?: string;
}) {
  try {
    if (data.phone) {
      const phoneResult = validatePhone(data.phone);
      if (!phoneResult.valid) return { error: phoneResult.error || "Invalid phone number" };
      const existingByPhone = await prisma.user.findFirst({ where: { phoneNumber: data.phone } });
      if (existingByPhone) {
        return { error: "An account with this phone number already exists" };
      }
    }
    if (data.restaurantPhone) {
      const rpResult = validatePhone(data.restaurantPhone);
      if (!rpResult.valid) return { error: `Restaurant phone: ${rpResult.error || "Invalid number"}` };
    }

    const existingByEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingByEmail) {
      return { error: "An account with this email already exists" };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const nameParts = data.fullName.trim().split(" ");

    // All four writes go in one transaction. Previously they ran sequentially:
    // if the restaurant create (or the user.update linking it) failed, the User
    // row survived with restaurantId = null. That account could then sign in to
    // a permanently broken dashboard AND could never re-register, because the
    // email/phone uniqueness check above would now match its own orphaned row.
    const { user, restaurant } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          username: generateUsername(data.email),
          passwordHash,
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          phoneNumber: data.phone || null,
          role: "RESTAURANT_OWNER",
          isActive: true,
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          ownerId: user.id,
          name: data.restaurantName,
          type: data.restaurantType.toUpperCase().replace(/\s+/g, '_'),
          street: data.address || '',
          city: data.city || '',
          phoneNumber: data.restaurantPhone || '',
          totalTables: 0,
          isActive: true,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { restaurantId: restaurant.id },
      });

      if (data.planId) {
        const plan = await tx.plan.findUnique({ where: { id: data.planId } });
        if (plan) {
          await tx.subscription.create({
            data: {
              restaurantId: restaurant.id,
              planId: plan.id,
              status: "ACTIVE",
              startDate: new Date(),
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              billingCycle: "MONTHLY",
            },
          });
        }
      }

      return { user, restaurant };
    });

    await createSession({
      id: user.id,
      username: user.username || "",
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      restaurantId: restaurant.id,
    });

    return { success: true, redirectTo: "/owner" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("register error:", message, err instanceof Error ? err.stack : "");
    return { error: "Failed to create account" };
  }
}

export async function logout() {
  await clearSession();
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true, restaurantId: true },
  });

  return user;
}

export async function getRestaurantFromSession() {
  const session = await getSession();
  if (!session) return null;

  // Full receipt-relevant fields, not just id/name — the bill/receipt UI reads
  // address, phone, and tax registration straight off this session snapshot.
  const receiptSelect = {
    id: true,
    name: true,
    street: true,
    city: true,
    state: true,
    phoneNumber: true,
    websiteUrl: true,
    taxPercentage: true,
    serviceCharge: true,
    vatRegistered: true,
    panNumber: true,
    vatNumber: true,
  } as const;

  // Try restaurantId from the JWT first
  if (session.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: receiptSelect,
    });
    if (restaurant) return restaurant;
  }

  // Fallback: find restaurant where this user is the owner
  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: session.id },
    select: receiptSelect,
  });

  return restaurant;
}

export async function getUserFromSession() {
  const session = await getSession();
  if (!session) return null;

  return {
    id: session.id,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    role: session.role,
  };
}

/**
 * Finishes Google sign-up: records the phone, creates or updates the restaurant
 * and subscription, and signs the new owner in.
 *
 * The account comes from the signed ticket `googleLogin` issued after verifying
 * the Google credential, never from an argument. It used to take a `userId`:
 * because every export of a `"use server"` module is a public POST endpoint,
 * that let anyone who knew an account id overwrite that restaurant's name,
 * address and subscription plan, and then walk away with a session cookie for
 * the account — `createSession` picks the portal cookie from the role on the
 * database row, so a superadmin's id produced a superadmin session.
 */
export async function completeGoogleRegistration(ticket: string, data: {
  phone?: string;
  restaurantName: string;
  restaurantType: string;
  address?: string;
  city?: string;
  restaurantPhone?: string;
  planId?: string;
}) {
  try {
    const userId = await verifyGoogleTicket(ticket);
    if (!userId) {
      return { error: "Your sign-in session expired. Please sign in with Google again." };
    }

    if (data.phone) {
      const phoneResult = validatePhone(data.phone);
      if (!phoneResult.valid) return { error: phoneResult.error || "Invalid phone number" };
    }
    if (data.restaurantPhone) {
      const rpResult = validatePhone(data.restaurantPhone);
      if (!rpResult.valid) return { error: `Restaurant phone: ${rpResult.error || "Invalid number"}` };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { error: "User not found" };

    // Re-checked here rather than trusted from ticket-issue time: the ticket
    // lives for minutes, and this call both mints a session and writes the
    // restaurant, so neither may happen for an account disabled in between.
    if (!user.isActive) {
      return { error: "This account has been deactivated. Please contact support." };
    }
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      return { error: "Please sign in through the admin console." };
    }

    // Update phone if provided
    if (data.phone) {
      await prisma.user.update({
        where: { id: userId },
        data: { phoneNumber: data.phone },
      });
    }

    // Matched on ownerId, with the user's own link column as a fallback. This
    // used to look only at `user.restaurantId`: `googleLogin` decides "already
    // registered" from `ownerId`, so an owner whose link column was never
    // populated read as having no restaurant here and got a second one created,
    // leaving two outlets owned by one account and the user pointed at the new
    // empty one.
    const existingRestaurant =
      (await prisma.restaurant.findFirst({ where: { ownerId: userId } })) ??
      (user.restaurantId
        ? await prisma.restaurant.findUnique({ where: { id: user.restaurantId } })
        : null);

    let restaurantId: string;

    if (existingRestaurant) {
      // Update existing restaurant
      await prisma.restaurant.update({
        where: { id: existingRestaurant.id },
        data: {
          name: data.restaurantName,
          type: data.restaurantType.toUpperCase().replace(/\s+/g, '_'),
          street: data.address || existingRestaurant.street || '',
          city: data.city || existingRestaurant.city || '',
          phoneNumber: data.restaurantPhone || existingRestaurant.phoneNumber || '',
        },
      });
      restaurantId = existingRestaurant.id;

      // Repair the link if it was the missing piece that sent us down the
      // fallback above, so the next sign-in resolves the outlet directly.
      if (user.restaurantId !== existingRestaurant.id) {
        await prisma.user.update({
          where: { id: userId },
          data: { restaurantId: existingRestaurant.id },
        });
      }
    } else {
      // Create new restaurant
      const restaurant = await prisma.restaurant.create({
        data: {
          ownerId: userId,
          name: data.restaurantName,
          type: data.restaurantType.toUpperCase().replace(/\s+/g, '_'),
          street: data.address || '',
          city: data.city || '',
          phoneNumber: data.restaurantPhone || '',
          totalTables: 0,
          isActive: true,
        },
      });
      restaurantId = restaurant.id;

      // Link user to restaurant
      await prisma.user.update({
        where: { id: userId },
        data: { restaurantId: restaurant.id },
      });
    }

    // Create or update subscription if plan selected
    if (data.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
      if (plan) {
        const existingSub = await prisma.subscription.findFirst({
          where: { restaurantId },
        });
        if (existingSub) {
          await prisma.subscription.update({
            where: { id: existingSub.id },
            data: {
              planId: plan.id,
              status: "ACTIVE",
              startDate: new Date(),
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          });
        } else {
          await prisma.subscription.create({
            data: {
              restaurantId,
              planId: plan.id,
              status: "ACTIVE",
              startDate: new Date(),
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              billingCycle: "MONTHLY",
            },
          });
        }
      }
    }

    // Create session
    await createSession({
      id: user.id,
      username: user.username || "",
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      restaurantId,
    });

    return { success: true, redirectTo: "/owner" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("completeGoogleRegistration error:", message);
    return { error: "Failed to complete registration" };
  }
}

// ── Password changes ──
//
// The one and only way a password is changed from outside the superadmin console.
// The account comes from the session cookie, never from an argument.
//
// It used to take a `username` and look the account up. Every export of a
// "use server" module is a public POST endpoint, so that made this an
// unauthenticated oracle for anyone who could post to it: its two distinct error
// strings ("User not found" versus "Current password is incorrect") confirmed
// which accounts exist and then whether a guessed password was right, and a
// caller who knew someone else's current password could change it for them.
//
// The current password is still required even though the session already proves
// who is calling. That is what stops a borrowed or hijacked session from locking
// the real owner out of their own account.
export async function changePassword(
  currentPassword: string,
  newPassword: string
) {
  if (newPassword.length < 6) {
    return { error: "New password must be at least 6 characters" };
  }

  const session = await getSession();
  if (!session?.id) return { error: "Not authenticated" };

  const user = await prisma.user.findFirst({
    where: { id: session.id, isActive: true },
    select: { id: true, passwordHash: true },
  });

  // Deliberately the same message as the missing session above: a signed-in
  // caller learns nothing about the account beyond "not you".
  if (!user?.passwordHash) {
    return { error: "Not authenticated" };
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect" };
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  // Worth an audit line, but never at the cost of the change itself. Skipped for
  // platform admins: ActivityLog.restaurantId is a required foreign key and they
  // carry no restaurantId, so the insert would fail.
  if (session.restaurantId) {
    try {
      await logActivity(session, {
        actionType: "PASSWORD_CHANGE",
        entityType: "User",
        entityId: user.id,
        description: "Account password changed",
      });
    } catch (logErr) {
      console.error("Failed to log password change:", logErr);
    }
  }

  return { success: true };
}

export async function createReceptionLogin(data: {
  firstName: string;
  lastName?: string;
  username: string;
  password: string;
  phoneNumber?: string;
}) {
  const session = await getSession();
  if (!session?.restaurantId || !session?.id) return { error: "Not authenticated" };
  if (!isApproverRole(session.role) && session.role !== "RESTAURANT_OWNER") {
    return { error: "Only owners and managers can create reception logins" };
  }

  if (!data.firstName || !data.username || !data.password) {
    return { error: "First name, username, and password are required" };
  }
  if (!(await isValidGmail(data.username))) {
    return { error: "Username must be a valid Gmail address (e.g. name@gmail.com)" };
  }
  if (data.password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { username: data.username, restaurantId: session.restaurantId },
    });
    if (existing) return { error: "Username already taken" };

    if (data.phoneNumber) {
      const existingPhone = await prisma.user.findFirst({
        where: { phoneNumber: data.phoneNumber, restaurantId: session.restaurantId },
      });
      if (existingPhone) return { error: "Phone number already in use within your restaurant" };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName || "",
        email: data.username,
        phoneNumber: data.phoneNumber || null,
        role: "RECEPTIONIST",
        restaurantId: session.restaurantId,
        isActive: true,
      },
    });

    await logActivity(session, {
      actionType: "RECEPTION_LOGIN_CREATE",
      entityType: "User",
      entityId: user.id,
      description: `Reception login created for ${data.firstName} ${data.lastName}`,
    });

    return { data: { id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username, phoneNumber: user.phoneNumber, isActive: user.isActive, role: user.role } };
  } catch (err: any) {
    return { error: err?.message || "Failed to create reception login" };
  }
}

export async function getReceptionLogins() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const users = await prisma.user.findMany({
      where: { restaurantId: session.restaurantId, role: "RECEPTIONIST" },
      select: { id: true, firstName: true, lastName: true, username: true, phoneNumber: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: users };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch reception logins" };
  }
}

export async function deactivateReceptionLogin(userId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  if (!isApproverRole(session.role) && session.role !== "RESTAURANT_OWNER") {
    return { error: "Only owners and managers can manage reception logins" };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId: session.restaurantId, role: "RECEPTIONIST" },
    });
    if (!user) return { error: "Reception login not found" };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });

    await logActivity(session, {
      actionType: "RECEPTION_LOGIN_DEACTIVATE",
      entityType: "User",
      entityId: userId,
      description: `Reception login deactivated`,
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to toggle reception login" };
  }
}

export async function deleteReceptionLogin(userId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  if (session.role !== "RESTAURANT_OWNER") {
    return { error: "Only the restaurant owner can delete reception logins" };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId: session.restaurantId, role: "RECEPTIONIST" },
    });
    if (!user) return { error: "Reception login not found" };

    await prisma.user.delete({ where: { id: userId } });

    await logActivity(session, {
      actionType: "RECEPTION_LOGIN_DELETE",
      entityType: "User",
      entityId: userId,
      description: `Reception login deleted`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete reception login" };
  }
}

// ── Waiter logins ──

export async function createWaiterLogin(data: {
  firstName: string;
  lastName?: string;
  username: string;
  password: string;
  phoneNumber?: string;
}) {
  const session = await getSession();
  if (!session?.restaurantId || !session?.id) return { error: "Not authenticated" };
  if (!isApproverRole(session.role) && session.role !== "RESTAURANT_OWNER") {
    return { error: "Only owners and managers can create waiter logins" };
  }

  if (!data.firstName || !data.username || !data.password) {
    return { error: "First name, username, and password are required" };
  }
  if (!(await isValidGmail(data.username))) {
    return { error: "Username must be a valid Gmail address (e.g. name@gmail.com)" };
  }
  if (data.password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { username: data.username, restaurantId: session.restaurantId },
    });
    if (existing) return { error: "Username already taken" };

    if (data.phoneNumber) {
      const existingPhone = await prisma.user.findFirst({
        where: { phoneNumber: data.phoneNumber, restaurantId: session.restaurantId },
      });
      if (existingPhone) return { error: "Phone number already in use within your restaurant" };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName || "",
        email: data.username,
        phoneNumber: data.phoneNumber || null,
        role: "WAITER",
        restaurantId: session.restaurantId,
        isActive: true,
      },
    });

    await logActivity(session, {
      actionType: "WAITER_LOGIN_CREATE",
      entityType: "User",
      entityId: user.id,
      description: `Waiter login created for ${data.firstName} ${data.lastName}`,
    });

    return { data: { id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username, phoneNumber: user.phoneNumber, isActive: user.isActive, role: user.role } };
  } catch (err: any) {
    return { error: err?.message || "Failed to create waiter login" };
  }
}

export async function getWaiterLogins() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const users = await prisma.user.findMany({
      where: { restaurantId: session.restaurantId, role: "WAITER" },
      select: { id: true, firstName: true, lastName: true, username: true, phoneNumber: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: users };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch waiter logins" };
  }
}

export async function deactivateWaiterLogin(userId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  if (!isApproverRole(session.role) && session.role !== "RESTAURANT_OWNER") {
    return { error: "Only owners and managers can manage waiter logins" };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId: session.restaurantId, role: "WAITER" },
    });
    if (!user) return { error: "Waiter login not found" };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });

    await logActivity(session, {
      actionType: "WAITER_LOGIN_DEACTIVATE",
      entityType: "User",
      entityId: userId,
      description: `Waiter login deactivated`,
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to toggle waiter login" };
  }
}

export async function deleteWaiterLogin(userId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  if (session.role !== "RESTAURANT_OWNER") {
    return { error: "Only the restaurant owner can delete waiter logins" };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId: session.restaurantId, role: "WAITER" },
    });
    if (!user) return { error: "Waiter login not found" };

    await prisma.user.delete({ where: { id: userId } });

    await logActivity(session, {
      actionType: "WAITER_LOGIN_DELETE",
      entityType: "User",
      entityId: userId,
      description: `Waiter login deleted`,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete waiter login" };
  }
}

// ── No self-serve password reset ──
//
// There was a `resetPassword(username, newPassword)` here. It set any account's
// password given only a username, email, or phone number: no session, no current
// password, no emailed token, no expiry, and no role restriction, so it reset
// SUPER_ADMIN accounts too. Being an export of a "use server" module made it a
// public POST endpoint, i.e. a one-request takeover of any account on the
// platform. The /owner/forgot-password page that called it generated its
// "verification code" in the browser and compared it against React state, so the
// UI alone was enough — no knowledge of server actions required.
//
// A correct reset needs a secret delivered out of band (a token mailed or texted
// to an address already on the account) and there is no mailer or SMS sender in
// this repo, so the flow cannot be rebuilt yet. Until then recovery is
// `resetRestaurantOwnerPassword` in lib/actions/admin.ts, which sits behind
// requireAdmin() and is wired to the superadmin console: owners go through
// platform support, and staff go through their own owner, who can already set
// staff passwords. Changing your own password is `changePassword` above.
//
// If this comes back, it must issue a single-use token with an expiry against a
// contact already stored on the user, and verify that token server side.
