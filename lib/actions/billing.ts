"use server";

import prisma from "@/lib/prisma";
import { requireTenant, FRONT_OF_HOUSE_ROLES } from "@/lib/auth-tenant";
import { logActivity } from "./logs";
import {
  calculateBill,
  type BillCalculation,
  type BillLineInput,
} from "@/lib/billing/calculate";
import {
  resolveBillingConfig,
  registrationTypeFor,
  cbmsRequired,
  type PaymentMethod,
  type PricingMode,
} from "@/lib/billing/config";
import {
  allocateInvoiceNumber,
  runWithSerialRetry,
} from "@/lib/billing/serial";

/**
 * Issuing an IRD-compliant tax invoice from an explicit set of line items.
 *
 * The serial numbering rule lives in lib/billing/serial.ts because the live
 * checkout path in orders.ts issues bills too and must produce identical
 * numbers; see the commentary there for why the unique constraint rather than
 * the max()+1 read is what actually guarantees no duplicate serial.
 */

export type IssueBillInput = {
  orderId: string;
  lines: BillLineInput[];
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  applyServiceCharge?: boolean;
  buyer?: {
    name?: string | null;
    panNumber?: string | null;
    address?: string | null;
    isBusiness?: boolean;
  };
  notes?: string | null;
};

export type IssuedBill = {
  id: string;
  billNumber: string;
  fiscalYear: string;
  sequence: number;
  billDateBS: string;
  /** Null for a credit note, which reverses stored figures rather than computing new ones. */
  calculation: BillCalculation | null;
};

export async function issueBill(
  input: IssueBillInput
): Promise<{ data: IssuedBill } | { error: string }> {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  if (!input.lines?.length) return { error: "A bill needs at least one line item" };

  const outlet = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      vatRegistered: true,
      taxPercentage: true,
      serviceCharge: true,
      pricingMode: true,
      branchCode: true,
      rollingTurnover: true,
      panNumber: true,
    },
  });
  if (!outlet) return { error: "Restaurant not found" };

  // A VAT-registered outlet with no PAN on file cannot legally issue a tax
  // invoice. Fail loudly at issue time rather than printing a defective bill.
  if (outlet.vatRegistered && !outlet.panNumber) {
    return { error: "Set your PAN number in Settings before issuing a tax invoice" };
  }

  const config = resolveBillingConfig(outlet);
  const registrationType = registrationTypeFor(outlet);
  const pricingMode = (outlet.pricingMode as PricingMode) ?? "INCLUSIVE";

  const calculation = calculateBill({
    lines: input.lines,
    config,
    pricingMode,
    registrationType,
    discountAmount: input.discountAmount,
    applyServiceCharge: input.applyServiceCharge ?? false,
  });

  // Buyer PAN is mandatory above the configured threshold and always for B2B.
  const panMandatory = calculation.buyerPanRequired || Boolean(input.buyer?.isBusiness);
  if (panMandatory && !input.buyer?.panNumber) {
    return {
      error: `Buyer PAN is required for bills above NPR ${config.buyerPanThreshold.toLocaleString("en-IN")}`,
    };
  }

  // CBMS is required above the hospitality turnover threshold. It must never
  // block closing a ticket, so the bill is written as PENDING and a background
  // worker drains the queue.
  const needsCbms =
    registrationType === "VAT" && cbmsRequired(outlet.rollingTurnover ?? 0, config, "hospitality");

  try {
    const result = await runWithSerialRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const allocated = await allocateInvoiceNumber(tx, {
          restaurantId,
          branchCode: outlet.branchCode,
        });

        const bill = await tx.bill.create({
          data: {
            restaurantId,
            orderId: input.orderId,
            billNumber: allocated.billNumber,
            fiscalYear: allocated.fiscalYear,
            sequence: allocated.sequence,
            billDateBS: allocated.billDateBS,
            billDate: allocated.billDate,
            pricingMode,
            isAbbreviated: calculation.isAbbreviated,
            subtotal: calculation.grossSubtotal,
            taxableAmount: calculation.taxableValue,
            taxAmount: calculation.vatAmount,
            serviceCharge: calculation.serviceCharge,
            discountAmount: calculation.discountAmount,
            exemptAmount: calculation.exemptValue,
            totalAmount: calculation.grandTotal,
            paymentMethod: input.paymentMethod.toUpperCase(),
            buyerName: input.buyer?.name ?? null,
            buyerPan: input.buyer?.panNumber ?? null,
            buyerAddress: input.buyer?.address ?? null,
            cbmsStatus: needsCbms ? "PENDING" : "NOT_REQUIRED",
            status: "PENDING",
            createdBy: session.id,
            notes: input.notes ?? null,
          },
          select: { id: true, billNumber: true, fiscalYear: true, sequence: true },
        });

        return { bill, billDateBS: allocated.billDateBS };
      });
    });

    await logActivity(session, {
      actionType: "BILL_ISSUE",
      entityType: "Bill",
      entityId: result.bill.id,
      description: `Bill ${result.bill.billNumber} issued for NPR ${calculation.grandTotal}`,
    });

    return {
      data: {
        id: result.bill.id,
        billNumber: result.bill.billNumber,
        fiscalYear: result.bill.fiscalYear!,
        sequence: result.bill.sequence!,
        billDateBS: result.billDateBS,
        calculation,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to issue bill" };
  }
}

/**
 * Reverses a settled bill with a credit note (sales return).
 *
 * A PAID bill is never voided: its serial has been consumed and, once CBMS is
 * live, reported. IRD requires the correction to be a *new* document that
 * points back at the original, so the audit trail shows both the sale and its
 * reversal rather than a hole where a sale used to be. `voidBill` in bills.ts
 * refuses a PAID bill and directs the cashier here.
 *
 * The note is issued as a negative-value bill drawing the next serial from the
 * same fiscal-year sequence, so the numbering stays unbroken.
 */
export async function issueCreditNote(input: {
  billId: string;
  reason: string;
  /** Partial return. Omit to reverse the whole bill. */
  amount?: number;
}): Promise<{ data: IssuedBill } | { error: string }> {
  const auth = await requireTenant(FRONT_OF_HOUSE_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  if (!input.reason?.trim()) return { error: "A credit note reason is required" };

  const original = await prisma.bill.findFirst({
    where: { id: input.billId, restaurantId },
    select: {
      id: true,
      orderId: true,
      billNumber: true,
      status: true,
      pricingMode: true,
      subtotal: true,
      taxableAmount: true,
      taxAmount: true,
      serviceCharge: true,
      discountAmount: true,
      exemptAmount: true,
      totalAmount: true,
      paymentMethod: true,
      buyerName: true,
      buyerPan: true,
      buyerAddress: true,
      creditNoteForId: true,
    },
  });
  if (!original) return { error: "Bill not found" };
  if (original.creditNoteForId) {
    return { error: "A credit note cannot itself be credited" };
  }
  if (original.status !== "PAID") {
    return { error: "Only a settled bill can be reversed with a credit note" };
  }

  // Already-credited value caps what is left to return, so a bill cannot be
  // refunded twice by issuing two full credit notes against it.
  const priorNotes = await prisma.bill.aggregate({
    where: { restaurantId, creditNoteForId: original.id, status: { not: "VOID" } },
    _sum: { totalAmount: true },
  });
  const alreadyCredited = Math.abs(priorNotes._sum.totalAmount ?? 0);
  const creditable = original.totalAmount - alreadyCredited;
  if (creditable <= 0) {
    return { error: `Bill ${original.billNumber} has already been fully credited` };
  }

  const requested = input.amount ?? creditable;
  if (requested <= 0) return { error: "Credit amount must be greater than zero" };
  if (requested > creditable + 0.01) {
    return {
      error: `Cannot credit more than the ${creditable.toFixed(2)} remaining on bill ${original.billNumber}`,
    };
  }

  const outlet = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { branchCode: true },
  });

  // Reverse proportionally so a partial return still splits correctly between
  // taxable value, VAT and exempt value. A full return uses the exact stored
  // figures rather than a ratio, so it cancels the original to the paisa.
  const ratio = requested / original.totalAmount;
  const isFull = Math.abs(requested - creditable) < 0.01 && alreadyCredited === 0;
  const portion = (value: number) => -(isFull ? value : Math.round(value * ratio * 100) / 100);

  try {
    const result = await runWithSerialRetry(async () =>
      prisma.$transaction(async (tx) => {
        const allocated = await allocateInvoiceNumber(tx, {
          restaurantId,
          branchCode: outlet?.branchCode,
          series: "CN",
        });

        const note = await tx.bill.create({
          data: {
            restaurantId,
            orderId: original.orderId,
            billNumber: allocated.billNumber,
            fiscalYear: allocated.fiscalYear,
            sequence: allocated.sequence,
            billDateBS: allocated.billDateBS,
            billDate: allocated.billDate,
            pricingMode: original.pricingMode,
            creditNoteForId: original.id,
            subtotal: portion(original.subtotal),
            taxableAmount: portion(original.taxableAmount),
            taxAmount: portion(original.taxAmount),
            serviceCharge: portion(original.serviceCharge),
            discountAmount: portion(original.discountAmount),
            exemptAmount: portion(original.exemptAmount),
            totalAmount: -Math.round(requested * 100) / 100,
            amountPaid: -Math.round(requested * 100) / 100,
            paymentMethod: original.paymentMethod,
            buyerName: original.buyerName,
            buyerPan: original.buyerPan,
            buyerAddress: original.buyerAddress,
            // A reversal is settled the moment it is issued: the money goes
            // back to the guest at the counter, not through a payment queue.
            status: "PAID",
            settledAt: allocated.billDate,
            createdBy: session.id,
            notes: `Credit note for ${original.billNumber}: ${input.reason.trim()}`,
          },
          select: { id: true, billNumber: true, fiscalYear: true, sequence: true },
        });

        return { note, billDateBS: allocated.billDateBS };
      })
    );

    await logActivity(session, {
      actionType: "BILL_CREDIT_NOTE",
      entityType: "Bill",
      entityId: result.note.id,
      description: `Credit note ${result.note.billNumber} issued against ${original.billNumber} for NPR ${requested.toFixed(2)}: ${input.reason.trim()}`,
    });

    return {
      data: {
        id: result.note.id,
        billNumber: result.note.billNumber,
        fiscalYear: result.note.fiscalYear!,
        sequence: result.note.sequence!,
        billDateBS: result.billDateBS,
        calculation: null,
      },
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to issue credit note" };
  }
}
