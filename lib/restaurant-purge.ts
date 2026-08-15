import prisma from "@/lib/prisma";

// Permanently erase a restaurant and everything that hangs off it.
//
// NOT a "use server" module — every export of one of those is a public POST
// endpoint, and this is a raw "delete the whole tenant" primitive with no auth
// of its own. It is a plain helper imported BY the action modules that do the
// authorization (lib/actions/admin.ts behind requireAdmin, lib/actions/settings.ts
// behind requireTenant), the same convention as lib/auth-tenant.ts.
//
// WHY THE LIST IS EXHAUSTIVE
// --------------------------
// No relation in prisma/schema.prisma declares onDelete: Cascade except
// TicketReply -> SupportTicket. Prisma emits ON DELETE RESTRICT for every
// required relation, so a single missed child table turns the whole delete into
// a foreign-key error. This list was derived from the `Restaurant` model's own
// relation block (schema.prisma:99-125) rather than by hand, so it stays
// checkable: every entry there has a line here.
//
// Callers pass the result straight to prisma.$transaction([...]) so the tenant
// is erased atomically, or not at all.
export function restaurantPurgeOperations(restaurantId: string) {
  const id = restaurantId;

  return [
    // ── Grandchildren: rows that reference a child rather than the restaurant,
    // so they have to go before the child they point at.
    prisma.payment.deleteMany({ where: { bill: { restaurantId: id } } }),
    prisma.inventoryHistory.deleteMany({ where: { item: { restaurantId: id } } }),
    prisma.orderItem.deleteMany({ where: { order: { restaurantId: id } } }),
    prisma.addOn.deleteMany({ where: { menuItem: { restaurantId: id } } }),

    // ── Rows that reference orders / tables / menu items.
    // barTab before order: BarTab.orderId points at Order.
    prisma.bill.deleteMany({ where: { restaurantId: id } }),
    prisma.barTab.deleteMany({ where: { restaurantId: id } }),
    prisma.reservation.deleteMany({ where: { restaurantId: id } }),
    prisma.order.deleteMany({ where: { restaurantId: id } }),
    prisma.menuItem.deleteMany({ where: { restaurantId: id } }),
    // Combo.categoryId points at Category, so it goes before it.
    prisma.combo.deleteMany({ where: { restaurantId: id } }),
    prisma.category.deleteMany({ where: { restaurantId: id } }),
    prisma.inventoryItem.deleteMany({ where: { restaurantId: id } }),
    // shift before staff: Shift.staffId points at Staff.
    prisma.shift.deleteMany({ where: { restaurantId: id } }),
    prisma.restaurantTable.deleteMany({ where: { restaurantId: id } }),
    prisma.staff.deleteMany({ where: { restaurantId: id } }),

    // ── Direct children of the restaurant.
    // supportTicket also carries a required userId, so it must precede the user
    // rows below. Its replies need no entry: TicketReply cascades from it.
    prisma.supportTicket.deleteMany({ where: { restaurantId: id } }),
    prisma.notification.deleteMany({ where: { restaurantId: id } }),
    prisma.activityLog.deleteMany({ where: { restaurantId: id } }),
    prisma.kpiCard.deleteMany({ where: { restaurantId: id } }),
    prisma.waitlistEntry.deleteMany({ where: { restaurantId: id } }),
    prisma.customer.deleteMany({ where: { restaurantId: id } }),
    prisma.coupon.deleteMany({ where: { restaurantId: id } }),
    prisma.corporateAccount.deleteMany({ where: { restaurantId: id } }),
    prisma.taxRate.deleteMany({ where: { restaurantId: id } }),
    prisma.space.deleteMany({ where: { restaurantId: id } }),
    prisma.operatingHours.deleteMany({ where: { restaurantId: id } }),
    prisma.subscription.deleteMany({ where: { restaurantId: id } }),

    // ── The 1-to-1 print / operational config rows.
    prisma.invoiceSetting.deleteMany({ where: { restaurantId: id } }),
    prisma.kotSetting.deleteMany({ where: { restaurantId: id } }),
    prisma.restaurantSetting.deleteMany({ where: { restaurantId: id } }),

    // ── The owner / reception / waiter logins, which cannot exist without
    // their restaurant, then the tenant root itself.
    prisma.user.deleteMany({ where: { restaurantId: id } }),
    prisma.restaurant.delete({ where: { id } }),
  ];
}
