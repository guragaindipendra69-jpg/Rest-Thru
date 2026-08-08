import type { BillCalculation } from "./calculate";
import type { BillingConfig, PaymentMethod, RegistrationType } from "./config";

/**
 * The serialisable payload a printed/displayed IRD bill is rendered from.
 *
 * This exists so the document has exactly one input shape. `TaxInvoice`
 * (on-screen) and `formatTaxInvoiceHTML` (thermal roll) both consume it, so the
 * two renderings cannot disagree about a figure — only about layout.
 *
 * It is built server-side, where the calculation actually happens, and crosses
 * the Server Action boundary intact. Dates are ISO strings rather than Date
 * objects because this payload also gets stashed in component state and passed
 * around the client, where a half-serialised Date is a latent bug.
 */

export type OutletDetails = {
  legalName: string;
  address: string;
  phone: string;
  panNumber: string;
  vatNumber?: string | null;
  branchCode?: string | null;
  logoUrl?: string | null;
};

export type BuyerDetails = {
  name?: string | null;
  address?: string | null;
  panNumber?: string | null;
  /** Corporate catering / banquet: PAN is mandatory regardless of amount. */
  isBusiness?: boolean;
};

export type BillDisplayOptions = {
  showSN?: boolean;
  showHSCode?: boolean;
  showRate?: boolean;
  showQty?: boolean;
  showInWords?: boolean;
  showPaymentMode?: boolean;
  showBilledBy?: boolean;
  footerHeader?: string;
  footerRemarks?: string;
  qrImageUrl?: string | null;
};

export type TaxInvoicePayload = {
  calculation: BillCalculation;
  config: BillingConfig;
  registrationType: RegistrationType;
  outlet: OutletDetails;
  buyer?: BuyerDetails;
  invoiceNumber: string;
  /** Bikram Sambat date string, as printed. */
  billDateBS: string;
  /** ISO 8601. Rendered as the AD timestamp for back-office reconciliation. */
  billDateAD: string;
  paymentMethod: PaymentMethod;
  /** The tender/change pair, when the bill has been settled. */
  amountPaid?: number;
  change?: number;
  billedBy?: string | null;
  tableLabel?: string | null;
  orderType?: string | null;
  customerName?: string | null;
  isReprint?: boolean;
  isVoid?: boolean;
  voidReason?: string | null;
  options?: BillDisplayOptions;
};

/** The outlet columns this module reads. Keeps callers free of Prisma types. */
export type OutletReceiptProfile = {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  phoneNumber?: string | null;
  panNumber?: string | null;
  vatNumber?: string | null;
  branchCode?: string | null;
  logoUrl?: string | null;
};

export function outletFromRestaurant(r: OutletReceiptProfile | null | undefined): OutletDetails {
  return {
    legalName: r?.name || "Restaurant",
    address: [r?.street, r?.city, r?.state].filter(Boolean).join(", "),
    phone: r?.phoneNumber || "",
    // Empty rather than a placeholder: a fabricated PAN on a tax invoice is
    // worse than a visibly missing one. issueBill refuses to issue without it.
    panNumber: r?.panNumber || "",
    vatNumber: r?.vatNumber ?? null,
    branchCode: r?.branchCode ?? null,
    logoUrl: r?.logoUrl ?? null,
  };
}

/**
 * Maps the app's payment enum onto the IRD-facing categories.
 *
 * This is not cosmetic: anything other than `cash` counts as a digital payment,
 * which is what makes the bill eligible for the VAT rebate note (section 13).
 */
const PAYMENT_METHOD_MAP: Record<string, PaymentMethod> = {
  CASH: "cash",
  ESEWA: "mobile_wallet",
  KHALTI: "mobile_wallet",
  FONEPAY: "qr",
  QR: "qr",
  CARD: "card",
  BANK: "bank_transfer",
  BANK_TRANSFER: "bank_transfer",
};

export function paymentMethodFor(method: string | null | undefined): PaymentMethod {
  if (!method) return "cash";
  return PAYMENT_METHOD_MAP[method.toUpperCase()] ?? "cash";
}

/** The InvoiceSetting columns the bill renderer reads. */
export type InvoiceDisplaySettings = {
  showSN?: boolean | null;
  showHSCode?: boolean | null;
  showRate?: boolean | null;
  showQty?: boolean | null;
  showInWords?: boolean | null;
  showPaymentMode?: boolean | null;
  showBilledBy?: boolean | null;
  footerHeader?: string | null;
  footerRemarks?: string | null;
  qrEnabled?: boolean | null;
  qrImageUrl?: string | null;
};

/**
 * Presentation toggles only.
 *
 * Compliance fields (header text, PAN, the VAT line, buyer PAN above the
 * threshold, amount in words) are deliberately absent: they are driven by
 * registration type and thresholds, because letting an outlet switch off its
 * own PAN or VAT line is how a bill becomes non-compliant.
 */
export function displayOptionsFrom(
  s: InvoiceDisplaySettings | null | undefined
): BillDisplayOptions {
  return {
    showSN: s?.showSN ?? false,
    showHSCode: s?.showHSCode ?? false,
    showRate: s?.showRate ?? true,
    showQty: s?.showQty ?? true,
    showInWords: s?.showInWords ?? true,
    showPaymentMode: s?.showPaymentMode ?? true,
    showBilledBy: s?.showBilledBy ?? true,
    footerHeader: s?.footerHeader || "Thank You",
    footerRemarks: s?.footerRemarks || "Thank you for your visit! Visit again",
    qrImageUrl: s?.qrEnabled ? s?.qrImageUrl ?? null : null,
  };
}

export const INVOICE_DISPLAY_SELECT = {
  showSN: true,
  showHSCode: true,
  showRate: true,
  showQty: true,
  showInWords: true,
  showPaymentMode: true,
  showBilledBy: true,
  footerHeader: true,
  footerRemarks: true,
  qrEnabled: true,
  qrImageUrl: true,
} as const;
