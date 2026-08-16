import prisma from "@/lib/prisma";

// Internal server helper shared by lib/actions/orders.ts and
// lib/actions/public-order.ts. A plain module, NOT "use server", for the same
// reason lib/activity-log.ts and lib/auth-tenant.ts are plain modules: it
// performs no authorization of its own, so exporting it from a "use server"
// file turned it into a public POST endpoint in its own right.
//
// That mattered here more than most. Its arguments are a restaurantId, a title,
// a message, a type and an actionUrl, and it fans them out to every active
// front-of-house user at that restaurant. As an endpoint, that is an
// unauthenticated push channel into staff notification lists: any caller could
// deliver arbitrary text with an arbitrary "View" link, arriving with the same
// presentation as a genuine system alert, at any restaurantId - and every
// restaurantId is public, since it is printed on every table QR sticker. Both
// call sites are server modules, so it never needed to be browser-reachable.
//
// The guest-facing QR order flow (public-order.ts) is legitimately
// unauthenticated and still calls this. It validates the restaurant, table and
// QR token first, which is exactly the gate a bare endpoint skipped.

/** Notifies the assigned waiter, or every active waiter/staff member if unassigned. */
export async function notifyServers(
  restaurantId: string,
  order: { id: string; orderId: string; assignedWaiterId: string | null },
  title: string,
  message: string,
  type: string,
  opts?: {
    /** Where the notification's "View" button should take the recipient. */
    actionUrl?: string;
    /** Never notify this user, so the person who just acted isn't pinged. */
    excludeUserId?: string;
    /** Alert the whole front of house even when the order has an assigned waiter. */
    notifyAll?: boolean;
  }
) {
  let recipientIds: string[];
  if (order.assignedWaiterId && !opts?.notifyAll) {
    recipientIds = [order.assignedWaiterId];
  } else {
    // Owners don't need to hear every "food ready" ring; all other types go to
    // everyone active on the floor.
    //
    // The owner role is spelled RESTAURANT_OWNER - that is the string
    // OWNER_ROLES in lib/auth-tenant.ts authorises against, and what every
    // owner account carries. This exclusion used to name a bare "OWNER", which
    // `User.role` being a free-text String let it match nothing: every actual
    // owner kept being pinged on every single order-ready, which is the exact
    // thing the comment above says not to do. The one row that did hold "OWNER"
    // came from prisma/seed.ts and has been corrected there and in the data.
    const excludeRoles =
      type === "ORDER_READY"
        ? ["KITCHEN", "ADMIN", "SUPER_ADMIN", "RESTAURANT_OWNER"]
        : ["KITCHEN", "ADMIN", "SUPER_ADMIN"];
    const servers = await prisma.user.findMany({
      where: { restaurantId, role: { notIn: excludeRoles }, isActive: true },
      select: { id: true },
    });
    recipientIds = servers.map((s) => s.id);
  }
  if (opts?.excludeUserId) {
    recipientIds = recipientIds.filter((id) => id !== opts.excludeUserId);
  }
  if (recipientIds.length === 0) return;

  await prisma.notification.createMany({
    data: recipientIds.map((id) => ({
      recipientUserId: id,
      restaurantId,
      type,
      title,
      message,
      relatedEntityId: order.id,
      relatedEntityType: "Order",
      actionUrl: opts?.actionUrl ?? null,
    })),
  });
}
