import type { BillLineInput } from "./calculate";

/**
 * Turns an order's stored rows into bill lines for lib/billing/calculate.ts.
 *
 * Per-line input is what makes Schedule 1 exemptions and HS codes reachable at
 * all: the engine decides tax treatment line by line, so collapsing a check to
 * a single aggregate figure silently taxes exempt goods.
 *
 * The complication is that order.subtotal is a stored column, not a derived
 * one, and it can disagree with the lines it is supposed to summarise. Live
 * data already contains orders whose items were all cancelled while subtotal
 * kept its original value, because the cancel path did not recompute it. If
 * those lines were fed to the engine the guest's total would change.
 *
 * So this reconciles before trusting the lines:
 *   - lines agree with subtotal  -> itemise, exemptions apply
 *   - they disagree              -> fall back to one aggregate line, so the
 *                                   total stays exactly what it was, and say so
 *
 * The caller can surface `reconciled: false` rather than quietly issuing a bill
 * that has lost its detail.
 */

export type OrderLineRow = {
  menuItemName: string;
  quantity: number;
  pricePerUnit: number;
  status?: string | null;
  vatExempt?: boolean | null;
  hsCode?: string | null;
};

export type BuildBillLinesInput = {
  items: OrderLineRow[];
  /** Stored order subtotal the lines must reconcile against. */
  subtotal: number;
  /** Added as its own taxable line; it is not part of subtotal. */
  serviceCharge: number;
  /** Description used for the aggregate line when reconciliation fails. */
  fallbackLabel: string;
};

export type BuiltBillLines = {
  lines: BillLineInput[];
  /** False when the lines did not sum to subtotal and a fallback was used. */
  reconciled: boolean;
};

/** Cancelled lines are not billed and must not count toward the subtotal. */
const isBillable = (i: OrderLineRow) => i.status !== "CANCELLED";

export const SERVICE_CHARGE_LABEL = "Service Charge";

export function buildBillLines({
  items,
  subtotal,
  serviceCharge,
  fallbackLabel,
}: BuildBillLinesInput): BuiltBillLines {
  const billable = items.filter(isBillable);
  const lineSum = billable.reduce((sum, i) => sum + i.pricePerUnit * i.quantity, 0);

  // Half a paisa of tolerance: the columns are Float, so an exact comparison
  // would reject sums that are correct to the last representable digit.
  const reconciled = billable.length > 0 && Math.abs(lineSum - subtotal) <= 0.005;

  if (!reconciled) {
    return {
      reconciled: false,
      lines: [
        {
          description: fallbackLabel,
          quantity: 1,
          unitPrice: subtotal + serviceCharge,
        },
      ],
    };
  }

  const lines: BillLineInput[] = billable.map((i) => ({
    description: i.menuItemName,
    quantity: i.quantity,
    unitPrice: i.pricePerUnit,
    vatExempt: Boolean(i.vatExempt),
    hsCode: i.hsCode ?? null,
  }));

  // Service charge is taxable in both pricing modes and is charged on the whole
  // check, so it rides as its own line rather than being spread over the items.
  if (serviceCharge > 0) {
    lines.push({
      description: SERVICE_CHARGE_LABEL,
      quantity: 1,
      unitPrice: serviceCharge,
    });
  }

  return { lines, reconciled: true };
}
