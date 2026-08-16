"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { notifyServers } from "@/lib/order-helpers";
import { verifyManagerApproval } from "@/lib/manager-approval";
import { newTableToken } from "@/lib/table-token";
import { calculateBill } from "@/lib/billing/calculate";
import {
  resolveBillingConfig,
  registrationTypeFor,
  cbmsRequired,
  type PricingMode,
} from "@/lib/billing/config";
import { allocateInvoiceNumber, runWithSerialRetry } from "@/lib/billing/serial";
import { buildBillLines } from "@/lib/billing/lines";
import {
  outletFromRestaurant,
  paymentMethodFor,
  displayOptionsFrom,
  INVOICE_DISPLAY_SELECT,
  type TaxInvoicePayload,
} from "@/lib/billing/receipt";

const SELF_VOID_ROLES = ["RECEPTIONIST", "MANAGER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN"];

// Order lifecycle: PENDING → PREPARING → READY → SERVED (+ Bill = closed)
// CANCELLED is allowed from PENDING/PREPARING only.
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED", "PENDING"], // PENDING allows kitchen undo
  READY: ["SERVED", "PREPARING"], // PREPARING allows kitchen undo
  SERVED: [],
  CANCELLED: [],
};

/** Frees the table if this order is the one occupying it. */
async function releaseTableForOrder(tx: any, order: { id: string; tableId: string | null }) {
  if (!order.tableId) return;
  const table = await tx.restaurantTable.findUnique({ where: { id: order.tableId } });
  if (table?.currentOrderId === order.id) {
    // Only free the table when it has no other open orders
    const otherOpen = await tx.order.findFirst({
      where: {
        tableId: order.tableId,
        id: { not: order.id },
        status: { in: ["PENDING", "PREPARING", "READY"] },
      },
      select: { id: true },
    });
    await tx.restaurantTable.update({
      where: { id: order.tableId },
      data: otherOpen
        ? { currentOrderId: otherOpen.id }
        : {
            status: "AVAILABLE",
            currentOrderId: null,
            occupiedSince: null,
            assignedWaiterId: null,
            // The party has paid and left: rotate the QR token so the link they
            // scanned can't be used to order again once they're gone.
            qrCode: newTableToken(),
          },
    });
  }
}

const TABLE_ORDER_TYPES = ["DINE_IN"];

export async function createOrder(data: {
  draftItems: Array<{ menuItem: { id: string, name: string, price: number }, quantity: number, notes?: string }>;
  tableNumber: string | null;
  guestCount: number;
  /** DINE_IN | TAKEAWAY | DELIVERY | PICKUP. Defaults by table presence. */
  orderType?: string;
}) {
  const session = await getSession();
  if (!session || !session.restaurantId) {
    return { error: "Not authenticated" };
  }
  const restaurantId = session.restaurantId;

  try {
    // Verify items against the menu in one query; recompute prices server-side
    const menuItemIds = data.draftItems.map((i) => i.menuItem.id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId, isAvailable: true },
    });
    const menuById = new Map(menuItems.map((m) => [m.id, m]));

    let subtotal = 0;
    const itemsToCreate: {
      menuItemId: string;
      menuItemName: string;
      quantity: number;
      pricePerUnit: number;
      specialInstructions: string | null;
      status: string;
    }[] = [];
    const unavailable: string[] = [];

    for (const item of data.draftItems) {
      const menuItem = menuById.get(item.menuItem.id);
      if (!menuItem) {
        unavailable.push(item.menuItem.name);
        continue;
      }
      if (item.quantity < 1) continue;

      const price = menuItem.discountPrice ?? menuItem.price;
      subtotal += price * item.quantity;

      itemsToCreate.push({
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        quantity: item.quantity,
        pricePerUnit: price,
        specialInstructions: item.notes || null,
        status: "PENDING",
      });
    }

    if (itemsToCreate.length === 0) {
      return {
        error: unavailable.length > 0
          ? `These items are no longer available: ${unavailable.join(", ")}`
          : "No valid items in order.",
      };
    }

    // Honour the caller's order type; fall back to the old table-presence rule
    // for callers that don't send one.
    const orderType = (data.orderType || (data.tableNumber ? "DINE_IN" : "TAKEAWAY")).toUpperCase();
    const takesTable = TABLE_ORDER_TYPES.includes(orderType);

    // Resolve the table — only dine-in sits at one. Ignoring it otherwise stops
    // a delivery/takeaway order inheriting a stale table and occupying it.
    let table: Awaited<ReturnType<typeof prisma.restaurantTable.findUnique>> = null;
    if (takesTable && data.tableNumber) {
      const tableNum = parseInt(data.tableNumber, 10);
      if (!isNaN(tableNum)) {
        table = await prisma.restaurantTable.findUnique({
          where: {
            restaurantId_tableNumber: { restaurantId, tableNumber: tableNum },
          },
        });
      }
      if (!table) {
        return { error: `Table ${data.tableNumber} does not exist. Please pick a table from the list.` };
      }
    }

    // Friendly order number: continue from the restaurant's latest order
    const lastOrder = await prisma.order.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      select: { orderId: true },
    });
    const lastNumber = parseInt(lastOrder?.orderId ?? "", 10);
    let nextNumber = isNaN(lastNumber) ? 1001 : lastNumber + 1;

    // No VAT/tax is added — the order total is exactly the sum of menu prices.
    const taxAmount = 0;
    const totalAmount = subtotal;

    // Retry on orderId collision from concurrent order creation
    let order;
    for (let attempt = 0; ; attempt++) {
      try {
        order = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              restaurantId,
              tableId: table?.id ?? null,
              orderId: nextNumber.toString(),
              orderType,
              status: "PENDING",
              subtotal,
              taxAmount,
              totalAmount,
              assignedWaiterId: session.id,
              items: { create: itemsToCreate },
            },
            include: { items: true },
          });

          // Occupy the table while it has an open order
          if (table) {
            await tx.restaurantTable.update({
              where: { id: table.id },
              data: {
                status: "OCCUPIED",
                currentOrderId: created.id,
                occupiedSince: table.status === "OCCUPIED" ? table.occupiedSince : new Date(),
                assignedWaiterId: session.id,
              },
            });
          }
          return created;
        });
        break;
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < 5) {
          nextNumber++;
          continue;
        }
        throw err;
      }
    }

    await logActivity(session, {
      actionType: "ORDER_CREATE",
      entityType: "Order",
      entityId: order.id,
      description: `Order ${order.orderId} created for table ${data.tableNumber} (${data.draftItems.length} items)`,
    });

    // Ring the front of house (owner/reception/other waiters) for the new order.
    // `notifyAll` overrides the assigned-waiter shortcut — the creator assigns
    // themselves, so without it nobody but them would ever hear about it — and
    // `excludeUserId` keeps the person who just tapped "send" from self-pinging.
    // Best-effort: the order is already committed, so a failure here isn't fatal.
    try {
      const whereLabel = data.tableNumber ? `Table ${data.tableNumber}` : "Takeaway";
      await notifyServers(
        restaurantId,
        order,
        "New Order Request",
        `Order #${order.orderId} added from ${whereLabel} — ${itemsToCreate.length} item${itemsToCreate.length !== 1 ? "s" : ""}, Rs ${totalAmount}`,
        "NEW_ORDER",
        { notifyAll: true, excludeUserId: session.id }
      );
    } catch (notifyErr) {
      console.error("Failed to notify staff of new order:", notifyErr);
    }

    if (unavailable.length > 0) {
      return { data: order, warning: `Skipped unavailable items: ${unavailable.join(", ")}` };
    }
    return { data: order };
  } catch (err: any) {
    console.error("Failed to create order:", err);
    return { error: err?.message || "Failed to create order" };
  }
}

export async function getKitchenOrders() {
  const session = await getSession();
  if (!session || !session.restaurantId) {
    return { error: "Not authenticated" };
  }

  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000); // keep READY visible for 12h max
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: session.restaurantId,
        OR: [
          { status: { in: ["PENDING", "PREPARING"] } },
          { status: "READY", updatedAt: { gte: cutoff } },
        ],
      },
      include: {
        items: true,
        table: { select: { tableNumber: true } },
      },
      orderBy: { createdAt: "asc" }, // oldest first — kitchen works FIFO
    });

    return { data: orders };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch kitchen orders" };
  }
}

/** Active orders for the waiter view: everything not yet served/cancelled, plus served-but-unbilled. */
export async function getActiveOrders() {
  const session = await getSession();
  if (!session || !session.restaurantId) {
    return { error: "Not authenticated" };
  }

  try {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: session.restaurantId,
        OR: [
          { status: { in: ["PENDING", "PREPARING", "READY"] } },
          { status: "SERVED", bills: { none: {} } },
        ],
      },
      include: {
        items: {
          include: {
            menuItem: { select: { imageUrl: true } },
          },
        },
        table: { select: { tableNumber: true } },
        bills: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: orders };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch active orders" };
  }
}

export async function updateOrderStatus(orderId: string, status: string) {
  const session = await getSession();
  if (!session || !session.restaurantId) {
    return { error: "Not authenticated" };
  }

  try {
    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: session.restaurantId },
      select: { id: true, status: true, tableId: true },
    });
    if (!existing) return { error: "Order not found" };

    if (!VALID_TRANSITIONS[existing.status]?.includes(status)) {
      return { error: `Cannot change order from ${existing.status} to ${status}` };
    }

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          updatedAt: new Date(),
          ...(status === "SERVED" ? { completedAt: new Date() } : {}),
          ...(status === "PREPARING" && existing.status === "READY" ? { completedAt: null } : {}),
        },
        include: { table: true },
      });

      // Cancelling releases the table (if no other open orders on it)
      if (status === "CANCELLED") {
        await releaseTableForOrder(tx, updated);
        await tx.orderItem.updateMany({
          where: { orderId },
          data: { status: "CANCELLED" },
        });
      }
      if (status === "SERVED") {
        await tx.orderItem.updateMany({
          where: { orderId, status: { not: "CANCELLED" } },
          data: { status: "SERVED", servedAt: new Date() },
        });
      }
      return updated;
    });

    // When food is READY, alert whoever is serving
    if (status === "READY") {
      const tableLabel = (order as any).table?.tableNumber
        ? `Table ${(order as any).table.tableNumber}`
        : order.orderType;
      await notifyServers(
        session.restaurantId,
        order,
        "🍽️ Food Ready!",
        `Order #${order.orderId} (${tableLabel}) is ready to serve.`,
        "ORDER_READY"
      );
    }

    await logActivity(session, {
      actionType: "ORDER_STATUS_UPDATE",
      entityType: "Order",
      entityId: orderId,
      description: `Order status updated to ${status}`,
    });

    return { data: order };
  } catch (err: any) {
    return { error: err?.message || "Failed to update order status" };
  }
}

/**
 * Settles an order: creates the bill, marks the order SERVED (if not already),
 * and frees the table. This is the step that closes an order in the real flow.
 */
export async function settleOrder(data: {
  orderId: string;
  paymentMethod: "CASH" | "ESEWA" | "KHALTI" | "FONEPAY";
  amountPaid?: number;
  discountAmount?: number;
  discountReason?: string;
  paymentRef?: string;
  /**
   * Counter sale: the guest pays up front, so the order is billed the moment
   * it's raised instead of after it has been cooked and served.
   */
  quickBill?: boolean;
}) {
  const session = await getSession();
  if (!session || !session.restaurantId) {
    return { error: "Not authenticated" };
  }
  const restaurantId = session.restaurantId;

  try {
    // Order lookup and restaurant lookup are independent — run them together
    // so the checkout tap pays one DB round-trip instead of two. The old
    // "last bill number" probe is gone: invoice numbers now come from
    // allocateInvoiceNumber inside the transaction, where the unique
    // constraint can actually arbitrate them.
    const [order, restaurant] = await Promise.all([
      prisma.order.findFirst({
        where: { id: data.orderId, restaurantId },
        include: {
          bills: { select: { id: true } },
          table: { select: { tableNumber: true, name: true } },
          // Loaded so the bill can be itemised: the engine decides VAT line by
          // line, and Schedule 1 exempt goods are unreachable from an aggregate.
          items: {
            select: {
              menuItemName: true,
              quantity: true,
              pricePerUnit: true,
              status: true,
              vatExempt: true,
              hsCode: true,
            },
          },
        },
      }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          street: true,
          city: true,
          state: true,
          phoneNumber: true,
          websiteUrl: true,
          logoUrl: true,
          vatRegistered: true,
          taxPercentage: true,
          serviceCharge: true,
          panNumber: true,
          vatNumber: true,
          pricingMode: true,
          branchCode: true,
          rollingTurnover: true,
        },
      }),
    ]);
    if (!order) return { error: "Order not found" };
    if (order.status === "CANCELLED") return { error: "Cannot bill a cancelled order" };
    if (order.billId || order.bills.length > 0) {
      return { error: "This order has already been billed" };
    }

    // A party that orders a second round shouldn't get a second bill. Settle
    // every unbilled order still open at their table as one check — the guest
    // pays once, and the next round only starts a fresh bill after this one is
    // paid (these orders are all marked billed below).
    const siblingOrders = order.tableId
      ? await prisma.order.findMany({
          where: {
            restaurantId,
            tableId: order.tableId,
            id: { not: order.id },
            billId: null,
            status: { notIn: ["CANCELLED"] },
          },
          include: {
            items: {
              select: {
                menuItemName: true,
                quantity: true,
                pricePerUnit: true,
                status: true,
                vatExempt: true,
                hsCode: true,
              },
            },
          },
        })
      : [];

    const billedOrders = [order, ...siblingOrders];
    const settledAt = new Date();

    // Is anyone else still eating at this table? Resolved out here rather than
    // inside the transaction: it reads only rows the transaction never writes,
    // so the answer can't change underneath us, and it keeps a round-trip out
    // of the transaction's time budget.
    const stillOpen = order.tableId
      ? await prisma.order.findFirst({
          where: {
            tableId: order.tableId,
            billId: null,
            id: { notIn: billedOrders.map((o) => o.id) },
            status: { in: ["PENDING", "PREPARING", "READY"] },
          },
          select: { id: true },
        })
      : null;
    const groupSubtotal = billedOrders.reduce((sum, o) => sum + o.subtotal, 0);
    const groupService = billedOrders.reduce((sum, o) => sum + o.serviceCharge, 0);

    const discount = Math.min(Math.max(data.discountAmount ?? 0, 0), groupSubtotal);

    // The bill figures come from lib/billing/calculate.ts rather than ad-hoc
    // arithmetic here, so the live checkout and issueBill() cannot drift apart
    // on rounding, exemptions or pricing mode.
    const billingConfig = resolveBillingConfig(restaurant);
    const registrationType = registrationTypeFor(restaurant ?? {});
    // KNOWN GAP: the ordering/cart path still renders menu prices as final, so
    // an outlet that switches to ADDITIVE gets VAT stacked on top at settle
    // time only. ADDITIVE is not yet supported end to end; see bill-design.md
    // section 17, which lists the inclusive-vs-additive posture as unresolved.
    const pricingMode = (restaurant?.pricingMode as PricingMode) ?? "INCLUSIVE";

    // Itemised so Schedule 1 exempt goods are actually excluded from the
    // taxable base. buildBillLines falls back to a single aggregate line if the
    // stored subtotal and its items disagree, so a check whose totals were
    // never recomputed after a cancellation still bills for the same amount.
    const { lines, reconciled } = buildBillLines({
      items: billedOrders.flatMap((o) => o.items ?? []),
      subtotal: groupSubtotal,
      serviceCharge: groupService,
      fallbackLabel: `Order ${order.orderId}`,
    });
    if (!reconciled) {
      console.warn(
        `[settleOrder] order ${order.orderId}: line items do not sum to subtotal ${groupSubtotal}; billing the aggregate and skipping per-line VAT treatment.`
      );
    }

    const calculation = calculateBill({
      lines,
      config: billingConfig,
      pricingMode,
      registrationType,
      discountAmount: discount,
      // Service charge is already a line above; applying it again double-charges.
      applyServiceCharge: false,
    });

    const totalAmount = calculation.grandTotal;
    const taxable = calculation.taxableValue;
    const vat = calculation.vatAmount;

    const amountPaid = data.amountPaid ?? totalAmount;
    if (amountPaid < totalAmount - 0.01) {
      return { error: `Amount paid (${amountPaid}) is less than the total (${totalAmount.toFixed(2)})` };
    }

    // CBMS never blocks closing a ticket: the bill is written PENDING and a
    // background worker drains the queue.
    const cbmsStatus =
      registrationType === "VAT" &&
      cbmsRequired(restaurant?.rollingTurnover ?? 0, billingConfig, "hospitality")
        ? "PENDING"
        : "NOT_REQUIRED";

    // runWithSerialRetry re-runs the whole transaction if another cashier took
    // the sequence between our read and our write. Everything inside is either
    // rolled back or keyed off `created`, so a retry is safe to repeat.
    const bill = await runWithSerialRetry(async () =>
      prisma.$transaction(async (tx) => {
          const allocated = await allocateInvoiceNumber(tx, {
            restaurantId,
            branchCode: restaurant?.branchCode,
          });

          const created = await tx.bill.create({
            data: {
              restaurantId,
              orderId: order.id,
              billNumber: allocated.billNumber,
              fiscalYear: allocated.fiscalYear,
              sequence: allocated.sequence,
              billDateBS: allocated.billDateBS,
              billDate: allocated.billDate,
              pricingMode,
              isAbbreviated: calculation.isAbbreviated,
              subtotal: groupSubtotal,
              taxableAmount: taxable,
              taxAmount: vat,
              serviceCharge: groupService,
              discountAmount: discount,
              exemptAmount: calculation.exemptValue,
              totalAmount,
              amountPaid,
              change: amountPaid - totalAmount,
              paymentMethod: data.paymentMethod,
              paymentRef: data.paymentRef || null,
              cbmsStatus,
              status: "PAID",
              settledAt: new Date(),
              createdBy: session.id,
            },
          });

          await tx.payment.create({
            data: {
              billId: created.id,
              method: data.paymentMethod,
              amount: amountPaid,
              reference: data.paymentRef || null,
            },
          });

          // Attach the siblings this bill also settles. `billId` is what stops
          // a second round being billed again, and what makes the next round
          // start a fresh bill only once this one is paid. Skipped entirely
          // for a lone order — every statement here is a round-trip to a
          // remote DB, and the transaction budget is spent in round-trips.
          if (siblingOrders.length > 0) {
            await tx.order.updateMany({
              where: { id: { in: siblingOrders.map((o) => o.id) } },
              data: {
                status: "SERVED",
                billId: created.id,
                completedAt: settledAt,
              },
            });
          }

          // The anchor carries the same billing stamp plus the discount and
          // settled total, which belong to it alone — applying those to each
          // sibling would count the group total many times over.
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "SERVED",
              billId: created.id,
              completedAt: settledAt,
              discountAmount: discount,
              discountReason: data.discountReason || order.discountReason,
              totalAmount,
            },
          });

          // Free the table once. Every covered order shares this table, so
          // looping releaseTableForOrder per order only repeated the same work.
          // Keying off the table (not the anchor order) also means it still
          // frees when the waiter settles from an order that isn't the one
          // recorded in `currentOrderId`. `stillOpen` is resolved before the
          // transaction opens — it only reads rows this transaction never
          // touches, so hoisting it costs no correctness and one less
          // round-trip inside the budget.
          if (order.tableId) {
            await tx.restaurantTable.update({
              where: { id: order.tableId },
              data: stillOpen
                ? { currentOrderId: stillOpen.id }
                : {
                    status: "AVAILABLE",
                    currentOrderId: null,
                    occupiedSince: null,
                    assignedWaiterId: null,
                    // Party paid and left — retire the QR link they scanned.
                    qrCode: newTableToken(),
                  },
            });
          }
          return created;
          // Neon is remote and every statement above is a round-trip; 20s was
          // not enough headroom on a slow link and settled bills were failing
          // mid-transaction.
        }, { timeout: 60000, maxWait: 15000 })
    );

    await logActivity(session, {
      actionType: "ORDER_SETTLE",
      entityType: "Order",
      entityId: order.id,
      description: `Order ${order.orderId} settled`,
    });

    // Mirror the checkout flow: a settled order produces a fully-paid bill, so
    // record a "completed" entry the owner can scan in the activity log.
    await logActivity(session, {
      actionType: "BILL_COMPLETED",
      entityType: "Bill",
      entityId: bill.id,
      description: `Bill ${bill.billNumber} completed — total ${totalAmount} paid in full via ${data.paymentMethod}`,
    });

    // assignedWaiterId has no Prisma relation (it points at users.id, the
    // login identity, not the Staff HR record), so the name is a one-off
    // lookup rather than an include — same pattern as prepareKot in kot.ts.
    // Paired with the invoice display toggles, which are only needed once the
    // bill exists and so stay off the checkout's critical path.
    const [waiter, invoiceSetting] = await Promise.all([
      order.assignedWaiterId
        ? prisma.user.findUnique({
            where: { id: order.assignedWaiterId },
            select: { firstName: true, lastName: true, username: true },
          })
        : null,
      prisma.invoiceSetting.findUnique({
        where: { restaurantId },
        select: INVOICE_DISPLAY_SELECT,
      }),
    ]);
    const waiterName = waiter
      ? [waiter.firstName, waiter.lastName].filter(Boolean).join(" ").trim() || waiter.username || null
      : null;

    // The document the guest is handed is rendered from the same calculation
    // the bill was written from, not from a re-derivation on the client. A
    // reprint months later re-reads the stored columns instead (getBill), so a
    // later VAT-rate change cannot retroactively alter a historical invoice.
    const invoice: TaxInvoicePayload = {
      calculation,
      config: billingConfig,
      registrationType,
      outlet: outletFromRestaurant(restaurant),
      invoiceNumber: bill.billNumber,
      billDateBS: bill.billDateBS ?? "",
      billDateAD: (bill.settledAt ?? bill.createdAt).toISOString(),
      paymentMethod: paymentMethodFor(data.paymentMethod),
      amountPaid,
      change: amountPaid - totalAmount,
      billedBy: waiterName,
      tableLabel: order.table ? order.table.name || `T${order.table.tableNumber}` : null,
      orderType: order.orderType ?? null,
      customerName: order.customerName ?? null,
      options: displayOptionsFrom(invoiceSetting),
    };

    return {
      data: {
        ...bill,
        orderNo: order.orderId,
        tableNo: order.table ? order.table.name || `T${order.table.tableNumber}` : null,
        customerName: order.customerName,
        waiterName,
        restaurant,
        invoice,
      },
    };
  } catch (err: any) {
    console.error("Failed to settle order:", err);
    return { error: err?.message || "Failed to settle order" };
  }
}

/**
 * Fetches unread ORDER_READY notifications for the currently logged-in user.
 * Called by the /order page on a polling interval so waiters see food-ready alerts.
 */
export async function getReadyOrderNotifications() {
  const session = await getSession();
  if (!session || !session.id) {
    return { error: "Not authenticated" };
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        recipientUserId: session.id,
        type: "ORDER_READY",
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        message: true,
        createdAt: true,
        relatedEntityId: true,
      },
    });
    return { data: notifications };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch notifications" };
  }
}

/**
 * Marks a batch of ORDER_READY notifications as read.
 * Called after displaying toasts so they don't re-appear on the next poll.
 */
export async function markNotificationsRead(ids: string[]) {
  const session = await getSession();
  if (!session || !session.id) return { error: "Not authenticated" };

  try {
    await prisma.notification.updateMany({
      where: { id: { in: ids }, recipientUserId: session.id },
      data: { isRead: true, readAt: new Date() },
    });
    return { data: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to mark notifications read" };
  }
}

/** Recomputes subtotal/total from an order's non-cancelled items. No VAT is added — totals are plain menu prices. */
function recomputeOrderTotals(items: { pricePerUnit: number; quantity: number; status: string }[], serviceCharge: number, discountAmount: number) {
  const subtotal = items
    .filter((i) => i.status !== "CANCELLED")
    .reduce((s, i) => s + i.pricePerUnit * i.quantity, 0);
  const taxAmount = 0;
  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  const totalAmount = subtotal + serviceCharge - discount;
  return { subtotal, taxAmount, totalAmount, discount };
}

/**
 * Voids a single order item (e.g. kitchen mistake, guest changed their mind) and
 * recomputes the order's totals. Requires a manager/owner/admin to authorize with
 * their own credentials. Only allowed before the order has been paid.
 */
export async function voidOrderItem(data: {
  orderItemId: string;
  reason: string;
  approverUsername?: string;
  approverPassword?: string;
  /**
   * How many units to cancel. Defaults to the whole line; pass a smaller number
   * to cancel only part of a multi-quantity line (e.g. 1 of "2x Black Forest
   * Cake") instead of the entire line.
   */
  quantity?: number;
}) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };
  if (!data.reason?.trim()) return { error: "A void reason is required" };

  try {
    const wantsApproval = !!(data.approverUsername?.trim() && data.approverPassword);

    let voidedById = session.id;
    let approvalNote = "self-authorized";

    if (wantsApproval) {
      const approval = await verifyManagerApproval(
        session.restaurantId,
        data.approverUsername!.trim(),
        data.approverPassword!
      );
      if (!approval.ok) return { error: approval.error };
      voidedById = approval.approverId;
      approvalNote = `approved by ${approval.approverName}`;
    } else if (!SELF_VOID_ROLES.includes(session.role)) {
      return { error: "You are not allowed to void an item. Ask a manager or owner to approve." };
    }

    const [item] = await Promise.all([
      prisma.orderItem.findUnique({
        where: { id: data.orderItemId },
        include: { order: { include: { items: true, bills: { select: { status: true } } } } },
      }),
    ]);
    if (!item || item.order.restaurantId !== session.restaurantId) return { error: "Order item not found" };
    if (item.status === "CANCELLED") return { error: "Item is already voided" };
    if (item.order.bills.some((b) => b.status === "PAID")) {
      return { error: "Cannot void an item on a paid bill" };
    }

    const voidQuantity = data.quantity && data.quantity > 0
      ? Math.min(data.quantity, item.quantity)
      : item.quantity;
    const isPartial = voidQuantity < item.quantity;

    const order = await prisma.$transaction(async (tx) => {
      if (isPartial) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity - voidQuantity,
            voidedBy: voidedById,
            voidReason: data.reason.trim(),
            voidedAt: new Date(),
          },
        });

        const remainingItems = item.order.items.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity - voidQuantity } : i
        );
        const { subtotal, taxAmount, totalAmount, discount } = recomputeOrderTotals(
          remainingItems,
          item.order.serviceCharge,
          item.order.discountAmount
        );

        return tx.order.update({
          where: { id: item.order.id },
          data: { subtotal, taxAmount, totalAmount, discountAmount: discount },
          include: { items: true },
        });
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          status: "CANCELLED",
          voidedBy: voidedById,
          voidReason: data.reason.trim(),
          voidedAt: new Date(),
        },
      });

      const remainingItems = item.order.items.map((i) =>
        i.id === item.id ? { ...i, status: "CANCELLED" } : i
      );
      const { subtotal, taxAmount, totalAmount, discount } = recomputeOrderTotals(
        remainingItems,
        item.order.serviceCharge,
        item.order.discountAmount
      );

      return tx.order.update({
        where: { id: item.order.id },
        data: { subtotal, taxAmount, totalAmount, discountAmount: discount },
        include: { items: true },
      });
    });

    await prisma.activityLog.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        actionType: "ORDER_ITEM_VOID",
        entityType: "OrderItem",
        entityId: item.id,
        description: `${item.menuItemName} x${voidQuantity}${isPartial ? ` of ${item.quantity}` : ""} voided from order ${item.order.orderId} by ${session.username} (${approvalNote}): ${data.reason.trim()}`,
      },
    });

    return { data: order };
  } catch (err: any) {
    return { error: err?.message || "Failed to void order item" };
  }
}

/**
 * Voids an entire order after it has left the kitchen queue (READY/SERVED), which
 * the normal kitchen-side cancel flow doesn't allow. Requires manager approval and
 * is blocked once the order has been paid.
 */
export async function voidOrder(data: {
  orderId: string;
  reason: string;
  approverUsername?: string;
  approverPassword?: string;
}) {
  const session = await getSession();
  if (!session || !session.restaurantId) return { error: "Not authenticated" };
  if (!data.reason?.trim()) return { error: "A void reason is required" };

  try {
    const wantsApproval = !!(data.approverUsername?.trim() && data.approverPassword);

    let voidedById = session.id;
    let approvalNote = "self-authorized";

    if (wantsApproval) {
      const approval = await verifyManagerApproval(
        session.restaurantId,
        data.approverUsername!.trim(),
        data.approverPassword!
      );
      if (!approval.ok) return { error: approval.error };
      voidedById = approval.approverId;
      approvalNote = `approved by ${approval.approverName}`;
    } else if (!SELF_VOID_ROLES.includes(session.role)) {
      return { error: "You are not allowed to void an order. Ask a manager or owner to approve." };
    }

    const order = await prisma.order.findFirst({
      where: { id: data.orderId, restaurantId: session.restaurantId },
      include: { bills: { select: { status: true } } },
    });
    if (!order) return { error: "Order not found" };
    if (order.status === "CANCELLED") return { error: "Order is already cancelled" };
    if (order.bills.some((b) => b.status === "PAID")) {
      return { error: "Cannot void an order with a paid bill" };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          voidedBy: voidedById,
          voidReason: data.reason.trim(),
          voidedAt: new Date(),
        },
        include: { table: true },
      });
      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: { status: "CANCELLED" },
      });
      await releaseTableForOrder(tx, result);
      return result;
    });

    await prisma.activityLog.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        actionType: "ORDER_VOID",
        entityType: "Order",
        entityId: order.id,
        description: `Order ${order.orderId} voided by ${session.username} (${approvalNote}): ${data.reason.trim()}`,
      },
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to void order" };
  }
}

/**
 * Everything the checkout screen needs for one table, in a single round-trip.
 *
 * Returns the anchor order plus every other unbilled round at the same table —
 * the exact set `settleOrder` will sweep onto one bill — so the screen quotes
 * the same figure that gets charged.
 */
export async function getTableCheckout(orderId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  const restaurantId = session.restaurantId;

  try {
    const anchor = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: true,
        table: { select: { tableNumber: true, name: true } },
        bills: { select: { id: true } },
      },
    });
    if (!anchor) return { error: "Order not found" };

    const siblings = anchor.tableId
      ? await prisma.order.findMany({
          where: {
            restaurantId,
            tableId: anchor.tableId,
            id: { not: anchor.id },
            billId: null,
            status: { notIn: ["CANCELLED"] },
          },
          include: { items: true },
        })
      : [];

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true, vatRegistered: true, taxPercentage: true,
        // pricingMode and serviceCharge feed the checkout screen's own call to
        // calculateBill: without them it cannot preview an ADDITIVE bill and
        // would quote the guest a total that settleOrder then disagrees with.
        pricingMode: true, serviceCharge: true,
        panNumber: true, vatNumber: true,
        street: true, city: true, state: true, phoneNumber: true, websiteUrl: true,
      },
    });

    const orders = [anchor, ...siblings];
    // Voided lines are off the bill, so they're off the checkout screen too.
    const items = orders.flatMap((o) =>
      o.items
        .filter((i) => i.status !== "CANCELLED" && i.status !== "VOIDED")
        .map((i) => ({
          id: i.id,
          name: i.menuItemName,
          quantity: i.quantity,
          rate: i.pricePerUnit,
          total: i.pricePerUnit * i.quantity,
          // Carried so the preview taxes the same lines the bill will: an
          // aggregate figure cannot express a Schedule 1 exemption.
          vatExempt: i.vatExempt,
          hsCode: i.hsCode,
        }))
    );

    return {
      data: {
        anchorId: anchor.id,
        orderIds: orders.map((o) => o.orderId),
        alreadyBilled: !!anchor.billId || anchor.bills.length > 0,
        tableLabel: anchor.table
          ? anchor.table.name || `Table ${anchor.table.tableNumber}`
          : null,
        orderType: anchor.orderType,
        customerName: anchor.customerName,
        openedAt: orders.reduce<Date>(
          (oldest, o) => (o.createdAt < oldest ? o.createdAt : oldest),
          anchor.createdAt
        ),
        items,
        subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
        serviceCharge: orders.reduce((s, o) => s + o.serviceCharge, 0),
        restaurant,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load checkout" };
  }
}
