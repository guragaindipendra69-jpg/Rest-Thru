"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { verifyManagerApproval } from "@/lib/manager-approval";
import { calculateBill } from "@/lib/billing/calculate";
import {
  resolveBillingConfig,
  registrationTypeFor,
  cbmsRequired,
  type PricingMode,
} from "@/lib/billing/config";
import { allocateInvoiceNumber, runWithSerialRetry } from "@/lib/billing/serial";
import { buildBillLines, type OrderLineRow } from "@/lib/billing/lines";

/**
 * Recomputes a pending bill's money columns for a new discount, through the
 * billing engine and under the bill's own pricing mode.
 *
 * This arithmetic must not be done by hand. `subtotal + serviceCharge -
 * discount` is the gross total in INCLUSIVE mode only. In ADDITIVE mode the
 * menu price is a pre-VAT base and VAT is stacked on top (section 8.2 of
 * bill-design.md), so treating that sum as the total drops the VAT the outlet
 * owes and undercharges the guest by the entire tax. Feeding the order's lines
 * back through calculateBill also keeps Schedule 1 exempt items out of the
 * taxable base, which one aggregate figure cannot express, and keeps discount
 * apportionment between taxable and exempt value in the single place that
 * implements it.
 *
 * `pricingMode` comes from the bill, not from the restaurant's current setting:
 * the bill was issued under one mode, and flipping the outlet's setting
 * afterwards must not retroactively change what an open ticket owes.
 *
 * The engine clamps the discount itself, so the returned `discountAmount` is
 * what was actually applied rather than what was asked for.
 */
function recalculateWithDiscount(
  bill: {
    billNumber: string;
    subtotal: number;
    serviceCharge: number;
    pricingMode: string | null;
    order?: { items?: OrderLineRow[] | null } | null;
  },
  restaurant: { vatRegistered: boolean; taxPercentage: number } | null,
  requestedDiscount: number,
) {
  const { lines } = buildBillLines({
    items: bill.order?.items ?? [],
    subtotal: bill.subtotal,
    serviceCharge: bill.serviceCharge,
    fallbackLabel: `Bill ${bill.billNumber}`,
  });

  const calculation = calculateBill({
    lines,
    config: resolveBillingConfig(restaurant),
    pricingMode: (bill.pricingMode as PricingMode) ?? "INCLUSIVE",
    registrationType: registrationTypeFor(restaurant ?? {}),
    discountAmount: requestedDiscount,
    // Service charge already rides as its own line; applying it again doubles it.
    applyServiceCharge: false,
  });

  return {
    discountAmount: calculation.discountAmount,
    totalAmount: calculation.grandTotal,
    taxableAmount: calculation.taxableValue,
    taxAmount: calculation.vatAmount,
    exemptAmount: calculation.exemptValue,
  };
}

/** Order lines a discount recalculation needs, matching `OrderLineRow`. */
const DISCOUNT_LINE_SELECT = {
  menuItemName: true,
  quantity: true,
  pricePerUnit: true,
  status: true,
  vatExempt: true,
  hsCode: true,
} as const;

const RECEIPT_RESTAURANT_SELECT = {
  name: true,
  street: true,
  city: true,
  state: true,
  phoneNumber: true,
  websiteUrl: true,
  vatRegistered: true,
  taxPercentage: true,
  serviceCharge: true,
  panNumber: true,
  vatNumber: true,
  pricingMode: true,
  branchCode: true,
  rollingTurnover: true,
} as const;

/**
 * Attaches everything the printed receipt needs (restaurant snapshot, waiter
 * name, order/table labels) to a bill fetched with `order: { table: true }`
 * included, so `BillReceiptDialog` doesn't need every call site plumbing
 * these through separately.
 */
async function attachReceiptInfo(bill: any, restaurantId: string) {
  const [restaurant, waiter] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: RECEIPT_RESTAURANT_SELECT,
    }),
    // assignedWaiterId has no Prisma relation (it points at users.id, the
    // login identity, not the Staff HR record) — same lookup prepareKot uses.
    bill.order?.assignedWaiterId
      ? prisma.user.findUnique({
          where: { id: bill.order.assignedWaiterId },
          select: { firstName: true, lastName: true, username: true },
        })
      : null,
  ]);
  return {
    ...bill,
    orderNo: bill.order?.orderId ?? null,
    tableNo: bill.order?.table
      ? bill.order.table.name || `T${bill.order.table.tableNumber}`
      : null,
    customerName: bill.order?.customerName ?? null,
    waiterName: waiter
      ? [waiter.firstName, waiter.lastName].filter(Boolean).join(" ").trim() || waiter.username || null
      : null,
    restaurant,
  };
}

export async function getPendingBills() {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const bills = await prisma.bill.findMany({
      where: {
        restaurantId: session.restaurantId,
        status: { in: ["PENDING", "HELD"] },
      },
      include: {
        order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: bills };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch pending bills" };
  }
}

export async function getBill(billId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const bill = await prisma.bill.findFirst({
      where: { id: billId, restaurantId: session.restaurantId },
      include: {
        order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
        payments: true,
      },
    });
    if (!bill) return { error: "Bill not found" };
    return { data: await attachReceiptInfo(bill, session.restaurantId) };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch bill" };
  }
}

export async function createBillDraft(orderId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    // Three lookups are independent — one round-trip instead of three. The old
    // "last bill number" probe is gone: the serial is allocated inside the
    // transaction below, where the unique constraint can arbitrate it.
    const [order, existing, restaurant] = await Promise.all([
      prisma.order.findFirst({
        where: { id: orderId, restaurantId: session.restaurantId },
        // Lines come along so the bill can be itemised: the engine decides VAT
        // treatment per line, and an aggregate figure would tax exempt goods.
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
      }),
      prisma.bill.findFirst({
        where: { orderId, status: { in: ["PENDING", "HELD"] } },
      }),
      prisma.restaurant.findUnique({
        where: { id: session.restaurantId },
        select: RECEIPT_RESTAURANT_SELECT,
      }),
    ]);
    if (!order) return { error: "Order not found" };
    if (existing) {
      const full = await prisma.bill.findUnique({
        where: { id: existing.id },
        include: {
          order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
          payments: true,
        },
      });
      return { data: await attachReceiptInfo(full, session.restaurantId) };
    }

    // Recompute the total from menu prices instead of copying the order's stored
    // total, so even older orders with tax baked in bill clean. The figures come
    // from lib/billing/calculate.ts so a draft and the settled bill it becomes
    // cannot disagree on rounding or thresholds.
    const billingConfig = resolveBillingConfig(restaurant);
    const registrationType = registrationTypeFor(restaurant ?? {});
    const pricingMode = (restaurant?.pricingMode as PricingMode) ?? "INCLUSIVE";

    const { lines, reconciled } = buildBillLines({
      items: order.items ?? [],
      subtotal: order.subtotal,
      serviceCharge: order.serviceCharge,
      fallbackLabel: `Order ${order.orderId}`,
    });
    if (!reconciled) {
      console.warn(
        `[createBillDraft] order ${order.orderId}: line items do not sum to subtotal ${order.subtotal}; billing the aggregate.`
      );
    }

    const calculation = calculateBill({
      lines,
      config: billingConfig,
      pricingMode,
      registrationType,
      discountAmount: order.discountAmount,
      // Already a line above; applying it again double-charges.
      applyServiceCharge: false,
    });

    const cbmsStatus =
      registrationType === "VAT" &&
      cbmsRequired(restaurant?.rollingTurnover ?? 0, billingConfig, "hospitality")
        ? "PENDING"
        : "NOT_REQUIRED";

    const bill = await runWithSerialRetry(async () =>
      prisma.$transaction(async (tx) => {
        const allocated = await allocateInvoiceNumber(tx, {
          restaurantId: session.restaurantId!,
          branchCode: restaurant?.branchCode,
        });

        return tx.bill.create({
          data: {
            restaurantId: session.restaurantId!,
            orderId: order.id,
            billNumber: allocated.billNumber,
            fiscalYear: allocated.fiscalYear,
            sequence: allocated.sequence,
            billDateBS: allocated.billDateBS,
            billDate: allocated.billDate,
            pricingMode,
            isAbbreviated: calculation.isAbbreviated,
            subtotal: order.subtotal,
            taxableAmount: calculation.taxableValue,
            taxAmount: calculation.vatAmount,
            serviceCharge: order.serviceCharge,
            discountAmount: calculation.discountAmount,
            exemptAmount: calculation.exemptValue,
            totalAmount: calculation.grandTotal,
            amountPaid: 0,
            change: 0,
            cbmsStatus,
            status: "PENDING",
            createdBy: session.id,
          },
          include: {
            order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
            payments: true,
          },
        });
      })
    );

    await logActivity(session, {
      actionType: "BILL_DRAFT",
      entityType: "Bill",
      entityId: bill.id,
      description: `Bill draft created for order ${orderId}`,
    });

    return { data: await attachReceiptInfo(bill, session.restaurantId) };
  } catch (err: any) {
    return { error: err?.message || "Failed to create bill draft" };
  }
}

export async function recordPayment(data: {
  billId: string;
  method: string;
  amount: number;
  reference?: string;
}) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  // Hoisted: narrowing on session does not survive into the transaction closure.
  const restaurantId = session.restaurantId;

  try {
    return await prisma.$transaction(async (tx) => {
      // Scoped to the session's restaurant, like every other lookup in this
      // file. Unscoped, this action would settle any bill on the platform from
      // its id alone: bill ids are handed to the client on every ticket, and a
      // Server Action is a public POST endpoint, so the only thing standing
      // between one outlet and another's takings is this where clause.
      const bill = await tx.bill.findFirst({
        where: { id: data.billId, restaurantId },
        select: { id: true, orderId: true, billNumber: true, totalAmount: true, status: true },
      });
      if (!bill) return { error: "Bill not found" };
      if (bill.status === "VOID") return { error: "A voided bill cannot take a payment" };
      if (!(data.amount > 0)) return { error: "Enter a payment amount greater than zero" };

      await tx.payment.create({
        data: {
          billId: bill.id,
          method: data.method,
          amount: data.amount,
          reference: data.reference || null,
        },
      });

      // The running total comes from an atomic increment, not from summing rows
      // this transaction read. Two cashiers taking halves of a split bill at the
      // same moment would each have read the other's payment as absent — even
      // reading back after the insert, since under read-committed neither sees
      // the other's uncommitted row — and written an amountPaid short by the
      // other's payment, leaving a fully-settled bill PENDING. An increment
      // takes the bill's row lock, so the second call blocks until the first
      // commits and then adds to the committed value. Whoever lands last sees
      // the true total, which is the one that decides PAID.
      const incremented = await tx.bill.update({
        where: { id: bill.id },
        data: { amountPaid: { increment: data.amount } },
        select: { amountPaid: true },
      });
      const totalPayments = incremented.amountPaid;

      // Safe to read now: the increment above already waited for any concurrent
      // payment to commit, so every row on this bill is visible.
      const payments = await tx.payment.findMany({
        where: { billId: bill.id },
        select: { method: true },
      });
      const distinctMethods = Array.from(new Set(payments.map((p) => p.method)));
      const paymentMethod = distinctMethods.length > 1 ? "SPLIT" : distinctMethods[0];
      const change = Math.max(0, totalPayments - bill.totalAmount);
      // A paisa of tolerance: the columns are Float, so a bill settled to the
      // last representable digit must not read as a rupee short.
      const fullyPaid = totalPayments >= bill.totalAmount - 0.005;

      const updated = await tx.bill.update({
        where: { id: bill.id },
        data: {
          paymentMethod: paymentMethod === "SPLIT" ? "SPLIT" : paymentMethod,
          change,
          status: fullyPaid ? "PAID" : "PENDING",
          // Stamped on the transition only. A further payment against an
          // already-settled bill must not move the time the sale was settled,
          // which is a reported figure.
          settledAt: fullyPaid && bill.status !== "PAID" ? new Date() : undefined,
        },
        include: { payments: true, order: { include: { items: true } } },
      });

      if (fullyPaid) {
        await tx.order.update({
          where: { id: bill.orderId },
          data: {
            status: "SERVED",
            completedAt: new Date(),
          },
        });
      }

      await logActivity(session, {
        actionType: "PAYMENT_RECORD",
        entityType: "Payment",
        entityId: data.billId,
        description: `Payment of ${data.amount} recorded via ${data.method}`,
      });

      // A distinct "completed" entry lands in the owner's logs the moment a bill
      // is settled in full, alongside the per-payment records.
      if (fullyPaid) {
        await logActivity(session, {
          actionType: "BILL_COMPLETED",
          entityType: "Bill",
          entityId: bill.id,
          description: `Bill ${bill.billNumber} completed — total ${bill.totalAmount} paid in full via ${paymentMethod}`,
        });
      }

      return { data: updated };
    });
  } catch (err: any) {
    return { error: err?.message || "Failed to record payment" };
  }
}

export async function holdBill(billId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const bill = await prisma.bill.findFirst({
      where: { id: billId, restaurantId: session.restaurantId },
    });
    if (!bill) return { error: "Bill not found" };

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: { status: "HELD" },
    });

    await logActivity(session, {
      actionType: "BILL_HOLD",
      entityType: "Bill",
      entityId: billId,
      description: `Bill put on hold`,
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to hold bill" };
  }
}

export async function resumeHeldBill(billId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const bill = await prisma.bill.findFirst({
      where: { id: billId, restaurantId: session.restaurantId },
    });
    if (!bill) return { error: "Bill not found" };

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: { status: "PENDING" },
      include: {
        order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
        payments: true,
      },
    });

    await logActivity(session, {
      actionType: "BILL_RESUME",
      entityType: "Bill",
      entityId: billId,
      description: `Bill resumed from hold`,
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to resume bill" };
  }
}

export async function popCashDrawer(shiftId?: string) {
  const session = await getSession();
  if (!session?.restaurantId || !session?.id) return { error: "Not authenticated" };

  try {
    await prisma.activityLog.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        actionType: "CASH_DRAWER_POP",
        entityType: "Shift",
        entityId: shiftId || "manual",
        description: `Cash drawer popped by ${session.id}`,
      },
    });
    return { data: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to log cash drawer pop" };
  }
}

/**
 * Works out what each guest owes when a table splits the bill equally.
 *
 * This is a calculator, not a mutation: it writes no Bill rows and does not
 * change the one it was given. The reception UI ("equal split / Calculate")
 * shows the amounts, and the cashier then takes them as separate payments
 * through `recordPayment`, which is what actually moves `amountPaid` and settles
 * the ticket. Splitting into real child invoices would consume a tax-invoice
 * serial per share, so it is deliberately not what this does.
 *
 * Item-level splitting ("you had the fish") is not implemented. The parameter
 * that used to accept item ids was silently ignored and has been removed rather
 * than left advertising a capability that was not there.
 */
export async function splitBill(data: {
  billId: string;
  splits: Array<{ label: string }>;
}) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };
  if (data.splits.length < 2) return { error: "Need at least 2 splits" };

  try {
    const bill = await prisma.bill.findFirst({
      where: { id: data.billId, restaurantId: session.restaurantId },
      select: { totalAmount: true },
    });
    if (!bill) return { error: "Bill not found" };

    const n = data.splits.length;
    // Floor each share to the paisa and give the rounding remainder to the first
    // guest, so the shares sum to the bill exactly rather than a paisa under.
    const equalShare = Math.floor((bill.totalAmount * 100) / n) / 100;
    const remainder = Math.round((bill.totalAmount - equalShare * n) * 100) / 100;

    const splitBills = data.splits.map((split, idx) => ({
      label: split.label,
      amount: idx === 0 ? Math.round((equalShare + remainder) * 100) / 100 : equalShare,
    }));

    await logActivity(session, {
      actionType: "BILL_SPLIT",
      entityType: "Bill",
      entityId: data.billId,
      description: `Bill split into ${data.splits.length} parts`,
    });

    return { data: { splits: splitBills, total: bill.totalAmount } };
  } catch (err: any) {
    return { error: err?.message || "Failed to split bill" };
  }
}

export async function getTopMenuItems(limit = 10) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: session.restaurantId, isAvailable: true },
      orderBy: { displayOrder: "asc" },
      take: limit,
    });
    return { data: items };
  } catch (err: any) {
    return { error: err?.message || "Failed to fetch menu items" };
  }
}

/** Searchable/filterable invoice history — bill number, table/customer, status, date range. */
export async function searchBills(filters: {
  query?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const where: any = { restaurantId: session.restaurantId };

    if (filters.status && filters.status !== "ALL") {
      where.status = filters.status;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.billDate = {};
      if (filters.dateFrom) where.billDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.billDate.lte = new Date(filters.dateTo + "T23:59:59.999Z");
    }
    if (filters.query) {
      where.OR = [
        { billNumber: { contains: filters.query, mode: "insensitive" } },
        { order: { orderId: { contains: filters.query, mode: "insensitive" } } },
        { order: { customerName: { contains: filters.query, mode: "insensitive" } } },
        { order: { customerPhone: { contains: filters.query, mode: "insensitive" } } },
      ];
    }

    const bills = await prisma.bill.findMany({
      where,
      include: {
        order: { include: { items: true, table: { select: { tableNumber: true, name: true } } } },
        payments: true,
      },
      orderBy: { billDate: "desc" },
      take: filters.limit ?? 100,
    });
    return { data: bills };
  } catch (err: any) {
    return { error: err?.message || "Failed to search bills" };
  }
}

export async function applyDiscountToBill(billId: string, discountAmount: number, discountReason?: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const [bill, restaurant] = await Promise.all([
      prisma.bill.findFirst({
        where: { id: billId, restaurantId: session.restaurantId },
        include: { order: { select: { items: { select: DISCOUNT_LINE_SELECT } } } },
      }),
      prisma.restaurant.findUnique({
        where: { id: session.restaurantId },
        select: { vatRegistered: true, taxPercentage: true },
      }),
    ]);
    if (!bill) return { error: "Bill not found" };
    if (bill.status !== "PENDING") return { error: "Can only discount a pending bill" };

    const money = recalculateWithDiscount(bill, restaurant, discountAmount);

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: {
        ...money,
        status: money.totalAmount <= 0 ? "PAID" : "PENDING",
        ...(discountReason ? { notes: discountReason } : {}),
      },
    });

    await logActivity(session, {
      actionType: "DISCOUNT_APPLY",
      entityType: "Bill",
      entityId: billId,
      description: `Discount of ${money.discountAmount} applied${discountReason ? ` (${discountReason})` : ""}`,
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to apply discount" };
  }
}

export async function applyCouponToBill(billId: string, couponCode: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { restaurantId_code: { restaurantId: session.restaurantId, code: couponCode.toUpperCase() } },
    });
    if (!coupon) return { error: "Coupon not found" };
    if (!coupon.isActive) return { error: "Coupon is inactive" };

    const now = new Date();
    if (now < coupon.validFrom) return { error: "Coupon not yet valid" };
    if (now > coupon.validUntil) return { error: "Coupon has expired" };
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { error: "Coupon usage limit reached" };
    }

    const [bill, restaurant] = await Promise.all([
      prisma.bill.findFirst({
        where: { id: billId, restaurantId: session.restaurantId },
        include: { order: { select: { items: { select: DISCOUNT_LINE_SELECT } } } },
      }),
      prisma.restaurant.findUnique({
        where: { id: session.restaurantId },
        select: { vatRegistered: true, taxPercentage: true },
      }),
    ]);
    if (!bill) return { error: "Bill not found" };
    if (bill.status !== "PENDING") return { error: "Can only apply coupon to a pending bill" };

    const discountValue = coupon.discountType === "PERCENTAGE"
      ? bill.subtotal * (coupon.discountValue / 100)
      : coupon.discountValue;

    const money = recalculateWithDiscount(bill, restaurant, discountValue);

    return await prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usageCount: { increment: 1 } },
      });

      const updated = await tx.bill.update({
        where: { id: billId },
        data: {
          ...money,
          notes: `Coupon: ${coupon.code} (${money.discountAmount})`,
        },
      });

      await logActivity(session, {
        actionType: "COUPON_APPLY",
        entityType: "Bill",
        entityId: billId,
        description: `Coupon "${couponCode}" applied to bill`,
      });

      return { data: { bill: updated, coupon: coupon.code, discount: money.discountAmount } };
    });
  } catch (err: any) {
    return { error: err?.message || "Failed to apply coupon" };
  }
}

export async function applyCorporateAccountToBill(billId: string, accountId: string) {
  const session = await getSession();
  if (!session?.restaurantId) return { error: "Not authenticated" };

  try {
    const account = await prisma.corporateAccount.findFirst({
      where: { id: accountId, restaurantId: session.restaurantId, isActive: true },
    });
    if (!account) return { error: "Corporate account not found or inactive" };

    const bill = await prisma.bill.findFirst({
      where: { id: billId, restaurantId: session.restaurantId },
    });
    if (!bill) return { error: "Bill not found" };

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: {
        paymentMethod: "CORPORATE",
        notes: bill.notes
          ? `${bill.notes} | Corporate: ${account.companyName}`
          : `Corporate: ${account.companyName}`,
      },
    });

    await prisma.activityLog.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        actionType: "CORPORATE_BILL",
        entityType: "Bill",
        entityId: bill.id,
        description: `Bill ${bill.billNumber} assigned to corporate account ${account.companyName}`,
      },
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to apply corporate account" };
  }
}

/** Roles allowed to void a bill on their own authority, without a separate
 *  manager/owner signing off. Reception is included so a receptionist can void
 *  directly — every void is still written to the activity log for the owner. */
const SELF_VOID_ROLES = ["RECEPTIONIST", "MANAGER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN"];

/**
 * Voids a bill and records it to the activity log so the owner can always see
 * who voided what and why.
 *
 * This is the single void path: lib/actions/billing.ts deliberately has no
 * competing implementation, because two Server Actions that both void bills
 * under different rules means the weaker one is the one that gets exploited.
 *
 * Reception (and managers/owners) may void directly — no separate approval is
 * required. Callers that still want a supervisor to sign off can pass
 * `approverUsername`/`approverPassword`; when supplied those credentials are
 * verified and the approver is recorded as the authorizer. Either way a
 * `BILL_VOID` entry is logged against the acting user.
 *
 * Only an unsettled bill can be voided. A PAID bill is reversed with
 * `issueCreditNote` instead — IRD requires the consumed serial to stay in the
 * sequence with a matching reversal document.
 */
export async function voidBill(data: {
  billId: string;
  reason: string;
  approverUsername?: string;
  approverPassword?: string;
}) {
  const session = await getSession();
  if (!session?.restaurantId || !session?.id) return { error: "Not authenticated" };
  if (!data.reason?.trim()) return { error: "A void reason is required" };

  const wantsApproval = !!(data.approverUsername?.trim() && data.approverPassword);

  try {
    // Decide who is authorizing this void before touching the bill.
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
      return { error: "You are not allowed to void a bill. Ask a manager or owner to approve." };
    }

    const bill = await prisma.bill.findFirst({
      where: { id: data.billId, restaurantId: session.restaurantId },
    });
    if (!bill) return { error: "Bill not found" };
    if (bill.voidedAt || bill.status === "VOID") return { error: "Bill is already voided" };
    // A settled bill's serial has been consumed and (once CBMS is live) already
    // reported, so it is reversed with a credit note rather than voided —
    // otherwise the reported sequence has a hole in it. See issueCreditNote.
    if (bill.status === "PAID") {
      return { error: "A paid bill must be reversed with a credit note, not voided" };
    }
    if (bill.creditNoteForId) {
      return { error: "A credit note cannot be voided" };
    }

    const updated = await prisma.bill.update({
      where: { id: bill.id },
      data: {
        status: "VOID",
        voidedBy: voidedById,
        voidReason: data.reason.trim(),
        voidedAt: new Date(),
      },
    });

    await prisma.activityLog.create({
      data: {
        restaurantId: session.restaurantId,
        userId: session.id,
        actionType: "BILL_VOID",
        entityType: "Bill",
        entityId: bill.id,
        description: `Bill ${bill.billNumber} (total ${bill.totalAmount}) voided by ${session.username} (${approvalNote}): ${data.reason.trim()}`,
      },
    });

    return { data: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to void bill" };
  }
}
