import type { BillingConfig, PricingMode, RegistrationType } from "./config";

/**
 * IRD Nepal bill calculation engine. Implements section 8 of bill-design.md.
 *
 * Two things drive every number here, and both are deliberate:
 *
 * 1. Rounding happens ONCE, at the total. The spec is explicit that rounding
 *    each line before summing produces mismatches against the CBMS payload, so
 *    line values stay at full precision internally and only the reported
 *    figures are rounded.
 *
 * 2. Money is handled in paisa (integer minor units) wherever a value is
 *    summed. The Bill columns are Float, so a bill of many lines can otherwise
 *    drift a paisa or two from the sum of its own items, which is exactly the
 *    kind of discrepancy an IRD audit flags.
 */

export type BillLineInput = {
  description: string;
  quantity: number;
  /** Price per unit as shown on the menu. Interpretation depends on pricingMode. */
  unitPrice: number;
  unit?: string;
  /** Schedule 1 exempt goods. Never attracts VAT, in either pricing mode. */
  vatExempt?: boolean;
  /** Optional, for packaged retail add-ons only. Not used for prepared food. */
  hsCode?: string | null;
};

export type BillCalculationInput = {
  lines: BillLineInput[];
  config: BillingConfig;
  pricingMode: PricingMode;
  registrationType: RegistrationType;
  /** Absolute discount in NPR, applied to the taxable base before VAT. */
  discountAmount?: number;
  /** Overrides config.serviceChargePercent for this bill only. */
  serviceChargePercent?: number;
  applyServiceCharge?: boolean;
};

export type BillLineResult = BillLineInput & {
  lineTotal: number;
  taxableValue: number;
  vatAmount: number;
};

export type BillCalculation = {
  lines: BillLineResult[];
  grossSubtotal: number;
  discountAmount: number;
  /** Base the VAT was actually computed on, after discount and exemptions. */
  taxableValue: number;
  exemptValue: number;
  serviceCharge: number;
  vatAmount: number;
  grandTotal: number;
  vatRate: number;
  pricingMode: PricingMode;
  /** True when the bill qualifies for the Rule 17(Ka) abbreviated format. */
  isAbbreviated: boolean;
  /** True when a buyer PAN must be captured for this ticket value. */
  buyerPanRequired: boolean;
};

// ── Minor-unit helpers ──
// Every intermediate sum runs through paisa so repeated float addition cannot
// accumulate error across a long bill.
const toPaisa = (rupees: number): number => Math.round(rupees * 100);
const toRupees = (paisa: number): number => paisa / 100;
/** Round a rupee amount to 2dp for reporting. Half-up, matching IRD convention. */
const round2 = (rupees: number): number => Math.round(rupees * 100) / 100;

/**
 * Back-calculate the VAT contained within a VAT-inclusive amount.
 * vat = gross * rate / (100 + rate)
 */
function vatWithin(grossPaisa: number, rate: number): number {
  return Math.round((grossPaisa * rate) / (100 + rate));
}

export function calculateBill(input: BillCalculationInput): BillCalculation {
  const {
    lines,
    config,
    pricingMode,
    registrationType,
    discountAmount = 0,
    applyServiceCharge = false,
  } = input;

  const vatRate = registrationType === "VAT" ? config.vatRate : 0;
  const serviceChargePercent = input.serviceChargePercent ?? config.serviceChargePercent;

  // 1. Line totals at full precision, in paisa.
  const linePaisa = lines.map((l) => toPaisa(l.unitPrice) * l.quantity);
  const grossSubtotalPaisa = linePaisa.reduce((sum, p) => sum + p, 0);

  // Split the bill into its VAT-bearing and Schedule-1-exempt halves. Exempt
  // lines are excluded from the taxable base entirely, never merely zero-rated.
  const exemptPaisa = lines.reduce(
    (sum, l, i) => (l.vatExempt ? sum + linePaisa[i] : sum),
    0
  );
  const taxablePaisaBeforeDiscount = grossSubtotalPaisa - exemptPaisa;

  // 2. Discount applies before VAT, always. Clamped so a discount larger than
  //    the bill can never drive the taxable base (or the total) negative.
  const requestedDiscountPaisa = Math.max(0, toPaisa(discountAmount));
  const discountPaisa = Math.min(requestedDiscountPaisa, grossSubtotalPaisa);

  // Apportion the discount across taxable and exempt value so a discount on a
  // mixed bill does not silently shift exempt value into the taxable base.
  const taxableShare =
    grossSubtotalPaisa === 0 ? 0 : taxablePaisaBeforeDiscount / grossSubtotalPaisa;
  const discountOnTaxablePaisa = Math.round(discountPaisa * taxableShare);

  const netTaxablePaisa = Math.max(0, taxablePaisaBeforeDiscount - discountOnTaxablePaisa);
  const netExemptPaisa = Math.max(0, exemptPaisa - (discountPaisa - discountOnTaxablePaisa));

  let serviceChargePaisa = 0;
  let vatPaisa = 0;
  let taxableValuePaisa = 0;
  let grandTotalPaisa = 0;

  if (pricingMode === "ADDITIVE") {
    // Mode B, section 8.2: menu price is the pre-VAT base.
    //   subtotal -> discount -> + service charge -> VAT on the combined amount
    serviceChargePaisa = applyServiceCharge
      ? Math.round((netTaxablePaisa * serviceChargePercent) / 100)
      : 0;

    const serviceInclusivePaisa = netTaxablePaisa + serviceChargePaisa;
    taxableValuePaisa = serviceInclusivePaisa;
    vatPaisa = Math.round((serviceInclusivePaisa * vatRate) / 100);
    grandTotalPaisa = serviceInclusivePaisa + vatPaisa + netExemptPaisa;
  } else {
    // Mode A, section 8.1: menu price is already the final price to the guest.
    // Nothing is added on top; VAT and service charge are extracted from it for
    // the printed bill, the VAT ledger and the CBMS payload.
    const inclusivePaisa = netTaxablePaisa;

    // Service charge, when the outlet operates one, is likewise treated as
    // already contained in the menu price.
    serviceChargePaisa = applyServiceCharge
      ? Math.round(
          (inclusivePaisa * serviceChargePercent) / (100 + serviceChargePercent)
        )
      : 0;

    vatPaisa = vatWithin(inclusivePaisa, vatRate);
    taxableValuePaisa = inclusivePaisa - vatPaisa;
    grandTotalPaisa = inclusivePaisa + netExemptPaisa;
  }

  // Per-line reporting values. These are derived for display and for the CBMS
  // line detail; the authoritative totals are the ones computed above.
  const resultLines: BillLineResult[] = lines.map((l, i) => {
    const linePaisaValue = linePaisa[i];
    if (l.vatExempt || vatRate === 0) {
      return {
        ...l,
        lineTotal: round2(toRupees(linePaisaValue)),
        taxableValue: 0,
        vatAmount: 0,
      };
    }
    const lineVatPaisa =
      pricingMode === "ADDITIVE"
        ? Math.round((linePaisaValue * vatRate) / 100)
        : vatWithin(linePaisaValue, vatRate);
    return {
      ...l,
      lineTotal: round2(toRupees(linePaisaValue)),
      taxableValue: round2(
        toRupees(pricingMode === "ADDITIVE" ? linePaisaValue : linePaisaValue - lineVatPaisa)
      ),
      vatAmount: round2(toRupees(lineVatPaisa)),
    };
  });

  const grandTotal = round2(toRupees(grandTotalPaisa));

  return {
    lines: resultLines,
    grossSubtotal: round2(toRupees(grossSubtotalPaisa)),
    discountAmount: round2(toRupees(discountPaisa)),
    taxableValue: round2(toRupees(taxableValuePaisa)),
    exemptValue: round2(toRupees(netExemptPaisa)),
    serviceCharge: round2(toRupees(serviceChargePaisa)),
    vatAmount: round2(toRupees(vatPaisa)),
    grandTotal,
    vatRate,
    pricingMode,
    // Rule 17(Ka) applies to VAT outlets only; a PAN-only bill is already a
    // single-copy cash memo with no VAT line to abbreviate.
    isAbbreviated:
      registrationType === "VAT" && grandTotal <= config.abbreviatedInvoiceThreshold,
    buyerPanRequired: grandTotal > config.buyerPanThreshold,
  };
}

/**
 * VAT amount a guest gets back when paying electronically, under the IRD pilot
 * for lodging, restaurant and bar businesses. The rebate is a percentage of the
 * VAT, not of the bill, and is VAT-linked so PAN-only sales never qualify.
 */
export function digitalPaymentRebate(
  calculation: BillCalculation,
  config: BillingConfig,
  isDigitalPayment: boolean
): number {
  if (!isDigitalPayment || calculation.vatAmount <= 0) return 0;
  return round2((calculation.vatAmount * config.digitalVatRebatePercent) / 100);
}
