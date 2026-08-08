/**
 * IRD Nepal billing configuration.
 *
 * Implements rule 3 of bill-design.md: every rate, threshold and percentage is a
 * named, overridable value rather than a literal typed into calculation or
 * rendering code. Nepal's Finance Act revises these figures most fiscal years
 * (effective Shrawan 1), and hardcoding them would mean a code release each time
 * a number changes.
 *
 * Resolution order for any given outlet:
 *   1. the value stored on the Restaurant row, when that column exists
 *   2. the platform default below
 *
 * Several defaults are marked UNCONFIRMED. Per rule 4, these are values where
 * the source material genuinely conflicts. They are NOT silently settled here:
 * they stay configurable and are surfaced in the compliance checklist so a
 * Nepali tax advisor can confirm them before production use.
 */

export type RegistrationType = "VAT" | "PAN_ONLY";

/**
 * Mode A (INCLUSIVE): the menu price is the final price to the guest, and VAT is
 *   back-calculated out of it. Lower legal risk, aligned with the 2023 Supreme
 *   Court ruling and Consumer Protection Act enforcement.
 * Mode B (ADDITIVE): the menu price is a pre-VAT base and service charge plus
 *   VAT are stacked on top. Common legacy industry practice, but carries
 *   documented enforcement risk.
 */
export type PricingMode = "INCLUSIVE" | "ADDITIVE";

export type PaymentMethod = "cash" | "qr" | "card" | "mobile_wallet" | "bank_transfer";

export type BillingConfig = {
  /** Standard VAT rate, percent. Finance Act 2083 leaves this at 13. */
  vatRate: number;
  /** Service charge percent. Customary, NOT legally mandated. */
  serviceChargePercent: number;
  /**
   * At or below this ticket value a buyer PAN is not mandatory.
   * UNCONFIRMED: sources cite both NPR 10,000 and NPR 1,00,000. Default is the
   * more conservative (lower) figure so the app asks for a PAN sooner rather
   * than omitting one that was required.
   */
  buyerPanThreshold: number;
  /**
   * At or below this value a VAT-registered outlet may issue an abbreviated
   * invoice under VAT Rules 2053, Rule 17(Ka).
   */
  abbreviatedInvoiceThreshold: number;
  /** Share of the VAT amount (not of the bill) rebated on digital payment. */
  digitalVatRebatePercent: number;
  /** Rolling 12-month turnover at which VAT registration becomes mandatory. */
  vatRegistrationThreshold: number;
  /** CBMS real-time e-billing turnover threshold, general businesses. */
  cbmsThresholdGeneral: number;
  /** CBMS threshold for hotels, restaurants and canteens. Materially lower. */
  cbmsThresholdHospitality: number;
  /** Minimum bill value eligible for the Taxpayer Incentive Prize Program. */
  prizeProgramMinimum: number;
  /** Statutory retention period for issued invoices, years. VAT Rule 23. */
  retentionYears: number;
};

/**
 * Platform defaults, current for FY 2082/83 to 2083/84.
 * Amounts are in NPR. Re-verify every Shrawan 1.
 */
export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  vatRate: 13,
  serviceChargePercent: 10,
  buyerPanThreshold: 10_000,          // UNCONFIRMED: 10,000 vs 1,00,000
  abbreviatedInvoiceThreshold: 10_000,
  digitalVatRebatePercent: 10,
  vatRegistrationThreshold: 3_000_000,      // 30 lakh, mixed goods-plus-services
  cbmsThresholdGeneral: 100_000_000,        // 10 crore
  cbmsThresholdHospitality: 50_000_000,     // 5 crore. UNCONFIRMED, verify circular
  prizeProgramMinimum: 100,
  retentionYears: 6,
};

/**
 * Bill header text, keyed by registration type. Per section 3 of the spec this
 * is a config map rather than an inline string in the receipt template, because
 * a PAN-only outlet printing "Tax Invoice" misrepresents a VAT charge and is a
 * real compliance and legal risk.
 */
export const BILL_HEADERS = {
  VAT: "Tax Invoice",
  VAT_ABBREVIATED: "Tax Invoice (Abbreviated)",
  PAN_ONLY: "Bill",
} as const;

export function headerFor(
  registrationType: RegistrationType,
  isAbbreviated: boolean
): string {
  if (registrationType === "PAN_ONLY") return BILL_HEADERS.PAN_ONLY;
  return isAbbreviated ? BILL_HEADERS.VAT_ABBREVIATED : BILL_HEADERS.VAT;
}

/** The subset of outlet columns this module reads. Keeps callers decoupled. */
export type OutletBillingProfile = {
  vatRegistered?: boolean | null;
  taxPercentage?: number | null;
  serviceCharge?: number | null;
};

export function registrationTypeFor(outlet: OutletBillingProfile): RegistrationType {
  return outlet.vatRegistered ? "VAT" : "PAN_ONLY";
}

/**
 * Merge an outlet's stored settings over the platform defaults. Null and
 * undefined fall back; an explicit 0 is honoured, since a zero service charge is
 * a legitimate choice and must not be silently replaced by the 10 percent
 * default.
 */
export function resolveBillingConfig(
  outlet: OutletBillingProfile | null | undefined,
  overrides: Partial<BillingConfig> = {}
): BillingConfig {
  return {
    ...DEFAULT_BILLING_CONFIG,
    ...(outlet?.taxPercentage != null ? { vatRate: outlet.taxPercentage } : {}),
    ...(outlet?.serviceCharge != null ? { serviceChargePercent: outlet.serviceCharge } : {}),
    ...overrides,
  };
}

/** Whether an outlet must integrate with CBMS at its current turnover. */
export function cbmsRequired(
  annualTurnover: number,
  config: BillingConfig,
  sector: "hospitality" | "general" = "hospitality"
): boolean {
  const threshold =
    sector === "hospitality" ? config.cbmsThresholdHospitality : config.cbmsThresholdGeneral;
  return annualTurnover > threshold;
}

/** True once the outlet is close enough to the VAT threshold to warn them. */
export function approachingVatThreshold(
  rollingTurnover: number,
  config: BillingConfig,
  warnAtFraction = 0.9
): boolean {
  return rollingTurnover >= config.vatRegistrationThreshold * warnAtFraction;
}
