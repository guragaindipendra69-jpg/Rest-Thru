import { calculateBill, digitalPaymentRebate } from "../lib/billing/calculate";
import { DEFAULT_BILLING_CONFIG, resolveBillingConfig } from "../lib/billing/config";
import { amountInWords } from "../lib/billing/amount-in-words";
import { fiscalYearFor, formatInvoiceNumber, toBikramSambat } from "../lib/billing/fiscal-year";

const cfg = DEFAULT_BILLING_CONFIG;
let fail = 0;
const check = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(got)}${ok ? "" : ` want ${JSON.stringify(want)}`}`);
};

// Spec section 8.2 worked example: 2000 food, +10% service = 2200, +13% VAT = 2486
const b = calculateBill({
  lines: [{ description: "Food", quantity: 1, unitPrice: 2000 }],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "VAT", applyServiceCharge: true,
});
check("ADDITIVE serviceCharge", b.serviceCharge, 200);
check("ADDITIVE vat", b.vatAmount, 286);
check("ADDITIVE grandTotal", b.grandTotal, 2486);
check("ADDITIVE taxableValue", b.taxableValue, 2200);

// Inclusive mode: 2486 inclusive should back out the same VAT
const inc = calculateBill({
  lines: [{ description: "Food", quantity: 1, unitPrice: 2260 }],
  config: cfg, pricingMode: "INCLUSIVE", registrationType: "VAT",
});
check("INCLUSIVE grandTotal unchanged", inc.grandTotal, 2260);
check("INCLUSIVE vat+taxable == total", Math.round((inc.vatAmount + inc.taxableValue)*100)/100, 2260);

// PAN-only: never any VAT
const pan = calculateBill({
  lines: [{ description: "Food", quantity: 1, unitPrice: 2000 }],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "PAN_ONLY", applyServiceCharge: true,
});
check("PAN_ONLY vat", pan.vatAmount, 0);
check("PAN_ONLY abbreviated flag", pan.isAbbreviated, false);

// Discount before VAT: 1000 - 100 discount = 900 taxable, VAT 117, total 1017
const d = calculateBill({
  lines: [{ description: "Food", quantity: 1, unitPrice: 1000 }],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "VAT", discountAmount: 100,
});
check("discount taxable", d.taxableValue, 900);
check("discount vat", d.vatAmount, 117);
check("discount total", d.grandTotal, 1017);

// Over-large discount must not go negative
const neg = calculateBill({
  lines: [{ description: "Food", quantity: 1, unitPrice: 500 }],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "VAT", discountAmount: 9999,
});
check("clamped discount total >= 0", neg.grandTotal >= 0, true);

// Schedule 1 exempt line excluded from taxable base
const ex = calculateBill({
  lines: [
    { description: "Food", quantity: 1, unitPrice: 1000 },
    { description: "Exempt goods", quantity: 1, unitPrice: 500, vatExempt: true },
  ],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "VAT",
});
check("exempt excluded from taxable", ex.taxableValue, 1000);
check("exempt value tracked", ex.exemptValue, 500);
check("exempt vat only on taxable", ex.vatAmount, 130);
check("exempt grandTotal", ex.grandTotal, 1630);

// Many-line float drift: 3x 33.33 must sum exactly
const drift = calculateBill({
  lines: Array.from({length: 3}, () => ({ description: "x", quantity: 1, unitPrice: 33.33 })),
  config: cfg, pricingMode: "ADDITIVE", registrationType: "PAN_ONLY",
});
check("no float drift", drift.grossSubtotal, 99.99);

// Abbreviated + buyer PAN thresholds
check("abbreviated under 10k", b.isAbbreviated, true);
check("buyerPan not required under 10k", b.buyerPanRequired, false);
const big = calculateBill({
  lines: [{ description: "Banquet", quantity: 1, unitPrice: 50000 }],
  config: cfg, pricingMode: "ADDITIVE", registrationType: "VAT",
});
check("abbreviated false over threshold", big.isAbbreviated, false);
check("buyerPan required over threshold", big.buyerPanRequired, true);

// Rebate is % of VAT, not of bill
check("digital rebate", digitalPaymentRebate(b, cfg, true), 28.6);
check("cash rebate zero", digitalPaymentRebate(b, cfg, false), 0);

// Words, lakh grouping
check("words 2486", amountInWords(2486), "Two Thousand Four Hundred Eighty Six Rupees Only");
check("words lakh", amountInWords(150000), "One Lakh Fifty Thousand Rupees Only");
check("words paisa", amountInWords(99.5), "Ninety Nine Rupees and Fifty Paisa Only");
check("words crore", amountInWords(12500000), "One Crore Twenty Five Lakh Rupees Only");
check("words one rupee singular", amountInWords(1), "One Rupee Only");

// Fiscal year + numbering
const fy = fiscalYearFor(new Date("2026-08-06"));
console.log("INFO  fiscalYear(2026-08-06) =", fy.label, "| BS date =", toBikramSambat(new Date("2026-08-06")));
console.log("INFO  invoiceNumber =", formatInvoiceNumber({ fiscalYear: fy, sequence: 142 }));
console.log("INFO  branch+CN     =", formatInvoiceNumber({ fiscalYear: fy, sequence: 7, branchCode: "KTM", series: "CN" }));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
