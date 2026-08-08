import { getSession, type SessionUser } from "@/lib/auth";

// Tenant-scoped authorization for Server Actions. NOT a "use server" file —
// these are plain helpers imported BY the action modules, so they run inside
// the same request with no extra round-trip (same pattern as lib/plan-guard.ts).
//
// WHY THIS EXISTS
// ---------------
// Every export of a "use server" module is a publicly reachable POST endpoint.
// Neither proxy.ts nor the layout-level guardArea() protects it: those only
// gate *navigation*, and an attacker calls the action endpoint directly.
//
// The old pattern across lib/actions/* was:
//
//     const session = await getSession();
//     if (!session) return { error: "Not authenticated" };
//     await prisma.staff.findMany({ where: { restaurantId } });  // ← caller-supplied
//
// That authenticates but never *authorizes*. Because restaurantId is printed on
// every table's QR code (/r/[restaurantId]/t/[tableId]) it is public knowledge,
// so any signed-in user — including a WAITER at another restaurant — could pass
// someone else's id and read or mutate their data.
//
// The rule this module enforces: **restaurantId always comes from the session,
// never from the caller.** Actions take business arguments only.

export type TenantSession = SessionUser & { restaurantId: string };

export type TenantAuth =
  | { ok: true; session: TenantSession }
  | { ok: false; error: string };

// ── Role sets ──
// Named so call sites read as intent ("who is allowed to do this") rather than
// as a bare string array. Kept in sync with ROLE_HOME in lib/constants.ts.

/** Owner dashboard roles. Legacy STAFF lives in the owner portal. */
export const OWNER_ROLES = ["RESTAURANT_OWNER", "STAFF"] as const;

/** Owner + reception — anyone who runs the front of house (orders, bills, tables). */
export const FRONT_OF_HOUSE_ROLES = ["RESTAURANT_OWNER", "STAFF", "RECEPTIONIST"] as const;

/** Every restaurant-scoped role, including the waiter order station. */
export const ALL_TENANT_ROLES = ["RESTAURANT_OWNER", "STAFF", "RECEPTIONIST", "WAITER"] as const;

/**
 * Resolve the caller's session and guarantee it is bound to a restaurant.
 *
 * Returns a discriminated union rather than throwing, because the existing
 * actions all return `{ error }` shapes that the UI renders — throwing here
 * would surface an unstyled error overlay instead of an inline message.
 *
 * @param allowedRoles Roles permitted to run this action. Defaults to every
 *   restaurant-scoped role. Platform admins (ADMIN / SUPER_ADMIN) are NOT
 *   accepted: they carry no restaurantId, and cross-tenant admin work belongs
 *   in lib/actions/admin.ts behind requireAdmin().
 */
export async function requireTenant(
  allowedRoles: readonly string[] = ALL_TENANT_ROLES
): Promise<TenantAuth> {
  const session = await getSession();

  if (!session) return { ok: false, error: "Not authenticated" };

  // Fail closed: a restaurant-scoped role with no restaurantId is a broken
  // account (see the orphaned-user case register() used to be able to create),
  // and letting it through would mean an unscoped query.
  if (!session.restaurantId) return { ok: false, error: "No restaurant linked to this account" };

  if (!allowedRoles.includes(session.role)) {
    return { ok: false, error: "You do not have permission to do that" };
  }

  return { ok: true, session: session as TenantSession };
}

/**
 * Guard for actions whose scope is the signed-in *user* rather than a
 * restaurant (profile, notifications-for-me). Admins are allowed through
 * because they legitimately have per-user state but no restaurantId.
 */
export async function requireUser(): Promise<
  { ok: true; session: SessionUser } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return { ok: true, session };
}
